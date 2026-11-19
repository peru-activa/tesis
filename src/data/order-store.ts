import type { AssignmentAutomation } from '../domain/assignment-plans.js';
import { Pool, type PoolClient } from 'pg';
import type { OrderAssignment, OrderStatus, PortalOrder } from '../domain/orders.js';
import type { RecommendationResult, RecommendationRequest, Workshop } from '../domain/contracts.js';
import { OrderAssignmentConflictError } from '../domain/orders.js';
import type { WorkshopNotification } from '../domain/workshop-notifications.js';
import { ensurePostgresSchema } from './postgres-schema.js';
import { applyWorkshopStatus } from '../domain/orders.js';
import {
  customerOrderReadyEmail,
  type CustomerEmailQuotationRepository,
} from '../domain/customer-email.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';
import { insertCustomerEmail } from '../infrastructure/customer-email-queue.js';

export interface OrderStatusHistoryEntry {
  status: OrderStatus;
  occurredAt: string;
}

export interface OrderStore {
  configureCustomerEmails(repository?: CustomerEmailQuotationRepository): void;
  list(): Promise<PortalOrder[]>;
  listBySourceQuotationIds(quotationIds: string[]): Promise<PortalOrder[]>;
  get(id: string): Promise<PortalOrder | undefined>;
  history(id: string): Promise<OrderStatusHistoryEntry[]>;
  create(order: PortalOrder): Promise<PortalOrder>;
  createMany(orders: PortalOrder[]): Promise<PortalOrder[]>;
  updateRecommendation(
    id: string,
    recommendation: RecommendationResult,
    constraints: RecommendationRequest['order'],
    updatedAt: string,
  ): Promise<PortalOrder | undefined>;
  updateAutomation(
    id: string,
    expectedRevision: number,
    next: AssignmentAutomation,
  ): Promise<PortalOrder | undefined>;
  assign(
    id: string,
    assignment: OrderAssignment,
    notifications: WorkshopNotification[],
    validate?: (orders: PortalOrder[], workshops?: Workshop[]) => void,
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
  private emailRepository: CustomerEmailQuotationRepository | undefined;
  private statusUpdates: Promise<void> = Promise.resolve();
  configureCustomerEmails(repository?: CustomerEmailQuotationRepository) {
    this.emailRepository = repository;
  }
  private readonly orders = new Map<string, PortalOrder>();
  private readonly statusHistory = new Map<string, OrderStatusHistoryEntry[]>();

  async list(): Promise<PortalOrder[]> {
    return [...this.orders.values()].sort((left, right) =>
      right.createdAt.localeCompare(left.createdAt),
    );
  }

  async listBySourceQuotationIds(quotationIds: string[]): Promise<PortalOrder[]> {
    const requested = new Set(quotationIds);
    return [...this.orders.values()]
      .filter((order) => order.source && requested.has(order.source.quotationId))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  async get(id: string): Promise<PortalOrder | undefined> {
    return this.orders.get(id);
  }

  async history(id: string): Promise<OrderStatusHistoryEntry[]> {
    return [...(this.statusHistory.get(id) || [])];
  }

  async create(order: PortalOrder): Promise<PortalOrder> {
    return (await this.createMany([order]))[0]!;
  }

  async createMany(orders: PortalOrder[]): Promise<PortalOrder[]> {
    const next = new Map(this.orders);
    const created: PortalOrder[] = [];
    const result = orders.map((order) => {
      const existing =
        order.source &&
        [...next.values()].find(
          (item) =>
            item.source?.quotationId === order.source!.quotationId &&
            item.source.garmentIndex === order.source!.garmentIndex,
        );
      if (existing) return existing;
      if (next.has(order.id)) throw new Error('El identificador del pedido ya existe.');
      next.set(order.id, order);
      created.push(order);
      return order;
    });
    for (const order of created) {
      this.orders.set(order.id, order);
      this.statusHistory.set(order.id, [{ status: order.status, occurredAt: order.createdAt }]);
    }
    return result;
  }

  async updateRecommendation(
    id: string,
    recommendation: RecommendationResult,
    constraints: RecommendationRequest['order'],
    updatedAt: string,
  ): Promise<PortalOrder | undefined> {
    const current = this.orders.get(id);
    if (!current || current.assignment || current.automation?.phase === 'running') return undefined;
    const updated: PortalOrder = {
      ...current,
      recommendation,
      recommendationOrder: constraints,
      updatedAt,
      status: recommendation.candidates.length ? 'recommended' : 'registered',
    };
    this.orders.set(id, updated);
    if (current.status !== updated.status) this.recordStatus(id, updated.status, updatedAt);
    return updated;
  }

  async updateAutomation(id: string, expectedRevision: number, next: AssignmentAutomation) {
    const current = this.orders.get(id);
    if (
      !current ||
      (current.automation?.revision ?? 0) !== expectedRevision ||
      next.revision !== expectedRevision + 1
    )
      return undefined;
    const updated = { ...current, automation: structuredClone(next) };
    this.orders.set(id, updated);
    return updated;
  }

  async assign(
    id: string,
    assignment: OrderAssignment,
    notifications: WorkshopNotification[],
    validate?: (orders: PortalOrder[], workshops?: Workshop[]) => void,
  ): Promise<PortalOrder | undefined> {
    const current = this.orders.get(id);
    if (!current) return undefined;
    if (current.assignment) {
      if (current.assignment.candidateId === assignment.candidateId) return current;
      throw new OrderAssignmentConflictError();
    }
    // No await between validation and write: this is atomic within the memory store.
    validate?.([...this.orders.values()]);
    const updated: PortalOrder = {
      ...current,
      status: 'assigned',
      assignment,
      notification: notifications[0]!,
      notifications,
      updatedAt: assignment.confirmedAt,
    };
    this.orders.set(id, updated);
    if (updated.status !== current.status) {
      this.recordStatus(id, updated.status, updated.updatedAt);
    }
    return updated;
  }

  async updateAllocationStatus(
    id: string,
    workshopId: string,
    status: 'in_production' | 'completed',
    occurredAt: string,
  ) {
    return this.updateProductionState(id, (current) =>
      applyWorkshopStatus(current, workshopId, status, occurredAt),
    );
  }

  async updateStatus(id: string, status: OrderStatus, occurredAt: string) {
    return this.updateProductionState(
      id,
      (current) => ({ ...current, status, updatedAt: occurredAt }),
      true,
    );
  }

  private updateProductionState(
    id: string,
    mutate: (current: PortalOrder) => PortalOrder | undefined,
    recordSameStatus = false,
  ): Promise<PortalOrder | undefined> {
    const operation = this.statusUpdates.then(async () => {
      const current = this.orders.get(id);
      if (!current) return undefined;
      const updated = mutate(current);
      if (!updated) return undefined;
      this.orders.set(id, updated);
      try {
        if (
          updated.status === 'completed' &&
          current.status !== 'completed' &&
          updated.source &&
          this.emailRepository
        ) {
          const quotation = await this.emailRepository.get(updated.source.quotationId);
          if (quotation) {
            const projected = [...this.orders.values()].map((order) =>
              order.id === updated.id ? updated : order,
            );
            const job = customerOrderReadyEmail(quotation, projected);
            if (job) await this.emailRepository.enqueueEmail(job);
          }
        }
      } catch (error) {
        this.orders.set(id, current);
        throw error;
      }
      if (recordSameStatus || updated.status !== current.status)
        this.recordStatus(id, updated.status, updated.updatedAt);
      return updated;
    });
    this.statusUpdates = operation.then(
      () => undefined,
      () => undefined,
    );
    return operation;
  }

  private recordStatus(id: string, status: OrderStatus, occurredAt: string): void {
    const current = this.statusHistory.get(id) || [];
    this.statusHistory.set(id, [...current, { status, occurredAt }]);
  }
}

export class PostgresOrderStore implements OrderStore {
  private customerEmails = false;
  configureCustomerEmails(repository?: CustomerEmailQuotationRepository) {
    this.customerEmails = Boolean(repository);
  }
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
      'SELECT payload FROM orders ORDER BY created_at DESC',
    );
    return result.rows.map((row) => row.payload);
  }

  async listBySourceQuotationIds(quotationIds: string[]): Promise<PortalOrder[]> {
    if (quotationIds.length === 0) return [];
    await this.ready;
    const result = await this.pool.query<{ payload: PortalOrder }>(
      `SELECT payload
       FROM orders
       WHERE source_quotation_id = ANY($1::text[])
       ORDER BY created_at DESC`,
      [quotationIds],
    );
    return result.rows.map((row) => row.payload);
  }

  async get(id: string): Promise<PortalOrder | undefined> {
    await this.ready;
    const result = await this.pool.query<{ payload: PortalOrder }>(
      'SELECT payload FROM orders WHERE id = $1',
      [id],
    );
    return result.rows[0]?.payload;
  }

  async history(id: string): Promise<OrderStatusHistoryEntry[]> {
    await this.ready;
    const result = await this.pool.query<{ status: OrderStatus; occurred_at: Date | string }>(
      `SELECT status, occurred_at
       FROM order_status_history
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
    return (await this.createMany([order]))[0]!;
  }

  async createMany(orders: PortalOrder[]): Promise<PortalOrder[]> {
    await this.ready;
    const client = await this.pool.connect();
    const result: PortalOrder[] = [];
    try {
      await client.query('BEGIN');
      const sources = [
        ...new Set(orders.flatMap((order) => (order.source ? [order.source.quotationId] : []))),
      ].sort();
      for (const source of sources) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':quotation-orders:' || $1, 0))",
          [source],
        );
      }
      for (const order of orders) {
        if (order.source) {
          const existing = await client.query<{ payload: PortalOrder }>(
            'SELECT payload FROM orders WHERE source_quotation_id = $1 AND source_garment_index = $2',
            [order.source.quotationId, order.source.garmentIndex],
          );
          if (existing.rows[0]) {
            result.push(existing.rows[0].payload);
            continue;
          }
        }
        await client.query(
          `INSERT INTO orders (
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
          'INSERT INTO order_status_history (order_id, status, occurred_at) VALUES ($1, $2, $3)',
          [order.id, order.status, order.createdAt],
        );
        result.push(order);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    return result;
  }

  async updateRecommendation(
    id: string,
    recommendation: RecommendationResult,
    constraints: RecommendationRequest['order'],
    updatedAt: string,
  ): Promise<PortalOrder | undefined> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const selected = await client.query<{ payload: PortalOrder }>(
        'SELECT payload FROM orders WHERE id = $1 FOR UPDATE',
        [id],
      );
      const current = selected.rows[0]?.payload;
      if (!current || current.assignment || current.automation?.phase === 'running') {
        await client.query('COMMIT');
        return undefined;
      }
      const updated: PortalOrder = {
        ...current,
        recommendation,
        recommendationOrder: constraints,
        updatedAt,
        status: recommendation.candidates.length ? 'recommended' : 'registered',
      };
      await client.query(
        'UPDATE orders SET updated_at = $2, status = $3, payload = $4 WHERE id = $1',
        [id, updatedAt, updated.status, updated],
      );
      if (current.status !== updated.status)
        await client.query(
          'INSERT INTO order_status_history (order_id, status, occurred_at) VALUES ($1, $2, $3)',
          [id, updated.status, updatedAt],
        );
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAutomation(id: string, expectedRevision: number, next: AssignmentAutomation) {
    if (next.revision !== expectedRevision + 1) return undefined;
    await this.ready;
    const result = await this.pool.query<{ payload: PortalOrder }>(
      `UPDATE orders SET payload=jsonb_set(payload, '{automation}', $3::jsonb)
       WHERE id=$1 AND COALESCE((payload->'automation'->>'revision')::int,0)=$2 RETURNING payload`,
      [id, expectedRevision, JSON.stringify(next)],
    );
    return result.rows[0]?.payload;
  }

  async assign(
    id: string,
    assignment: OrderAssignment,
    notifications: WorkshopNotification[],
    validate?: (orders: PortalOrder[], workshops?: Workshop[]) => void,
  ): Promise<PortalOrder | undefined> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      // Shared across API instances. One transaction validates and reserves all workshops
      // of a plan, without lock-order deadlocks for plans involving several workshops.
      await client.query(
        "SELECT pg_advisory_xact_lock(hashtextextended(current_schema() || ':order-assignment-capacity', 0))",
      );
      const selected = await client.query<{ payload: PortalOrder }>(
        'SELECT payload FROM orders WHERE id = $1 FOR UPDATE',
        [id],
      );
      const current = selected.rows[0]?.payload;
      if (!current) {
        await client.query('COMMIT');
        return undefined;
      }
      if (current.assignment) {
        if (current.assignment.candidateId !== assignment.candidateId)
          throw new OrderAssignmentConflictError();
        await client.query('COMMIT');
        return current;
      }
      const active = await client.query<{ payload: PortalOrder }>(
        "SELECT payload FROM orders WHERE status <> 'completed'",
      );
      const workshopRows = validate
        ? await client.query<{ payload: Workshop }>(
            'SELECT payload FROM workshops ORDER BY id FOR SHARE',
          )
        : undefined;
      validate?.(
        active.rows.map((row) => row.payload),
        workshopRows?.rows.map((row) => row.payload),
      );
      const updated: PortalOrder = {
        ...current,
        status: 'assigned',
        assignment,
        notification: notifications[0]!,
        notifications,
        updatedAt: assignment.confirmedAt,
      };
      await client.query(
        'UPDATE orders SET updated_at = $2, status = $3, payload = $4 WHERE id = $1',
        [id, updated.updatedAt, updated.status, updated],
      );
      await this.replaceAssignment(client, updated);
      await client.query(
        'INSERT INTO order_status_history (order_id, status, occurred_at) VALUES ($1, $2, $3)',
        [id, updated.status, updated.updatedAt],
      );
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async updateAllocationStatus(
    id: string,
    workshopId: string,
    status: 'in_production' | 'completed',
    occurredAt: string,
  ) {
    return this.updateProductionState(id, (current) =>
      applyWorkshopStatus(current, workshopId, status, occurredAt),
    );
  }

  async updateStatus(id: string, status: OrderStatus, occurredAt: string) {
    return this.updateProductionState(
      id,
      (current) => ({ ...current, status, updatedAt: occurredAt }),
      true,
    );
  }

  private async updateProductionState(
    id: string,
    mutate: (current: PortalOrder) => PortalOrder | undefined,
    recordSameStatus = false,
  ): Promise<PortalOrder | undefined> {
    await this.ready;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const row = await client.query<{ payload: PortalOrder }>(
        'SELECT payload FROM orders WHERE id=$1 FOR UPDATE',
        [id],
      );
      const current = row.rows[0]?.payload;
      const updated = current ? mutate(current) : undefined;
      if (!current || !updated) {
        await client.query('COMMIT');
        return undefined;
      }
      await client.query('UPDATE orders SET updated_at=$2, status=$3, payload=$4 WHERE id=$1', [
        id,
        updated.updatedAt,
        updated.status,
        updated,
      ]);
      await this.replaceAssignment(client, updated);
      if (recordSameStatus || updated.status !== current.status) {
        await client.query(
          'INSERT INTO order_status_history (order_id,status,occurred_at) VALUES ($1,$2,$3)',
          [id, updated.status, updated.updatedAt],
        );
      }
      if (updated.status === 'completed' && current.status !== 'completed')
        await this.recordReadyEmail(client, updated);
      await client.query('COMMIT');
      return updated;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  private async recordReadyEmail(client: PoolClient, order: PortalOrder): Promise<void> {
    if (!this.customerEmails || !order.source || order.previewOnly || order.testOnly) return;
    const row = await client.query<{ payload: QuotationRequest }>(
      'SELECT payload FROM quotation_requests WHERE id=$1 FOR UPDATE',
      [order.source.quotationId],
    );
    const quotation = row.rows[0]?.payload;
    if (!quotation) return;
    const related = await client.query<{ payload: PortalOrder }>(
      'SELECT payload FROM orders WHERE source_quotation_id=$1 OR id=ANY($2::text[])',
      [quotation.id, quotation.production?.orderIds ?? []],
    );
    const job = customerOrderReadyEmail(
      quotation,
      related.rows.map((row) => row.payload),
    );
    if (job) await insertCustomerEmail(client, job);
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
    await client.query('DELETE FROM order_sizes WHERE order_id = $1', [order.id]);
    for (const [size, quantity] of Object.entries(order.draft.sizes)) {
      await client.query('INSERT INTO order_sizes (order_id, size, quantity) VALUES ($1, $2, $3)', [
        order.id,
        size,
        quantity,
      ]);
    }

    await client.query('DELETE FROM order_processes WHERE order_id = $1', [order.id]);
    const uniqueProcesses = order.requiredProcesses.filter(
      (process, index, processes) => processes.indexOf(process) === index,
    );
    for (const [index, process] of uniqueProcesses.entries()) {
      await client.query(
        'INSERT INTO order_processes (order_id, sequence, process) VALUES ($1, $2, $3)',
        [order.id, index + 1, process],
      );
    }

    await client.query('DELETE FROM order_customizations WHERE order_id = $1', [order.id]);
    const customizations = [
      ...(order.draft.customization === 'none' ? [] : [order.draft.customization]),
      ...(order.draft.additionalCustomizations ?? []),
    ].filter((value, index, values) => values.indexOf(value) === index);
    for (const [index, customization] of customizations.entries()) {
      await client.query(
        `INSERT INTO order_customizations
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
      await client.query('DELETE FROM order_assignments WHERE order_id = $1', [order.id]);
      return;
    }

    await client.query(
      `INSERT INTO order_assignments (order_id, candidate_id, confirmed_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (order_id) DO UPDATE
       SET candidate_id = EXCLUDED.candidate_id, confirmed_at = EXCLUDED.confirmed_at`,
      [order.id, order.assignment.candidateId, order.assignment.confirmedAt],
    );
    await client.query('DELETE FROM assignment_allocations WHERE order_id = $1', [order.id]);
    for (const allocation of order.assignment.allocations) {
      await client.query(
        `INSERT INTO assignment_allocations
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
          `INSERT INTO allocation_processes
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
