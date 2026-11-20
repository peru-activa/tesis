import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { it } from 'node:test';
import { createApp } from '../src/app.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { emailDraft, emailOwner, emailQuote } from './fixtures/customer-email.js';

it('integra recepción y emisión con PDF, conserva autorización y bloquea entradas inválidas', async () => {
  const store = new MemoryQuotationStore(),
    sent: unknown[] = [];
  const orders = new MemoryOrderStore();
  const app = createApp({
    orderStore: orders,
    quotationStore: store,
    customerEmail: {
      portalUrl: 'https://portal.example.test',
      transport: {
        async send(message) {
          sent.push(message);
          return { messageId: 'test', queued: false };
        },
      },
    },
  });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const customer = { 'content-type': 'application/json', 'x-demo-client-email': emailOwner.email };
  const seller = { 'content-type': 'application/json', 'x-demo-actor': 'peru_activa' };
  try {
    const invalid = await fetch(`${base}/v1/quotation-requests`, {
      method: 'POST',
      headers: customer,
      body: '{}',
    });
    assert.equal(invalid.status, 400);
    assert.equal((await store.list()).length, 0);
    const response = await fetch(`${base}/v1/quotation-requests`, {
      method: 'POST',
      headers: customer,
      body: JSON.stringify(emailDraft()),
    });
    assert.equal(response.status, 201);
    const { request } = await response.json();
    assert.equal(
      (
        await fetch(`${base}/v1/quotation-requests/${request.id}/quotation.pdf`, {
          headers: customer,
        })
      ).status,
      409,
    );
    await app.locals.customerEmailWorker.tick();
    assert.equal(sent.length, 1);
    const quote = await fetch(`${base}/v1/quotation-requests/${request.id}/quotation`, {
      method: 'POST',
      headers: seller,
      body: JSON.stringify(emailQuote()),
    });
    assert.equal(quote.status, 200);
    assert.equal((await quote.json()).emailDelivery.messages.length, 2);
    await app.locals.customerEmailWorker.tick();
    assert.equal(sent.length, 2);
    const pdf = await fetch(`${base}/v1/quotation-requests/${request.id}/quotation.pdf`, {
      headers: customer,
    });
    assert.equal(pdf.status, 200);
    assert.match(pdf.headers.get('content-type')!, /application\/pdf/);
    assert.equal(pdf.headers.get('cache-control'), 'private, no-store');
    assert.equal(
      Buffer.from(await pdf.arrayBuffer())
        .subarray(0, 5)
        .toString(),
      '%PDF-',
    );
    const detail = await fetch(`${base}/v1/my-orders/${request.id}`, { headers: customer });
    assert.equal((await detail.json()).item.emailDelivery.messages[1].state, 'accepted');
    const accepted = await fetch(`${base}/v1/quotation-requests/${request.id}/decision`, {
      method: 'POST',
      headers: customer,
      body: JSON.stringify({ decision: 'accepted' }),
    });
    assert.equal(accepted.status, 200);
    const acceptedRequest = (await accepted.json()).request;
    await app.locals.customerEmailWorker.tick();
    assert.equal(sent.length, 3);
    for (const id of acceptedRequest.production.orderIds)
      await orders.updateStatus(id, 'completed', new Date().toISOString());
    await app.locals.customerEmailWorker.tick();
    assert.equal(sent.length, 4);
    const completed = await fetch(`${base}/v1/my-orders/${request.id}`, { headers: customer });
    assert.equal(
      (await completed.json()).item.emailDelivery.messages.find(
        (job: { kind: string }) => job.kind === 'order_ready',
      ).state,
      'accepted',
    );
    for (const path of ['quotation.pdf', 'email-status']) {
      const other = await fetch(`${base}/v1/quotation-requests/${request.id}/${path}`, {
        headers: { ...customer, 'x-demo-client-email': 'other@example.test' },
      });
      assert.equal(other.status, 404);
    }
  } finally {
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
});
