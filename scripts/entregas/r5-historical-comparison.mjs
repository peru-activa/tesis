import {
  recommendationForHistoricalCase,
  R5_HISTORICAL_DATASET_VERSION,
  R5_HISTORICAL_EVALUATED_AT,
  R5_HISTORICAL_SEED,
  r5HistoricalPoloCases,
} from '../../src/data/r5-historical-polo-cases.ts';
import { compareRecommendationAlgorithms } from '../../src/domain/compare-recommendations.ts';

function allocation(candidate) {
  return (
    candidate?.allocations.map((item) => ({
      workshop: item.displayName,
      quantity: item.quantity,
      processes: item.assignedProcesses ?? [],
    })) ?? []
  );
}

function uniqueRejectionReasons(result) {
  return Array.from(new Set(result.rejected.flatMap((item) => item.reasons))).sort();
}

const rows = r5HistoricalPoloCases.map((historicalCase) => {
  const request = recommendationForHistoricalCase(historicalCase);
  const comparison = compareRecommendationAlgorithms(request, R5_HISTORICAL_SEED);
  const baseline = comparison.baseline.value.candidates[0];
  const genetic = comparison.genetic.value.result.candidates[0];
  const rejectedByBoth = !baseline && !genetic;
  return {
    caseId: historicalCase.id,
    input: {
      poloType: historicalCase.poloType,
      material: historicalCase.material,
      quantity: historicalCase.quantity,
      customization: historicalCase.customization,
      additionalCustomizations: historicalCase.additionalCustomizations,
      requiredBy: historicalCase.requiredBy,
      fabricBuyer: historicalCase.fabricBuyer,
    },
    normalization: {
      sourceStatus: historicalCase.sourceStatus,
      specificationSource: historicalCase.specificationSource,
      leadTimeSource: historicalCase.leadTimeSource,
      assumptions: historicalCase.normalizationAssumptions,
      validationStatus: historicalCase.validationStatus,
    },
    baseline: {
      feasible: Boolean(baseline),
      score: baseline?.score ?? null,
      allocation: allocation(baseline),
      averageMilliseconds: comparison.baseline.averageMilliseconds,
    },
    genetic: {
      feasible: Boolean(genetic),
      score: genetic?.score ?? null,
      allocation: allocation(genetic),
      averageMilliseconds: comparison.genetic.averageMilliseconds,
    },
    comparison: {
      sameFeasibility: comparison.summary.baselineFeasible === comparison.summary.geneticFeasible,
      sameAllocation: rejectedByBoth || comparison.summary.sameAllocation,
      scoreDifference: comparison.summary.scoreDifference,
    },
    rejectionReasons: rejectedByBoth ? uniqueRejectionReasons(comparison.baseline.value) : [],
  };
});

const feasibleByBoth = rows.filter((row) => row.baseline.feasible && row.genetic.feasible);
const rejectedByBoth = rows.filter((row) => !row.baseline.feasible && !row.genetic.feasible);
const disagreements = rows.filter(
  (row) => !row.comparison.sameFeasibility || !row.comparison.sameAllocation,
);
const pendingLeadTime = r5HistoricalPoloCases.filter(
  (item) => item.leadTimeSource === 'default_pending_confirmation',
).length;

process.stdout.write(
  `${JSON.stringify(
    {
      historical: true,
      anonymized: true,
      academicStatus: 'prevalidation_pending_peru_activa',
      iovValidated: false,
      datasetVersion: R5_HISTORICAL_DATASET_VERSION,
      evaluatedAt: R5_HISTORICAL_EVALUATED_AT,
      seed: R5_HISTORICAL_SEED,
      algorithms: ['deterministic-baseline-0.6.0', 'ga-0.6.0'],
      summary: {
        independentHistoricalCases: rows.length,
        receivedOrders: r5HistoricalPoloCases.filter(
          (item) => item.sourceStatus === 'order_received',
        ).length,
        quotationRequests: r5HistoricalPoloCases.filter(
          (item) => item.sourceStatus === 'quotation_request',
        ).length,
        quotations: r5HistoricalPoloCases.filter((item) => item.sourceStatus === 'quoted').length,
        feasibleByBoth: feasibleByBoth.length,
        rejectedByBoth: rejectedByBoth.length,
        methodDisagreements: disagreements.length,
        casesWithProvisionalLeadTime: pendingLeadTime,
        casesPendingPeruActivaVerdict: rows.length,
      },
      limitations: [
        'El resultado todavía no mide el IOV de R5 porque Perú Activa no ha emitido un veredicto por caso.',
        'La compra de tela y el uso de molde nuevo no constaban en los registros y fueron normalizados mediante reglas provisionales.',
        'Los plazos ausentes se sustituyeron por un valor explícito pendiente de confirmación.',
      ],
      rows,
    },
    null,
    2,
  )}\n`,
);
