import { readFileSync } from 'node:fs';
import {
  recommendationAlternativesForHistoricalCase,
  R5_HISTORICAL_DATASET_VERSION,
  R5_HISTORICAL_EVALUATED_AT,
  R5_HISTORICAL_SEED,
  r5HistoricalPoloCases,
} from '../../src/data/r5-historical-polo-cases.ts';
import { compareRecommendationAlgorithms } from '../../src/domain/compare-recommendations.ts';

const validation = JSON.parse(
  readFileSync(
    new URL(
      '../../docs/entregas/evidencia-r5/r5-validacion-peru-activa-2026-09-03.json',
      import.meta.url,
    ),
    'utf8',
  ),
);
const validationByCase = new Map(validation.cases.map((item) => [item.caseId, item]));

function result(candidate) {
  return {
    allocation:
      candidate?.allocations.map((item) => ({
        workshop: item.displayName,
        quantity: item.quantity,
        processes: item.assignedProcesses ?? [],
        effectiveLeadTimeDays: item.effectiveLeadTimeDays,
      })) ?? [],
    calculatedLeadTimeDays: candidate
      ? Math.max(...candidate.allocations.map((item) => item.effectiveLeadTimeDays))
      : null,
    workflow:
      candidate?.workflowSteps?.map((item) => ({
        sequence: item.sequence,
        workshop: item.displayName,
        process: item.process,
      })) ?? [],
  };
}

function uniqueRejectionReasons(result) {
  return Array.from(new Set(result.rejected.flatMap((item) => item.reasons))).sort();
}

function requestWithoutDeadline(request) {
  const relaxedDeadline = new Date(Date.parse(request.evaluatedAt) + 90 * 24 * 60 * 60 * 1000);
  return {
    ...request,
    order: {
      ...request.order,
      requiredBy: relaxedDeadline.toISOString(),
    },
  };
}

const rows = r5HistoricalPoloCases.map((historicalCase) => {
  const alternatives = recommendationAlternativesForHistoricalCase(historicalCase).map(
    (request) => {
      const comparison = compareRecommendationAlgorithms(request, R5_HISTORICAL_SEED);
      const baseline = comparison.baseline.value.candidates[0];
      const genetic = comparison.genetic.value.result.candidates[0];
      return { request, comparison, baseline, genetic };
    },
  );
  const representative =
    alternatives.find(({ baseline, genetic }) => baseline && genetic) ?? alternatives[0];
  const { comparison, baseline, genetic } = representative;
  const projectedComparison =
    baseline && genetic
      ? comparison
      : compareRecommendationAlgorithms(
          requestWithoutDeadline(representative.request),
          R5_HISTORICAL_SEED,
        );
  const projectedBaseline = projectedComparison.baseline.value.candidates[0];
  const projectedGenetic = projectedComparison.genetic.value.result.candidates[0];
  const rejectedByBoth = alternatives.every(({ baseline, genetic }) => !baseline && !genetic);
  const humanValidation = validationByCase.get(historicalCase.id);
  if (!humanValidation) throw new Error(`Falta la validación humana de ${historicalCase.id}.`);
  return {
    caseId: historicalCase.id,
    input: {
      poloType: historicalCase.poloType,
      material: historicalCase.material,
      materialAlternatives: alternatives.map(({ request }) => request.order.material),
      quantity: historicalCase.quantity,
      customization: historicalCase.customization,
      additionalCustomizations: historicalCase.additionalCustomizations,
      embroideryApplicationsPerGarment: historicalCase.embroideryApplicationsPerGarment,
      requiredBy: historicalCase.requiredBy,
      originalLeadTime: historicalCase.originalLeadTime,
      leadTimeSource: historicalCase.leadTimeSource,
      leadTimeScope: historicalCase.leadTimeScope,
      fabricBuyer: historicalCase.fabricBuyer,
      fabricSupply: historicalCase.fabricSupply,
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
      ...result(baseline),
      projectedLeadTimeDays: result(projectedBaseline).calculatedLeadTimeDays,
      averageMilliseconds: comparison.baseline.averageMilliseconds,
    },
    genetic: {
      feasible: Boolean(genetic),
      score: genetic?.score ?? null,
      ...result(genetic),
      projectedLeadTimeDays: result(projectedGenetic).calculatedLeadTimeDays,
      averageMilliseconds: comparison.genetic.averageMilliseconds,
      convergence: comparison.genetic.value.convergence,
    },
    comparison: {
      sameFeasibility: alternatives.every(
        ({ comparison }) =>
          comparison.summary.baselineFeasible === comparison.summary.geneticFeasible,
      ),
      sameAllocation:
        rejectedByBoth || alternatives.every(({ comparison }) => comparison.summary.sameAllocation),
      scoreDifference: comparison.summary.scoreDifference,
    },
    materialAlternativeResults: alternatives.map(({ request, comparison, baseline, genetic }) => ({
      material: request.order.material,
      baseline: { feasible: Boolean(baseline), ...result(baseline) },
      genetic: { feasible: Boolean(genetic), ...result(genetic) },
      sameAllocation: comparison.summary.sameAllocation,
    })),
    rejectionReasons: rejectedByBoth
      ? Array.from(
          new Set(
            alternatives.flatMap(({ comparison }) =>
              uniqueRejectionReasons(comparison.baseline.value),
            ),
          ),
        ).sort()
      : [],
    humanValidation,
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
      academicStatus: 'human_validation_completed_conflict_iov_not_calculable',
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
        casesWithAssumedEvaluationWindow: pendingLeadTime,
        casesPendingPeruActivaVerdict: 0,
        correctAutomaticProposals: validation.summary.correctAutomaticProposals,
        proposalAgreementRate:
          validation.summary.correctAutomaticProposals / validation.summary.evaluatedCases,
        manualConflicts: validation.summary.manualConflicts,
        automaticConflicts: validation.summary.automaticConflicts,
        conflictReductionRate: validation.summary.conflictReductionRate,
      },
      limitations: [
        'Perú Activa calificó como correctas las veinte propuestas automáticas revisadas.',
        'La reducción porcentual de conflictos no es calculable porque la decisión manual registró cero conflictos.',
        'La compra de tela y el uso de molde nuevo no constaban en los registros y fueron normalizados mediante reglas explícitas.',
        'Las telas fuera del catálogo inmediato para polos incorporan una espera conservadora de catorce días dentro del rango operativo de siete a catorce días.',
        'Cuando la fuente no registra plazo, la fecha interna se usa únicamente para calcular la duración técnica y no se atribuye al cliente.',
      ],
      rows,
    },
    null,
    2,
  )}\n`,
);
