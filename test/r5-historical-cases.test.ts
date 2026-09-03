import assert from 'node:assert/strict';
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

  it('hace explícitos los datos inferidos y mantiene pendiente la validación humana', () => {
    assert.ok(
      r5HistoricalPoloCases.every(
        (item) =>
          item.validationStatus === 'pending_peru_activa' &&
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
      assert.equal(request.workshops.length, 7);
    }
  });

  it('reproduce la comparación en un caso histórico sin cambiar la entrada', () => {
    const historicalCase = r5HistoricalPoloCases.find((item) => item.id === 'H16');
    assert.ok(historicalCase);
    const request = recommendationForHistoricalCase(historicalCase);
    const first = compareRecommendationAlgorithms(request, R5_HISTORICAL_SEED);
    const second = compareRecommendationAlgorithms(request, R5_HISTORICAL_SEED);

    assert.deepEqual(first.baseline.value, second.baseline.value);
    assert.deepEqual(first.genetic.value, second.genetic.value);
    assert.equal(first.summary.baselineFeasible, true);
    assert.equal(first.summary.geneticFeasible, true);
  });
});
