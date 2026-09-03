import type {
  RankedCandidate,
  RecommendationRequest,
  RecommendationResult,
  Workshop,
} from './contracts.js';
import { recommendWorkshops } from './recommend.js';

export const GENETIC_ALGORITHM_VERSION = 'ga-0.6.0';

export interface GeneticParameters {
  populationSize: number;
  generations: number;
  mutationRate: number;
  eliteCount: number;
  maximumWorkshops: number;
}

export interface ConvergencePoint {
  generation: number;
  bestScore: number;
  averageScore: number;
  feasibleIndividuals: number;
}

export interface GeneticRecommendation {
  algorithmVersion: typeof GENETIC_ALGORITHM_VERSION;
  seed: number;
  parameters: GeneticParameters;
  evaluations: number;
  convergence: ConvergencePoint[];
  result: RecommendationResult;
}

const DEFAULT_PARAMETERS: GeneticParameters = {
  populationSize: 36,
  generations: 40,
  mutationRate: 0.12,
  eliteCount: 2,
  maximumWorkshops: 4,
};

interface EvaluatedChromosome {
  genes: boolean[];
  fitness: number;
  candidate: RankedCandidate | undefined;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

function selectedWorkshops(genes: boolean[], workshops: Workshop[]): Workshop[] {
  return workshops.filter((_workshop, index) => genes[index]);
}

function repair(genes: boolean[], random: () => number, maximumWorkshops: number): boolean[] {
  const repaired = [...genes];
  let selected = repaired.flatMap((value, index) => (value ? [index] : []));
  if (selected.length === 0) {
    repaired[Math.floor(random() * repaired.length)] = true;
    selected = repaired.flatMap((value, index) => (value ? [index] : []));
  }
  while (selected.length > maximumWorkshops) {
    const position = Math.floor(random() * selected.length);
    repaired[selected[position]!] = false;
    selected.splice(position, 1);
  }
  return repaired;
}

function evaluate(request: RecommendationRequest, genes: boolean[]): EvaluatedChromosome {
  const workshops = selectedWorkshops(genes, request.workshops);
  const candidate = recommendWorkshops({ ...request, workshops }, request.workshops).candidates[0];
  return {
    genes,
    candidate,
    fitness: candidate ? round(candidate.score - (candidate.allocations.length - 1) * 0.002) : 0,
  };
}

function tournament(population: EvaluatedChromosome[], random: () => number): EvaluatedChromosome {
  const first = population[Math.floor(random() * population.length)]!;
  const second = population[Math.floor(random() * population.length)]!;
  const third = population[Math.floor(random() * population.length)]!;
  return [first, second, third].sort(
    (left, right) =>
      right.fitness - left.fitness || genesKey(left.genes).localeCompare(genesKey(right.genes)),
  )[0]!;
}

function genesKey(genes: boolean[]): string {
  return genes.map((gene) => (gene ? '1' : '0')).join('');
}

function candidateKey(individual: EvaluatedChromosome): string {
  return individual.candidate?.candidateId || `~${genesKey(individual.genes)}`;
}

function crossover(left: boolean[], right: boolean[], random: () => number): boolean[] {
  return left.map((gene, index) => (random() < 0.5 ? gene : right[index]!));
}

function mutate(genes: boolean[], mutationRate: number, random: () => number): boolean[] {
  return genes.map((gene) => (random() < mutationRate ? !gene : gene));
}

function initialPopulation(
  workshopCount: number,
  parameters: GeneticParameters,
  random: () => number,
): boolean[][] {
  const population = Array.from({ length: workshopCount }, (_unused, selectedIndex) =>
    Array.from({ length: workshopCount }, (_item, index) => index === selectedIndex),
  );
  while (population.length < parameters.populationSize) {
    const genes = Array.from({ length: workshopCount }, () => random() < 0.5);
    population.push(repair(genes, random, parameters.maximumWorkshops));
  }
  return population;
}

export function recommendWorkshopsGenetically(
  request: RecommendationRequest,
  seed: number,
  overrides: Partial<GeneticParameters> = {},
): GeneticRecommendation {
  const parameters = { ...DEFAULT_PARAMETERS, ...overrides };
  const random = seededRandom(seed);
  let population = initialPopulation(request.workshops.length, parameters, random);
  let best: EvaluatedChromosome | undefined;
  let evaluations = 0;
  const convergence: ConvergencePoint[] = [];

  for (let generation = 0; generation <= parameters.generations; generation += 1) {
    const evaluated = population
      .map((genes) => evaluate(request, genes))
      .sort(
        (left, right) =>
          right.fitness - left.fitness || candidateKey(left).localeCompare(candidateKey(right)),
      );
    evaluations += evaluated.length;
    const generationBest = evaluated[0]!;
    if (
      !best ||
      generationBest.fitness > best.fitness ||
      (generationBest.fitness === best.fitness &&
        candidateKey(generationBest).localeCompare(candidateKey(best)) < 0)
    ) {
      best = generationBest;
    }
    convergence.push({
      generation,
      bestScore: round(best.fitness),
      averageScore: round(
        evaluated.reduce((sum, individual) => sum + individual.fitness, 0) / evaluated.length,
      ),
      feasibleIndividuals: evaluated.filter((individual) => individual.candidate).length,
    });

    if (generation === parameters.generations) break;
    const next = evaluated.slice(0, parameters.eliteCount).map((individual) => individual.genes);
    while (next.length < parameters.populationSize) {
      const child = crossover(
        tournament(evaluated, random).genes,
        tournament(evaluated, random).genes,
        random,
      );
      next.push(
        repair(mutate(child, parameters.mutationRate, random), random, parameters.maximumWorkshops),
      );
    }
    population = next;
  }

  const baseline = recommendWorkshops(request);
  const candidate = best?.candidate;
  const candidates = candidate ? [{ ...candidate, rank: 1 }] : [];
  return {
    algorithmVersion: GENETIC_ALGORITHM_VERSION,
    seed,
    parameters,
    evaluations,
    convergence,
    result: {
      algorithmVersion: '0.6.0',
      orderId: request.order.id,
      evaluatedAt: request.evaluatedAt,
      candidates,
      rejected: baseline.rejected,
      requiresHumanConfirmation: true,
    },
  };
}
