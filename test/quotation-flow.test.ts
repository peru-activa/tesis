import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { week03DeclaredWorkshops } from '../src/data/week-03-assignment-scenarios.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';

let server: Server;
let baseUrl: string;
const quotationEvents: Array<{ id: string; status: string }> = [];
const orderEvents: Array<{ id: string; source?: { quotationId: string } }> = [];
const peruActivaHeaders = {
  'content-type': 'application/json',
  'x-demo-actor': 'peru_activa',
};

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
      onQuotationUpdated: (quotation) => quotationEvents.push(quotation),
      onOrderUpdated: (order) => orderEvents.push(order),
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

    const detailResponse = await fetch(`${baseUrl}/v1/quotation-requests/${created.request.id}`);
    assert.equal(detailResponse.status, 200);
    const detail = await detailResponse.json();
    assert.equal(detail.request.id, created.request.id);
    assert.deepEqual(detail.request.request, draft);

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
        headers: peruActivaHeaders,
        body: JSON.stringify({
          totalPricePEN: 1_920,
          lineItems: [{ garmentIndex: 0, unitPricePEN: 60 }],
          selectedFabric: 'Zanetti 100 % poliéster',
          fabricBuyer: 'workshop',
          validUntil: '2026-09-05',
          conditions: 'Incluye confección y un bordado por prenda.',
        }),
      },
    );
    assert.equal(quotedResponse.status, 200);
    const quoted = await quotedResponse.json();
    assert.equal(quoted.request.status, 'quoted');
    assert.equal(quoted.request.quotation.totalPricePEN, 1_920);
    assert.equal(quoted.request.quotation.lineItems[0].unitPricePEN, 60);

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
    assert.equal(accepted.request.production.status, 'recommended');
    assert.equal(accepted.request.production.orderIds.length, 1);

    const ordersResponse = await fetch(`${baseUrl}/v1/orders`, {
      headers: { 'x-demo-actor': 'peru_activa' },
    });
    const orders = await ordersResponse.json();
    const productionOrder = orders.orders.find(
      (order: { id: string }) => order.id === accepted.request.production.orderIds[0],
    );
    assert.equal(productionOrder.source.quotationId, accepted.request.id);
    assert.equal(productionOrder.status, 'recommended');
    assert.equal(productionOrder.draft.material, 'zanetti');
    assert.equal(productionOrder.draft.sizes.M, 14);
    assert.ok(productionOrder.recommendation.candidates.length > 0);

    const workshop = week03DeclaredWorkshops.find(
      (item) => item.id === productionOrder.recommendation.candidates[0].workshopId,
    );
    assert.ok(workshop?.contactPhone);
    const confirmationResponse = await fetch(`${baseUrl}/v1/orders/${productionOrder.id}/confirm`, {
      method: 'POST',
      headers: peruActivaHeaders,
      body: JSON.stringify({ workshopId: workshop.id }),
    });
    assert.equal(confirmationResponse.status, 200);
    const confirmation = await confirmationResponse.json();
    const assignedWorkshopIds = confirmation.order.assignment.allocations.map(
      (allocation: { workshopId: string }) => allocation.workshopId,
    );

    const assignedTrackingResponse = await fetch(`${baseUrl}/v1/my-orders/${created.request.id}`);
    const assignedTracking = await assignedTrackingResponse.json();
    assert.equal(assignedTracking.item.productionOrders[0].status, 'assigned');

    const unauthorizedWorkshop = week03DeclaredWorkshops.find(
      (item) => item.contactPhone && !assignedWorkshopIds.includes(item.id),
    );
    assert.ok(unauthorizedWorkshop?.contactPhone);
    const unauthorizedStatusResponse = await fetch(
      `${baseUrl}/v1/orders/${productionOrder.id}/status`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-workshop-phone': unauthorizedWorkshop.contactPhone,
        },
        body: JSON.stringify({ status: 'in_production' }),
      },
    );
    assert.equal(unauthorizedStatusResponse.status, 404);

    for (const workshopId of assignedWorkshopIds) {
      const assignedWorkshop = week03DeclaredWorkshops.find((item) => item.id === workshopId);
      assert.ok(assignedWorkshop?.contactPhone);
      for (const status of ['in_production', 'completed']) {
        const updateResponse: Response = await fetch(
          `${baseUrl}/v1/orders/${productionOrder.id}/status`,
          {
            method: 'POST',
            headers: {
              'content-type': 'application/json',
              'x-demo-workshop-phone': assignedWorkshop.contactPhone,
            },
            body: JSON.stringify({ status }),
          },
        );
        assert.equal(updateResponse.status, 200);
      }
    }

    const completedTrackingResponse = await fetch(`${baseUrl}/v1/my-orders/${created.request.id}`);
    const completedTracking = await completedTrackingResponse.json();
    assert.equal(completedTracking.item.productionOrders[0].status, 'completed');

    const repeatedCompletionResponse = await fetch(
      `${baseUrl}/v1/orders/${productionOrder.id}/status`,
      {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-demo-workshop-phone': workshop.contactPhone,
        },
        body: JSON.stringify({ status: 'completed' }),
      },
    );
    assert.equal(repeatedCompletionResponse.status, 409);
    assert.deepEqual(
      quotationEvents
        .filter((event) => event.id === accepted.request.id)
        .map((event) => event.status),
      ['pending_quote', 'quoted', 'accepted'],
    );
    assert.ok(orderEvents.some((event) => event.source?.quotationId === accepted.request.id));
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

    const quoteResponse = await fetch(
      `${baseUrl}/v1/quotation-requests/${payload.request.id}/quotation`,
      {
        method: 'POST',
        headers: peruActivaHeaders,
        body: JSON.stringify({
          totalPricePEN: 1,
          lineItems: [
            { garmentIndex: 0, unitPricePEN: 60 },
            { garmentIndex: 1, unitPricePEN: 80 },
          ],
          selectedFabric: 'Microtec poliéster',
          fabricBuyer: 'peru_activa',
          validUntil: '2026-09-05',
          conditions: 'Cotización simulada para dos prendas.',
        }),
      },
    );
    assert.equal(quoteResponse.status, 200);
    const quote = await quoteResponse.json();
    assert.equal(quote.request.quotation.totalPricePEN, 4_480);
    assert.deepEqual(quote.request.quotation.lineItems, [
      { garmentIndex: 0, unitPricePEN: 60 },
      { garmentIndex: 1, unitPricePEN: 80 },
    ]);
    const decisionResponse = await fetch(
      `${baseUrl}/v1/quotation-requests/${payload.request.id}/decision`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision: 'accepted' }),
      },
    );
    const decision = await decisionResponse.json();
    assert.equal(decision.request.production.status, 'requires_scope_decision');
    assert.deepEqual(decision.request.production.orderIds, []);
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
