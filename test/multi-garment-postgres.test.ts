import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { it } from 'node:test';
import { Pool } from 'pg';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { MemoryOrderStore, PostgresOrderStore } from '../src/data/order-store.js';

const socket = process.env.ORDER_TEST_PG_SOCKET;
it(
  'guarda las prendas en una transacción y deduplica reintentos entre conexiones',
  { skip: !socket },
  async () => {
    const schema = `orders_test_${randomUUID().replaceAll('-', '')}`;
    const config = {
      host: socket!,
      port: Number(process.env.ORDER_TEST_PG_PORT ?? 5432),
      database: 'postgres',
      user: userInfo().username,
    };
    const admin = new Pool(config);
    await admin.query(`CREATE SCHEMA ${schema}`);
    const first = new Pool({ ...config, options: `-c search_path=${schema}` });
    const other = new Pool({ ...config, options: `-c search_path=${schema}` });
    try {
      const store = new PostgresOrderStore(first);
      await store.list();
      const repeatedStore = new PostgresOrderStore(other);
      await repeatedStore.list();
      const template = await new AssignmentDemoService(new MemoryOrderStore()).runScenario(
        'balanced-polo',
      );
      await first.query(
        'INSERT INTO quotation_requests (id, created_at, updated_at, status, payload) VALUES ($1, $2, $2, $3, $4)',
        ['COT-BATCH', template.createdAt, 'accepted', {}],
      );
      const batch = [0, 1].map((index) => ({
        ...template,
        id: `batch-${index}`,
        source: { type: 'quotation' as const, quotationId: 'COT-BATCH', garmentIndex: index },
      }));
      const [saved, repeated] = await Promise.all([
        store.createMany(batch),
        repeatedStore.createMany(batch.map((order) => ({ ...order, id: `retry-${order.id}` }))),
      ]);
      assert.deepEqual(
        saved.map((order) => order.id),
        repeated.map((order) => order.id),
      );
      assert.equal((await store.listBySourceQuotationIds(['COT-BATCH'])).length, 2);
      await assert.rejects(
        store.createMany([
          { ...template, id: 'must-rollback' },
          { ...template, id: saved[0]!.id },
        ]),
      );
      assert.equal(await store.get('must-rollback'), undefined);
      assert.equal((await store.history(saved[0]!.id)).length, 1);
    } finally {
      await Promise.all([first.end(), other.end()]);
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    }
  },
);
