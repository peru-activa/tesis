import { Pool } from 'pg';
import type { OrderAssignment, PortalOrder } from '../domain/orders.js';

export interface OrderStore {
  list(): Promise<PortalOrder[]>;
  get(id: string): Promise<PortalOrder | undefined>;
  create(order: PortalOrder): Promise<PortalOrder>;
  assign(id: string, assignment: OrderAssignment): Promise<PortalOrder | undefined>;
}

export class MemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, PortalOrder>();

  async list(): Promise<PortalOrder[]> {
    return [...this.orders.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async get(id: string): Promise<PortalOrder | undefined> {
    return this.orders.get(id);
  }

  async create(order: PortalOrder): Promise<PortalOrder> {
    this.orders.set(order.id, order);
    return order;
  }

  async assign(id: string, assignment: OrderAssignment): Promise<PortalOrder | undefined> {
    const current = this.orders.get(id);
    if (!current) return undefined;
    const updated: PortalOrder = {
      ...current,
      status: 'assigned',
      assignment,
      updatedAt: assignment.confirmedAt,
    };
    this.orders.set(id, updated);
    return updated;
  }
}

export class PostgresOrderStore implements OrderStore {
  private readonly ready: Promise<void>;

  constructor(private readonly pool: Pool) {
    this.ready = this.ensureSchema();
  }

  private async ensureSchema(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS thesis_orders (
        id text PRIMARY KEY,
        created_at timestamptz NOT NULL,
        updated_at timestamptz NOT NULL,
        status text NOT NULL,
        payload jsonb NOT NULL
      );
      CREATE TABLE IF NOT EXISTS thesis_order_status_history (
        id bigserial PRIMARY KEY,
        order_id text NOT NULL REFERENCES thesis_orders(id),
        status text NOT NULL,
        occurred_at timestamptz NOT NULL
      );
    `);
  }

  async list(): Promise<PortalOrder[]> {
    await this.ready;
    const result = await this.pool.query<{ payload: PortalOrder }>(
      'SELECT payload FROM thesis_orders ORDER BY created_at DESC',
    );
    return result.rows.map((row) => row.payload);
  }

  async get(id: string): Promise<PortalOrder | undefined> {
    await this.ready;
    const result = await this.pool.query<{ payload: PortalOrder }>(
      'SELECT payload FROM thesis_orders WHERE id = $1',
      [id],
    );
    return result.rows[0]?.payload;
  }

  async create(order: PortalOrder): Promise<PortalOrder> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'INSERT INTO thesis_orders (id, created_at, updated_at, status, payload) VALUES ($1, $2, $3, $4, $5)',
        [order.id, order.createdAt, order.updatedAt, order.status, order],
      );
      await client.query(
        'INSERT INTO thesis_order_status_history (order_id, status, occurred_at) VALUES ($1, $2, $3)',
        [order.id, order.status, order.createdAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return order;
  }

  async assign(id: string, assignment: OrderAssignment): Promise<PortalOrder | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const updated: PortalOrder = {
      ...current,
      status: 'assigned',
      assignment,
      updatedAt: assignment.confirmedAt,
    };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE thesis_orders SET updated_at = $2, status = $3, payload = $4 WHERE id = $1',
        [id, updated.updatedAt, updated.status, updated],
      );
      await client.query(
        'INSERT INTO thesis_order_status_history (order_id, status, occurred_at) VALUES ($1, $2, $3)',
        [id, updated.status, updated.updatedAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return updated;
  }
}

export function createOrderStore(): OrderStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new MemoryOrderStore();
  return new PostgresOrderStore(new Pool({ connectionString }));
}
