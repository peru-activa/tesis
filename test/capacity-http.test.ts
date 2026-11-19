import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { capacityWorkshop } from './fixtures/capacity.js';

it('returns a recoverable HTTP 409 for a stale assignment and refreshes the proposal', async () => {
  const orders = new MemoryOrderStore();
  const profile = capacityWorkshop({
    capacityPlanningMode: 'fixed',
    productionRate: undefined,
    processes: ['design', 'cutting', 'sewing', 'finishing'],
  });
  const server = createServer(
    createApp({
      orderStore: orders,
      workshopStore: new MemoryWorkshopStore([profile]),
      quotationStore: new MemoryQuotationStore(),
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { 'content-type': 'application/json', 'x-demo-actor': 'peru_activa' };
  const draft = {
    product: 'polo',
    quantity: 80,
    material: 'algodón',
    color: 'Azul',
    sizes: { M: 80 },
    customization: 'none',
    designReference: 'Prueba sintética',
    requiredBy: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10),
    deliveryDistrict: 'Lima',
    notes: '',
  };
  try {
    async function create() {
      const response = await fetch(`${url}/v1/orders`, {
        method: 'POST',
        headers,
        body: JSON.stringify(draft),
      });
      assert.equal(response.status, 201);
      return (await response.json()).order.id as string;
    }
    async function confirm(id: string) {
      return fetch(`${url}/v1/orders/${id}/confirm`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ candidateId: 'resource' }),
      });
    }
    const first = await create();
    const second = await create();
    assert.equal((await confirm(first)).status, 200);
    const conflict = await confirm(second);
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, 'capacity_changed');
    const refreshed = await fetch(`${url}/v1/orders/${second}/recommendation`, {
      method: 'POST',
      headers,
    });
    assert.equal(refreshed.status, 200);
    assert.equal((await refreshed.json()).order.status, 'registered');
    const assignedRefresh = await fetch(`${url}/v1/orders/${first}/recommendation`, {
      method: 'POST',
      headers,
    });
    assert.equal(assignedRefresh.status, 409);
    assert.equal((await orders.list()).filter((order) => order.assignment).length, 1);
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
