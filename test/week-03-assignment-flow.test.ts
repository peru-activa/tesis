import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';

let server: Server;
let baseUrl: string;
const peruActivaHeaders = {
  'content-type': 'application/json',
  'x-demo-actor': 'peru_activa',
};

before(async () => {
  server = createServer(createApp({ orderStore: new MemoryOrderStore() }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('flujo multicanal simulado de Semana 3', () => {
  it('expone cuatro productores, cuatro proveedores de proceso y nueve escenarios reproducibles', async () => {
    const response = await fetch(`${baseUrl}/v1/demos/week-03/assignment-scenarios`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.simulated, true);
    assert.equal(payload.datasetVersion, 'r5-synthetic-v15');
    assert.equal(payload.seed, 20_260_827);
    assert.equal(payload.workshops.length, 8);
    assert.equal(
      payload.workshops.filter(
        (workshop: { providerType: string }) => workshop.providerType === 'garment_producer',
      ).length,
      4,
    );
    assert.equal(
      payload.workshops.filter(
        (workshop: { providerType: string }) => workshop.providerType === 'process_provider',
      ).length,
      4,
    );
    assert.equal(payload.scenarios.length, 9);
    assert.ok(
      payload.workshops.every(
        (workshop: { evidenceLevel: string }) => workshop.evidenceLevel === 'declared',
      ),
    );
  });

  it('compara la línea base y el algoritmo genético con la misma semilla', async () => {
    const response = await fetch(
      `${baseUrl}/v1/demos/week-03/assignment-scenarios/balanced-polo/compare`,
      { method: 'POST' },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.datasetVersion, 'r5-synthetic-v15');
    assert.equal(payload.seed, 20_260_827);
    assert.equal(payload.comparison.baseline.algorithm, 'deterministic-baseline');
    assert.equal(payload.comparison.genetic.algorithm, 'genetic');
    assert.equal(payload.comparison.genetic.value.algorithmVersion, 'ga-0.6.0');
    assert.equal(payload.comparison.summary.sameAllocation, true);
    assert.equal(payload.comparison.summary.scoreDifference, 0);
  });

  it('recibe la decisión de Perú Activa sobre la compra de tela', async () => {
    const response = await fetch(
      `${baseUrl}/v1/demos/week-03/assignment-scenarios/balanced-polo/compare`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ fabricBuyer: 'peru_activa' }),
      },
    );
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.request.order.fabricBuyer, 'peru_activa');
    assert.match(
      payload.comparison.genetic.value.result.candidates[0].reasons.join(' '),
      /Perú Activa compra la tela/,
    );
  });

  it('evalúa, confirma y publica el mismo contenido para web y WhatsApp', async () => {
    const runResponse = await fetch(
      `${baseUrl}/v1/demos/week-03/assignment-scenarios/balanced-polo/run`,
      { method: 'POST' },
    );
    assert.equal(runResponse.status, 201);
    const evaluated = await runResponse.json();
    assert.equal(evaluated.order.status, 'recommended');
    assert.equal(evaluated.order.recommendation.candidates[0].workshopId, 'sim-workshop-b');
    assert.equal(evaluated.order.simulation.datasetVersion, 'r5-synthetic-v15');

    const confirmationResponse = await fetch(`${baseUrl}/v1/orders/${evaluated.order.id}/confirm`, {
      method: 'POST',
      headers: peruActivaHeaders,
      body: JSON.stringify({ workshopId: 'sim-workshop-b' }),
    });
    assert.equal(confirmationResponse.status, 200);
    const confirmed = await confirmationResponse.json();
    assert.equal(confirmed.order.status, 'assigned');
    assert.equal(confirmed.order.notification.channels.web.status, 'published');
    assert.equal(confirmed.order.notification.channels.whatsapp.status, 'preview_only');
    assert.equal(confirmed.order.notification.content.orderId, confirmed.order.id);
    assert.match(
      confirmed.order.notification.channels.whatsapp.messageText,
      new RegExp(confirmed.order.id),
    );
    assert.match(confirmed.order.notification.channels.whatsapp.messageText, /100 polos/);

    const inboxResponse = await fetch(`${baseUrl}/v1/workshop-notifications`, {
      headers: { 'x-demo-actor': 'peru_activa' },
    });
    const inbox = await inboxResponse.json();
    assert.equal(inbox.notifications.length, 1);
    assert.deepEqual(inbox.notifications[0], confirmed.order.notification);

    const assignedWorkshopResponse = await fetch(`${baseUrl}/v1/workshop-notifications`, {
      headers: { 'x-demo-workshop-phone': '900000002' },
    });
    const assignedWorkshop = await assignedWorkshopResponse.json();
    assert.equal(assignedWorkshop.notifications.length, 1);

    const differentWorkshopResponse = await fetch(`${baseUrl}/v1/workshop-notifications`, {
      headers: { 'x-demo-workshop-phone': '900000001' },
    });
    const differentWorkshop = await differentWorkshopResponse.json();
    assert.deepEqual(differentWorkshop.notifications, []);
  });

  it('rechaza un volumen que los productores reales compatibles no pueden cubrir', async () => {
    const response = await fetch(
      `${baseUrl}/v1/demos/week-03/assignment-scenarios/insufficient-capacity/run`,
      { method: 'POST' },
    );
    assert.equal(response.status, 422);
    const payload = await response.json();
    assert.equal(payload.error, 'no_eligible_workshops');
    assert.deepEqual(payload.result.candidates, []);
  });
});
