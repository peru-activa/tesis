import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fabricSupplyForPoloMaterial, poloFabricFor } from '../src/data/polo-fabrics.js';

describe('catálogo de telas para polos', () => {
  it('reconoce las calidades principales y complementos registrados', () => {
    for (const material of [
      'Jersey 20/1 – Peinado Reactivo Polycotton',
      'Jersey 24/1 – Peinado Reactivo Polycotton',
      'Jersey 30/1 – Peinado Reactivo Polycotton',
      'Piqué 24/1',
      'Piqué 30/1 Lacoste',
      'Full Licra 30/1',
      'Jersey 20/1 – Spun 100% Poliéster',
      'Jersey 30/1 – Spun 100% Poliéster',
      'Waffle 20/1 Peinado Reactivo',
      'Jersey 2 Cabos Ultra Pesado',
      'Gamuza 50/1',
      'Rib 1×1 24/1 – Peinado Reactivo Polycotton',
      'Rib 2×1 Grueso Licrado',
    ]) {
      assert.ok(poloFabricFor(material), material);
      assert.equal(fabricSupplyForPoloMaterial(material).category, 'base');
    }
  });

  it('aplica de siete a catorce días a telas fuera del catálogo de polos', () => {
    for (const material of [
      'Hydrotech 100% poliéster',
      'French Terry rígido',
      'Franela peinada reactiva 20/1 pesada',
      'Material nuevo sin registrar',
    ]) {
      assert.equal(poloFabricFor(material), undefined, material);
      assert.deepEqual(fabricSupplyForPoloMaterial(material), {
        category: 'imported',
        minimumLeadTimeDays: 7,
        maximumLeadTimeDays: 14,
        remainingLeadTimeDays: 14,
      });
    }
  });
});
