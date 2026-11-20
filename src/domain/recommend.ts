import { productionForMaterial } from './material-production.js';
import { RECOMMENDATION_VERSION } from './contracts.js';
import { withoutRedundantSplits } from './assignment-plans.js';
import type {
  DimensionScores,
  RecommendationRequest,
  RecommendationResult,
  Process,
  WorkshopAllocation,
  Weights,
  Workshop,
  WorkflowStep,
} from './contracts.js';
import { materialFamilyFor } from './material-families.js';

const DAY_MS = 86_400_000;
const WORKING_DAY_BY_UTC_INDEX = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

const evidenceScores = {
  declared: 0.4,
  verified: 0.75,
  historical: 1,
} as const;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('es-PE');
}

function effectiveRequiredProcesses(request: RecommendationRequest) {
  const productionProcesses = request.order.requiredProcesses.filter(
    (process) => process !== 'fabric_sourcing',
  );
  return request.order.fabricBuyer === 'workshop'
    ? [...productionProcesses, 'fabric_sourcing' as const]
    : productionProcesses;
}

function missingProcesses(request: RecommendationRequest, workshop: Workshop): string[] {
  const available = new Set(workshop.processes);
  return effectiveRequiredProcesses(request).filter((process) => !available.has(process));
}

function workingDaysBetween(startTimestamp: number, endTimestamp: number, workshop: Workshop) {
  const calendarDays = Math.max(0, Math.floor((endTimestamp - startTimestamp) / DAY_MS));
  if (!workshop.workingDays) return calendarDays;
  return Array.from(
    { length: calendarDays },
    (_unused, index) => startTimestamp + (index + 1) * DAY_MS,
  ).filter((timestamp) =>
    workshop.workingDays!.includes(WORKING_DAY_BY_UTC_INDEX[new Date(timestamp).getUTCDay()]!),
  ).length;
}

function calendarDaysForWork(
  startTimestamp: number,
  requiredWorkingDays: number,
  workshop: Workshop,
) {
  if (requiredWorkingDays <= 0) return 0;
  if (!workshop.workingDays) return requiredWorkingDays;
  const workingDaysPerWeek = new Set(workshop.workingDays).size;
  const fullWeeks = Math.max(
    0,
    Math.floor((Math.ceil(requiredWorkingDays) - 1) / workingDaysPerWeek),
  );
  let elapsed = fullWeeks * 7;
  let completed = fullWeeks * workingDaysPerWeek;
  while (completed < requiredWorkingDays) {
    const day = WORKING_DAY_BY_UTC_INDEX[new Date(startTimestamp + elapsed * DAY_MS).getUTCDay()]!;
    if (workshop.workingDays.includes(day)) completed += 1;
    elapsed += 1;
  }
  return elapsed;
}

function effectiveRate(
  workshop: Workshop,
  assignedProcesses: Process[],
): { quantity: number; days: number } | undefined {
  if (assignedProcesses.includes('embroidery')) return effectiveEmbroideryRate(workshop);
  if (assignedProcesses.includes('vinyl') && workshop.vinylProfile) {
    return workshop.vinylProfile.productionRate;
  }
  return workshop.productionRate;
}

function workload(request: RecommendationRequest, assignedProcesses: Process[]): number {
  if (assignedProcesses.includes('patternmaking') && assignedProcesses.length === 1) return 1;
  if (assignedProcesses.includes('embroidery')) {
    return request.order.quantity * request.order.embroideryApplicationsPerGarment;
  }
  return request.order.quantity;
}

function committedWork(request: RecommendationRequest, workshop: Workshop) {
  return (request.committedWork ?? []).filter(
    (work) => work.workshopId === workshop.id && work.orderId !== request.order.id,
  );
}

function committedUnits(request: RecommendationRequest, workshop: Workshop): number {
  return committedWork(request, workshop).reduce(
    (total, work) =>
      total +
      workload(
        {
          ...request,
          order: {
            ...request.order,
            quantity: work.quantity,
            embroideryApplicationsPerGarment: work.embroideryApplicationsPerGarment,
          },
        },
        work.assignedProcesses,
      ),
    0,
  );
}

// Conservative queue: unfinished allocations retain all their work until completed.
// Rates share a workshop's working calendar; no progress or parallel machines are inferred.
function committedDaysAfterReady(
  request: RecommendationRequest,
  workshop: Workshop,
  startsAt: number,
): number {
  const work = committedWork(request, workshop);
  const committedDays = work.filter((entry) => !entry.reservedUntil).reduce((total, entry) => {
    const rate = effectiveRate(productionForMaterial(workshop, entry.material ?? request.order.material), entry.assignedProcesses);
    if (!rate) return Number.POSITIVE_INFINITY;
    const units = workload({ ...request, order: { ...request.order, quantity: entry.quantity,
      embroideryApplicationsPerGarment: entry.embroideryApplicationsPerGarment } }, entry.assignedProcesses);
    return total + units * rate.days / rate.quantity;
  }, 0);
  const queueStartsAt = Math.max(Date.parse(request.evaluatedAt),
    workshop.availableFrom ? Date.parse(workshop.availableFrom) : 0);
  const remaining = Math.max(0, committedDays - workingDaysBetween(queueStartsAt, startsAt, workshop));
  // Hypothetical plans carry a complete schedule; do not consume their work again
  // or assume they can be produced during the customer's approval window.
  const reservedUntil = Math.max(0, ...work.map((entry) => entry.reservedUntil ? Date.parse(entry.reservedUntil) : 0));
  const reservedDays = Math.max(0, Math.ceil((reservedUntil - startsAt) / DAY_MS));
  return Math.max(remaining, reservedDays);
}

function remainingFixedCapacity(request: RecommendationRequest, workshop: Workshop): number {
  return Math.max(
    0,
    Math.min(workshop.maximumUnits, workshop.availableCapacity) - committedUnits(request, workshop),
  );
}

function fixedCapacityFor(
  request: RecommendationRequest,
  workshop: Workshop,
  processes: Process[] = effectiveRequiredProcesses(request),
): number {
  const units = remainingFixedCapacity(request, workshop);
  return processes.includes('embroidery')
    ? Math.floor(units / request.order.embroideryApplicationsPerGarment)
    : units;
}

function effectiveLeadTimeDays(
  request: RecommendationRequest,
  workshop: Workshop,
  assignedProcesses: Process[] = effectiveRequiredProcesses(request),
): number {
  const evaluatedAt = Date.parse(request.evaluatedAt);
  const fabricReadyAt = evaluatedAt + request.order.fabricSupply.remainingLeadTimeDays * DAY_MS;
  const availableFrom = workshop.availableFrom ? Date.parse(workshop.availableFrom) : evaluatedAt;
  const startsAt = Math.max(
    fabricReadyAt, availableFrom,
    request.order.productionNotBefore ? Date.parse(request.order.productionNotBefore) : evaluatedAt,
  );
  const waitingDays = Math.max(0, Math.ceil((startsAt - evaluatedAt) / DAY_MS));
  const production = productionForMaterial(workshop, request.order.material);
  const rate = effectiveRate(production, assignedProcesses);
  const productionWorkingDays = rate
    ? Math.ceil((workload(request, assignedProcesses) * rate.days) / rate.quantity)
    : 0;
  const processMinimumWorkingDays = Math.max(
    0,
    ...assignedProcesses.map((process) => workshop.minimumLeadTimeDaysByProcess?.[process] ?? 0),
  );
  const requiredWorkingDays = Math.max(
    production.estimatedLeadTimeDays,
    processMinimumWorkingDays,
    productionWorkingDays,
  );
  const queueDays = rate ? committedDaysAfterReady(request, workshop, startsAt) : 0;
  if (!Number.isFinite(queueDays)) return Number.POSITIVE_INFINITY;
  return (
    waitingDays +
    calendarDaysForWork(startsAt, Math.ceil(requiredWorkingDays + queueDays), workshop)
  );
}

/** Independent providers within a phase run in parallel.
 * A provider revisited after another phase retains its declared service time.
 * Phase-specific durations and batch overlap require explicit scheduling data.
 */
export function planLeadTimeDays(
  request: RecommendationRequest,
  allocations: WorkshopAllocation[],
  workflowSteps?: WorkflowStep[],
): number {
  const duration = (allocation: WorkshopAllocation, processes: Process[], readyAt: number) => {
    const workshop = request.workshops.find((item) => item.id === allocation.workshopId)!;
    return effectiveLeadTimeDays({
      ...request,
      order: { ...request.order, quantity: allocation.quantity,
        productionNotBefore: new Date(readyAt).toISOString() },
    }, workshop, processes);
  };
  const origin = Date.parse(request.evaluatedAt);
  let readyAt = Math.max(origin, Date.parse(request.order.productionNotBefore ?? request.evaluatedAt));
  if (!workflowSteps?.length || request.routeTiming !== 'sequential_phases') return Math.max(...allocations.map((allocation) =>
    duration(allocation, allocation.assignedProcesses ?? effectiveRequiredProcesses(request), readyAt)));
  const phases: WorkflowStep[][] = [];
  for (const step of workflowSteps) {
    const previous = phases.at(-1);
    if (previous?.[0]?.process === step.process) previous.push(step);
    else phases.push([step]);
  }
  const merged: WorkflowStep[][] = [];
  const owners = (phase: WorkflowStep[]) => JSON.stringify([...new Set(phase.map((step) => step.workshopId))].sort());
  for (const phase of phases) {
    const previous = merged.at(-1);
    if (previous && owners(previous) === owners(phase)) previous.push(...phase);
    else merged.push([...phase]);
  }
  for (const [index, phase] of merged.entries()) {
    if (index > 0) readyAt += request.handoffDays * DAY_MS;
    const elapsed = Math.max(...allocations.filter((allocation) =>
      phase.some((step) => step.workshopId === allocation.workshopId)).map((allocation) =>
      duration(allocation, [...new Set(phase.filter((step) => step.workshopId === allocation.workshopId)
        .map((step) => step.process))], readyAt)));
    if (!Number.isFinite(elapsed)) return Number.POSITIVE_INFINITY;
    readyAt = origin + elapsed * DAY_MS;
  }
  return (readyAt - origin) / DAY_MS;
}

function effectiveEmbroideryRate(
  workshop: Workshop,
): { quantity: number; days: number } | undefined {
  if (!workshop.embroideryProfile || !workshop.productionRate) return undefined;
  const { headCount, availableHeadCount } = workshop.embroideryProfile;
  if (availableHeadCount === 0) return undefined;
  return {
    quantity: workshop.productionRate.quantity * (availableHeadCount / headCount),
    days: workshop.productionRate.days,
  };
}

function capacityBeforeDeadline(
  request: RecommendationRequest,
  workshop: Workshop,
  assignedProcesses: Process[] = effectiveRequiredProcesses(request),
): number | undefined {
  const production = productionForMaterial(workshop, request.order.material);
  const rate = effectiveRate(production, assignedProcesses);
  if (!rate) return undefined;
  const evaluatedAt = Date.parse(request.evaluatedAt);
  const fabricReadyAt = evaluatedAt + request.order.fabricSupply.remainingLeadTimeDays * DAY_MS;
  const availableFrom = workshop.availableFrom ? Date.parse(workshop.availableFrom) : evaluatedAt;
  const startsAt = Math.max(
    fabricReadyAt, availableFrom,
    request.order.productionNotBefore ? Date.parse(request.order.productionNotBefore) : evaluatedAt,
  );
  const deadline = Date.parse(request.order.requiredBy);
  const workingDays = Math.max(
    0,
    workingDaysBetween(startsAt, deadline, workshop) -
      committedDaysAfterReady(request, workshop, startsAt),
  );
  const serviceUnits = Math.floor((workingDays * rate.quantity) / rate.days + 1e-9);
  const availableUnits =
    workshop.capacityPlanningMode === 'throughput'
      ? serviceUnits
      : Math.min(serviceUnits, remainingFixedCapacity(request, workshop));
  return assignedProcesses.includes('embroidery')
    ? Math.floor(availableUnits / request.order.embroideryApplicationsPerGarment)
    : availableUnits;
}

function supportsMaterial(material: string, workshop: Workshop): boolean {
  const declaredMaterials = new Set(workshop.materials.map(normalize));
  if (declaredMaterials.has(normalize(material))) return true;
  if (workshop.materialMatchingMode === 'declared_only') return false;

  const requestedFamily = materialFamilyFor(material);
  if (requestedFamily && workshop.materialFamilies.includes(requestedFamily)) return true;
  return false;
}

function supportsPoloType(request: RecommendationRequest, workshop: Workshop): boolean {
  if (request.order.product !== 'polo' || !request.order.poloType) return true;
  if (workshop.providerType === 'process_provider' || !workshop.poloTypes) return true;
  return workshop.poloTypes.includes(request.order.poloType);
}

function rejectionReasons(request: RecommendationRequest, workshop: Workshop): string[] {
  const reasons: string[] = [];
  const products = new Set(workshop.products.map(normalize));
  const missing = missingProcesses(request, workshop);
  const availableDays = Math.floor(
    (Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS,
  );

  if (!products.has(normalize(request.order.product))) reasons.push('producto no atendido');
  if (!supportsPoloType(request, workshop)) reasons.push('tipo de polo no atendido');
  if (!supportsMaterial(request.order.material, workshop)) reasons.push('material no atendido');
  if (productionForMaterial(workshop, request.order.material).capacityStatus === 'unknown') reasons.push('capacidad productiva no registrada');
  if (missing.includes('fabric_sourcing')) reasons.push('no gestiona la compra de tela');
  const missingProduction = missing.filter((process) => process !== 'fabric_sourcing');
  if (missingProduction.length > 0)
    reasons.push(`procesos faltantes: ${missingProduction.join(', ')}`);
  if (request.order.quantity < workshop.minimumUnits) reasons.push('cantidad menor al mínimo');
  const deadlineCapacity = capacityBeforeDeadline(request, workshop);
  if (deadlineCapacity !== undefined) {
    if (request.order.quantity > deadlineCapacity)
      reasons.push(
        workshop.embroideryProfile
          ? 'capacidad de bordado insuficiente para el plazo'
          : 'capacidad productiva insuficiente para el plazo',
      );
  } else {
    if (request.order.quantity > workshop.maximumUnits) reasons.push('cantidad mayor al máximo');
    if (request.order.quantity > fixedCapacityFor(request, workshop))
      reasons.push('capacidad disponible insuficiente');
  }
  if (availableDays < 0 || effectiveLeadTimeDays(request, workshop) > availableDays) {
    reasons.push('disponibilidad o plazo insuficiente');
  }

  return reasons;
}

function compatibilityReasons(request: RecommendationRequest, workshop: Workshop): string[] {
  const reasons: string[] = [];
  const products = new Set(workshop.products.map(normalize));
  const missing = missingProcesses(request, workshop);
  const availableDays = Math.floor(
    (Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS,
  );

  if (!products.has(normalize(request.order.product))) reasons.push('producto no atendido');
  if (!supportsPoloType(request, workshop)) reasons.push('tipo de polo no atendido');
  if (!supportsMaterial(request.order.material, workshop))
    reasons.push('tela o material no atendido');
  if (productionForMaterial(workshop, request.order.material).capacityStatus === 'unknown') reasons.push('capacidad productiva no registrada');
  if (missing.includes('fabric_sourcing')) reasons.push('no gestiona la compra de tela');
  const missingProduction = missing.filter((process) => process !== 'fabric_sourcing');
  if (missingProduction.length > 0)
    reasons.push(`procesos faltantes: ${missingProduction.join(', ')}`);
  // A distributed plan asks each workshop for a fraction, not the full order.
  const minimumRequest = {
    ...request,
    order: { ...request.order, quantity: Math.max(1, workshop.minimumUnits) },
  };
  const capacity = capacityBeforeDeadline(request, workshop) ?? fixedCapacityFor(request, workshop);
  if (
    capacity < minimumRequest.order.quantity ||
    availableDays < 0 ||
    effectiveLeadTimeDays(minimumRequest, workshop) > availableDays
  ) {
    reasons.push('disponibilidad o plazo insuficiente');
  }
  return reasons;
}

function combinations<T>(items: T[], size: number): T[][] {
  if (size === 0) return [[]];
  return items.flatMap((item, index) =>
    combinations(items.slice(index + 1), size - 1).map((tail) => [item, ...tail]),
  );
}

function allocateQuantity(
  quantity: number,
  workshops: Workshop[],
  assignedProcesses: Process[],
  request?: RecommendationRequest,
): WorkshopAllocation[] | undefined {
  const ordered = [...workshops].sort(
    (left, right) =>
      right.onTimeRate - left.onTimeRate ||
      left.defectRate - right.defectRate ||
      left.id.localeCompare(right.id),
  );
  const minimum = ordered.reduce((sum, workshop) => sum + workshop.minimumUnits, 0);
  const capacities = ordered.map((workshop) =>
    (request && capacityBeforeDeadline(request, workshop, assignedProcesses)) ??
    (request
      ? fixedCapacityFor(request, workshop, assignedProcesses)
      : Math.min(workshop.maximumUnits, workshop.availableCapacity)),
  );
  const maximum = capacities.reduce((sum, capacity) => sum + capacity, 0);
  if (
    quantity < minimum ||
    quantity > maximum ||
    ordered.some((workshop, index) => workshop.minimumUnits > capacities[index]!)
  ) {
    return undefined;
  }

  let remaining = quantity - minimum;
  const extraCapacity = maximum - minimum;
  const allocations = ordered.map((workshop, index) => {
    const capacity = capacities[index]!;
    const availableExtra = capacity - workshop.minimumUnits;
    const extra =
      remaining === 0 || extraCapacity === 0
        ? 0
        : index === ordered.length - 1
          ? Math.min(remaining, availableExtra)
          : Math.min(
              remaining,
              Math.floor(((quantity - minimum) * availableExtra) / extraCapacity),
            );
    remaining -= extra;
    return {
      workshopId: workshop.id,
      displayName: workshop.displayName,
      quantity: workshop.minimumUnits + extra,
      availableCapacity: capacity,
      effectiveLeadTimeDays: 0,
      estimatedCost: 0,
      assignedProcesses,
    };
  });

  for (const allocation of allocations) {
    if (remaining === 0) break;
    const extra = Math.min(remaining, allocation.availableCapacity - allocation.quantity);
    allocation.quantity += extra;
    remaining -= extra;
  }
  return allocations;
}

interface CandidatePlan {
  workshops: Workshop[];
  allocations: WorkshopAllocation[];
  workflowSteps?: WorkflowStep[];
  pipeline?: true;
}

function baseRouteReasons(
  request: RecommendationRequest,
  workshop: Workshop,
  assignedProcesses: Process[] = effectiveRequiredProcesses(request),
): string[] {
  const reasons: string[] = [];
  const products = new Set(workshop.products.map(normalize));
  if (!products.has(normalize(request.order.product))) reasons.push('producto no atendido');
  if (!supportsPoloType(request, workshop)) reasons.push('tipo de polo no atendido');
  if (!supportsMaterial(request.order.material, workshop)) reasons.push('material no atendido');
  if (productionForMaterial(workshop, request.order.material).capacityStatus === 'unknown') reasons.push('capacidad productiva no registrada');
  const requiredUnits =
    assignedProcesses.length === 1 && assignedProcesses[0] === 'patternmaking'
      ? 1
      : request.order.quantity;
  if (requiredUnits < workshop.minimumUnits) reasons.push('cantidad menor al mínimo');
  const capacity =
    capacityBeforeDeadline(request, workshop, assignedProcesses) ??
    fixedCapacityFor(request, workshop, assignedProcesses);
  if (requiredUnits > capacity) reasons.push('capacidad insuficiente');
  return reasons;
}

export function allocationCapacityProblems(
  request: RecommendationRequest,
  allocations: Array<Pick<WorkshopAllocation, 'workshopId' | 'quantity' | 'assignedProcesses'>>,
  workflowSteps?: WorkflowStep[],
): RecommendationResult['rejected'] {
  if (workflowSteps && allocations.every((allocation) => request.workshops.some((workshop) => workshop.id === allocation.workshopId))) {
    const lead = planLeadTimeDays(request, allocations.map((allocation) => ({ ...allocation,
      displayName: allocation.workshopId, availableCapacity: 0, effectiveLeadTimeDays: 0, estimatedCost: 0 })), workflowSteps);
    const availableDays = Math.floor((Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS);
    if (lead > availableDays) return allocations.map((allocation) => ({
      workshopId: allocation.workshopId, displayName: allocation.workshopId,
      reasons: ['la ruta completa ya no cumple el plazo disponible'],
    }));
  }
  const requiredProcesses = effectiveRequiredProcesses(request);
  const quantityMismatch = requiredProcesses
    .filter((process) => process !== 'design' && process !== 'patternmaking')
    .some((process) => {
      const coveredQuantity = allocations.reduce((total, allocation) => {
        const processes = allocation.assignedProcesses ?? requiredProcesses;
        return processes.includes(process) ? total + allocation.quantity : total;
      }, 0);
      return coveredQuantity !== request.order.quantity;
    });
  return allocations.flatMap((allocation) => {
    const workshop = request.workshops.find((item) => item.id === allocation.workshopId);
    if (!workshop)
      return [
        {
          workshopId: allocation.workshopId,
          displayName: allocation.workshopId,
          reasons: ['taller no disponible'],
        },
      ];
    const allocatedRequest = {
      ...request,
      order: { ...request.order, quantity: allocation.quantity },
    };
    const processes = allocation.assignedProcesses ?? requiredProcesses;
    const capacity =
      capacityBeforeDeadline(allocatedRequest, workshop, processes) ??
      fixedCapacityFor(allocatedRequest, workshop, processes);
    const units =
      processes.length === 1 && processes[0] === 'patternmaking' ? 1 : allocation.quantity;
    const reasons: string[] = [];
    if (quantityMismatch) reasons.push('el reparto no coincide con la cantidad solicitada');
    if (productionForMaterial(workshop, request.order.material).capacityStatus === 'unknown') reasons.push('capacidad productiva no registrada');
    if (units < workshop.minimumUnits) reasons.push('cantidad menor al mínimo del taller');
    if (units > capacity) reasons.push('capacidad disponible insuficiente');
    const availableDays = Math.floor(
      (Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS,
    );
    if (availableDays < effectiveLeadTimeDays(allocatedRequest, workshop, processes))
      reasons.push('disponibilidad o plazo insuficiente');
    return reasons.length
      ? [{ workshopId: workshop.id, displayName: workshop.displayName, reasons }]
      : [];
  });
}

function specializedRoutePlans(request: RecommendationRequest): CandidatePlan[] {
  const required = new Set(effectiveRequiredProcesses(request));
  const needsSublimation = required.has('sublimation');
  const needsEmbroidery = required.has('embroidery');
  const needsVinyl = required.has('vinyl');
  const needsPatternmaking = request.order.requiresNewPattern && required.has('patternmaking');
  if (!needsSublimation && !needsEmbroidery && !needsVinyl && !needsPatternmaking) return [];

  const externalProcesses = new Set<Process>(['sublimation', 'embroidery', 'vinyl']);
  const producerProcesses = [...required].filter(
    (process) => !externalProcesses.has(process) && process !== 'design',
  );
  const producers = request.workshops.filter((workshop) => {
    const blockingReasons = baseRouteReasons(request, workshop, producerProcesses).filter(
      (reason) => reason !== 'capacidad insuficiente' && reason !== 'cantidad menor al mínimo',
    );
    return (
      workshop.providerType === 'garment_producer' &&
      blockingReasons.length === 0 &&
      producerProcesses.every((process) => workshop.processes.includes(process)) &&
      workshop.technicalCapabilities.includes('garment_sewing') &&
      workshop.technicalCapabilities.includes('finishing')
    );
  });
  const producerGroups = [1, 2, 3].flatMap((size) => combinations(producers, size));
  const sublimationProviders = needsSublimation
    ? request.workshops.filter(
        (workshop) =>
          workshop.providerType === 'process_provider' &&
          Boolean(workshop.sublimationProfile) &&
          baseRouteReasons(request, workshop, ['sublimation']).length === 0,
      )
    : [undefined];
  const embroideryProviders = needsEmbroidery
    ? request.workshops.filter(
        (workshop) =>
          workshop.providerType === 'process_provider' &&
          Boolean(workshop.embroideryProfile) &&
          workshop.technicalCapabilities.includes('machine_embroidery') &&
          baseRouteReasons(request, workshop, ['embroidery']).length === 0,
      )
    : [undefined];
  const vinylProviders = needsVinyl
    ? request.workshops.filter(
        (workshop) =>
          workshop.providerType === 'process_provider' &&
          Boolean(workshop.vinylProfile) &&
          workshop.technicalCapabilities.includes('vinyl_application') &&
          baseRouteReasons(request, workshop, ['vinyl']).length === 0,
      )
    : [undefined];
  return producerGroups.flatMap((producerGroup) =>
    sublimationProviders.flatMap((sublimationProvider) =>
      embroideryProviders.flatMap((embroideryProvider) =>
        vinylProviders.flatMap((vinylProvider) => {
          if (needsSublimation && !sublimationProvider) return [];
          if (needsEmbroidery && !embroideryProvider) return [];
          if (needsVinyl && !vinylProvider) return [];
          const primaryProducer = producerGroup[0]!;
          const producerAllocations = allocateQuantity(
            request.order.quantity,
            producerGroup,
            producerProcesses,
            request,
          );
          if (!producerAllocations) return [];

          const steps: Array<Omit<WorkflowStep, 'sequence'>> = [];
          const push = (
            process: Process,
            workshop: Workshop,
            states: Pick<WorkflowStep, 'inputState' | 'outputState'> = {},
          ) =>
            steps.push({
              process,
              workshopId: workshop.id,
              displayName: workshop.displayName,
              ...states,
            });
          const add = (
            process: Process,
            workshop: Workshop,
            states: Pick<WorkflowStep, 'inputState' | 'outputState'> = {},
          ) => {
            if (required.has(process)) push(process, workshop, states);
          };

          for (const producer of producerGroup) add('fabric_sourcing', producer);
          if (needsPatternmaking) add('patternmaking', primaryProducer);
          const designOwner = sublimationProvider ?? vinylProvider ?? primaryProducer;
          add('design', designOwner, { outputState: 'digital_layout' });

          if (sublimationProvider?.sublimationProfile?.method === 'flat_press') {
            if (
              producerGroup.some(
                (producer) => !producer.technicalCapabilities.includes('manual_cutting'),
              )
            )
              return [];
            for (const producer of producerGroup)
              add('cutting', producer, {
                inputState: 'fabric_roll',
                outputState: 'cut_panels',
              });
            push('transfer_printing', sublimationProvider, {
              inputState: 'digital_layout',
              outputState: 'printed_transfer',
            });
            add('sublimation', sublimationProvider, {
              inputState: 'cut_panels',
              outputState: 'sublimated_cut_panels',
            });
          } else if (sublimationProvider) {
            if (!sublimationProvider.technicalCapabilities.includes('digital_cutting')) return [];
            push('transfer_printing', sublimationProvider, {
              inputState: 'digital_layout',
              outputState: 'printed_transfer',
            });
            add('sublimation', sublimationProvider, {
              inputState: 'fabric_roll',
              outputState: 'sublimated_fabric',
            });
            add('cutting', sublimationProvider, {
              inputState: 'sublimated_fabric',
              outputState: 'sublimated_cut_panels',
            });
          } else {
            for (const producer of producerGroup)
              add('cutting', producer, {
                inputState: 'fabric_roll',
                outputState: 'cut_panels',
              });
          }

          if (embroideryProvider) {
            add('embroidery', embroideryProvider, {
              inputState: needsSublimation ? 'sublimated_cut_panels' : 'cut_panels',
              outputState: needsSublimation ? 'sublimated_cut_panels' : 'cut_panels',
            });
          }
          for (const producer of producerGroup) {
            add('sewing', producer, {
              inputState: needsSublimation ? 'sublimated_cut_panels' : 'cut_panels',
              outputState: 'assembled_garment',
            });
          }
          for (const producer of producerGroup) add('printing', producer);
          if (vinylProvider) add('vinyl', vinylProvider, { inputState: 'assembled_garment' });
          for (const process of ['notions', 'ironing', 'finishing', 'quality_control', 'delivery'] as Process[]) {
            for (const producer of producerGroup) {
              add(process, producer, process === 'finishing'
                ? { inputState: 'assembled_garment', outputState: 'finished_garment' } : {});
            }
          }

          const routeWorkshops = Array.from(
            new Map(
              [...producerGroup, sublimationProvider, embroideryProvider, vinylProvider]
                .filter((item): item is Workshop => Boolean(item))
                .map((item) => [item.id, item]),
            ).values(),
          );
          const workflowSteps = steps.map((step, index) => ({ ...step, sequence: index + 1 }));
          if (
            workflowSteps.some(
              (step) =>
                !routeWorkshops
                  .find((item) => item.id === step.workshopId)
                  ?.processes.includes(step.process),
            )
          )
            return [];
          const covered = new Set(workflowSteps.map((step) => step.process));
          if ([...required].some((process) => !covered.has(process))) return [];

          const assignedProcesses = (workshop: Workshop) =>
            Array.from(
              new Set(
                workflowSteps
                  .filter((step) => step.workshopId === workshop.id)
                  .map((step) => step.process),
              ),
            );
          const leadTime = planLeadTimeDays(request, routeWorkshops.map((workshop) => ({
            workshopId: workshop.id,
            displayName: workshop.displayName,
            quantity: producerAllocations.find((item) => item.workshopId === workshop.id)?.quantity ?? request.order.quantity,
            availableCapacity: 0,
            effectiveLeadTimeDays: 0,
            estimatedCost: 0,
            assignedProcesses: assignedProcesses(workshop),
          })), workflowSteps);
          const availableDays = Math.floor(
            (Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS,
          );
          if (leadTime > availableDays) return [];

          return [
            {
              workshops: routeWorkshops,
              allocations: routeWorkshops.map((workshop) => {
                const processes = assignedProcesses(workshop);
                const producerAllocation = producerAllocations.find(
                  (allocation) => allocation.workshopId === workshop.id,
                );
                return {
                  workshopId: workshop.id,
                  displayName: workshop.displayName,
                  quantity: producerAllocation?.quantity ?? request.order.quantity,
                  availableCapacity:
                    capacityBeforeDeadline(request, workshop, processes) ??
                    fixedCapacityFor(request, workshop, processes),
                  effectiveLeadTimeDays: 0,
                  estimatedCost: 0,
                  assignedProcesses: processes,
                };
              }),
              workflowSteps,
              pipeline: true as const,
            },
          ];
        }),
      ),
    ),
  );
}

function weightedScore(dimensions: DimensionScores, weights: Weights): number {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weightedTotal = (Object.keys(weights) as Array<keyof Weights>).reduce(
    (sum, key) => sum + dimensions[key] * weights[key],
    0,
  );
  return weightedTotal / totalWeight;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function recommendWorkshops(
  request: RecommendationRequest,
  scoringReferenceWorkshops: Workshop[] = request.workshops,
  enumeratePlans = false,
): RecommendationResult {
  const rejected: RecommendationResult['rejected'] = [];
  const individuallyEligible = request.workshops.filter((workshop) => {
    const reasons = rejectionReasons(request, workshop);
    if (reasons.length > 0) {
      rejected.push({ workshopId: workshop.id, displayName: workshop.displayName, reasons });
      return false;
    }
    return true;
  });

  const compatible = request.workshops.filter(
    (workshop) => compatibilityReasons(request, workshop).length === 0,
  );

  const plans: CandidatePlan[] = individuallyEligible.flatMap((workshop) => {
    const allocations = allocateQuantity(
      request.order.quantity,
      [workshop],
      effectiveRequiredProcesses(request),
      request,
    );
    return allocations ? [{ workshops: [workshop], allocations }] : [];
  });

  if (enumeratePlans || plans.length === 0) plans.push(...specializedRoutePlans(request));

  if (enumeratePlans || plans.length === 0) {
    for (const size of [2, 3]) {
      for (const group of combinations(compatible, size)) {
        const allocations = allocateQuantity(
          request.order.quantity,
          group,
          effectiveRequiredProcesses(request),
          request,
        );
        if (allocations) plans.push({ workshops: group, allocations });
      }
      if (!enumeratePlans && plans.length > 0) break;
    }
  }

  const availableDays = Math.max(
    1,
    Math.floor((Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS),
  );
  const referenceCosts = scoringReferenceWorkshops
    .filter((workshop) => compatibilityReasons(request, workshop).length === 0)
    .map((workshop) => workshop.estimatedTotalCost);
  const lowestCost = referenceCosts.length > 0 ? Math.min(...referenceCosts) : 0;

  const rankedCandidates = plans
    .map(({ workshops, allocations, workflowSteps, pipeline }) => {
      const hydratedAllocations = allocations.map((allocation) => {
        const workshop = workshops.find((item) => item.id === allocation.workshopId)!;
        return {
          ...allocation,
          effectiveLeadTimeDays: effectiveLeadTimeDays(
            {
              ...request,
              order: { ...request.order, quantity: allocation.quantity },
            },
            workshop,
            allocation.assignedProcesses ?? effectiveRequiredProcesses(request),
          ),
          estimatedCost: round(
            workshop.estimatedTotalCost * (allocation.quantity / request.order.quantity),
          ),
        };
      });
      const effectiveLeadTime = planLeadTimeDays(request, hydratedAllocations, workflowSteps);
      const estimatedCost = hydratedAllocations.reduce(
        (sum, allocation) => sum + allocation.estimatedCost,
        0,
      );
      const allocatedTotal = hydratedAllocations.reduce(
        (sum, allocation) => sum + allocation.quantity,
        0,
      );
      const weightedAverage = (selector: (workshop: Workshop) => number) =>
        workshops.reduce((sum, workshop) => {
          const allocation = hydratedAllocations.find((item) => item.workshopId === workshop.id)!;
          return sum + selector(workshop) * (allocation.quantity / allocatedTotal);
        }, 0);
      const dimensions: DimensionScores = {
        delivery: Math.max(0, 1 - effectiveLeadTime / availableDays),
        cost: estimatedCost === 0 || lowestCost === 0 ? 1 : lowestCost / estimatedCost,
        reliability: weightedAverage((workshop) => workshop.onTimeRate),
        quality: 1 - weightedAverage((workshop) => workshop.defectRate),
        evidence: weightedAverage((workshop) => evidenceScores[workshop.evidenceLevel]),
      };

      const candidateId = workshops
        .map((workshop) => workshop.id)
        .sort()
        .join('+');
      const displayName = hydratedAllocations
        .map((allocation) => allocation.displayName)
        .join(' + ');

      return {
        candidateId,
        workshopId: workshops[0]!.id,
        displayName,
        allocations: hydratedAllocations,
        rank: 0,
        score: round(weightedScore(dimensions, request.weights)),
        dimensions: Object.fromEntries(
          Object.entries(dimensions).map(([key, value]) => [key, round(value)]),
        ) as DimensionScores,
        reasons: [
          'el plazo de producción empieza con el diseño aprobado',
          ...(request.order.fabricSupply.category === 'imported'
            ? [
                `la tela importada requiere entre ${request.order.fabricSupply.minimumLeadTimeDays} y ${request.order.fabricSupply.maximumLeadTimeDays} días y fue programada con ${request.order.fabricSupply.remainingLeadTimeDays} días pendientes al evaluar`,
              ]
            : []),
          request.order.fabricBuyer === 'workshop'
            ? 'el taller gestiona la compra de la tela especificada por Perú Activa'
            : 'Perú Activa compra la tela y la entrega al taller',
          workflowSteps
            ? (request.routeTiming === 'sequential_phases'
                ? `ruta de ${workflowSteps.length} etapas secuenciales entre ${hydratedAllocations.length} proveedores`
                : `ruta superpuesta de ${workflowSteps.length} etapas por lotes entre ${hydratedAllocations.length} proveedores`)
            : hydratedAllocations.length === 1
              ? 'un taller cubre el pedido completo'
              : `pedido distribuido entre ${hydratedAllocations.length} talleres`,
          `plazo efectivo estimado: ${effectiveLeadTime} días`,
          ...hydratedAllocations.map(
            (allocation) =>
              `${allocation.displayName}: ${allocation.quantity} unidades de ${allocation.availableCapacity} disponibles`,
          ),
          `cumplimiento ponderado: ${Math.round(dimensions.reliability * 100)} %`,
          `tasa de defectos ponderada: ${Math.round((1 - dimensions.quality) * 100)} %`,
        ],
        ...(workflowSteps ? { workflowSteps } : {}),
      };
    })
    .filter((candidate) =>
      candidate.allocations.every(
        (allocation) => allocation.effectiveLeadTimeDays <= availableDays,
      ),
    )
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.allocations.length - right.allocations.length ||
        left.candidateId.localeCompare(right.candidateId),
    );

  const candidates = enumeratePlans ? rankedCandidates : withoutRedundantSplits(rankedCandidates);
  candidates.forEach((candidate, index) => {
    candidate.rank = index + 1;
  });

  const participatingWorkshopIds = new Set(
    candidates.flatMap((candidate) =>
      candidate.allocations.map((allocation) => allocation.workshopId),
    ),
  );

  return {
    algorithmVersion: RECOMMENDATION_VERSION,
    orderId: request.order.id,
    evaluatedAt: request.evaluatedAt,
    candidates,
    rejected: rejected.filter((workshop) => !participatingWorkshopIds.has(workshop.workshopId)),
    requiresHumanConfirmation: true,
  };
}
