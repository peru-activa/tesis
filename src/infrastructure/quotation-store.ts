import { Pool } from 'pg';
import { ensurePostgresSchema } from '../data/postgres-schema.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';
import type { CustomerEmailJob, CustomerEmailQueue } from '../domain/customer-email.js';
import {
  MemoryCustomerEmailQueue,
  PostgresCustomerEmailQueue,
  insertCustomerEmail,
} from './customer-email-queue.js';

export interface QuotationStore extends CustomerEmailQueue {
  list(): Promise<QuotationRequest[]>;
  listOwnedBy(subject: string, email: string): Promise<QuotationRequest[]>;
  hasOwnedByEmail(subject: string, email: string): Promise<boolean>;
  getOwnedBy(id: string, subject: string, email: string): Promise<QuotationRequest | undefined>;
  get(id: string): Promise<QuotationRequest | undefined>;
  save(request: QuotationRequest, email?: CustomerEmailJob): Promise<QuotationRequest>;
}

export class MemoryQuotationStore implements QuotationStore {
  private readonly requests = new Map<string, QuotationRequest>();
  private readonly emailQueue = new MemoryCustomerEmailQueue();
  enqueueEmail: CustomerEmailQueue['enqueueEmail'] = (job) => this.emailQueue.enqueueEmail(job);
  emailStatus: CustomerEmailQueue['emailStatus'] = (id) => this.emailQueue.emailStatus(id);
  claimEmail: CustomerEmailQueue['claimEmail'] = (now) => this.emailQueue.claimEmail(now);
  finishEmail: CustomerEmailQueue['finishEmail'] = (id, token, result) =>
    this.emailQueue.finishEmail(id, token, result);

  async list(): Promise<QuotationRequest[]> {
    return [...this.requests.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async listOwnedBy(subject: string, email: string): Promise<QuotationRequest[]> {
    return [...this.requests.values()]
      .filter(
        (request) =>
          request.owner?.subject === subject ||
          (!request.owner && request.request.customer.contact.trim().toLowerCase() === email),
      )
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async hasOwnedByEmail(subject: string, email: string): Promise<boolean> {
    return [...this.requests.values()].some((request) =>
      request.owner
        ? request.owner.subject === subject && request.owner.email === email
        : request.request.customer.contact.trim().toLowerCase() === email,
    );
  }

  async getOwnedBy(
    id: string,
    subject: string,
    email: string,
  ): Promise<QuotationRequest | undefined> {
    const request = this.requests.get(id);
    if (
      request?.owner?.subject === subject ||
      (request && !request.owner && request.request.customer.contact.trim().toLowerCase() === email)
    ) {
      return request;
    }
    return undefined;
  }

  async get(id: string): Promise<QuotationRequest | undefined> {
    return this.requests.get(id);
  }

  async save(request: QuotationRequest, email?: CustomerEmailJob): Promise<QuotationRequest> {
    if (email) this.emailQueue.enqueue(email);
    this.requests.set(request.id, request);
    return request;
  }
}

export class PostgresQuotationStore implements QuotationStore {
  private readonly ready: Promise<void>;
  private readonly emailQueue: PostgresCustomerEmailQueue;
  enqueueEmail: CustomerEmailQueue['enqueueEmail'] = (job) => this.emailQueue.enqueueEmail(job);
  emailStatus: CustomerEmailQueue['emailStatus'] = (id) => this.emailQueue.emailStatus(id);
  claimEmail: CustomerEmailQueue['claimEmail'] = (now) => this.emailQueue.claimEmail(now);
  finishEmail: CustomerEmailQueue['finishEmail'] = (id, token, result) =>
    this.emailQueue.finishEmail(id, token, result);

  constructor(private readonly pool: Pool) {
    this.emailQueue = new PostgresCustomerEmailQueue(pool);
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await ensurePostgresSchema(this.pool);
  }

  async list(): Promise<QuotationRequest[]> {
    await this.ready;
    const result = await this.pool.query<{ payload: QuotationRequest }>(
      'SELECT payload FROM quotation_requests ORDER BY created_at DESC',
    );
    return result.rows.map((row) => row.payload);
  }

  async listOwnedBy(subject: string, email: string): Promise<QuotationRequest[]> {
    await this.ready;
    const result = await this.pool.query<{ payload: QuotationRequest }>(
      `SELECT payload
       FROM quotation_requests
       WHERE payload->'owner'->>'subject' = $1
          OR (
            payload->'owner' IS NULL
            AND lower(payload->'request'->'customer'->>'contact') = $2
          )
       ORDER BY created_at DESC`,
      [subject, email],
    );
    return result.rows.map((row) => row.payload);
  }

  async hasOwnedByEmail(subject: string, email: string): Promise<boolean> {
    await this.ready;
    const result = await this.pool.query<{ found: boolean }>(
      `SELECT EXISTS (
        SELECT 1 FROM quotation_requests
        WHERE (payload->'owner'->>'subject' = $1 AND payload->'owner'->>'email' = $2)
           OR (payload->'owner' IS NULL
               AND lower(btrim(payload->'request'->'customer'->>'contact')) = $2)
      ) AS found`,
      [subject, email],
    );
    return result.rows[0]?.found ?? false;
  }

  async getOwnedBy(
    id: string,
    subject: string,
    email: string,
  ): Promise<QuotationRequest | undefined> {
    await this.ready;
    const result = await this.pool.query<{ payload: QuotationRequest }>(
      `SELECT payload
       FROM quotation_requests
       WHERE id = $1
         AND (
           payload->'owner'->>'subject' = $2
           OR (
             payload->'owner' IS NULL
             AND lower(payload->'request'->'customer'->>'contact') = $3
           )
         )`,
      [id, subject, email],
    );
    return result.rows[0]?.payload;
  }

  async get(id: string): Promise<QuotationRequest | undefined> {
    await this.ready;
    const result = await this.pool.query<{ payload: QuotationRequest }>(
      'SELECT payload FROM quotation_requests WHERE id = $1',
      [id],
    );
    return result.rows[0]?.payload;
  }

  async save(request: QuotationRequest, email?: CustomerEmailJob): Promise<QuotationRequest> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO quotation_requests (id, created_at, updated_at, status, payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET updated_at = EXCLUDED.updated_at, status = EXCLUDED.status, payload = EXCLUDED.payload`,
        [request.id, request.createdAt, request.updatedAt, request.status, request],
      );
      if (email) await insertCustomerEmail(client, email);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return request;
  }
}

export function createQuotationStore(): QuotationStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new MemoryQuotationStore();
  return new PostgresQuotationStore(new Pool({ connectionString }));
}
