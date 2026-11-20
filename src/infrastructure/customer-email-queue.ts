import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { ensurePostgresSchema } from '../data/postgres-schema.js';
import { customerEmailEventOrder } from '../domain/customer-email-events.js';
import type {
  CustomerEmailJob,
  CustomerEmailRecord,
  CustomerEmailQueue,
  CustomerEmailSummary,
} from '../domain/customer-email.js';

function summary(record: CustomerEmailRecord): CustomerEmailSummary {
  return {
    id: record.id,
    kind: record.kind,
    createdAt: record.createdAt,
    state: record.state,
    ...(record.providerQueued !== undefined ? { providerQueued: record.providerQueued } : {}),
  };
}

export class MemoryCustomerEmailQueue implements CustomerEmailQueue {
  private readonly records = new Map<string, CustomerEmailRecord>();
  enqueue(job: CustomerEmailJob) {
    if (!this.records.has(job.id))
      this.records.set(job.id, {
        ...structuredClone(job),
        state: 'pending',
        attempts: 0,
        nextAttemptAt: job.createdAt,
      });
  }
  async enqueueEmail(job: CustomerEmailJob) {
    this.enqueue(job);
  }
  async emailStatus(id: string) {
    return [...this.records.values()].filter((job) => job.quotationId === id).map(summary);
  }
  async claimEmail(now: string) {
    for (const record of this.records.values()) {
      if (
        record.state === 'processing' &&
        Date.parse(record.claimedAt!) < Date.parse(now) - 120_000
      ) {
        record.state = 'uncertain';
        record.errorCode = 'worker_interrupted';
      }
    }
    const record = [...this.records.values()]
      .filter((job) => job.state === 'pending' && job.nextAttemptAt <= now)
      .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt) || customerEmailEventOrder[a.kind] - customerEmailEventOrder[b.kind])[0];
    if (!record) return undefined;
    record.state = 'processing';
    record.claimToken = randomUUID();
    record.claimedAt = now;
    record.attempts++;
    return structuredClone(record);
  }
  async finishEmail(
    id: string,
    token: string,
    result: Parameters<CustomerEmailQueue['finishEmail']>[2],
  ) {
    const record = this.records.get(id);
    if (record?.state === 'processing' && record.claimToken === token) {
      Object.assign(record, result);
      delete record.claimToken;
      delete record.claimedAt;
    }
  }
}

export async function insertCustomerEmail(
  client: Pick<PoolClient, 'query'>,
  job: CustomerEmailJob,
) {
  await client.query(
    `INSERT INTO customer_email_jobs (id, quotation_id, state, next_attempt_at, payload)
    VALUES ($1, $2, 'pending', $3, $4) ON CONFLICT (id) DO NOTHING`,
    [
      job.id,
      job.quotationId,
      job.createdAt,
      {
        ...job,
        state: 'pending',
        attempts: 0,
        nextAttemptAt: job.createdAt,
      },
    ],
  );
}

export class PostgresCustomerEmailQueue implements CustomerEmailQueue {
  constructor(private readonly pool: Pool) {}
  async enqueueEmail(job: CustomerEmailJob) {
    await ensurePostgresSchema(this.pool);
    await insertCustomerEmail(this.pool, job);
  }
  async emailStatus(id: string) {
    await ensurePostgresSchema(this.pool);
    const result = await this.pool.query<{ payload: CustomerEmailRecord }>(
      'SELECT payload FROM customer_email_jobs WHERE quotation_id=$1 ORDER BY next_attempt_at, id',
      [id],
    );
    return result.rows.map((row) => summary(row.payload));
  }
  async claimEmail(now: string) {
    await ensurePostgresSchema(this.pool);
    await this.pool.query(
      `UPDATE customer_email_jobs SET state='uncertain',
      payload=payload || '{"state":"uncertain","errorCode":"worker_interrupted"}'::jsonb
      WHERE state='processing' AND claimed_at < $1::timestamptz - interval '2 minutes'`,
      [now],
    );
    const token = randomUUID();
    const result = await this.pool.query<{ payload: CustomerEmailRecord }>(
      `WITH next AS (
      SELECT id FROM customer_email_jobs WHERE state='pending' AND next_attempt_at <= $1
      ORDER BY next_attempt_at, ($3::jsonb->>(payload->>'kind'))::int, id FOR UPDATE SKIP LOCKED LIMIT 1
    ) UPDATE customer_email_jobs AS jobs SET state='processing', claimed_at=$1, claim_token=$2,
      payload=jobs.payload || jsonb_build_object('state','processing','claimedAt',$1::text,
        'claimToken',$2::text,'attempts',(jobs.payload->>'attempts')::int+1)
      FROM next WHERE jobs.id=next.id RETURNING jobs.payload`,
      [now, token, customerEmailEventOrder],
    );
    return result.rows[0]?.payload;
  }
  async finishEmail(
    id: string,
    token: string,
    result: Parameters<CustomerEmailQueue['finishEmail']>[2],
  ) {
    await ensurePostgresSchema(this.pool);
    await this.pool.query(
      `UPDATE customer_email_jobs SET state=$3, claimed_at=NULL, claim_token=NULL,
      next_attempt_at=COALESCE($4::timestamptz,next_attempt_at),
      payload=(payload - 'claimToken' - 'claimedAt') || $5::jsonb
      WHERE id=$1 AND claim_token=$2 AND state='processing'`,
      [id, token, result.state, result.nextAttemptAt ?? null, result],
    );
  }
}
