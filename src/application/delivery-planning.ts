import type { OrderStore } from '../data/order-store.js';
import type { WorkshopStore } from '../data/workshop-store.js';
import {
  recommendationRequestSchema,
  type CommittedWork,
  type FabricBuyer,
  type RankedCandidate,
  type Workshop,
} from '../domain/contracts.js';
import {
  addDateDays,
  calendarDaysBetween,
  deliveryPlanningInputSchema,
  deliveryPolicySchema,
  limaDate,
  type DeliveryEstimate,
  type DeliveryPlanningInput,
  type DeliveryPolicy,
} from '../domain/delivery-estimate.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';
import { planLeadTimeDays, recommendWorkshops } from '../domain/recommend.js';
import { workshopsForScope } from '../domain/workshop-scope.js';
import { committedWorkFromOrders } from './committed-work.js';
import { fabricCategory, productionOrderForGarment } from './quotation-order-adapter.js';

interface DeliveryPlanningContext {
  quotation?: QuotationRequest;
  requiredBy?: string;
}

interface ApprovalOptions {
  approving?: boolean;
  approvalDate?: string;
}

interface DeliveryPlanningSnapshot {
  evaluatedAt: string;
  garments: DeliveryPlanningInput['garment'][];
  workshops: Workshop[];
  committed: CommittedWork[];
  quoted: QuotationRequest['quotation'];
  requiredBy: string | undefined;
}

export class DeliveryPlanningService {
  readonly policy: DeliveryPolicy;
  constructor(
    private readonly orders: OrderStore,
    private readonly workshops: WorkshopStore,
    policy: Partial<DeliveryPolicy> = {},
    private readonly now: () => Date = () => new Date(),
  ) {
    this.policy = deliveryPolicySchema.parse(policy);
  }

  async estimate(
    input: DeliveryPlanningInput,
    options: DeliveryPlanningContext & ApprovalOptions = {},
  ): Promise<DeliveryEstimate> {
    const evaluate = await this.prepareEstimate(input, options);
    return evaluate(options);
  }

  async prepareEstimate(
    input: DeliveryPlanningInput,
    { quotation, requiredBy }: DeliveryPlanningContext = {},
  ): Promise<(options?: ApprovalOptions) => DeliveryEstimate> {
    const parsed = deliveryPlanningInputSchema.parse(input);
    const evaluatedAt = this.now().toISOString();
    const [allWorkshops, orders] = await Promise.all([this.workshops.list(), this.orders.list()]);
    const snapshot: DeliveryPlanningSnapshot = {
      evaluatedAt,
      garments: [parsed.garment, ...parsed.additionalGarments],
      workshops: workshopsForScope(allWorkshops, quotation ?? {}),
      committed: committedWorkFromOrders(orders),
      quoted: quotation?.quotation,
      requiredBy,
    };
    return (options = {}) => this.estimateFromSnapshot(snapshot, options);
  }

  private estimateFromSnapshot(
    { evaluatedAt, garments, workshops, committed, quoted, requiredBy }: DeliveryPlanningSnapshot,
    options: ApprovalOptions,
  ): DeliveryEstimate {
    const today = limaDate(evaluatedAt);
    const approvalDays = options.approving ? 0 : options.approvalDate
      ? Math.max(0, calendarDaysBetween(today, options.approvalDate)) : this.policy.approvalDays;
    const approvalBy = addDateDays(today, approvalDays);
    const horizonDate = addDateDays(today, this.policy.horizonDays);
    const productionNotBefore = options.approvalDate && !options.approving
      ? `${approvalBy}T23:59:59.999-05:00` : new Date(
      Date.parse(evaluatedAt) + approvalDays * 86_400_000,
    ).toISOString();
    const materialPending =
      garments.some((garment) => garment.fabric.mode === 'proposal') && !quoted;
    const result: DeliveryEstimate = {
      status: 'unavailable',
      evaluatedAt,
      approvalBy,
      earliestDate: null,
      horizonDate,
      policy: this.policy,
      materialPending,
    };
    if (!workshops.length) return result;

    let evaluations = 0;
    let searchLimited = false;
    const feasible = (deliveryDate: string): boolean => {
      const productionDeadline = `${addDateDays(deliveryDate, -this.policy.deliveryDays)}T18:00:00-05:00`;
      const search = (index: number, planned: CommittedWork[]): boolean => {
        if (++evaluations > this.policy.maximumPlanEvaluations) {
          searchLimited = true;
          return false;
        }
        const garment = garments[index];
        if (!garment) return true;
        const selectedFabric =
          quoted?.lineItems?.find((line) => line.garmentIndex === index)?.selectedFabric ??
          quoted?.selectedFabric;
        const materials = selectedFabric
          ? [selectedFabric]
          : garment.fabric.mode === 'specified'
            ? [garment.fabric.name]
            : [...new Set(workshops.flatMap((workshop) => workshop.materials))];
        for (const material of materials) {
          const order = productionOrderForGarment({
            id: `planning-garment-${index}`,
            garment,
            selectedFabric: fabricCategory(material),
            fabricBuyer: quoted?.fabricBuyer ?? ('peru_activa' as FabricBuyer),
            requiredBy: productionDeadline,
            productionNotBefore,
          });
          const request = recommendationRequestSchema.parse({
            evaluatedAt,
            routeTiming: 'sequential_phases',
            handoffDays: this.policy.handoffDays,
            order,
            workshops,
            committedWork: [...committed, ...planned],
          });
          const candidates = recommendWorkshops(request, workshops, garments.length > 1).candidates;
          for (const candidate of candidates) {
            const reservations = plannedReservations(
              candidate,
              order.id,
              order.requiredProcesses,
              order.embroideryApplicationsPerGarment,
              new Date(
                Date.parse(evaluatedAt) +
                  planLeadTimeDays(request, candidate.allocations, candidate.workflowSteps) *
                    86_400_000,
              ).toISOString(),
            );
            if (
              search(index + 1, [
                ...planned,
                ...reservations.map((work) => ({ ...work, material: order.material })),
              ])
            )
              return true;
          }
        }
        return false;
      };
      return search(0, []);
    };

    // Validate the requested date and find the minimum against the same snapshot.
    const selectedIsFeasible = requiredBy ? feasible(requiredBy) : true;
    if (searchLimited) return { ...result, reason: 'search_limit' };
    // Scan rather than assume monotonicity of discrete allocations and route fallbacks.
    for (
      let days = Math.max(1, approvalDays + this.policy.deliveryDays);
      days <= this.policy.horizonDays;
      days++
    ) {
      const date = addDateDays(today, days);
      if (feasible(date))
        return {
          ...result,
          status: selectedIsFeasible ? 'available' : 'unavailable',
          earliestDate: date,
        };
      if (searchLimited) return { ...result, reason: 'search_limit' };
    }
    return result;
  }
}

function plannedReservations(
  candidate: RankedCandidate,
  orderId: string,
  processes: CommittedWork['assignedProcesses'],
  applications: number,
  reservedUntil: string,
): CommittedWork[] {
  return candidate.allocations.map((allocation) => ({
    orderId,
    reservedUntil,
    workshopId: allocation.workshopId,
    quantity: allocation.quantity,
    assignedProcesses: allocation.assignedProcesses ?? processes,
    embroideryApplicationsPerGarment: applications,
  }));
}
