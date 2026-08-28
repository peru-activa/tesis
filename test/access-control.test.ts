import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';

let server: Server;
let baseUrl: string;

const draft = {
  customer: {
    contactName: 'Cliente simulado',
    businessName: 'Organización simulada',
    contact: 'contacto@example.test',
  },
  garment: {
    product: 'polo',
    model: 'Cuello camisero',
    audience: 'unisex',
    sleeve: 'manga_corta',
    cut: 'estandar',
    quantity: 20,
    sizes: [
      { size: 'M', quantity: 10 },
      { size: 'L', quantity: 10 },
    ],
    color: 'Azul marino',
    fabric: { mode: 'proposal' },
    customization: 'embroidery',
    applicationCount: 1,
    customizationDetails: 'Logo al pecho',
    designReference: 'Logo institucional simulado',
  },
  additionalGarments: [],
  delivery: { requiredBy: '2026-09-30', location: 'Lima Metropolitana' },
  notes: '',
};

const clientHeaders = (email: string) => ({
  'content-type': 'application/json',
  'x-demo-client-email': email,
});
const peruActivaHeaders = {
  'content-type': 'application/json',
  'x-demo-actor': 'peru_activa',
};

before(async () => {
  server = createServer(
    createApp({
      orderStore: new MemoryOrderStore(),
      quotationStore: new MemoryQuotationStore(),
    }),
  );
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

describe('aislamiento de datos por identidad', () => {
  it('redirige la entrada simple según el rol resuelto por el backend', async () => {
    const clientResponse = await fetch(`${baseUrl}/demo`, {
      headers: clientHeaders('cliente-ruta@example.test'),
      redirect: 'manual',
    });
    assert.equal(clientResponse.status, 302);
    assert.equal(clientResponse.headers.get('location'), '/mis-pedidos');

    const peruActivaResponse = await fetch(`${baseUrl}/demo`, {
      headers: peruActivaHeaders,
      redirect: 'manual',
    });
    assert.equal(peruActivaResponse.status, 302);
    assert.equal(peruActivaResponse.headers.get('location'), '/peru-activa');

    const workshopResponse = await fetch(`${baseUrl}/demo`, {
      headers: { 'x-demo-workshop-phone': '900000001' },
      redirect: 'manual',
    });
    assert.equal(workshopResponse.status, 302);
    assert.equal(workshopResponse.headers.get('location'), '/taller');
  });

  it('cada cliente lista y abre solamente sus propias solicitudes', async () => {
    const first = await createQuotation('cliente-a@example.test');
    const second = await createQuotation('cliente-b@example.test');

    const firstListResponse = await fetch(`${baseUrl}/v1/quotation-requests`, {
      headers: clientHeaders('cliente-a@example.test'),
    });
    const firstList = await firstListResponse.json();
    assert.deepEqual(
      firstList.requests.map((request: { id: string }) => request.id),
      [first.id],
    );

    const firstTrackingResponse = await fetch(`${baseUrl}/v1/my-orders`, {
      headers: clientHeaders('cliente-a@example.test'),
    });
    assert.equal(firstTrackingResponse.status, 200);
    const firstTracking = await firstTrackingResponse.json();
    assert.deepEqual(
      firstTracking.items.map((item: { quotation: { id: string } }) => item.quotation.id),
      [first.id],
    );

    const foreignTrackingResponse = await fetch(`${baseUrl}/v1/my-orders/${second.id}`, {
      headers: clientHeaders('cliente-a@example.test'),
    });
    assert.equal(foreignTrackingResponse.status, 404);

    const foreignResponse = await fetch(`${baseUrl}/v1/quotation-requests/${second.id}`, {
      headers: clientHeaders('cliente-a@example.test'),
    });
    assert.equal(foreignResponse.status, 404);

    const peruActivaResponse = await fetch(`${baseUrl}/v1/quotation-requests`, {
      headers: peruActivaHeaders,
    });
    const peruActivaList = await peruActivaResponse.json();
    assert.deepEqual(
      new Set(peruActivaList.requests.map((request: { id: string }) => request.id)),
      new Set([first.id, second.id]),
    );
  });

  it('solo Perú Activa puede registrar una cotización', async () => {
    const quotation = await createQuotation('cliente-c@example.test');
    const payload = {
      totalPricePEN: 1_000,
      lineItems: [{ garmentIndex: 0, unitPricePEN: 50 }],
      selectedFabric: 'Algodón pima 20/1',
      validUntil: '2026-09-05',
      conditions: 'Cotización simulada.',
    };
    const clientAttempt = await fetch(
      `${baseUrl}/v1/quotation-requests/${quotation.id}/quotation`,
      {
        method: 'POST',
        headers: clientHeaders('cliente-c@example.test'),
        body: JSON.stringify(payload),
      },
    );
    assert.equal(clientAttempt.status, 403);

    const accepted = await fetch(`${baseUrl}/v1/quotation-requests/${quotation.id}/quotation`, {
      method: 'POST',
      headers: peruActivaHeaders,
      body: JSON.stringify(payload),
    });
    assert.equal(accepted.status, 200);
  });

  it('identifica los cinco teléfonos simulados y rechaza uno desconocido', async () => {
    for (const phone of ['900000001', '900000002', '900000003', '900000004', '900000005']) {
      const response = await fetch(`${baseUrl}/v1/session`, {
        headers: { 'x-demo-workshop-phone': phone },
      });
      assert.equal(response.status, 200);
      const payload = await response.json();
      assert.equal(payload.identity.role, 'workshop');
      assert.equal(payload.identity.phone, phone);
    }

    const unknown = await fetch(`${baseUrl}/v1/session`, {
      headers: { 'x-demo-workshop-phone': '999999999' },
    });
    assert.equal(unknown.status, 401);
  });
});

async function createQuotation(email: string) {
  const response = await fetch(`${baseUrl}/v1/quotation-requests`, {
    method: 'POST',
    headers: clientHeaders(email),
    body: JSON.stringify(draft),
  });
  assert.equal(response.status, 201);
  return (await response.json()).request as { id: string };
}
