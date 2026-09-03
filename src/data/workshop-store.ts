import { Pool } from 'pg';
import { workshopSchema, type Workshop } from '../domain/contracts.js';

export interface WorkshopStore {
  list(): Promise<Workshop[]>;
  get(id: string): Promise<Workshop | undefined>;
  upsertAll(workshops: Workshop[], updatedAt?: string): Promise<void>;
}

export class MemoryWorkshopStore implements WorkshopStore {
  private readonly workshops = new Map<string, Workshop>();

  constructor(initial: Workshop[] = []) {
    for (const workshop of initial) this.workshops.set(workshop.id, workshopSchema.parse(workshop));
  }

  async list(): Promise<Workshop[]> {
    return [...this.workshops.values()].sort((left, right) => left.id.localeCompare(right.id));
  }

  async get(id: string): Promise<Workshop | undefined> {
    return this.workshops.get(id);
  }

  async upsertAll(workshops: Workshop[], _updatedAt?: string): Promise<void> {
    for (const workshop of workshops) this.workshops.set(workshop.id, workshopSchema.parse(workshop));
  }
}

export class PostgresWorkshopStore implements WorkshopStore {
  private readonly ready: Promise<void>;

  constructor(
    private readonly pool: Pool,
    initial: Workshop[] = [],
  ) {
    this.ready = this.initialize(initial);
  }

  private async initialize(initial: Workshop[]): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS thesis_workshops (
        id text PRIMARY KEY,
        updated_at timestamptz NOT NULL,
        payload jsonb NOT NULL
      );
      CREATE INDEX IF NOT EXISTS thesis_workshops_provider_type_idx
        ON thesis_workshops ((payload->>'providerType'));
    `);
    if (initial.length > 0) await this.persistAll(initial, new Date().toISOString());
  }

  async list(): Promise<Workshop[]> {
    await this.ready;
    const result = await this.pool.query<{ payload: Workshop }>(
      'SELECT payload FROM thesis_workshops ORDER BY id',
    );
    return result.rows.map((row) => workshopSchema.parse(row.payload));
  }

  async get(id: string): Promise<Workshop | undefined> {
    await this.ready;
    const result = await this.pool.query<{ payload: Workshop }>(
      'SELECT payload FROM thesis_workshops WHERE id = $1',
      [id],
    );
    return result.rows[0] ? workshopSchema.parse(result.rows[0].payload) : undefined;
  }

  async upsertAll(workshops: Workshop[], updatedAt = new Date().toISOString()): Promise<void> {
    await this.ready;
    await this.persistAll(workshops, updatedAt);
  }

  private async persistAll(workshops: Workshop[], updatedAt: string): Promise<void> {
    const validated = workshops.map((workshop) => workshopSchema.parse(workshop));
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      for (const workshop of validated) {
        await client.query(
          `INSERT INTO thesis_workshops (id, updated_at, payload)
           VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE
           SET updated_at = EXCLUDED.updated_at, payload = EXCLUDED.payload`,
          [workshop.id, updatedAt, workshop],
        );
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
}

export function createWorkshopStore(initial: Workshop[]): WorkshopStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new MemoryWorkshopStore(initial);
  return new PostgresWorkshopStore(new Pool({ connectionString }), initial);
}
