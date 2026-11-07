import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { QuotationService } from '../src/application/quotation-service.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { week03DeclaredWorkshops } from '../src/data/week-03-assignment-scenarios.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import {
  quotationRequestDraftSchema,
  type QuotationRequest,
} from '../src/domain/quotation-requests.js';

function fixture(count = 1) {
  const requiredBy = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const garment = {
    product: 'polo',
    model: 'Cuello redondo',
    audience: 'unisex',
    sleeve: 'manga_corta',
    cut: 'estandar',
    quantity: 20,
    sizes: [{ size: 'M', quantity: 20 }],
    color: 'Azul',
    fabric: { mode: 'specified', name: 'Zanetti' },
    customization: 'none',
    applicationCount: 0,
    customizationDetails: '',
    designReference: '',
  };
  const draft = quotationRequestDraftSchema.parse({
    customer: {
      contactName: 'Cliente técnico',
      businessName: 'Empresa de prueba',
      contact: 'cliente@example.test',
    },
    garment,
    additionalGarments: Array.from({ length: count - 1 }, (_, index) => ({
      ...garment,
      color: `Azul ${index + 1}`,
    })),
    delivery: { requiredBy, location: 'Lima' },
    notes: '',
  });
  const quote = {
    totalPricePEN: 520 * count,
    lineItems: Array.from({ length: count }, (_, garmentIndex) => ({
      garmentIndex,
      unitPricePEN: 26,
    })),
    selectedFabric: 'Zanetti',
    fabricBuyer: 'peru_activa' as const,
    validUntil: requiredBy,
    conditions: 'Condiciones de prueba',
    deliveryConfirmation: { requiredBy, confirmed: true },
    quotedAt: new Date().toISOString(),
  };
  const orders = new MemoryOrderStore();
  const quotations = new MemoryQuotationStore();
  const assignment = new AssignmentDemoService(
    orders,
    new MemoryWorkshopStore(week03DeclaredWorkshops),
  );
  const accepted: QuotationRequest = {
    id: 'COT-TECH',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'accepted',
    owner: { subject: 'local-email:cliente@example.test', email: 'cliente@example.test' },
    request: draft,
    quotation: quote,
  };
  return { draft, quote, orders, quotations, assignment, accepted };
}

describe('Copiar una solicitud propia', () => {
  it('copia solo datos editables del propietario y genera una solicitud independiente', async () => {
    const f = fixture(2);
    await f.quotations.save(f.accepted);
    const app = createApp({
      orderStore: f.orders,
      quotationStore: f.quotations,
      workshopStore: new MemoryWorkshopStore([]),
    });
    const server = createServer(app);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Missing address');
    const base = `http://127.0.0.1:${address.port}`;
    try {
      assert.equal(
        (
          await fetch(base + '/v1/quotation-requests/COT-TECH/draft', {
            headers: { 'x-demo-client-email': 'otro@example.test' },
          })
        ).status,
        404,
      );
      assert.equal(
        (
          await fetch(base + '/v1/quotation-requests/COT-TECH/draft', {
            headers: { 'x-demo-actor': 'peru_activa' },
          })
        ).status,
        404,
      );
      const response = await fetch(base + '/v1/quotation-requests/COT-TECH/draft');
      assert.equal(response.status, 200);
      const copied = await response.json();
      assert.equal(copied.draft.delivery.requiredBy, '');
      assert.equal(copied.draft.additionalGarments.length, 1);
      assert.equal(copied.draft.quotation, undefined);
      assert.equal(copied.draft.buyerDecision, undefined);
      assert.equal(copied.draft.production, undefined);
      copied.draft.delivery.requiredBy = f.draft.delivery.requiredBy;
      copied.draft.garment.quantity = 30;
      copied.draft.garment.sizes = [{ size: 'L', quantity: 30 }];
      const created = await fetch(base + '/v1/quotation-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(copied.draft),
      });
      assert.equal(created.status, 201);
      const payload = await created.json();
      assert.notEqual(payload.request.id, f.accepted.id);
      assert.equal(payload.request.status, 'pending_quote');
      assert.equal(payload.request.quotation, undefined);
      assert.equal(payload.request.production, undefined);
      assert.equal((await f.quotations.get(f.accepted.id))?.request.garment.quantity, 20);
      assert.equal((await f.orders.list()).length, 0);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
