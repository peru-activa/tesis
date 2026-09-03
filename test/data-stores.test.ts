import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { week03DeclaredWorkshops } from '../src/data/week-03-assignment-scenarios.js';
import type { PortalOrder } from '../src/domain/orders.js';

const order: PortalOrder = {
  id: 'PED-R4-STORE',
  createdAt: '2026-09-03T10:00:00-05:00',
  updatedAt: '2026-09-03T10:00:00-05:00',
  status: 'registered',
  draft: {
    product: 'polo',
    poloType: 'cotton_basic',
    quantity: 20,
    material: 'pima 20/1',
    color: 'Azul',
    sizes: { M: 20 },
    customization: 'none',
    designReference: 'Pedido simulado para prueba de persistencia',
    requiredBy: '2026-09-30',
    deliveryDistrict: 'Lima',
    notes: '',
  },
  requiredProcesses: ['cutting', 'sewing', 'finishing'],
  recommendation: {
    algorithmVersion: '0.6.0',
    orderId: 'PED-R4-STORE',
    evaluatedAt: '2026-09-03T10:00:00-05:00',
    candidates: [],
    rejected: [],
    requiresHumanConfirmation: true,
  },
};

describe('centralized data-store contracts', () => {
  it('preserves the complete status history of an order', async () => {
    const store = new MemoryOrderStore();
    await store.create(order);
    await store.updateStatus(order.id, 'recommended', '2026-09-03T10:01:00-05:00');
    await store.updateStatus(order.id, 'assigned', '2026-09-03T10:02:00-05:00');

    assert.deepEqual(
      (await store.history(order.id)).map((entry) => entry.status),
      ['registered', 'recommended', 'assigned'],
    );
  });

  it('stores validated technical specifications for workshops', async () => {
    const store = new MemoryWorkshopStore();
    await store.upsertAll(week03DeclaredWorkshops, '2026-09-03T10:00:00-05:00');

    const stored = await store.list();
    assert.equal(stored.length, week03DeclaredWorkshops.length);
    assert.deepEqual(await store.get(week03DeclaredWorkshops[0]!.id), week03DeclaredWorkshops[0]);
    assert.ok(stored.every((workshop) => workshop.technicalCapabilities.length > 0));
  });
});
