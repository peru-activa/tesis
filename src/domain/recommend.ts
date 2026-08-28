import type {
  DimensionScores,
  RecommendationRequest,
  RecommendationResult,
  WorkshopAllocation,
  Weights,
  Workshop,
} from './contracts.js';

const DAY_MS = 86_400_000;

const evidenceScores = {
  declared: 0.4,
  verified: 0.75,
  historical: 1,
} as const;

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('es-PE');
}

function missingProcesses(request: RecommendationRequest, workshop: Workshop): string[] {
  const available = new Set(workshop.processes);
  return request.order.requiredProcesses.filter((process) => !available.has(process));
}

function effectiveLeadTimeDays(request: RecommendationRequest, workshop: Workshop): number {
  const evaluatedAt = Date.parse(request.evaluatedAt);
  const availableFrom = workshop.availableFrom ? Date.parse(workshop.availableFrom) : evaluatedAt;
  const waitingDays = Math.max(0, Math.ceil((availableFrom - evaluatedAt) / DAY_MS));
  return waitingDays + workshop.estimatedLeadTimeDays;
}

function rejectionReasons(request: RecommendationRequest, workshop: Workshop): string[] {
  const reasons: string[] = [];
  const products = new Set(workshop.products.map(normalize));
  const materials = new Set(workshop.materials.map(normalize));
  const missing = missingProcesses(request, workshop);
  const availableDays = Math.floor(
    (Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS,
  );

  if (!products.has(normalize(request.order.product))) reasons.push('producto no atendido');
  if (!materials.has(normalize(request.order.material))) reasons.push('material no atendido');
  if (missing.length > 0) reasons.push(`procesos faltantes: ${missing.join(', ')}`);
  if (request.order.quantity < workshop.minimumUnits) reasons.push('cantidad menor al mínimo');
  if (request.order.quantity > workshop.maximumUnits) reasons.push('cantidad mayor al máximo');
  if (request.order.quantity > workshop.availableCapacity)
    reasons.push('capacidad disponible insuficiente');
  if (availableDays < 0 || effectiveLeadTimeDays(request, workshop) > availableDays) {
    reasons.push('disponibilidad o plazo insuficiente');
  }

  return reasons;
}

function compatibilityReasons(request: RecommendationRequest, workshop: Workshop): string[] {
  const reasons: string[] = [];
  const products = new Set(workshop.products.map(normalize));
  const materials = new Set(workshop.materials.map(normalize));
  const missing = missingProcesses(request, workshop);
  const availableDays = Math.floor(
    (Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS,
  );

  if (!products.has(normalize(request.order.product))) reasons.push('producto no atendido');
  if (!materials.has(normalize(request.order.material)))
    reasons.push('tela o material no atendido');
  if (missing.length > 0) reasons.push(`procesos faltantes: ${missing.join(', ')}`);
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
): WorkshopAllocation[] | undefined {
  const ordered = [...workshops].sort(
    (left, right) =>
      right.onTimeRate - left.onTimeRate ||
      left.defectRate - right.defectRate ||
      left.id.localeCompare(right.id),
  );
  const minimum = ordered.reduce((sum, workshop) => sum + workshop.minimumUnits, 0);
  const maximum = ordered.reduce((sum, workshop) => sum + workshopCapacity(workshop), 0);
  if (quantity < minimum || quantity > maximum) return undefined;

  let remaining = quantity - minimum;
  return ordered.map((workshop) => {
    const extra = Math.min(remaining, workshopCapacity(workshop) - workshop.minimumUnits);
    remaining -= extra;
    const assigned = workshop.minimumUnits + extra;
    return {
      workshopId: workshop.id,
      displayName: workshop.displayName,
      quantity: assigned,
      availableCapacity: workshop.availableCapacity,
      effectiveLeadTimeDays: 0,
      estimatedCost: 0,
    };
  });
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

export function recommendWorkshops(request: RecommendationRequest): RecommendationResult {
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

  const plans: Array<{ workshops: Workshop[]; allocations: WorkshopAllocation[] }> =
    individuallyEligible.map((workshop) => ({
      workshops: [workshop],
      allocations: allocateQuantity(request.order.quantity, [workshop]) || [],
    }));

  if (plans.length === 0) {
    for (const size of [2, 3]) {
      for (const group of combinations(compatible, size)) {
        const allocations = allocateQuantity(request.order.quantity, group);
        if (allocations) plans.push({ workshops: group, allocations });
      }
      if (plans.length > 0) break;
    }
  }

  const availableDays = Math.max(
    1,
    Math.floor((Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS),
  );
  const estimatedPlanCosts = plans.map(({ workshops, allocations }) =>
    allocations.reduce((sum, allocation) => {
      const workshop = workshops.find((item) => item.id === allocation.workshopId)!;
      return sum + workshop.estimatedTotalCost * (allocation.quantity / request.order.quantity);
    }, 0),
  );
  const lowestCost = Math.min(...estimatedPlanCosts);

  const candidates = plans
    .map(({ workshops, allocations }) => {
      const hydratedAllocations = allocations.map((allocation) => {
        const workshop = workshops.find((item) => item.id === allocation.workshopId)!;
        return {
          ...allocation,
          effectiveLeadTimeDays: effectiveLeadTimeDays(request, workshop),
          estimatedCost: round(
            workshop.estimatedTotalCost * (allocation.quantity / request.order.quantity),
          ),
        };
      });
      const effectiveLeadTime = Math.max(
        ...hydratedAllocations.map((allocation) => allocation.effectiveLeadTimeDays),
      );
      const estimatedCost = hydratedAllocations.reduce(
        (sum, allocation) => sum + allocation.estimatedCost,
        0,
      );
      const weightedAverage = (selector: (workshop: Workshop) => number) =>
        workshops.reduce((sum, workshop) => {
          const allocation = hydratedAllocations.find((item) => item.workshopId === workshop.id)!;
          return sum + selector(workshop) * (allocation.quantity / request.order.quantity);
        }, 0);
      const dimensions: DimensionScores = {
        delivery: Math.max(0, 1 - effectiveLeadTime / availableDays),
        cost: estimatedCost === 0 ? 1 : lowestCost / estimatedCost,
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
          hydratedAllocations.length === 1
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

  return {
    algorithmVersion: '0.1.0',
    orderId: request.order.id,
    evaluatedAt: request.evaluatedAt,
    candidates,
    rejected,
    requiresHumanConfirmation: true,
  };
}
