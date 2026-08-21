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
    requiredProcesses: ['cutting', 'sewing', 'printing', 'finishing'],
    requiredBy: '2026-09-04T15:00:00-05:00',
  },
  workshops: [
    {
      id: 'workshop-b',
      displayName: 'Taller B',
      products: ['polo'],
      materials: ['algodón'],
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
    assert.equal(result.candidates[0]?.rank, 1);
    assert.equal(result.rejected.length, 1);
    assert.equal(result.rejected[0]?.workshopId, 'workshop-c');
    assert.match(result.rejected[0]?.reasons.join(' ') || '', /procesos faltantes/);
    assert.equal(result.requiresHumanConfirmation, true);
  });

  it('is deterministic for the same input', () => {
    assert.deepEqual(recommendWorkshops(input), recommendWorkshops(input));
  });
});

