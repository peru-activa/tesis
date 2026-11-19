import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { week03DeclaredWorkshops } from '../src/data/week-03-assignment-scenarios.js';
test('el detalle de una orden exige Perú Activa, devuelve nombres vigentes y no modifica la asignación', async () => {
  const orders = new MemoryOrderStore();
  const workshops = new MemoryWorkshopStore(week03DeclaredWorkshops.map(w => ({ ...w, displayName: `Nombre vigente ${w.id}` })));
  const server = createServer(createApp({ orderStore: orders, workshopStore: workshops }));
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    const created = await (await fetch(base+'/v1/demos/week-03/assignment-scenarios/balanced-polo/run', { method: 'POST' })).json();
    const path = base+'/v1/orders/'+created.order.id;
    assert.equal((await fetch(path)).status,403);
    const response = await fetch(path, { headers: { 'x-demo-actor': 'peru_activa' } });
    assert.equal(response.status,200);assert.match(response.headers.get('cache-control') || '',/no-store/);
    const detail = await response.json(); assert.equal(detail.order.id,created.order.id);
    assert.ok(Object.values(detail.workshopNames).every(name => String(name).startsWith('Nombre vigente')));
    assert.equal(detail.order.assignment,undefined);assert.equal((await orders.list()).length,1);
    assert.equal((await fetch(base+'/v1/orders/PED-UNKNOWN', { headers: { 'x-demo-actor': 'peru_activa' } })).status,404);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
