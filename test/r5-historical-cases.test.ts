import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  recommendationForHistoricalCase,
  R5_HISTORICAL_SEED,
  r5HistoricalPoloCases,
} from '../src/data/r5-historical-polo-cases.js';
import { compareRecommendationAlgorithms } from '../src/domain/compare-recommendations.js';

describe('dataset histórico anonimizado de R5', () => {
  it('contiene veinte casos de Gmail independientes sin identificadores personales ni referencias internas', () => {
    assert.equal(r5HistoricalPoloCases.length, 20);
    assert.equal(new Set(r5HistoricalPoloCases.map((item) => item.id)).size, 20);
    assert.deepEqual(
      r5HistoricalPoloCases.map((item) => item.id),
      Array.from({ length: 20 }, (_unused, index) => `H${String(index + 1).padStart(2, '0')}`),
    );
    assert.ok(r5HistoricalPoloCases.every((item) => item.sourceChannel === 'gmail'));

    const serialized = JSON.stringify(r5HistoricalPoloCases);
    for (const forbiddenField of [
      'customerName',
      'organization',
      'email',
      'phone',
      'quoteId',
      'sourceThreadKey',
      'operationalCode',
    ]) {
      assert.doesNotMatch(serialized, new RegExp(forbiddenField, 'i'));
    }
  });

  it('incluye pedidos recibidos y rutas con varias personalizaciones', () => {
    assert.ok(r5HistoricalPoloCases.some((item) => item.sourceStatus === 'order_received'));
    assert.ok(r5HistoricalPoloCases.some((item) => item.additionalCustomizations.length > 0));
  });

  it('hace explícitos los datos inferidos y registra la validación humana', () => {
    assert.ok(
      r5HistoricalPoloCases.every(
        (item) =>
          item.validationStatus === 'validated_peru_activa' &&
          item.normalizationAssumptions.length > 0,
      ),
    );
    assert.ok(
      r5HistoricalPoloCases.some((item) => item.leadTimeSource === 'default_pending_confirmation'),
    );
    assert.ok(r5HistoricalPoloCases.some((item) => item.sourceStatus === 'order_received'));
  });

  it('convierte todos los casos al contrato ejecutable del algoritmo', () => {
    for (const historicalCase of r5HistoricalPoloCases) {
      const request = recommendationForHistoricalCase(historicalCase);
      assert.equal(request.order.id, historicalCase.id);
      assert.equal(request.order.quantity, historicalCase.quantity);
      assert.equal(request.workshops.length, 8);
    }
  });

  it('reproduce la comparación en un caso histórico sin cambiar la entrada', () => {
    const historicalCase = r5HistoricalPoloCases.find((item) => item.id === 'H17');
    assert.ok(historicalCase);
    const request = recommendationForHistoricalCase(historicalCase);
    const first = compareRecommendationAlgorithms(request, R5_HISTORICAL_SEED);
    const second = compareRecommendationAlgorithms(request, R5_HISTORICAL_SEED);

    assert.deepEqual(first.baseline.value, second.baseline.value);
    assert.deepEqual(first.genetic.value, second.genetic.value);
    assert.equal(first.summary.baselineFeasible, true);
    assert.equal(first.summary.geneticFeasible, true);
  });

  it('registra Hydrotech fuera del catálogo con catorce días pendientes', () => {
    const historicalCase = r5HistoricalPoloCases.find((item) => item.id === 'H04');
    assert.deepEqual(historicalCase?.fabricSupply, {
      category: 'imported',
      minimumLeadTimeDays: 7,
      maximumLeadTimeDays: 14,
      remainingLeadTimeDays: 14,
    });
  });

  it('normaliza H14 con Zanetti y solo el bordado expresamente indicado', () => {
    const historicalCase = r5HistoricalPoloCases.find((item) => item.id === 'H14');
    assert.ok(historicalCase);
    assert.equal(historicalCase.material, 'Zanetti 100% poliéster');
    assert.equal(historicalCase.embroideryApplicationsPerGarment, 1);
    assert.equal(historicalCase.specificationSource, 'customer');
    assert.deepEqual(historicalCase.requiredProcesses, [
      'design',
      'cutting',
      'embroidery',
      'sewing',
      'finishing',
    ]);
  });

  it('rechaza H04 por abastecimiento, aunque la capacidad productiva sí alcanza', () => {
    const historicalCase = r5HistoricalPoloCases.find((item) => item.id === 'H04');
    assert.ok(historicalCase);
    const request = recommendationForHistoricalCase(historicalCase);
    const withPendingFabric = compareRecommendationAlgorithms(request, R5_HISTORICAL_SEED).baseline
      .value;
    assert.equal(withPendingFabric.candidates.length, 0);

    const withFabricAvailable = compareRecommendationAlgorithms(
      {
        ...request,
        order: {
          ...request.order,
          fabricSupply: {
            category: 'base',
            minimumLeadTimeDays: 0,
            maximumLeadTimeDays: 0,
            remainingLeadTimeDays: 0,
          },
        },
      },
      R5_HISTORICAL_SEED,
    ).baseline.value;
    const allocations = withFabricAvailable.candidates[0]?.allocations.map((allocation) => ({
      workshopId: allocation.workshopId,
      quantity: allocation.quantity,
    }));

    assert.deepEqual(allocations, [
      { workshopId: 'sim-workshop-a', quantity: 2000 },
      { workshopId: 'sim-workshop-b', quantity: 2000 },
      { workshopId: 'sim-workshop-f', quantity: 4000 },
    ]);
  });

  it('conserva la validación de Perú Activa completa y anonimizada', () => {
    const evidence = JSON.parse(
      readFileSync(
        new URL(
          '../docs/entregas/evidencia-r5/r5-validacion-peru-activa-2026-09-03.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as {
      sourceEvidence: { custody: string; pages: number; sha256: string };
      summary: {
        evaluatedCases: number;
        correctAutomaticProposals: number;
        manualConflicts: number;
        automaticConflicts: number;
        conflictReductionRate: number | null;
      };
      cases: Array<{
        caseId: string;
        manualDecision: string[];
        manualConflict: boolean;
        automaticProposalCorrect: boolean;
      }>;
    };

    assert.equal(evidence.sourceEvidence.custody, 'private');
    assert.equal(evidence.sourceEvidence.pages, 4);
    assert.match(evidence.sourceEvidence.sha256, /^[a-f0-9]{64}$/);
    assert.equal(evidence.cases.length, 20);
    assert.deepEqual(
      evidence.cases.map((item) => item.caseId),
      Array.from({ length: 20 }, (_unused, index) => `H${String(index + 1).padStart(2, '0')}`),
    );
    assert.ok(evidence.cases.every((item) => item.manualConflict === false));
    assert.ok(evidence.cases.every((item) => item.automaticProposalCorrect === true));
    assert.ok(
      evidence.cases.every((item) =>
        item.manualDecision.every((workshop) => /^Taller [A-H]$/.test(workshop)),
      ),
    );
    assert.deepEqual(evidence.summary, {
      evaluatedCases: 20,
      correctAutomaticProposals: 20,
      manualConflicts: 0,
      automaticConflicts: 0,
      conflictReductionRate: null,
    });
  });
});
