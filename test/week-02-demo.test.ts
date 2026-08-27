import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryOrderStore } from '../src/data/order-store.js';

let server: Server;
let baseUrl: string;

before(async () => {
  server = createServer(createApp({ orderStore: new MemoryOrderStore() }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
after(async () => {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

describe('entrega de Semana 2', () => {
  it('expone un escenario simulado y versionado', async () => {
    const response = await fetch(`${baseUrl}/v1/demos/week-02`);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.simulated, true);
    assert.deepEqual(payload.delivery.thesisResults, ['R5', 'R8']);
    assert.equal(payload.delivery.resultStatus, 'partial');
    assert.equal(payload.request.workshops.length, 3);
  });

  it('produce el mismo resultado explicable en cada ejecución', async () => {
    const first = await fetch(`${baseUrl}/v1/demos/week-02/run`, { method: 'POST' }).then((response) => response.json());
    const second = await fetch(`${baseUrl}/v1/demos/week-02/run`, { method: 'POST' }).then((response) => response.json());

    assert.deepEqual(first.result, second.result);
    assert.equal(first.result.candidates[0].workshopId, 'workshop-b');
    assert.equal(first.result.candidates.length, 2);
    assert.equal(first.result.rejected.length, 1);
    assert.match(first.result.rejected[0].reasons.join(' '), /procesos faltantes/);
  });
});
