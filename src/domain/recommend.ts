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
  let elapsed = 0;
  let completed = 0;
  while (completed < requiredWorkingDays && elapsed < 366) {
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

function effectiveLeadTimeDays(
  request: RecommendationRequest,
  workshop: Workshop,
  assignedProcesses: Process[] = effectiveRequiredProcesses(request),
): number {
  const evaluatedAt = Date.parse(request.evaluatedAt);
  const fabricReadyAt = evaluatedAt + request.order.fabricSupply.remainingLeadTimeDays * DAY_MS;
  const availableFrom = workshop.availableFrom ? Date.parse(workshop.availableFrom) : evaluatedAt;
  const startsAt = Math.max(fabricReadyAt, availableFrom);
  const waitingDays = Math.max(0, Math.ceil((startsAt - evaluatedAt) / DAY_MS));
  const rate = effectiveRate(workshop, assignedProcesses);
  const productionWorkingDays = rate
    ? Math.ceil((workload(request, assignedProcesses) * rate.days) / rate.quantity)
    : 0;
  const processMinimumWorkingDays = Math.max(
    0,
    ...assignedProcesses.map(
      (process) => workshop.minimumLeadTimeDaysByProcess?.[process] ?? 0,
    ),
  );
  const requiredWorkingDays = Math.max(
    workshop.estimatedLeadTimeDays,
    processMinimumWorkingDays,
    productionWorkingDays,
  );
  return waitingDays + calendarDaysForWork(startsAt, requiredWorkingDays, workshop);
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
  const rate = effectiveRate(workshop, assignedProcesses);
  if (!rate) return undefined;
  const evaluatedAt = Date.parse(request.evaluatedAt);
  const fabricReadyAt = evaluatedAt + request.order.fabricSupply.remainingLeadTimeDays * DAY_MS;
  const availableFrom = workshop.availableFrom ? Date.parse(workshop.availableFrom) : evaluatedAt;
  const startsAt = Math.max(fabricReadyAt, availableFrom);
  const deadline = Date.parse(request.order.requiredBy);
  const workingDays = workingDaysBetween(startsAt, deadline, workshop);
  const serviceUnits = Math.floor((workingDays * rate.quantity) / rate.days);
  if (assignedProcesses.includes('embroidery')) {
    return Math.floor(serviceUnits / request.order.embroideryApplicationsPerGarment);
  }
  return workshop.capacityPlanningMode === 'throughput'
    ? serviceUnits
    : Math.min(serviceUnits, workshopCapacity(workshop));
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
  if (workshop.capacityStatus === 'unknown') reasons.push('capacidad productiva no registrada');
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
    if (request.order.quantity > workshop.availableCapacity)
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
  if (workshop.capacityStatus === 'unknown') reasons.push('capacidad productiva no registrada');
  if (missing.includes('fabric_sourcing')) reasons.push('no gestiona la compra de tela');
  const missingProduction = missing.filter((process) => process !== 'fabric_sourcing');
  if (missingProduction.length > 0)
    reasons.push(`procesos faltantes: ${missingProduction.join(', ')}`);
  if (availableDays < 0 || effectiveLeadTimeDays(request, workshop) > availableDays) {
    reasons.push('disponibilidad o plazo insuficiente');
  }
  return reasons;
}

function workshopCapacity(workshop: Workshop): number {
  return Math.min(workshop.maximumUnits, workshop.availableCapacity);
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
  const capacityFor = (workshop: Workshop) =>
    (request && capacityBeforeDeadline(request, workshop, assignedProcesses)) ??
    workshopCapacity(workshop);
  const maximum = ordered.reduce((sum, workshop) => sum + capacityFor(workshop), 0);
  if (quantity < minimum || quantity > maximum) return undefined;

  let remaining = quantity - minimum;
  const extraCapacity = ordered.reduce(
    (sum, workshop) => sum + Math.max(0, capacityFor(workshop) - workshop.minimumUnits),
    0,
  );
  return ordered.map((workshop, index) => {
    const capacity = capacityFor(workshop);
    const availableExtra = Math.max(0, capacity - workshop.minimumUnits);
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
    const assigned = workshop.minimumUnits + extra;
    return {
      workshopId: workshop.id,
      displayName: workshop.displayName,
      quantity: assigned,
      availableCapacity: capacity,
      effectiveLeadTimeDays: 0,
      estimatedCost: 0,
      assignedProcesses,
    };
  });
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
  if (workshop.capacityStatus === 'unknown') reasons.push('capacidad productiva no registrada');
  const requiredUnits =
    assignedProcesses.length === 1 && assignedProcesses[0] === 'patternmaking'
      ? 1
      : request.order.quantity;
  if (requiredUnits < workshop.minimumUnits) reasons.push('cantidad menor al mínimo');
  const capacity =
    capacityBeforeDeadline(request, workshop, assignedProcesses) ?? workshopCapacity(workshop);
  if (requiredUnits > capacity) reasons.push('capacidad insuficiente');
  return reasons;
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
            add('printing', producer);
          }
          if (vinylProvider) add('vinyl', vinylProvider, { inputState: 'assembled_garment' });
          for (const producer of producerGroup) {
            for (const process of ['notions', 'ironing'] as Process[]) add(process, producer);
            add('finishing', producer, {
              inputState: 'assembled_garment',
              outputState: 'finished_garment',
            });
            add('quality_control', producer);
            add('delivery', producer);
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
          const leadTime = Math.max(
            ...routeWorkshops.map((workshop) => {
              const producerAllocation = producerAllocations.find(
                (allocation) => allocation.workshopId === workshop.id,
              );
              const allocationRequest = producerAllocation
                ? {
                    ...request,
                    order: { ...request.order, quantity: producerAllocation.quantity },
                  }
                : request;
              return effectiveLeadTimeDays(
                allocationRequest,
                workshop,
                assignedProcesses(workshop),
              );
            }),
          );
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
                    workshop.availableCapacity,
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

  if (plans.length === 0) plans.push(...specializedRoutePlans(request));

  if (plans.length === 0) {
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
      if (plans.length > 0) break;
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

  const candidates = plans
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
      const effectiveLeadTime = pipeline
        ? Math.max(...hydratedAllocations.map((allocation) => allocation.effectiveLeadTimeDays))
        : Math.max(...hydratedAllocations.map((allocation) => allocation.effectiveLeadTimeDays));
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
            ? `ruta superpuesta de ${workflowSteps.length} etapas por lotes entre ${hydratedAllocations.length} proveedores`
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
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.allocations.length - right.allocations.length ||
        left.candidateId.localeCompare(right.candidateId),
    );

  candidates.forEach((candidate, index) => {
    candidate.rank = index + 1;
  });

  const participatingWorkshopIds = new Set(
    candidates.flatMap((candidate) =>
      candidate.allocations.map((allocation) => allocation.workshopId),
    ),
  );

  return {
    algorithmVersion: '0.6.0',
    orderId: request.order.id,
    evaluatedAt: request.evaluatedAt,
    candidates,
    rejected: rejected.filter((workshop) => !participatingWorkshopIds.has(workshop.workshopId)),
    requiresHumanConfirmation: true,
  };
}
