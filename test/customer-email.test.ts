import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { QuotationService } from '../src/application/quotation-service.js';
import { customerEmailJob, CustomerEmailWorker } from '../src/application/customer-email.js';
import {
  EmailDeliveryError,
  type CustomerEmailMessage,
  type CustomerEmailTransport,
} from '../src/domain/customer-email.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import {
  CloudflareEmailTransport,
  customerEmailConfiguration,
} from '../src/infrastructure/cloudflare-email.js';
import { customerMessageBuilder } from '../src/infrastructure/customer-email-message.js';
import {
  quotationDocumentInput,
  renderQuotationDocument,
} from '../src/infrastructure/quotation-document.js';
import { PDFDocument } from '@pdfme/pdf-lib';
import { emailDraft, emailQuote, emailOwner } from './fixtures/customer-email.js';

const start = new Date().toISOString();
function setup() {
  let clock = new Date(start);
  const store = new MemoryQuotationStore();
  const service = new QuotationService(store, () => clock, { customerEmails: true });
  const sent: CustomerEmailMessage[] = [];
  const transport: CustomerEmailTransport = {
    async send(message) {
      sent.push(message);
      return { messageId: 'receipt', queued: true };
    },
  };
  const builder = customerMessageBuilder('https://portal.example.test', async () =>
    Buffer.from('%PDF-stub'),
  );
  const worker = (channel = transport, build = builder) =>
    new CustomerEmailWorker(store, store, channel, build, () => clock);
  return {
    store,
    service,
    sent,
    worker,
    advance: (ms: number) => {
      clock = new Date(clock.getTime() + ms);
    },
  };
}

describe('correos transaccionales del cliente', () => {
  it('envía una cotización anterior al activar el correo sin cambiar precios ni duplicarla', async () => {
    const store = new MemoryQuotationStore();
    const original = new QuotationService(store);
    const request = await original.create(emailDraft(), emailOwner);
    const quoted = await original.quote(request.id, emailQuote());
    assert.equal((await store.emailStatus(request.id)).length, 0);
    const enabled = new QuotationService(store, undefined, { customerEmails: true });
    const emitted = await enabled.quote(request.id, emailQuote());
    await enabled.quote(request.id, emailQuote());
    assert.deepEqual(emitted.quotation, quoted.quotation);
    const jobs = await store.emailStatus(request.id);
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0]!.kind, 'quotation_issued');
  });
  it('envía la copia emitida aunque el cliente ya haya respondido en el portal', async () => {
    const f = setup();
    const request = await f.service.create(emailDraft(), emailOwner);
    await f.worker().tick();
    await f.service.quote(request.id, emailQuote());
    await f.service.respond(request.id, { decision: 'accepted' });
    await f.worker().tick();
    assert.equal(f.sent.length, 3);
    assert.match(f.sent[2]!.subject, /pedido está confirmado/);
    assert.equal(f.sent[1]!.attachments.filter((file) => file.disposition !== 'inline').length, 1);
  });
  it('guarda la recepción para la cuenta verificada y no duplica entre trabajadores', async () => {
    const f = setup();
    const request = await f.service.create(emailDraft(), emailOwner);
    const [job] = await f.store.emailStatus(request.id);
    assert.equal(job?.state, 'pending');
    await Promise.all([f.worker().tick(), f.worker().tick()]);
    assert.equal(f.sent.length, 1);
    assert.equal(f.sent[0]!.to, emailOwner.email);
    assert.equal(f.sent[0]!.attachments.filter((file) => file.disposition !== 'inline').length, 0);
    assert.match(f.sent[0]!.text, /recepción de la solicitud/);
    assert.match(f.sent[0]!.html, /https:\/\/portal.example.test\/mis-pedidos\/COT-/);
    assert.equal((await f.store.emailStatus(request.id))[0]!.state, 'accepted');
    await f.worker().tick();
    assert.equal(f.sent.length, 1);
  });
  it('no encola si está desactivado, no tiene propietario o es prueba/vista previa', async () => {
    const store = new MemoryQuotationStore();
    const request = await new QuotationService(store).create(emailDraft(), emailOwner);
    assert.deepEqual(await store.emailStatus(request.id), []);
    assert.equal(
      customerEmailJob({ ...request, previewOnly: true }, 'request_received'),
      undefined,
    );
    assert.equal(customerEmailJob({ ...request, testOnly: true }, 'request_received'), undefined);
    const { owner: _owner, ...unowned } = request;
    assert.equal(customerEmailJob(unowned, 'request_received'), undefined);
  });
  it('adjunta la cotización vigente, omite revisiones reemplazadas y deduplica repetir la emisión', async () => {
    const f = setup();
    const request = await f.service.create(emailDraft(), emailOwner);
    await f.worker().tick();
    await f.service.quote(request.id, emailQuote());
    f.advance(1000);
    const changed = emailQuote();
    changed.lineItems![0]!.unitPricePEN = 40;
    const current = await f.service.quote(request.id, changed);
    f.advance(1000);
    await f.service.quote(request.id, changed);
    assert.equal((await f.store.emailStatus(request.id)).length, 3);
    await f.worker().tick();
    assert.equal(f.sent.length, 2);
    assert.equal(f.sent[1]!.attachments.filter((file) => file.disposition !== 'inline').length, 1);
    assert.match(f.sent[1]!.text, /800/);
    assert.equal(
      (await f.store.emailStatus(request.id)).filter((job) => job.state === 'superseded').length,
      1,
    );
    assert.equal(current.quotation!.totalPricePEN, 800);
  });
  it('reintenta un rechazo temporal, con límite, y conserva la misma notificación', async () => {
    const f = setup();
    const request = await f.service.create(emailDraft(), emailOwner);
    let calls = 0;
    const worker = f.worker({
      async send() {
        calls++;
        throw new EmailDeliveryError('rate_limit', 'retry');
      },
    });
    await worker.tick();
    assert.equal(calls, 1);
    assert.equal((await f.store.emailStatus(request.id))[0]!.state, 'pending');
    for (let i = 0; i < 5; i++) {
      f.advance(3_600_000);
      await worker.tick();
    }
    assert.equal(calls, 5);
    assert.equal((await f.store.emailStatus(request.id))[0]!.state, 'failed');
  });
  it('no repite envíos de resultado incierto ni trabajos interrumpidos', async () => {
    const f = setup();
    const request = await f.service.create(emailDraft(), emailOwner);
    let calls = 0;
    const worker = f.worker({
      async send() {
        calls++;
        throw new Error('connection lost');
      },
    });
    await worker.tick();
    f.advance(3_600_000);
    await worker.tick();
    assert.equal(calls, 1);
    assert.equal((await f.store.emailStatus(request.id))[0]!.state, 'uncertain');
    const second = await f.service.create(emailDraft(), emailOwner);
    const job = await f.store.claimEmail(new Date(Date.parse(start) + 3_600_000).toISOString());
    assert.ok(job);
    f.advance(180_000);
    await f.worker().tick();
    assert.equal(f.sent.length, 0);
    assert.equal((await f.store.emailStatus(second.id))[0]!.state, 'uncertain');
  });
  it('conserva la solicitud si falla el PDF y no llama al proveedor', async () => {
    const f = setup();
    const request = await f.service.create(emailDraft(), emailOwner);
    await f.worker().tick();
    await f.service.quote(request.id, emailQuote());
    const builder = customerMessageBuilder('https://portal.example.test', async () => {
      throw new Error('render');
    });
    await f.worker(undefined, builder).tick();
    assert.equal(f.sent.length, 1);
    assert.ok(await f.store.get(request.id));
    assert.equal((await f.store.emailStatus(request.id)).at(-1)!.state, 'failed');
  });
  it('escapa el HTML y conserva el contenido de cada emisión', async () => {
    const f = setup();
    const draft = emailDraft();
    draft.customer.contactName = '<img src=x onerror=alert(1)>';
    const request = await f.service.create(draft, emailOwner);
    await f.worker().tick();
    assert.match(f.sent[0]!.html, /&lt;img/);
    assert.doesNotMatch(f.sent[0]!.html, /<img src=x/);
    assert.ok(await f.store.get(request.id));
  });
});

describe('contrato Cloudflare Email Sending REST', () => {
  const config = {
    accountId: 'a'.repeat(32),
    token: 'test-token',
    from: 'pedidos@example.test',
    name: 'Perú Activa',
    replyTo: 'ventas@example.test',
    portalUrl: 'https://portal.example.test',
  };
  const message: CustomerEmailMessage = {
    to: emailOwner.email,
    subject: 'Prueba',
    text: 'Texto',
    html: '<p>Texto</p>',
    attachments: [
      { filename: 'quote.pdf', content: Buffer.from('%PDF-stub'), type: 'application/pdf' },
    ],
  };
  it('usa address, reply_to y PDF base64; distingue aceptación de entrega en cola', async () => {
    let body: Record<string, any> = {};
    const transport = new CloudflareEmailTransport(config, async (_url, options) => {
      body = JSON.parse(options!.body as string);
      return Response.json({
        success: true,
        result: {
          delivered: [],
          queued: [emailOwner.email],
          permanent_bounces: [],
          message_id: 'cf-receipt',
        },
      });
    });
    assert.deepEqual(await transport.send(message), { messageId: 'cf-receipt', queued: true });
    assert.equal(body.from.address, config.from);
    assert.equal(body.from.email, undefined);
    assert.equal(body.reply_to, config.replyTo);
    assert.equal(body.attachments[0].content, message.attachments[0]!.content.toString('base64'));
  });
  it('envía el banner como imagen CID, sin exponer la ruta local ni campos de otro contrato', async () => {
    let body: Record<string, any> = {};
    const transport = new CloudflareEmailTransport(config, async (_url, options) => {
      body = JSON.parse(options!.body as string);
      return Response.json({
        success: true,
        result: { delivered: [emailOwner.email], queued: [], permanent_bounces: [] },
      });
    });
    await transport.send({
      ...message,
      attachments: [
        {
          filename: 'logo.png',
          type: 'image/png',
          content: Buffer.from('png'),
          disposition: 'inline',
          contentId: 'brand',
        },
      ],
    });
    assert.equal(body.attachments[0].disposition, 'inline');
    assert.equal(body.attachments[0].content_id, 'brand');
    assert.equal(body.attachments[0].contentId, undefined);
  });
  for (const [status, outcome] of [
    [400, 'failed'],
    [401, 'failed'],
    [429, 'retry'],
    [503, 'uncertain'],
  ] as const) {
    it(`clasifica HTTP ${status} como ${outcome}`, async () => {
      const transport = new CloudflareEmailTransport(
        config,
        async () => new Response('', { status }),
      );
      await assert.rejects(
        transport.send(message),
        (error: unknown) => error instanceof EmailDeliveryError && error.outcome === outcome,
      );
    });
  }
  it('no interpreta HTTP 200 con rebote o destinatario ausente como enviado', async () => {
    for (const result of [
      { delivered: [], queued: [], permanent_bounces: [emailOwner.email] },
      { delivered: [], queued: [], permanent_bounces: [] },
    ]) {
      await assert.rejects(
        new CloudflareEmailTransport(config, async () =>
          Response.json({ success: true, result }),
        ).send(message),
      );
    }
  });
  it('exige configuración completa solo al activar', () => {
    assert.equal(customerEmailConfiguration({}), undefined);
    assert.throws(() => customerEmailConfiguration({ CUSTOMER_EMAIL_ENABLED: 'true' }));
  });
});

describe('PDF con plantilla PAS', () => {
  it('genera varias prendas y conserva totales y condiciones sin inventar IGV', async () => {
    const f = setup(),
      draft = emailDraft();
    draft.additionalGarments = Array.from({ length: 4 }, (_unused, i) => ({
      ...draft.garment,
      model: `Prenda ${i + 2}`,
      color: 'Rojo',
    }));
    const request = await f.service.create(draft, emailOwner),
      quote = emailQuote();
    quote.lineItems = Array.from({ length: 5 }, (_unused, garmentIndex) => ({
      garmentIndex,
      unitPricePEN: 35,
    }));
    const current = await f.service.quote(request.id, quote);
    const input = await quotationDocumentInput(current);
    assert.equal(input.priceItems.length, 5);
    assert.equal(input.total, 3500);
    assert.equal(input.notes, quote.conditions);
    assert.equal(input.taxMode, 'unspecified');
    const pdf = await renderQuotationDocument(current);
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok((await PDFDocument.load(pdf)).getPageCount() >= 3);
  });
  it('representa precios globales antiguos como un pedido, sin inventar precios por prenda', async () => {
    const f = setup(),
      request = await f.service.create(emailDraft(), emailOwner),
      quote = emailQuote();
    delete quote.lineItems;
    const current = await f.service.quote(request.id, quote);
    const input = await quotationDocumentInput(current);
    assert.equal(input.priceItems[0]!.quantity, 1);
    assert.equal(input.priceItems[0]!.unitPrice, 700);
    assert.match(input.priceItems[0]!.description, /20 unidades/);
  });
});
