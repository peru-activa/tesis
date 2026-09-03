import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  recommendationForScenario,
  WEEK_03_SEED,
  week03AssignmentScenarios,
} from '../src/data/week-03-assignment-scenarios.js';
import { compareRecommendationAlgorithms } from '../src/domain/compare-recommendations.js';
import { recommendWorkshopsGenetically } from '../src/domain/genetic-recommend.js';
import { recommendWorkshops } from '../src/domain/recommend.js';

function scenario(id: string) {
  const found = week03AssignmentScenarios.find((item) => item.id === id);
  assert.ok(found);
  return recommendationForScenario(found);
}

describe('algoritmo genético de asignación', () => {
  it('produce la misma solución y convergencia con la misma entrada y semilla', () => {
    const request = scenario('balanced-polo');
    const first = recommendWorkshopsGenetically(request, WEEK_03_SEED);
    const second = recommendWorkshopsGenetically(request, WEEK_03_SEED);

    assert.deepEqual(first, second);
    assert.equal(first.algorithmVersion, 'ga-0.6.0');
    assert.equal(first.result.candidates[0]?.candidateId, 'sim-workshop-a');
    assert.equal(
      first.result.candidates[0]?.allocations.reduce((sum, item) => sum + item.quantity, 0),
      request.order.quantity,
    );
    assert.equal(first.convergence.length, first.parameters.generations + 1);
    assert.ok(first.convergence.at(-1)!.feasibleIndividuals > 0);
  });

  it('mantiene sin solución los escenarios que incumplen restricciones obligatorias', () => {
    const result = recommendWorkshopsGenetically(scenario('unsupported-material'), WEEK_03_SEED);
    assert.deepEqual(result.result.candidates, []);
    assert.ok(result.result.rejected.every((item) => item.reasons.length > 0));
    assert.ok(result.convergence.every((point) => point.feasibleIndividuals === 0));
  });

  it('compara ambos métodos con puntuaciones calculadas sobre la misma referencia', () => {
    const comparison = compareRecommendationAlgorithms(scenario('balanced-polo'), WEEK_03_SEED);
    assert.equal(comparison.summary.baselineFeasible, true);
    assert.equal(comparison.summary.geneticFeasible, true);
    assert.equal(comparison.summary.sameAllocation, true);
    assert.equal(comparison.summary.scoreDifference, 0);
    assert.ok(comparison.baseline.averageMilliseconds >= 0);
    assert.ok(comparison.genetic.averageMilliseconds >= 0);
  });

  it('asigna una ruta superpuesta de calandra, corte y confección', () => {
    const request = scenario('sports-sublimation');
    const comparison = compareRecommendationAlgorithms(request, WEEK_03_SEED);
    const candidate = comparison.baseline.value.candidates[0];

    assert.ok(candidate?.workflowSteps);
    assert.deepEqual(
      candidate.workflowSteps.map((step) => step.process),
      ['design', 'transfer_printing', 'sublimation', 'cutting', 'sewing', 'finishing'],
    );
    assert.deepEqual(candidate.workflowSteps.map((step) => step.outputState).filter(Boolean), [
      'digital_layout',
      'printed_transfer',
      'sublimated_fabric',
      'sublimated_cut_panels',
      'assembled_garment',
      'finished_garment',
    ]);
    assert.equal(candidate.allocations.length, 2);
    assert.equal(comparison.summary.sameAllocation, true);
    assert.ok(
      comparison.baseline.value.candidates.some((item) =>
        item.allocations.some((allocation) => allocation.workshopId === 'sim-workshop-g'),
      ),
    );
  });

  it('respeta que la plancha recibe piezas previamente cortadas', () => {
    const request = scenario('sports-sublimation');
    const result = recommendWorkshops({
      ...request,
      workshops: request.workshops.filter((workshop) => workshop.id !== 'sim-workshop-f'),
    });
    const candidate = result.candidates[0];

    assert.deepEqual(
      candidate?.workflowSteps?.map((step) => step.process),
      ['design', 'cutting', 'transfer_printing', 'sublimation', 'sewing', 'finishing'],
    );
    assert.equal(candidate?.workflowSteps?.[3]?.inputState, 'cut_panels');
    assert.equal(candidate?.workflowSteps?.[3]?.outputState, 'sublimated_cut_panels');
    const vinylProvider = request.workshops.find((workshop) => workshop.id === 'sim-workshop-g');
    assert.deepEqual(vinylProvider?.productionRate, { quantity: 1000, days: 5 });
    assert.deepEqual(vinylProvider?.vinylProfile?.productionRate, { quantity: 500, days: 5 });
    assert.equal(vinylProvider?.vinylProfile?.includesPrinting, true);
    assert.equal(vinylProvider?.vinylProfile?.includesWeeding, true);
  });

  it('asigna el bordado a un proveedor con cabezales registrados', () => {
    const request = scenario('embroidery-specialist');
    const result = recommendWorkshops(request);
    const candidate = result.candidates[0];

    assert.ok(candidate?.workflowSteps);
    assert.deepEqual(
      candidate.workflowSteps.map((step) => step.process),
      ['fabric_sourcing', 'design', 'cutting', 'embroidery', 'sewing', 'finishing'],
    );
    const embroideryStep = candidate.workflowSteps.find((step) => step.process === 'embroidery');
    assert.match(embroideryStep?.displayName || '', /bordado/);
    const provider = request.workshops.find(
      (workshop) => workshop.id === embroideryStep?.workshopId,
    );
    assert.ok(provider?.embroideryProfile);
    assert.ok(provider.embroideryProfile.availableHeadCount > 0);
    if (provider.id === 'sim-workshop-h') {
      assert.equal(provider.embroideryProfile.headCount, 4);
      assert.deepEqual(provider.productionRate, { quantity: 100, days: 1 });
      assert.equal(provider.embroideryProfile.includesCleanup, true);
      assert.equal(provider.embroideryProfile.includesBackingRemoval, true);
    }
    assert.equal(candidate.allocations.length, 2);
  });

  it('multiplica la capacidad diaria de bordado por los días disponibles', () => {
    const base = scenario('embroidery-specialist');
    const request = {
      ...base,
      order: {
        ...base.order,
        quantity: 200,
        requiredBy: '2026-08-30T18:00:00-05:00',
      },
      workshops: base.workshops
        .filter((workshop) => ['sim-workshop-a', 'sim-workshop-h'].includes(workshop.id))
        .map((workshop) =>
          workshop.id === 'sim-workshop-a'
            ? {
                ...workshop,
                maximumUnits: 500,
                availableCapacity: 500,
                estimatedLeadTimeDays: 0,
              }
            : workshop,
        ),
    };
    const result = recommendWorkshops(request);
    const candidate = result.candidates[0];
    const embroideryAllocation = candidate?.allocations.find(
      (allocation) => allocation.workshopId === 'sim-workshop-h',
    );

    assert.equal(embroideryAllocation?.availableCapacity, 200);
    assert.equal(embroideryAllocation?.effectiveLeadTimeDays, 2);
  });

  it('registra 300 logos diarios para el taller G con 12 cabezales', () => {
    const provider = scenario('embroidery-specialist').workshops.find(
      (workshop) => workshop.id === 'sim-workshop-i',
    );
    assert.deepEqual(provider?.productionRate, { quantity: 300, days: 1 });
    assert.equal(provider?.embroideryProfile?.headCount, 12);
  });

  it('combina sublimación, bordado sobre panel cortado y confección', () => {
    const request = scenario('combined-sublimation-embroidery');
    const result = recommendWorkshops(request);
    const candidate = result.candidates[0];

    assert.ok(candidate);
    assert.equal(candidate.allocations.length, 3);
    assert.deepEqual(
      candidate.workflowSteps?.map((step) => step.process),
      [
        'fabric_sourcing',
        'design',
        'transfer_printing',
        'sublimation',
        'cutting',
        'embroidery',
        'sewing',
        'finishing',
      ],
    );
    assert.equal(candidate.workflowSteps?.[5]?.inputState, 'sublimated_cut_panels');
  });

  it('acepta el pedido combinado de 200 polos en dos días mediante superposición', () => {
    const base = scenario('combined-sublimation-embroidery');
    const result = recommendWorkshops({
      ...base,
      evaluatedAt: '2026-09-02T09:00:00-05:00',
      order: { ...base.order, requiredBy: '2026-09-04T18:00:00-05:00' },
    });
    assert.ok(result.candidates[0]);
    assert.match(result.candidates[0]!.reasons.join(' '), /ruta superpuesta/);
    assert.match(result.candidates[0]!.reasons.join(' '), /plazo efectivo estimado: 2 días/);
  });

  it('programa 1000 polos Dry Fit completos dentro de una semana', () => {
    const base = scenario('combined-sublimation-embroidery');
    const result = recommendWorkshops({
      ...base,
      evaluatedAt: '2026-08-31T09:00:00-05:00',
      order: {
        ...base.order,
        quantity: 1000,
        requiredBy: '2026-09-05T18:00:00-05:00',
      },
    });
    const candidate = result.candidates[0];

    assert.ok(candidate);
    assert.match(candidate.reasons.join(' '), /ruta superpuesta/);
    assert.match(candidate.reasons.join(' '), /plazo efectivo estimado: 5 días/);
    assert.ok(
      candidate.allocations.some(
        (allocation) =>
          allocation.workshopId === 'sim-workshop-b' && allocation.availableCapacity >= 1000,
      ),
    );
  });

  it('asigna el patronaje al polero únicamente cuando el modelo es nuevo', () => {
    const base = scenario('sports-sublimation');
    const standard = recommendWorkshops(base).candidates[0];
    const newModel = recommendWorkshops({
      ...base,
      order: {
        ...base.order,
        requiresNewPattern: true,
        requiredProcesses: [...base.order.requiredProcesses, 'patternmaking'],
      },
    }).candidates[0];

    assert.ok(!standard?.workflowSteps?.some((step) => step.process === 'patternmaking'));
    const patternmaking = newModel?.workflowSteps?.find((step) => step.process === 'patternmaking');
    const producer = newModel?.allocations.find((allocation) =>
      allocation.assignedProcesses?.includes('sewing'),
    );
    assert.equal(patternmaking?.workshopId, producer?.workshopId);
  });

  it('asigna el vinil al taller E con su tasa específica', () => {
    const base = scenario('sports-sublimation');
    const result = recommendWorkshops({
      ...base,
      order: {
        ...base.order,
        requiredProcesses: ['design', 'cutting', 'sewing', 'vinyl', 'finishing'],
      },
    });
    const candidate = result.candidates[0];
    const vinylStep = candidate?.workflowSteps?.find((step) => step.process === 'vinyl');
    const provider = base.workshops.find((workshop) => workshop.id === vinylStep?.workshopId);

    assert.equal(provider?.id, 'sim-workshop-g');
    assert.deepEqual(provider?.vinylProfile?.productionRate, { quantity: 500, days: 5 });
  });
});
