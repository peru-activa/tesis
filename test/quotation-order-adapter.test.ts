import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  adaptAcceptedQuotation,
  fabricCategory,
} from '../src/application/quotation-order-adapter.js';
import { quotationRequestDraftSchema } from '../src/domain/quotation-requests.js';

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

  it('normaliza las telas sintéticas declaradas para sublimación', () => {
    assert.deepEqual(
      [
        'Razo',
        'Faylli',
        'Pongee',
        'Taslan',
        'Polystrech',
        'Piel de Angel',
        'Gasa',
        'French Terry',
        'Suplex',
        'Taffeta',
        'Gamuza',
        'Malla de Aire',
        'Microfibra',
        'Polar',
      ].map(fabricCategory),
      [
        'raso',
        'fayli',
        'pongee',
        'taslan',
        'polystretch',
        'piel-de-angel',
        'gasa',
        'french-terry',
        'suplex',
        'tafetan',
        'gamuza',
        'malla-de-aire',
        'microfibra',
        'polar',
      ],
    );
  });

  it('convierte varias personalizaciones del cliente en procesos internos', () => {
    const request = quotationRequestDraftSchema.parse({
      customer: {
        contactName: 'Cliente simulado',
        businessName: 'Organización simulada',
        contact: 'cliente@example.test',
      },
      garment: {
        product: 'polo',
        poloType: 'sports',
        model: 'Cuello redondo',
        audience: 'unisex',
        sleeve: 'manga_corta',
        cut: 'estandar',
        quantity: 200,
        sizes: [{ size: 'M', quantity: 200 }],
        color: 'Azul y blanco',
        fabric: { mode: 'specified', name: 'Dry Fit' },
        customization: 'sublimation',
        additionalCustomizations: ['embroidery'],
        patternMode: 'standard',
        applicationCount: 1,
        customizationDetails: 'Un bordado al pecho y sublimado integral',
        designReference: 'Diseño deportivo simulado',
      },
      additionalGarments: [],
      delivery: { requiredBy: '2026-09-30', location: 'Lima Metropolitana' },
      notes: '',
    });
    const adapted = adaptAcceptedQuotation(
      {
        id: 'COT-SIMULADA',
        createdAt: '2026-09-02T09:00:00-05:00',
        updatedAt: '2026-09-02T09:00:00-05:00',
        status: 'accepted',
        request,
        quotation: {
          totalPricePEN: 1,
          selectedFabric: 'Dry Fit',
          fabricBuyer: 'workshop',
          validUntil: '2026-09-10',
          conditions: 'Condiciones simuladas',
          quotedAt: '2026-09-02T09:00:00-05:00',
        },
      },
      0,
    );

    assert.deepEqual(adapted.requiredProcesses, [
      'design',
      'cutting',
      'sewing',
      'sublimation',
      'embroidery',
      'finishing',
    ]);
    assert.equal(adapted.draft.poloType, 'sports');
    assert.equal(adapted.draft.embroideryApplicationsPerGarment, 1);
  });
});
