import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';

let server: Server;
let baseUrl: string;

const requiredBy = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
const peruActivaHeaders = {
  'content-type': 'application/json',
  'x-demo-actor': 'peru_activa',
};
const draft = {
  product: 'polo',
  quantity: 100,
  material: 'algodón',
  color: 'Azul marino',
  sizes: { S: 20, M: 35, L: 30, XL: 15 },
  customization: 'printing',
  designReference: 'Logo institucional en el pecho',
  requiredBy,
  deliveryDistrict: 'La Victoria',
  notes: '',
};

before(async () => {
  server = createServer(createApp({ orderStore: new MemoryOrderStore() }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('portal order flow', () => {
  it('registers, recommends and confirms a simulated order', async () => {
    const createdResponse = await fetch(`${baseUrl}/v1/orders`, {
      method: 'POST',
      headers: peruActivaHeaders,
      body: JSON.stringify(draft),
    });
    assert.equal(createdResponse.status, 201);
    const created = await createdResponse.json();
    assert.equal(created.order.status, 'recommended');
    assert.equal(created.order.recommendation.candidates[0].workshopId, 'workshop-b');

    const confirmationResponse = await fetch(`${baseUrl}/v1/orders/${created.order.id}/confirm`, {
      method: 'POST',
      headers: peruActivaHeaders,
      body: JSON.stringify({ workshopId: created.order.recommendation.candidates[0].workshopId }),
    });
    assert.equal(confirmationResponse.status, 200);
    const confirmed = await confirmationResponse.json();
    assert.equal(confirmed.order.status, 'assigned');
    assert.equal(confirmed.order.assignment.displayName, 'Taller B');

    const listResponse = await fetch(`${baseUrl}/v1/orders`, {
      headers: { 'x-demo-actor': 'peru_activa' },
    });
    const list = await listResponse.json();
    assert.equal(list.orders.length, 1);
    assert.equal(list.orders[0].id, created.order.id);
  });

  it('rejects a size breakdown that does not match the quantity', async () => {
    const response = await fetch(`${baseUrl}/v1/orders`, {
      method: 'POST',
      headers: peruActivaHeaders,
      body: JSON.stringify({ ...draft, sizes: { S: 10, M: 10, L: 10, XL: 10 } }),
    });
    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, 'invalid_order');
  });
});
