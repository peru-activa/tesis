import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';

let server: Server;
let baseUrl: string;

const draft = {
  customer: {
    contactName: 'Cliente piloto',
    businessName: 'Organización simulada',
    contact: 'cliente@example.test',
  },
  garment: {
    product: 'polo',
    model: 'Cuello Taylor',
    audience: 'unisex',
    sleeve: 'manga_corta',
    cut: 'estandar',
    quantity: 32,
    sizes: [
      { size: 'S', quantity: 4 },
      { size: 'M', quantity: 14 },
      { size: 'L', quantity: 8 },
      { size: 'XL', quantity: 6 },
    ],
    color: 'Azul marino',
    fabric: { mode: 'proposal' },
    customization: 'embroidery',
    applicationCount: 1,
    customizationDetails: 'Una aplicación en la espalda',
    designReference: 'Referencia visual simulada del logo institucional',
  },
  additionalGarments: [],
  delivery: {
    requiredBy: '2026-09-30',
    location: 'Lima Metropolitana',
  },
  notes: '',
};

before(async () => {
  server = createServer(
    createApp({
      orderStore: new MemoryOrderStore(),
      quotationStore: new MemoryQuotationStore(),
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('quotation request flow', () => {
  it('requires a seller quotation before the buyer can accept', async () => {
    const createdResponse = await fetch(`${baseUrl}/v1/quotation-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.match(created.request.id, /^COT-[A-F0-9]{8}$/);
    assert.equal(created.request.status, 'pending_quote');
    assert.equal(created.request.quotation, undefined, 'the form must not generate a price');

    const prematureDecision = await fetch(
      `${baseUrl}/v1/quotation-requests/${created.request.id}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'accepted' }),
      },
    );
    assert.equal(prematureDecision.status, 409);

    const quotedResponse = await fetch(
      `${baseUrl}/v1/quotation-requests/${created.request.id}/quotation`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          totalPricePEN: 1_920,
          selectedFabric: 'Zanetti 100 % poliéster',
          validUntil: '2026-09-05',
          conditions: 'Incluye confección y un bordado por prenda.',
        }),
      },
    );
    assert.equal(quotedResponse.status, 200);
    const quoted = await quotedResponse.json();
    assert.equal(quoted.request.status, 'quoted');
    assert.equal(quoted.request.quotation.totalPricePEN, 1_920);

    const acceptedResponse = await fetch(
      `${baseUrl}/v1/quotation-requests/${created.request.id}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'accepted' }),
      },
    );
    assert.equal(acceptedResponse.status, 200);
    const accepted = await acceptedResponse.json();
    assert.equal(accepted.request.status, 'accepted');
  });

  it('rejects a request when the size distribution differs from the total', async () => {
    const response = await fetch(`${baseUrl}/v1/quotation-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        garment: {
          ...draft.garment,
          sizes: draft.garment.sizes.map((item) =>
            item.size === 'M' ? { ...item, quantity: 10 } : item,
          ),
        },
      }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, 'invalid_quotation_request');
    assert.ok(
      payload.issues.some((issue: { path: string[] }) => issue.path.join('.') === 'garment.sizes'),
    );
  });

  it('rejects an impossible delivery date', async () => {
    const response = await fetch(`${baseUrl}/v1/quotation-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        delivery: { ...draft.delivery, requiredBy: '2026-99-99' },
      }),
    });

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.ok(
      payload.issues.some(
        (issue: { path: string[] }) => issue.path.join('.') === 'delivery.requiredBy',
      ),
    );
  });

  it('supports a buzo and requires no sleeve selection', async () => {
    const response = await fetch(`${baseUrl}/v1/quotation-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        garment: {
          ...draft.garment,
          product: 'buzo',
          model: 'Casaca y dos pantalones',
          sleeve: 'no_aplica',
          cut: 'no_aplica',
          fabric: { mode: 'specified', name: 'Microtec poliéster' },
        },
      }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.equal(payload.request.request.garment.product, 'buzo');
  });

  it('supports polos and buzos in the same quotation request', async () => {
    const buzo = {
      ...draft.garment,
      product: 'buzo',
      model: 'Casaca y pantalón',
      sleeve: 'no_aplica',
      cut: 'no_aplica',
      fabric: { mode: 'specified', name: 'Microtec poliéster' },
    };
    const response = await fetch(`${baseUrl}/v1/quotation-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...draft, additionalGarments: [buzo] }),
    });
    assert.equal(response.status, 201);
    const payload = await response.json();
    assert.deepEqual(
      [
        payload.request.request.garment.product,
        payload.request.request.additionalGarments[0].product,
      ],
      ['polo', 'buzo'],
    );
  });

  it('does not require a design when the garment has no customization', async () => {
    const response = await fetch(`${baseUrl}/v1/quotation-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        ...draft,
        garment: {
          ...draft.garment,
          customization: 'none',
          applicationCount: 0,
          customizationDetails: '',
          designReference: '',
        },
      }),
    });

    assert.equal(response.status, 201);
  });
});
