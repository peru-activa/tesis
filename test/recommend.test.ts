import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recommendationRequestSchema } from '../src/domain/contracts.js';
import { recommendWorkshops } from '../src/domain/recommend.js';

const input = recommendationRequestSchema.parse({
  evaluatedAt: '2026-08-21T15:00:00-05:00',
  order: {
    id: 'order-1',
    product: 'polo',
    material: 'algodón',
    quantity: 100,
    fabricBuyer: 'peru_activa',
    requiredProcesses: ['cutting', 'sewing', 'printing', 'finishing'],
    requiredBy: '2026-09-04T15:00:00-05:00',
  },
  workshops: [
    {
      id: 'workshop-b',
      displayName: 'Taller B',
      products: ['polo'],
      materials: ['algodón'],
      materialFamilies: ['cotton_knit'],
      processes: ['cutting', 'sewing', 'printing', 'finishing'],
      minimumUnits: 20,
      maximumUnits: 300,
      availableCapacity: 200,
      estimatedLeadTimeDays: 8,
      estimatedTotalCost: 2400,
      onTimeRate: 0.95,
      defectRate: 0.02,
      evidenceLevel: 'historical',
    },
    {
      id: 'workshop-a',
      displayName: 'Taller A',
      products: ['polo'],
      materials: ['algodón'],
      materialFamilies: ['cotton_knit'],
      processes: ['cutting', 'sewing', 'printing', 'finishing'],
      minimumUnits: 20,
      maximumUnits: 150,
      availableCapacity: 120,
      estimatedLeadTimeDays: 10,
      estimatedTotalCost: 2100,
      onTimeRate: 0.72,
      defectRate: 0.08,
      evidenceLevel: 'verified',
    },
    {
      id: 'workshop-c',
      displayName: 'Taller C',
      products: ['polo'],
      materials: ['algodón'],
      materialFamilies: ['cotton_knit'],
      processes: ['cutting', 'sewing'],
      minimumUnits: 10,
      maximumUnits: 500,
      availableCapacity: 400,
      estimatedLeadTimeDays: 5,
      estimatedTotalCost: 1800,
      onTimeRate: 0.9,
      defectRate: 0.03,
      evidenceLevel: 'historical',
    },
  ],
});

describe('recommendWorkshops', () => {
  it('ranks eligible workshops and explains rejected alternatives', () => {
    const result = recommendWorkshops(input);

    assert.equal(result.candidates.length, 2);
    assert.equal(result.candidates[0]?.workshopId, 'workshop-b');
    assert.equal(result.candidates[0]?.candidateId, 'workshop-b');
    assert.deepEqual(
      result.candidates[0]?.allocations.map((item) => item.quantity),
      [100],
    );
    assert.equal(result.candidates[0]?.rank, 1);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.workshopId, 'workshop-c');
    assert.match(result.rejected[0]?.reasons.join(' ') || '', /procesos faltantes/);
    assert.equal(result.requiresHumanConfirmation, true);
  });

  it('combines two compatible workshops only when none can cover the order alone', () => {
    const result = recommendWorkshops(
      recommendationRequestSchema.parse({
        ...input,
        order: { ...input.order, quantity: 250 },
        workshops: input.workshops.map((workshop) => ({
          ...workshop,
          maximumUnits: 160,
          availableCapacity: 160,
        })),
      }),
    );

    assert.ok(result.candidates.length > 0);
    assert.equal(result.candidates[0]?.allocations.length, 2);
    assert.equal(
      result.candidates[0]?.allocations.reduce((sum, item) => sum + item.quantity, 0),
      250,
    );
    assert.ok(result.candidates[0]?.allocations.every((item) => item.quantity <= 160));
  });

  it('does not combine more than three workshops', () => {
    const result = recommendWorkshops(
      recommendationRequestSchema.parse({
        ...input,
        order: { ...input.order, quantity: 650 },
        workshops: Array.from({ length: 4 }, (_, index) => ({
          ...input.workshops[0]!,
          id: `small-${index + 1}`,
          displayName: `Taller pequeño ${index + 1}`,
          maximumUnits: 200,
          availableCapacity: 200,
        })),
      }),
    );

    assert.equal(result.candidates.length, 0);
  });

  it('is deterministic for the same input', () => {
    assert.deepEqual(recommendWorkshops(input), recommendWorkshops(input));
  });

  it('aplica la decisión de Perú Activa sobre quién compra la tela', () => {
    const peruActivaBuys = recommendWorkshops(input);
    const workshopBuys = recommendWorkshops({
      ...input,
      order: { ...input.order, fabricBuyer: 'workshop' },
    });

    assert.equal(peruActivaBuys.candidates.length, 2);
    assert.equal(workshopBuys.candidates.length, 0);
    assert.ok(
      workshopBuys.rejected.every((candidate) =>
        candidate.reasons.includes('no gestiona la compra de tela'),
      ),
    );
  });

  it('mantiene elegible al taller que puede comprar la tela indicada', () => {
    const result = recommendWorkshops({
      ...input,
      order: { ...input.order, fabricBuyer: 'workshop' },
      workshops: input.workshops.map((workshop) =>
        workshop.id === 'workshop-b'
          ? { ...workshop, processes: [...workshop.processes, 'fabric_sourcing'] }
          : workshop,
      ),
    });

    assert.equal(result.candidates[0]?.workshopId, 'workshop-b');
    assert.match(result.candidates[0]?.reasons.join(' ') || '', /gestiona la compra/);
  });

  it('acepta una tela deportiva mediante la capacidad de su familia', () => {
    const result = recommendWorkshops({
      ...input,
      order: { ...input.order, material: 'win' },
      workshops: input.workshops.slice(0, 2).map((workshop, index) =>
        index === 0
          ? {
              ...workshop,
              materials: ['zanetti'],
              materialFamilies: ['sports_knit'],
            }
          : workshop,
      ),
    });

    assert.equal(result.candidates.length, 1);
    assert.equal(result.candidates[0]?.workshopId, 'workshop-b');
    assert.match(result.rejected[0]?.reasons.join(' ') || '', /material no atendido/);
  });
});
