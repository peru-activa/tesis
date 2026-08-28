import type {
  DimensionScores,
  RecommendationRequest,
  RecommendationResult,
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
  if (request.order.quantity > workshop.availableCapacity) reasons.push('capacidad disponible insuficiente');
  if (availableDays < 0 || effectiveLeadTimeDays(request, workshop) > availableDays) {
    reasons.push('disponibilidad o plazo insuficiente');
  }

  return reasons;
}

function weightedScore(dimensions: DimensionScores, weights: Weights): number {
  const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
  const weightedTotal = (Object.keys(weights) as Array<keyof Weights>)
    .reduce((sum, key) => sum + dimensions[key] * weights[key], 0);
  return weightedTotal / totalWeight;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

export function recommendWorkshops(request: RecommendationRequest): RecommendationResult {
  const rejected: RecommendationResult['rejected'] = [];
  const eligible = request.workshops.filter((workshop) => {
    const reasons = rejectionReasons(request, workshop);
    if (reasons.length > 0) {
      rejected.push({ workshopId: workshop.id, displayName: workshop.displayName, reasons });
      return false;
    }
    return true;
  });

  const availableDays = Math.max(
    1,
    Math.floor((Date.parse(request.order.requiredBy) - Date.parse(request.evaluatedAt)) / DAY_MS),
  );
  const lowestCost = Math.min(...eligible.map((workshop) => workshop.estimatedTotalCost));

  const candidates = eligible.map((workshop) => {
    const effectiveLeadTime = effectiveLeadTimeDays(request, workshop);
    const dimensions: DimensionScores = {
      delivery: Math.max(0, 1 - effectiveLeadTime / availableDays),
      cost: workshop.estimatedTotalCost === 0 ? 1 : lowestCost / workshop.estimatedTotalCost,
      reliability: workshop.onTimeRate,
      quality: 1 - workshop.defectRate,
      evidence: evidenceScores[workshop.evidenceLevel],
    };

    return {
      workshopId: workshop.id,
      displayName: workshop.displayName,
      rank: 0,
      score: round(weightedScore(dimensions, request.weights)),
      dimensions: Object.fromEntries(
        Object.entries(dimensions).map(([key, value]) => [key, round(value)]),
      ) as DimensionScores,
      reasons: [
        `plazo efectivo estimado: ${effectiveLeadTime} días`,
        `capacidad disponible: ${workshop.availableCapacity} unidades`,
        `cumplimiento histórico: ${Math.round(workshop.onTimeRate * 100)} %`,
        `tasa de defectos: ${Math.round(workshop.defectRate * 100)} %`,
        `evidencia: ${workshop.evidenceLevel}`,
      ],
    };
  }).sort((left, right) => right.score - left.score || left.workshopId.localeCompare(right.workshopId));

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
