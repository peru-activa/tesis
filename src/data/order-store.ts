import { Pool } from 'pg';
import type { OrderAssignment, OrderStatus, PortalOrder } from '../domain/orders.js';
import type { WorkshopNotification } from '../domain/workshop-notifications.js';

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  occurredAt: string;
}

export interface OrderStore {
  list(): Promise<PortalOrder[]>;
  get(id: string): Promise<PortalOrder | undefined>;
  history(id: string): Promise<OrderStatusHistoryEntry[]>;
  create(order: PortalOrder): Promise<PortalOrder>;
  assign(
    id: string,
    assignment: OrderAssignment,
    notifications: WorkshopNotification[],
  ): Promise<PortalOrder | undefined>;
  updateAllocationStatus(
    id: string,
    workshopId: string,
    status: 'in_production' | 'completed',
    occurredAt: string,
  ): Promise<PortalOrder | undefined>;
  updateStatus(
    id: string,
    status: OrderStatus,
    occurredAt: string,
  ): Promise<PortalOrder | undefined>;
}

export class MemoryOrderStore implements OrderStore {
  private readonly orders = new Map<string, PortalOrder>();
  private readonly statusHistory = new Map<string, OrderStatusHistoryEntry[]>();

  async list(): Promise<PortalOrder[]> {
    return [...this.orders.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async get(id: string): Promise<PortalOrder | undefined> {
    return this.orders.get(id);
  }

  async history(id: string): Promise<OrderStatusHistoryEntry[]> {
    return [...(this.statusHistory.get(id) || [])];
  }

  async create(order: PortalOrder): Promise<PortalOrder> {
    this.orders.set(order.id, order);
    this.statusHistory.set(order.id, [
      { status: order.status, occurredAt: order.createdAt },
    ]);
    return order;
  }

  async assign(
    id: string,
    assignment: OrderAssignment,
    notifications: WorkshopNotification[],
  ): Promise<PortalOrder | undefined> {
    const current = this.orders.get(id);
    if (!current) return undefined;
    const updated: PortalOrder = {
      ...current,
      status: 'assigned',
      assignment,
      notification: notifications[0]!,
      notifications,
      updatedAt: assignment.confirmedAt,
    };
    this.orders.set(id, updated);
    this.recordStatus(id, updated.status, updated.updatedAt);
    return updated;
  }

  async updateAllocationStatus(
    id: string,
    workshopId: string,
    status: 'in_production' | 'completed',
    occurredAt: string,
  ): Promise<PortalOrder | undefined> {
    const current = this.orders.get(id);
    if (!current?.assignment) return undefined;
    const currentAllocations = current.assignment.allocations || [
      {
        workshopId: current.assignment.workshopId,
        displayName: current.assignment.displayName,
        quantity: current.draft.quantity,
        status:
          current.status === 'completed'
            ? ('completed' as const)
            : current.status === 'in_production'
              ? ('in_production' as const)
              : ('assigned' as const),
      },
    ];
    const allocations = currentAllocations.map((allocation) =>
      allocation.workshopId === workshopId ? { ...allocation, status } : allocation,
    );
    const orderStatus = allocations.every((allocation) => allocation.status === 'completed')
      ? 'completed'
      : allocations.some((allocation) => allocation.status !== 'assigned')
        ? 'in_production'
        : 'assigned';
    const updated: PortalOrder = {
      ...current,
      status: orderStatus,
      updatedAt: occurredAt,
      assignment: { ...current.assignment, allocations },
    };
    this.orders.set(id, updated);
    this.recordStatus(id, updated.status, updated.updatedAt);
    return updated;
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    occurredAt: string,
  ): Promise<PortalOrder | undefined> {
    const current = this.orders.get(id);
    if (!current) return undefined;
    const updated = { ...current, status, updatedAt: occurredAt };
    this.orders.set(id, updated);
    this.recordStatus(id, status, occurredAt);
    return updated;
  }

  private recordStatus(id: string, status: OrderStatus, occurredAt: string): void {
    const current = this.statusHistory.get(id) || [];
    this.statusHistory.set(id, [...current, { status, occurredAt }]);
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

  async history(id: string): Promise<OrderStatusHistoryEntry[]> {
    await this.ready;
    const result = await this.pool.query<{ status: OrderStatus; occurred_at: Date | string }>(
      `SELECT status, occurred_at
       FROM thesis_order_status_history
       WHERE order_id = $1
       ORDER BY occurred_at, id`,
      [id],
    );
    return result.rows.map((row) => ({
      status: row.status,
      occurredAt:
        row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    }));
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

  async assign(
    id: string,
    assignment: OrderAssignment,
    notifications: WorkshopNotification[],
  ): Promise<PortalOrder | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const updated: PortalOrder = {
      ...current,
      status: 'assigned',
      assignment,
      notification: notifications[0]!,
      notifications,
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

  async updateAllocationStatus(
    id: string,
    workshopId: string,
    status: 'in_production' | 'completed',
    occurredAt: string,
  ): Promise<PortalOrder | undefined> {
    const current = await this.get(id);
    if (!current?.assignment) return undefined;
    const currentAllocations = current.assignment.allocations || [
      {
        workshopId: current.assignment.workshopId,
        displayName: current.assignment.displayName,
        quantity: current.draft.quantity,
        status:
          current.status === 'completed'
            ? ('completed' as const)
            : current.status === 'in_production'
              ? ('in_production' as const)
              : ('assigned' as const),
      },
    ];
    const allocations = currentAllocations.map((allocation) =>
      allocation.workshopId === workshopId ? { ...allocation, status } : allocation,
    );
    const orderStatus = allocations.every((allocation) => allocation.status === 'completed')
      ? 'completed'
      : allocations.some((allocation) => allocation.status !== 'assigned')
        ? 'in_production'
        : 'assigned';
    const updated: PortalOrder = {
      ...current,
      status: orderStatus,
      updatedAt: occurredAt,
      assignment: { ...current.assignment, allocations },
    };
    await this.persistUpdate(updated);
    return updated;
  }

  private async persistUpdate(updated: PortalOrder): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE thesis_orders SET updated_at = $2, status = $3, payload = $4 WHERE id = $1',
        [updated.id, updated.updatedAt, updated.status, updated],
      );
      await client.query(
        'INSERT INTO thesis_order_status_history (order_id, status, occurred_at) VALUES ($1, $2, $3)',
        [updated.id, updated.status, updated.updatedAt],
      );
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateStatus(
    id: string,
    status: OrderStatus,
    occurredAt: string,
  ): Promise<PortalOrder | undefined> {
    const current = await this.get(id);
    if (!current) return undefined;
    const updated = { ...current, status, updatedAt: occurredAt };
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        'UPDATE thesis_orders SET updated_at = $2, status = $3, payload = $4 WHERE id = $1',
        [id, occurredAt, status, updated],
      );
      await client.query(
        'INSERT INTO thesis_order_status_history (order_id, status, occurred_at) VALUES ($1, $2, $3)',
        [id, status, occurredAt],
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
