import { Pool, type PoolClient } from 'pg';
import type { OrderAssignment, OrderStatus, PortalOrder } from '../domain/orders.js';
import type { WorkshopNotification } from '../domain/workshop-notifications.js';
import { ensurePostgresSchema } from './postgres-schema.js';

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
    this.statusHistory.set(order.id, [{ status: order.status, occurredAt: order.createdAt }]);
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
    await ensurePostgresSchema(this.pool);
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
      occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
    }));
  }

  async create(order: PortalOrder): Promise<PortalOrder> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO thesis_orders (
          id, created_at, updated_at, status, product, polo_type, quantity, material, color,
          customization, required_by, delivery_district, design_reference, notes,
          requires_new_pattern, embroidery_applications_per_garment,
          source_quotation_id, source_garment_index, payload
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9,
          $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
        )`,
        this.orderValues(order),
      );
      await this.replaceOrderDetails(client, order);
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
      await this.replaceAssignment(client, updated);
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
      await this.replaceAssignment(client, updated);
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
      await this.replaceAssignment(client, updated);
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

  private orderValues(order: PortalOrder): unknown[] {
    return [
      order.id,
      order.createdAt,
      order.updatedAt,
      order.status,
      order.draft.product,
      order.draft.poloType ?? null,
      order.draft.quantity,
      order.draft.material,
      order.draft.color,
      order.draft.customization,
      order.draft.requiredBy,
      order.draft.deliveryDistrict,
      order.draft.designReference,
      order.draft.notes,
      order.draft.requiresNewPattern ?? false,
      order.draft.embroideryApplicationsPerGarment ?? 1,
      order.source?.quotationId ?? null,
      order.source?.garmentIndex ?? null,
      order,
    ];
  }

  private async replaceOrderDetails(client: PoolClient, order: PortalOrder): Promise<void> {
    await client.query('DELETE FROM thesis_order_sizes WHERE order_id = $1', [order.id]);
    for (const [size, quantity] of Object.entries(order.draft.sizes)) {
      await client.query(
        'INSERT INTO thesis_order_sizes (order_id, size, quantity) VALUES ($1, $2, $3)',
        [order.id, size, quantity],
      );
    }

    await client.query('DELETE FROM thesis_order_processes WHERE order_id = $1', [order.id]);
    const uniqueProcesses = order.requiredProcesses.filter(
      (process, index, processes) => processes.indexOf(process) === index,
    );
    for (const [index, process] of uniqueProcesses.entries()) {
      await client.query(
        'INSERT INTO thesis_order_processes (order_id, sequence, process) VALUES ($1, $2, $3)',
        [order.id, index + 1, process],
      );
    }

    await client.query('DELETE FROM thesis_order_customizations WHERE order_id = $1', [order.id]);
    const customizations = [
      ...(order.draft.customization === 'none' ? [] : [order.draft.customization]),
      ...(order.draft.additionalCustomizations ?? []),
    ].filter((value, index, values) => values.indexOf(value) === index);
    for (const [index, customization] of customizations.entries()) {
      await client.query(
        `INSERT INTO thesis_order_customizations
          (order_id, sequence, kind, applications_per_garment)
         VALUES ($1, $2, $3, $4)`,
        [
          order.id,
          index + 1,
          customization,
          customization === 'embroidery'
            ? (order.draft.embroideryApplicationsPerGarment ?? 1)
            : null,
        ],
      );
    }
  }

  private async replaceAssignment(client: PoolClient, order: PortalOrder): Promise<void> {
    if (!order.assignment) {
      await client.query('DELETE FROM thesis_order_assignments WHERE order_id = $1', [order.id]);
      return;
    }

    await client.query(
      `INSERT INTO thesis_order_assignments (order_id, candidate_id, confirmed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO UPDATE
       SET candidate_id = EXCLUDED.candidate_id, confirmed_at = EXCLUDED.confirmed_at`,
      [order.id, order.assignment.candidateId, order.assignment.confirmedAt],
    );
    await client.query('DELETE FROM thesis_assignment_allocations WHERE order_id = $1', [order.id]);
    for (const allocation of order.assignment.allocations) {
      await client.query(
        `INSERT INTO thesis_assignment_allocations
          (order_id, workshop_id, display_name, quantity, status)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          order.id,
          allocation.workshopId,
          allocation.displayName,
          allocation.quantity,
          allocation.status,
        ],
      );
      for (const [index, process] of allocation.assignedProcesses.entries()) {
        await client.query(
          `INSERT INTO thesis_allocation_processes
            (order_id, workshop_id, sequence, process)
           VALUES ($1, $2, $3, $4)`,
          [order.id, allocation.workshopId, index + 1, process],
        );
      }
    }
  }
}

export function createOrderStore(): OrderStore {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return new MemoryOrderStore();
  return new PostgresOrderStore(new Pool({ connectionString }));
}
