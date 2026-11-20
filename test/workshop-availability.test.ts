import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { week03DeclaredWorkshops } from '../src/data/week-03-assignment-scenarios.js';
import { availabilityTargets, workshopAvailability } from '../src/application/workshop-availability.js';
import { availabilityReference, type ProductionWhatsApp, type ProductionStatus } from '../src/infrastructure/production-whatsapp.js';
import type { PortalOrder } from '../src/domain/orders.js';
const producer = week03DeclaredWorkshops.find((item) => item.id === 'sim-workshop-b')!;
const testWorkshop = { ...producer, id: 'test-workshop', displayName: 'Taller de prueba', contactPhone: '911111111', testOnly: true };
function fixture(testOnly = false): PortalOrder {
  return { id: 'PED-TEST-AVAILABLE', testOnly, ...(testOnly ? { allowedWorkshopIds: ['test-workshop'] } : {}), createdAt: '2026-11-11T10:00:00Z', updatedAt: '2026-11-11T10:00:00Z', status: 'recommended', draft: { product: 'polo', quantity: 20, material: 'algodón', color: 'azul', sizes: { M: 20 }, customization: 'none', designReference: 'Caso sintético', requiredBy: '2027-01-20', deliveryDistrict: 'Lima', notes: 'PRUEBA' }, fabricBuyer: 'peru_activa', requiredProcesses: ['sewing'], recommendation: {
    candidates: [producer, testWorkshop].map((workshop, index) => ({ candidateId: workshop.id, workshopId: workshop.id, displayName: workshop.displayName, rank: index + 1, score: 1, allocations: [{ workshopId: workshop.id, displayName: workshop.displayName, quantity: 20, assignedProcesses: ['sewing'], capacityUsed: 20 }] })), rejected: [],
  } as unknown as PortalOrder['recommendation'] };
}
function channel() {
  const sent: string[] = [];
  const statuses = new Map<string, ProductionStatus>();
  const client: ProductionWhatsApp = {
    async consult(order, notification, recipient) {
      sent.push(recipient);
      const next = { orderId: availabilityReference(order.id), workshopId: notification.content.workshopId, state: 'capacity_pending', effects: [], lastError: null };
      statuses.set(`${next.orderId}/${next.workshopId}`, next); return next;
    },
    async assign() { throw new Error('A consultation must never assign'); },
    async status(orderId, workshopId) { return statuses.get(`${orderId}/${workshopId}`) ?? null; },
    async progress() { throw new Error('Not used'); },
  };
  return { client, sent, statuses };
}
test('la prueba queda aislada y los pedidos normales excluyen el taller de prueba', async () => {
  const workshops = [producer, testWorkshop];
  assert.deepEqual(availabilityTargets(fixture(true), workshops).map((target) => target.workshop.id), ['test-workshop']);
  assert.deepEqual(availabilityTargets(fixture(false), workshops).map((target) => target.workshop.id), [producer.id]);
  const { client, sent } = channel();
  await workshopAvailability(fixture(true), workshops, client, false);
  assert.deepEqual(sent, []);
  const result = await workshopAvailability(fixture(true), workshops, client, true);
  assert.deepEqual(sent, ['51911111111']);
  assert.equal(result[0]!.state, 'capacity_pending');
});
test('un fallo no oculta los éxitos de otros talleres ni inventa confirmaciones', async () => {
  const other = { ...producer, id: 'other', contactPhone: '922222222' };
  const order = fixture(false);
  order.recommendation.candidates.push({ ...order.recommendation.candidates[0]!, candidateId: 'other', allocations: [{ ...order.recommendation.candidates[0]!.allocations[0]!, workshopId: 'other' }] });
  const { client, sent } = channel(); const consult = client.consult!;
  client.consult = async (o, n, phone) => { if (phone === '51922222222') throw new Error('Ambiguous failure'); return consult(o, n, phone); };
  const result = await workshopAvailability(order, [producer, other], client, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(result.map((row) => row.state), ['capacity_pending', 'send_failed']);
});
test('HTTP requiere Perú Activa; leer no envía mensajes y consultar no asigna', async () => {
  const orders = new MemoryOrderStore(); await orders.create(fixture(true));
  const { client, sent, statuses } = channel();
  const server = createServer(createApp({ orderStore: orders, workshopStore: new MemoryWorkshopStore([producer, testWorkshop]), productionWhatsApp: client }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/v1/orders/${fixture().id}/workshop-availability`;
  const headers = { 'x-demo-actor': 'peru_activa' };
  try {
    assert.equal((await fetch(base, { method: 'POST' })).status, 403);
    assert.equal((await fetch(base, { headers })).status, 200); assert.equal(sent.length, 0);
    assert.equal((await fetch(base, { method: 'POST', headers })).status, 200); assert.equal(sent.length, 1);
    assert.equal((await orders.get(fixture().id))!.assignment, undefined);
    statuses.get(`${availabilityReference(fixture().id)}/${testWorkshop.id}`)!.state = 'capacity_yes';
    assert.equal((await (await fetch(base, { headers })).json()).availability[0].state, 'capacity_yes');
    assert.equal(sent.length, 1);
  } finally { await new Promise<void>((resolve) => server.close(() => resolve())); }
});
