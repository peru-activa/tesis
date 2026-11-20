import { workshopsForScope } from '../domain/workshop-scope.js';
import { randomUUID } from 'node:crypto';
import type { OrderStore } from '../data/order-store.js';
import { MemoryWorkshopStore, type WorkshopStore } from '../data/workshop-store.js';
import {
  findWeek03Scenario,
  recommendationForScenario,
  WEEK_03_DATASET_VERSION,
  WEEK_03_SEED,
  week03AssignmentScenarios,
  week03DeclaredWorkshops,
} from '../data/week-03-assignment-scenarios.js';
import {
  recommendationRequestSchema,
  type FabricBuyer,
  type RecommendationRequest,
} from '../domain/contracts.js';
import { compareRecommendationAlgorithms } from '../domain/compare-recommendations.js';
import type { OrderAssignment, PortalOrder } from '../domain/orders.js';
import { OrderAssignmentConflictError } from '../domain/orders.js';
import { allocationCapacityProblems, recommendWorkshops } from '../domain/recommend.js';
import { fabricSupplyForPoloMaterial } from '../data/polo-fabrics.js';
import { committedWorkFromOrders } from './committed-work.js';
import { createWorkshopNotification } from '../domain/workshop-notifications.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';
import { recommendationFromQuotation } from './quotation-order-adapter.js';

export interface QuotationProductionOutcome {
  status:
    'recommended' | 'partially_recommended' | 'no_eligible_workshop' | 'requires_scope_decision';
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
      | 'capacity_changed'
      | 'invalid_order_transition',
    public readonly details?: unknown,
  ) {
    super(code);
  }
}

export class AssignmentDemoService {
  constructor(
    private readonly orders: OrderStore,
    private readonly workshops: WorkshopStore = new MemoryWorkshopStore(week03DeclaredWorkshops),
    private readonly now: () => string = () => new Date().toISOString(),
    private readonly createOrderId: () => string = () =>
      `PED-${randomUUID().slice(0, 8).toUpperCase()}`,
    private readonly deliveryDays = 0,
    private readonly handoffDays = 0,
  ) {}

  async withCommittedWork(request: RecommendationRequest): Promise<RecommendationRequest> {
    return { ...request, committedWork: committedWorkFromOrders(await this.orders.list()) };
  }

  async recommend(request: RecommendationRequest) {
    return recommendWorkshops(await this.withCommittedWork(request));
  }

  private capacityRequest(
    order: PortalOrder,
    workshops: RecommendationRequest['workshops'],
    evaluatedAt: string,
  ) {
    return recommendationRequestSchema.parse({
      evaluatedAt: order.planningAt ?? evaluatedAt,
      routeTiming: order.routeTiming,
      handoffDays: order.handoffDays,
      order: order.recommendationOrder ?? {
        id: order.id,
        product: order.draft.product,
        poloType: order.draft.poloType,
        material: order.draft.material,
        quantity: order.draft.quantity,
        // Incomplete legacy metadata uses the conservative workshop-sourcing constraint.
        fabricBuyer: 'workshop',
        fabricSupply: fabricSupplyForPoloMaterial(order.draft.material),
        requiredProcesses: order.requiredProcesses,
        embroideryApplicationsPerGarment: order.draft.embroideryApplicationsPerGarment ?? 1,
        requiredBy: `${order.draft.requiredBy}T18:00:00-05:00`,
      },
      workshops: workshopsForScope(workshops, order),
    });
  }

  async refreshRecommendation(orderId: string): Promise<PortalOrder> {
    const order = await this.orders.get(orderId);
    if (!order) throw new AssignmentFlowError('order_not_found');
    if (order.assignment) throw new AssignmentFlowError('invalid_order_transition');
    const timestamp = this.now();
    const request = this.capacityRequest(order, await this.workshops.list(), timestamp);
    const result = await this.recommend(request);
    const updated = await this.orders.updateRecommendation(
      order.id,
      result,
      request.order,
      timestamp,
    );
    if (!updated) throw new AssignmentFlowError('invalid_order_transition');
    return updated;
  }

  async catalog() {
    return {
      simulated: true as const,
      datasetVersion: WEEK_03_DATASET_VERSION,
      seed: WEEK_03_SEED,
      workshops: await this.workshops.list(),
      scenarios: week03AssignmentScenarios,
    };
  }

  async runScenario(scenarioId: string, fabricBuyer?: FabricBuyer): Promise<PortalOrder> {
    const scenario = findWeek03Scenario(scenarioId);
    if (!scenario) throw new AssignmentFlowError('scenario_not_found');

    const id = this.createOrderId();
    const request = recommendationForScenario(scenario, fabricBuyer);
    const workshops = (await this.workshops.list()).filter((workshop) => !workshop.testOnly);
    const input = recommendationRequestSchema.parse({
      ...request,
      order: { ...request.order, id },
      workshops,
    });
    const recommendation = await this.recommend(input);
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
      fabricBuyer: fabricBuyer ?? scenario.fabricBuyer,
      recommendation,
      recommendationOrder: input.order,
      planningAt: input.evaluatedAt,
      simulation: {
        datasetVersion: WEEK_03_DATASET_VERSION,
        scenarioId: scenario.id,
        seed: WEEK_03_SEED,
      },
    };
    return this.orders.create(order);
  }

  async compareScenario(scenarioId: string, fabricBuyer?: FabricBuyer) {
    const scenario = findWeek03Scenario(scenarioId);
    if (!scenario) throw new AssignmentFlowError('scenario_not_found');
    const request = recommendationForScenario(scenario, fabricBuyer);
    const workshops = (await this.workshops.list()).filter((workshop) => !workshop.testOnly);
    const centralizedRequest = await this.withCommittedWork(
      recommendationRequestSchema.parse({ ...request, workshops }),
    );
    return {
      simulated: true as const,
      datasetVersion: WEEK_03_DATASET_VERSION,
      seed: WEEK_03_SEED,
      scenario,
      request: {
        order: request.order,
        weights: request.weights,
        workshopCount: centralizedRequest.workshops.length,
      },
      comparison: compareRecommendationAlgorithms(centralizedRequest, WEEK_03_SEED),
    };
  }

  async createFromAcceptedQuotation(
    quotation: QuotationRequest,
  ): Promise<QuotationProductionOutcome> {
    const garments = [quotation.request.garment, ...quotation.request.additionalGarments];
    const evaluatedAt = this.now();
    const workshops = workshopsForScope(await this.workshops.list(), quotation);
    if (quotation.testOnly && workshops.length === 0) throw new AssignmentFlowError('no_eligible_workshops');
    // Prepare all garments before the store atomically saves and deduplicates the batch.
    const prepared = await Promise.all(
      garments.map(async (_garment, garmentIndex): Promise<PortalOrder> => {
        const id = this.createOrderId();
        const adapted = recommendationFromQuotation({
          orderId: id,
          quotation,
          garmentIndex,
          evaluatedAt,
          workshops,
          deliveryDays: this.deliveryDays,
          handoffDays: this.handoffDays,
        });
        const recommendation = await this.recommend(adapted.request);
        const hasCandidate = recommendation.candidates.length > 0;
        const order: PortalOrder = {
          id,
          ...(quotation.previewOnly ? { previewOnly: true } : {}),
          ...(quotation.testOnly ? { testOnly: true } : {}),
          ...(quotation.allowedWorkshopIds ? { allowedWorkshopIds: [...quotation.allowedWorkshopIds] } : {}),
          createdAt: evaluatedAt,
          updatedAt: evaluatedAt,
          status: hasCandidate ? 'recommended' : 'registered',
          draft: adapted.draft,
          requiredProcesses: adapted.requiredProcesses,
          ...(quotation.quotation ? { fabricBuyer: quotation.quotation.fabricBuyer } : {}),
          recommendation,
          recommendationOrder: adapted.request.order,
          routeTiming: adapted.request.routeTiming,
          handoffDays: adapted.request.handoffDays,
          simulation: {
            datasetVersion: WEEK_03_DATASET_VERSION,
            scenarioId: `quotation:${quotation.id}:garment-${garmentIndex + 1}`,
            seed: WEEK_03_SEED,
          },
          source: { type: 'quotation', quotationId: quotation.id, garmentIndex },
        };
        return order;
      }),
    );
    const orders = await this.orders.createMany(prepared);
    const feasible = orders.filter((order) => order.recommendation.candidates.length > 0).length;
    return {
      status:
        feasible === orders.length
          ? 'recommended'
          : feasible > 0
            ? 'partially_recommended'
            : 'no_eligible_workshop',
      orderIds: orders.map((order) => order.id),
      message:
        feasible === orders.length
          ? `${orders.length === 1 ? 'Orden creada y evaluada' : `${orders.length} órdenes creadas y evaluadas por prenda`}. Perú Activa debe confirmar la asignación antes de iniciar el trabajo.`
          : `${orders.length} órdenes creadas: ${feasible} con propuesta y ${orders.length - feasible} pendientes de una alternativa de Perú Activa. No necesitas volver a registrar el pedido.`,
      orders,
    };
  }

  async confirm(orderId: string, candidateId: string): Promise<PortalOrder> {
    const order = await this.orders.get(orderId);
    if (!order) throw new AssignmentFlowError('order_not_found');
    if (order.assignment) {
      if (
        order.assignment.candidateId === candidateId ||
        order.assignment.workshopId === candidateId
      )
        return order;
      throw new AssignmentFlowError('invalid_order_transition');
    }

    const candidate = order.recommendation.candidates.find(
      (item) => item.candidateId === candidateId || item.workshopId === candidateId,
    );
    if (!candidate) throw new AssignmentFlowError('workshop_not_recommended');

    const confirmedAt = this.now();
    const assignment: OrderAssignment = {
      candidateId: candidate.candidateId,
      workshopId: candidate.workshopId,
      displayName: candidate.displayName,
      confirmedAt,
      allocations: candidate.allocations.map((allocation) => ({
        workshopId: allocation.workshopId,
        displayName: allocation.displayName,
        quantity: allocation.quantity,
        assignedProcesses: allocation.assignedProcesses || order.requiredProcesses,
        status: 'assigned',
      })),
    };
    const notifications = assignment.allocations.map((allocation) =>
      createWorkshopNotification({
        orderId: order.id,
        draft: order.draft,
        assignment,
        workshopId: allocation.workshopId,
        requiredProcesses: allocation.assignedProcesses,
        publishedAt: confirmedAt,
      }),
    );
    const workshops = await this.workshops.list();
    const request = this.capacityRequest(order, workshops, confirmedAt);
    let updated: PortalOrder | undefined;
    try {
      updated = await this.orders.assign(
        order.id,
        assignment,
        notifications,
        (orders, latestWorkshops) => {
          const problems = allocationCapacityProblems(
            {
              ...request,
              ...(latestWorkshops ? { workshops: workshopsForScope(latestWorkshops, order) } : {}),
              committedWork: committedWorkFromOrders(orders),
            },
            assignment.allocations,
            candidate.workflowSteps,
          );
          if (problems.length) throw new AssignmentFlowError('capacity_changed', problems);
        },
      );
    } catch (error) {
      if (error instanceof OrderAssignmentConflictError)
        throw new AssignmentFlowError('invalid_order_transition');
      throw error;
    }
    if (!updated) throw new AssignmentFlowError('order_not_found');
    return updated;
  }

  async notifications() {
    const orders = await this.orders.list();
    return orders.filter((order) => !order.previewOnly).flatMap(
      (order) => order.notifications || (order.notification ? [order.notification] : []),
    );
  }

  async updateWorkshopStatus(
    orderId: string,
    workshopId: string,
    status: 'in_production' | 'completed',
  ): Promise<PortalOrder> {
    const order = await this.orders.get(orderId);
    if (!order) throw new AssignmentFlowError('order_not_found');
    const allocation =
      order.assignment?.allocations?.find((item) => item.workshopId === workshopId) ||
      (order.assignment?.workshopId === workshopId
        ? { workshopId, status: order.status }
        : undefined);
    if (!allocation) {
      throw new AssignmentFlowError('workshop_not_assigned');
    }
    const expected = allocation.status === 'assigned' ? 'in_production' : 'completed';
    if (status !== expected || !['assigned', 'in_production'].includes(allocation.status)) {
      throw new AssignmentFlowError('invalid_order_transition');
    }
    const updated = await this.orders.updateAllocationStatus(
      orderId,
      workshopId,
      status,
      this.now(),
    );
    if (!updated) throw new AssignmentFlowError('order_not_found');
    return updated;
  }
}
