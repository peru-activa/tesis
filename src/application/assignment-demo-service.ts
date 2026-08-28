import { randomUUID } from 'node:crypto';
import type { OrderStore } from '../data/order-store.js';
import {
  findWeek03Scenario,
  recommendationForScenario,
  WEEK_03_DATASET_VERSION,
  WEEK_03_SEED,
  week03AssignmentScenarios,
  week03SimulatedWorkshops,
} from '../data/week-03-assignment-scenarios.js';
import { recommendationRequestSchema } from '../domain/contracts.js';
import type { OrderAssignment, PortalOrder } from '../domain/orders.js';
import { recommendWorkshops } from '../domain/recommend.js';
import { createWorkshopNotification } from '../domain/workshop-notifications.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';
import { recommendationFromQuotation } from './quotation-order-adapter.js';

export interface QuotationProductionOutcome {
  status: 'recommended' | 'no_eligible_workshop' | 'requires_scope_decision';
  orderIds: string[];
  message: string;
  orders: PortalOrder[];
}

export class AssignmentFlowError extends Error {
  constructor(
    public readonly code:
      | 'scenario_not_found'
      | 'no_eligible_workshops'
      | 'order_not_found'
      | 'workshop_not_recommended'
      | 'workshop_not_assigned'
      | 'invalid_order_transition',
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

export class AssignmentDemoService {
  constructor(
    private readonly orders: OrderStore,
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createOrderId: () => string = () =>
      `PED-${randomUUID().slice(0, 8).toUpperCase()}`,
  ) {}

  catalog() {
    return {
      simulated: true as const,
      datasetVersion: WEEK_03_DATASET_VERSION,
      seed: WEEK_03_SEED,
      workshops: week03SimulatedWorkshops,
      scenarios: week03AssignmentScenarios,
    };
  }

  async runScenario(scenarioId: string): Promise<PortalOrder> {
    const scenario = findWeek03Scenario(scenarioId);
    if (!scenario) throw new AssignmentFlowError('scenario_not_found');

    const id = this.createOrderId();
    const request = recommendationForScenario(scenario);
    const recommendation = recommendWorkshops(
      recommendationRequestSchema.parse({
        ...request,
        order: { ...request.order, id },
      }),
    );
    if (recommendation.candidates.length === 0) {
      throw new AssignmentFlowError('no_eligible_workshops', recommendation);
    }

    const timestamp = this.now();
    const order: PortalOrder = {
      id,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'recommended',
      draft: scenario.draft,
      requiredProcesses: scenario.requiredProcesses,
      recommendation,
      simulation: {
        datasetVersion: WEEK_03_DATASET_VERSION,
        scenarioId: scenario.id,
        seed: WEEK_03_SEED,
      },
    };
    return this.orders.create(order);
  }

  async createFromAcceptedQuotation(
    quotation: QuotationRequest,
  ): Promise<QuotationProductionOutcome> {
    const garmentCount = 1 + quotation.request.additionalGarments.length;
    if (garmentCount > 1) {
      return {
        status: 'requires_scope_decision',
        orderIds: [],
        message: 'La cotización contiene varias prendas; falta definir si se asignan juntas o por separado.',
        orders: [],
      };
    }

    const id = this.createOrderId();
    const evaluatedAt = this.now();
    const adapted = recommendationFromQuotation({
      orderId: id,
      quotation,
      garmentIndex: 0,
      evaluatedAt,
      workshops: week03SimulatedWorkshops,
    });
    const recommendation = recommendWorkshops(adapted.request);
    const hasCandidate = recommendation.candidates.length > 0;
    const order: PortalOrder = {
      id,
      createdAt: evaluatedAt,
      updatedAt: evaluatedAt,
      status: hasCandidate ? 'recommended' : 'registered',
      draft: adapted.draft,
      requiredProcesses: adapted.requiredProcesses,
      recommendation,
      simulation: {
        datasetVersion: WEEK_03_DATASET_VERSION,
        scenarioId: `quotation:${quotation.id}:garment-1`,
        seed: WEEK_03_SEED,
      },
      source: { type: 'quotation', quotationId: quotation.id, garmentIndex: 0 },
    };
    await this.orders.create(order);
    return {
      status: hasCandidate ? 'recommended' : 'no_eligible_workshop',
      orderIds: [order.id],
      message: hasCandidate
        ? 'Orden creada y evaluada automáticamente; Perú Activa debe confirmar el taller.'
        : 'Orden creada, pero ningún taller simulado cumple todas las restricciones.',
      orders: [order],
    };
  }

  async confirm(orderId: string, workshopId: string): Promise<PortalOrder> {
    const order = await this.orders.get(orderId);
    if (!order) throw new AssignmentFlowError('order_not_found');

    const candidate = order.recommendation.candidates.find(
      (item) => item.workshopId === workshopId,
    );
    if (!candidate) throw new AssignmentFlowError('workshop_not_recommended');

    const confirmedAt = this.now();
    const assignment: OrderAssignment = {
      workshopId: candidate.workshopId,
      displayName: candidate.displayName,
      confirmedAt,
    };
    const notification = createWorkshopNotification({
      orderId: order.id,
      draft: order.draft,
      assignment,
      requiredProcesses: order.requiredProcesses,
      publishedAt: confirmedAt,
    });
    const updated = await this.orders.assign(order.id, assignment, notification);
    if (!updated) throw new AssignmentFlowError('order_not_found');
    return updated;
  }

  async notifications() {
    const orders = await this.orders.list();
    return orders.flatMap((order) => (order.notification ? [order.notification] : []));
  }

  async updateWorkshopStatus(
    orderId: string,
    workshopId: string,
    status: 'in_production' | 'completed',
  ): Promise<PortalOrder> {
    const order = await this.orders.get(orderId);
    if (!order) throw new AssignmentFlowError('order_not_found');
    if (order.assignment?.workshopId !== workshopId) {
      throw new AssignmentFlowError('workshop_not_assigned');
    }
    const expected = order.status === 'assigned' ? 'in_production' : 'completed';
    if (status !== expected || !['assigned', 'in_production'].includes(order.status)) {
      throw new AssignmentFlowError('invalid_order_transition');
    }
    const updated = await this.orders.updateStatus(orderId, status, this.now());
    if (!updated) throw new AssignmentFlowError('order_not_found');
    return updated;
  }
}
