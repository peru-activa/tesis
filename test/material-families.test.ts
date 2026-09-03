import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { materialFamilyFor } from '../src/domain/material-families.js';

describe('normalización de familias de tela', () => {
  it('reconoce denominaciones deportivas observadas en los correos históricos', () => {
    assert.equal(materialFamilyFor('Hydrotech 100% poliéster'), 'sports_knit');
    assert.equal(materialFamilyFor('Poly Tricot deportivo 100% poliéster'), 'sports_knit');
  });
});
