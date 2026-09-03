import { performance } from 'node:perf_hooks';
import type {
  RecommendationRequest,
  RecommendationResult,
  WorkshopAllocation,
} from './contracts.js';
import { recommendWorkshopsGenetically, type GeneticRecommendation } from './genetic-recommend.js';
import { recommendWorkshops } from './recommend.js';

interface TimedResult<T> {
  averageMilliseconds: number;
  repetitions: number;
  value: T;
}

export interface RecommendationComparison {
  baseline: TimedResult<RecommendationResult> & { algorithm: 'deterministic-baseline' };
  genetic: TimedResult<GeneticRecommendation> & { algorithm: 'genetic' };
  summary: {
    baselineFeasible: boolean;
    geneticFeasible: boolean;
    scoreDifference: number | null;
    sameAllocation: boolean;
  };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function benchmark<T>(repetitions: number, action: () => T): TimedResult<T> {
  let value = action();
  const startedAt = performance.now();
  for (let iteration = 0; iteration < repetitions; iteration += 1) value = action();
  return {
    averageMilliseconds: round((performance.now() - startedAt) / repetitions),
    repetitions,
    value,
  };
}

function allocationKey(allocations: WorkshopAllocation[] | undefined): string {
  if (!allocations) return '';
  return allocations
    .map((allocation) => `${allocation.workshopId}:${allocation.quantity}`)
    .sort()
    .join('|');
}

export function compareRecommendationAlgorithms(
  request: RecommendationRequest,
  seed: number,
): RecommendationComparison {
  const baseline = benchmark(100, () => recommendWorkshops(request));
  const genetic = benchmark(5, () => recommendWorkshopsGenetically(request, seed));
  const baselineCandidate = baseline.value.candidates[0];
  const geneticCandidate = genetic.value.result.candidates[0];
  return {
    baseline: { ...baseline, algorithm: 'deterministic-baseline' },
    genetic: { ...genetic, algorithm: 'genetic' },
    summary: {
      baselineFeasible: Boolean(baselineCandidate),
      geneticFeasible: Boolean(geneticCandidate),
      scoreDifference:
        baselineCandidate && geneticCandidate
          ? round(geneticCandidate.score - baselineCandidate.score)
          : null,
      sameAllocation:
        Boolean(baselineCandidate) &&
        Boolean(geneticCandidate) &&
        allocationKey(baselineCandidate?.allocations) ===
          allocationKey(geneticCandidate?.allocations),
    },
  };
}
