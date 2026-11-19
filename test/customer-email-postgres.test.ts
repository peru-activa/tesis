import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { it } from 'node:test';
import { Pool } from 'pg';
import { QuotationService } from '../src/application/quotation-service.js';
import { customerEmailJob } from '../src/application/customer-email.js';
import { PostgresQuotationStore } from '../src/infrastructure/quotation-store.js';
import { emailDraft, emailOwner, emailQuote } from './fixtures/customer-email.js';

it(
  'PostgreSQL: atomicidad, reinicio, exclusión entre conexiones y protección de claims',
  { skip: !process.env.CAPACITY_TEST_PG_SOCKET },
  async () => {
    const schema = `email_test_${randomUUID().replaceAll('-', '')}`;
    const config = {
      host: process.env.CAPACITY_TEST_PG_SOCKET!,
      port: Number(process.env.CAPACITY_TEST_PG_PORT ?? 5432),
      database: 'postgres',
      user: userInfo().username,
    };
    const admin = new Pool(config),
      pools: Pool[] = [];
    await admin.query(`CREATE SCHEMA ${schema}`);
    const instance = () => {
      const pool = new Pool({ ...config, options: `-c search_path=${schema}` });
      pools.push(pool);
      return { store: new PostgresQuotationStore(pool), pool };
    };
    try {
      const first = instance();
      const service = new QuotationService(first.store, undefined, { customerEmails: true });
      const request = await service.create(emailDraft(), emailOwner);
      await first.pool.end();
      const reopened = instance(),
        other = instance();
      assert.equal((await reopened.store.emailStatus(request.id))[0]!.state, 'pending');
      const now = new Date().toISOString();
      const jobs = await Promise.all([reopened.store.claimEmail(now), other.store.claimEmail(now)]);
      assert.equal(jobs.filter(Boolean).length, 1);
      const claimed = jobs.find(Boolean)!;
      await other.store.finishEmail(claimed.id, 'wrong-token', { state: 'accepted' });
      assert.equal((await reopened.store.emailStatus(request.id))[0]!.state, 'processing');
      await other.store.finishEmail(claimed.id, claimed.claimToken!, {
        state: 'accepted',
        providerMessageId: 'accepted-test',
      });
      assert.equal((await reopened.store.emailStatus(request.id))[0]!.state, 'accepted');
      const next = { ...request, id: 'COT-ROLLBACK' };
      const badJob = {
        ...customerEmailJob(next, 'request_received')!,
        quotationId: 'does-not-exist',
      };
      await assert.rejects(reopened.store.save(next, badJob));
      assert.equal(await reopened.store.get(next.id), undefined);
      await new QuotationService(reopened.store, undefined, { customerEmails: true }).quote(
        request.id,
        emailQuote(),
      );
      await new QuotationService(other.store, undefined, { customerEmails: true }).quote(
        request.id,
        emailQuote(),
      );
      assert.equal(
        (await other.store.emailStatus(request.id)).length,
        2,
        'JSONB key ordering must not create another issuance',
      );
      const quoteJob = await other.store.claimEmail(new Date().toISOString());
      assert.ok(quoteJob);
      await other.store.finishEmail(quoteJob.id, quoteJob.claimToken!, { state: 'accepted' });
      const second = await new QuotationService(reopened.store, undefined, {
        customerEmails: true,
      }).create(emailDraft(), emailOwner);
      const interrupted = await reopened.store.claimEmail(new Date().toISOString());
      assert.ok(interrupted);
      assert.equal(
        await other.store.claimEmail(new Date(Date.now() + 180_000).toISOString()),
        undefined,
      );
      assert.equal((await other.store.emailStatus(second.id))[0]!.state, 'uncertain');
      await reopened.store.finishEmail(interrupted.id, interrupted.claimToken!, {
        state: 'accepted',
      });
      assert.equal((await other.store.emailStatus(second.id))[0]!.state, 'uncertain');
    } finally {
      await Promise.all(pools.map((pool) => (pool.ended ? undefined : pool.end())));
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
