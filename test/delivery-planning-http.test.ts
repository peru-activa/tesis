import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { addDateDays } from '../src/domain/delivery-estimate.js';
import { capacityWorkshop } from './fixtures/capacity.js';

it('protects estimation and rejects manipulated or stale delivery dates before persisting', async () => {
  const profile = capacityWorkshop({ workingDays: undefined,
    processes: ['design', 'cutting', 'sewing', 'finishing'] });
  const workshops = new MemoryWorkshopStore([profile]);
  const quotations = new MemoryQuotationStore();
  const orders = new MemoryOrderStore();
  const app = createApp({ orderStore: orders, quotationStore: quotations, workshopStore: workshops });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { 'content-type': 'application/json' };
  const garment = { product: 'polo', model: 'Cuello redondo', quantity: 100,
    fabric: { mode: 'specified', name: 'Algodón' }, customization: 'none', applicationCount: 0 };
  const input = { garment, additionalGarments: [] };
  async function post(path: string, body: unknown, actorHeaders: Record<string, string> = headers) {
    return fetch(base + path, { method: 'POST', headers: actorHeaders, body: JSON.stringify(body) });
  }
  try {
    assert.equal((await post('/v1/quotation-requests/delivery-estimate', input,
      { ...headers, 'x-demo-actor': 'workshop', 'x-demo-workshop-phone': '900000001' })).status, 403);
    assert.equal((await post('/v1/quotation-requests/delivery-estimate', {})).status, 400);
    const response = await post('/v1/quotation-requests/delivery-estimate', input);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const { estimate } = await response.json();
    assert.equal(estimate.status, 'available');
    assert.equal((await quotations.list()).length, 0);
    assert.equal((await orders.list()).length, 0);
    const draft = { ...input, customer: { contactName: 'Cliente de prueba', businessName: 'Empresa sintética', contact: 'cliente@example.test' },
      garment: { ...garment, audience: 'unisex', sleeve: 'manga_corta', cut: 'estandar', color: 'Azul',
        sizes: [{ size: 'M', quantity: 100 }], customizationDetails: '', designReference: '' },
      delivery: { requiredBy: addDateDays(estimate.earliestDate, -1), location: 'Lima' }, notes: '',
      deliveryEstimate: { earliestDate: '2000-01-01' } };
    const early = await post('/v1/quotation-requests', draft);
    assert.equal(early.status, 409);
    assert.equal((await early.json()).error, 'delivery_unavailable');
    assert.equal((await quotations.list()).length, 0);
    draft.delivery.requiredBy = estimate.earliestDate;
    assert.equal((await post('/v1/quotation-requests', draft)).status, 201);
    assert.equal((await quotations.list())[0]?.deliveryEstimate?.earliestDate, estimate.earliestDate);
    await workshops.upsertAll([{ ...profile, productionRate: { quantity: 100, days: 20 } }]);
    const stale = await post('/v1/quotation-requests', draft);
    assert.equal(stale.status, 409);
    const failure = await stale.json();
    assert.ok(failure.estimate.earliestDate > estimate.earliestDate);
    assert.equal((await quotations.list()).length, 1);
    assert.equal((await orders.list()).length, 0);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
