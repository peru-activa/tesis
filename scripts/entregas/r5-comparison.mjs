import {
  recommendationForScenario,
  WEEK_03_DATASET_VERSION,
  WEEK_03_SEED,
  week03AssignmentScenarios,
} from '../../src/data/week-03-assignment-scenarios.ts';
import { compareRecommendationAlgorithms } from '../../src/domain/compare-recommendations.ts';

const rows = week03AssignmentScenarios.map((scenario) => {
  const comparison = compareRecommendationAlgorithms(
    recommendationForScenario(scenario),
    WEEK_03_SEED,
  );
  const baseline = comparison.baseline.value.candidates[0];
  const genetic = comparison.genetic.value.result.candidates[0];
  return {
    scenario: scenario.id,
    baselineFeasible: comparison.summary.baselineFeasible,
    geneticFeasible: comparison.summary.geneticFeasible,
    sameAllocation: comparison.summary.sameAllocation,
    baselineScore: baseline?.score ?? null,
    geneticScore: genetic?.score ?? null,
    baselineAverageMilliseconds: comparison.baseline.averageMilliseconds,
    geneticAverageMilliseconds: comparison.genetic.averageMilliseconds,
  };
});

const feasibleRows = rows.filter((row) => row.baselineFeasible || row.geneticFeasible);
const rejectedRows = rows.filter((row) => !row.baselineFeasible && !row.geneticFeasible);
if (!feasibleRows.every((row) => row.baselineFeasible && row.geneticFeasible)) {
  throw new Error('Los métodos discrepan en la factibilidad de al menos un escenario.');
}
if (!feasibleRows.every((row) => row.sameAllocation)) {
  throw new Error('Los métodos discrepan en la asignación de al menos un escenario factible.');
}

process.stdout.write(
  `${JSON.stringify(
    {
      simulated: true,
      datasetVersion: WEEK_03_DATASET_VERSION,
      seed: WEEK_03_SEED,
      algorithms: ['deterministic-baseline-0.6.0', 'ga-0.6.0'],
      summary: {
        scenarios: rows.length,
        feasibleByBoth: feasibleRows.length,
        rejectedByBoth: rejectedRows.length,
        sameAllocationInFeasibleScenarios: feasibleRows.length,
      },
      rows,
    },
    null,
    2,
  )}\n`,
);
