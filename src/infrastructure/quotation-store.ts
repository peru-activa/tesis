import { Pool } from 'pg';
import { ensurePostgresSchema } from '../data/postgres-schema.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';

export interface QuotationStore {
  list(): Promise<QuotationRequest[]>;
  listOwnedBy(subject: string, email: string): Promise<QuotationRequest[]>;
  get(id: string): Promise<QuotationRequest | undefined>;
  save(request: QuotationRequest): Promise<QuotationRequest>;
}

export class MemoryQuotationStore implements QuotationStore {
  private readonly requests = new Map<string, QuotationRequest>();

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

  async get(id: string): Promise<QuotationRequest | undefined> {
    return this.requests.get(id);
  }

  async save(request: QuotationRequest): Promise<QuotationRequest> {
    this.requests.set(request.id, request);
    return request;
  }
}

export class PostgresQuotationStore implements QuotationStore {
  private readonly ready: Promise<void>;

  constructor(private readonly pool: Pool) {
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

  async get(id: string): Promise<QuotationRequest | undefined> {
    await this.ready;
    const result = await this.pool.query<{ payload: QuotationRequest }>(
      'SELECT payload FROM quotation_requests WHERE id = $1',
      [id],
    );
    return result.rows[0]?.payload;
  }

  async save(request: QuotationRequest): Promise<QuotationRequest> {
    await this.ready;
    await this.pool.query(
      `INSERT INTO quotation_requests (id, created_at, updated_at, status, payload)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
       SET updated_at = EXCLUDED.updated_at, status = EXCLUDED.status, payload = EXCLUDED.payload`,
      [request.id, request.createdAt, request.updatedAt, request.status, request],
    );
    return request;
  }
}

export function createQuotationStore(): QuotationStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new MemoryQuotationStore();
  return new PostgresQuotationStore(new Pool({ connectionString }));
}
