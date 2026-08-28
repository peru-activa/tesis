import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fabricCategory } from '../src/application/quotation-order-adapter.js';

describe('adaptador de cotización aceptada', () => {
  it('clasifica telas cotizadas de manera explícita y reproducible', () => {
    assert.equal(fabricCategory('Pima 20/1 algodón'), 'pima 20/1');
    assert.equal(fabricCategory('Pima 30/1 algodón'), 'pima 30/1');
    assert.equal(fabricCategory('Piqué Lacoste'), 'piqué lacoste');
    assert.equal(fabricCategory('Tela Dry Fit deportiva'), 'dry fit');
    assert.equal(fabricCategory('Win'), 'win');
    assert.equal(fabricCategory('Zanetti 100 % poliéster'), 'zanetti');
    assert.equal(fabricCategory('Material experimental'), 'material experimental');
  });
});
