import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { recommendationRequestSchema } from '../src/domain/contracts.js';
import { materialAlternativesFor } from '../src/domain/material-alternatives.js';

function request(material: string, poloType: 'sports' | 'cotton_basic' = 'sports') {
  return recommendationRequestSchema.parse({
    evaluatedAt: '2026-09-03T09:00:00-05:00',
    order: {
      id: 'material-options',
      product: 'polo',
      poloType,
      material,
      quantity: 300,
      fabricBuyer: 'workshop',
      requiredProcesses: ['design', 'cutting', 'sewing', 'printing', 'finishing'],
      requiredBy: '2026-09-15T18:00:00-05:00',
    },
    workshops: [
      {
        id: 'sports',
        displayName: 'Taller deportivo',
        products: ['polo'],
        poloTypes: ['sports'],
        materials: ['dry fit', 'win'],
        materialFamilies: ['sports_knit'],
        processes: ['fabric_sourcing', 'design', 'cutting', 'sewing', 'printing', 'finishing'],
        minimumUnits: 1,
        maximumUnits: 1000,
        availableCapacity: 1000,
        estimatedLeadTimeDays: 1,
        estimatedTotalCost: 0,
        onTimeRate: 1,
        defectRate: 0,
        evidenceLevel: 'declared',
      },
    ],
  });
}

describe('default material alternatives', () => {
  it('offers Dry Fit and Win for a sports polo specified only as polyester', () => {
    assert.deepEqual(materialAlternativesFor(request('Poliéster')), ['Dry Fit', 'Win']);
  });

  it('preserves a concrete quality and does not reinterpret non-sports polos', () => {
    assert.deepEqual(materialAlternativesFor(request('Hydrotech 100% poliéster')), [
      'Hydrotech 100% poliéster',
    ]);
    assert.deepEqual(materialAlternativesFor(request('Poliéster', 'cotton_basic')), ['Poliéster']);
  });
});
