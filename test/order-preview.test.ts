import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { test } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { committedWorkFromOrders } from '../src/application/committed-work.js';
import {
  ProductionWhatsAppClient,
  type ProductionWhatsApp,
} from '../src/infrastructure/production-whatsapp.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { capacityOrder, capacityWorkshop } from './fixtures/capacity.js';
import { createWorkshopNotification } from '../src/domain/workshop-notifications.js';

test('las vistas previas conservan distribución y avances sin reservar capacidad ni publicar trabajo al taller', async () => {
  const store = new MemoryOrderStore();
  const workshop = capacityWorkshop({
    id: 'sim-workshop-a',
    contactPhone: '900000001',
    processes: ['design', 'cutting', 'sewing', 'finishing'],
  });
  const service = new AssignmentDemoService(
    store,
    new MemoryWorkshopStore([workshop]),
    () => '2026-11-02T18:00:00-05:00',
  );
  const prepared = await capacityOrder(service, store, 'PED-ABCDEF01', 40);
  prepared.previewOnly = true;
  const assigned = await service.confirm(
    prepared.id,
    prepared.recommendation.candidates[0]!.candidateId,
  );
  const producing = await service.updateWorkshopStatus(prepared.id, workshop.id, 'in_production');
  assert.equal(producing.status, 'in_production');
  assert.equal(producing.assignment?.allocations[0]?.quantity, 40);
  assert.deepEqual(committedWorkFromOrders([producing]), []);
  assert.deepEqual(await service.notifications(), []);
  const normal = { ...producing, id: 'PED-ABCDEF02', previewOnly: false };
  assert.equal(committedWorkFromOrders([normal, producing]).length, 1);
  const notification = createWorkshopNotification({
    orderId: assigned.id,
    draft: assigned.draft,
    assignment: assigned.assignment!,
    workshopId: workshop.id,
    requiredProcesses: assigned.requiredProcesses,
    publishedAt: assigned.updatedAt,
  });
  let networkCalls = 0;
  const client = new ProductionWhatsAppClient(
    'http://never-called.invalid',
    'x'.repeat(40),
    async () => {
      networkCalls++;
      throw new Error('network_called');
    },
  );
  await assert.rejects(() => client.assign(producing, notification), /preview_read_only/);
  await assert.rejects(
    () => client.consult(producing, notification, '51900000001'),
    /preview_read_only/,
  );
  assert.equal(networkCalls, 0);
  let effects = 0;
  const production: ProductionWhatsApp = {
    assign: async () => {
      effects++;
      throw new Error('effect_called');
    },
    consult: async () => {
      effects++;
      throw new Error('effect_called');
    },
    status: async () => null,
    progress: async () => {
      effects++;
      throw new Error('effect_called');
    },
  };
  const server = createServer(
    createApp({
      orderStore: store,
      workshopStore: new MemoryWorkshopStore([workshop]),
      quotationStore: new MemoryQuotationStore(),
      productionWhatsApp: production,
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const path of [
      'confirm',
      'status',
      'recommendation',
      'workshop-availability',
      'production-coordination/sim-workshop-a/progress',
      'future-operation',
    ]) {
      const response = await fetch(`${origin}/v1/orders/${prepared.id}/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-demo-actor': 'peru_activa' },
        body: '{}',
      });
      assert.equal(response.status, 409, path);
      assert.equal((await response.json()).error, 'preview_read_only');
    }
    const admin = await fetch(origin + '/v1/orders', {
      headers: { 'x-demo-actor': 'peru_activa' },
    });
    assert.equal((await admin.json()).orders.length, 1);
    const worker = await fetch(origin + '/v1/orders', {
      headers: { 'x-demo-workshop-phone': '900000001' },
    });
    assert.deepEqual((await worker.json()).orders, []);
    const publicDraft = {
      ...prepared.draft,
      requiredBy: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
      previewOnly: true,
    };
    const created = await fetch(origin + '/v1/orders', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-demo-actor': 'peru_activa' },
      body: JSON.stringify(publicDraft),
    });
    assert.equal(created.status, 201);
    assert.equal(
      (await created.json()).order.previewOnly,
      undefined,
      'public form must not set trusted metadata',
    );
    assert.equal(effects, 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
