import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import type { ProductionStatus, ProductionWhatsApp } from '../src/infrastructure/production-whatsapp.js';

test('R6 confirma el plan, envía una intención por taller y expone aceptación y avance', async () => {
  const sent: Array<{ orderId: string; workshopId: string; quantity: number; fabricBuyer: string | undefined }> = [];
  const statuses = new Map<string, ProductionStatus>();
  const production: ProductionWhatsApp = {
    async assign(order, notification) {
      const workshopId = notification.content.workshopId;
      sent.push({ orderId: order.id, workshopId, quantity: notification.content.quantity, fabricBuyer: order.fabricBuyer });
      const current = statuses.get(workshopId) || {
        orderId: order.id, workshopId, state: 'capacity_pending',
        effects: [{ phase: 'capacity', ordinal: 0, state: 'accepted', provider_receipt_id: 'wamid.test', error: null }],
        lastError: null,
      };
      statuses.set(workshopId, current);
      return current;
    },
    async status(_orderId, workshopId) { return statuses.get(workshopId) || null; },
    async progress(_orderId, workshopId) {
      const current = statuses.get(workshopId)!;
      const next = { ...current, state: 'progress_pending' };
      statuses.set(workshopId, next);
      return next;
    },
  };
  const server = createServer(createApp({ orderStore: new MemoryOrderStore(), productionWhatsApp: production }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const headers = { 'content-type': 'application/json', 'x-demo-actor': 'peru_activa' };
  try {
    const run = await fetch(`${base}/v1/demos/week-03/assignment-scenarios/balanced-polo/run`, { method: 'POST' });
    const { order } = await run.json();
    assert.equal(order.status, 'recommended');
    const confirm = () => fetch(`${base}/v1/orders/${order.id}/confirm`, {
      method: 'POST', headers, body: JSON.stringify({ workshopId: 'sim-workshop-b' }),
    });
    const first = await confirm();
    assert.equal(first.status, 200);
    const payload = await first.json();
    assert.equal(payload.order.status, 'assigned');
    assert.equal(payload.coordination[0].state, 'capacity_pending');
    assert.equal(sent[0]!.fabricBuyer, 'workshop');
    assert.equal(sent[0]!.quantity, 100);
    assert.equal((await confirm()).status, 200);
    assert.equal(sent.length, 2);
    assert.equal((await fetch(`${base}/v1/orders/${order.id}/production-coordination`, { headers })).status, 200);
    statuses.get('sim-workshop-b')!.state = 'accepted';
    const progress = await fetch(`${base}/v1/orders/${order.id}/production-coordination/sim-workshop-b/progress`, { method: 'POST', headers });
    assert.equal(progress.status, 200);
    assert.equal((await progress.json()).coordination.state, 'progress_pending');
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});
