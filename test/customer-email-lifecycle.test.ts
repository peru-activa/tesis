import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { Pool } from 'pg';
import { QuotationService } from '../src/application/quotation-service.js';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { CustomerEmailWorker, customerEmailJob } from '../src/application/customer-email.js';
import { MemoryOrderStore, PostgresOrderStore, type OrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore, PostgresWorkshopStore } from '../src/data/workshop-store.js';
import {
  MemoryQuotationStore,
  PostgresQuotationStore,
  type QuotationStore,
} from '../src/infrastructure/quotation-store.js';
import { customerMessageBuilder } from '../src/infrastructure/customer-email-message.js';
import { isCustomerOrderReady, type CustomerEmailMessage } from '../src/domain/customer-email.js';
import { customerEmailKinds } from '../src/domain/customer-email-events.js';
import type { PortalOrder } from '../src/domain/orders.js';
import { emailDraft, emailOwner, emailQuote } from './fixtures/customer-email.js';
import { capacityOrder, capacityWorkshop } from './fixtures/capacity.js';

async function seed(orders: OrderStore, quotations: QuotationStore, count = 2) {
  const service = new QuotationService(quotations, undefined, { customerEmails: true });
  const draft = emailDraft();
  draft.additionalGarments = Array.from({ length: count - 1 }, () =>
    structuredClone(draft.garment),
  );
  const request = await service.create(draft, emailOwner),
    quote = emailQuote();
  quote.lineItems = Array.from({ length: count }, (_item, garmentIndex) => ({
    garmentIndex,
    unitPricePEN: 35,
  }));
  await service.quote(request.id, quote);
  const accepted = await service.respond(request.id, { decision: 'accepted' });
  const fixtureStore = new MemoryOrderStore();
  const template = await capacityOrder(
    new AssignmentDemoService(fixtureStore, new MemoryWorkshopStore([capacityWorkshop()])),
    fixtureStore,
    'template',
    20,
    draft.delivery.requiredBy,
  );
  const production: PortalOrder[] = Array.from({ length: count }, (_item, garmentIndex) => ({
    ...structuredClone(template),
    id: `${request.id}-prenda-${garmentIndex}`,
    source: { type: 'quotation', quotationId: request.id, garmentIndex },
  }));
  accepted.production = {
    status: 'recommended',
    orderIds: production.map((order) => order.id),
    message: 'Prueba sintética',
  };
  await quotations.save(accepted);
  await orders.createMany(production);
  orders.configureCustomerEmails(quotations);
  return { service, request: accepted, production };
}

function worker(quotations: QuotationStore, orders: OrderStore, sent: CustomerEmailMessage[]) {
  return new CustomerEmailWorker(
    quotations,
    quotations,
    {
      async send(message) {
        sent.push(message);
        return { messageId: 'synthetic', queued: true };
      },
    },
    customerMessageBuilder('https://portal.example.test', async () =>
      Buffer.from('%PDF-synthetic'),
    ),
    undefined,
    undefined,
    orders,
  );
}

describe('cuatro avisos del cliente', () => {
  it('emite los cuatro momentos sin avisos intermedios ni duplicados y con banner en todos', async () => {
    const orders = new MemoryOrderStore(),
      quotations = new MemoryQuotationStore(),
      sent: CustomerEmailMessage[] = [];
    const { request, service, production } = await seed(orders, quotations);
    await service.respond(request.id, { decision: 'accepted' });
    const sender = worker(quotations, orders, sent);
    await sender.tick();
    assert.equal(sent.length, 3);
    await orders.updateStatus(production[0]!.id, 'in_production', new Date().toISOString());
    await orders.updateStatus(production[0]!.id, 'completed', new Date().toISOString());
    await sender.tick();
    assert.equal(sent.length, 3, 'una prenda terminada no completa el pedido');
    await orders.updateStatus(production[1]!.id, 'completed', new Date().toISOString());
    await sender.tick();
    await orders.updateStatus(production[1]!.id, 'completed', new Date().toISOString());
    await sender.tick();
    assert.equal(sent.length, 4);
    assert.deepEqual(
      (await quotations.emailStatus(request.id)).map((job) => job.kind),
      [...customerEmailKinds],
    );
    assert.match(sent[3]!.text, /todas las prendas/);
    for (const message of sent) {
      const logo = message.attachments.find((file) => file.disposition === 'inline')!;
      assert.ok(logo);
      assert.equal(logo.type, 'image/png');
      assert.equal(logo.content.subarray(0, 4).toString('hex'), '89504e47');
      assert.ok(message.html.includes(`src="cid:${logo.contentId}"`));
      assert.doesNotMatch(message.html, /src="https:/, 'el banner no depende de una URL protegida');
    }
    assert.deepEqual(
      sent.map(
        (message) => message.attachments.filter((file) => file.disposition !== 'inline').length,
      ),
      [0, 1, 0, 0],
    );
  });
  it('serializa terminaciones simultáneas en memoria y no pierde la última prenda', async () => {
    const orders = new MemoryOrderStore(),
      quotations = new MemoryQuotationStore();
    const { production, request } = await seed(orders, quotations);
    await Promise.all(
      production.map((order) =>
        orders.updateStatus(order.id, 'completed', new Date().toISOString()),
      ),
    );
    assert.equal(
      (await quotations.emailStatus(request.id)).filter((job) => job.kind === 'order_ready').length,
      1,
    );
  });
  it('no anuncia un pedido listo si su estado dejó de respaldarlo antes del envío', async () => {
    const orders = new MemoryOrderStore(),
      quotations = new MemoryQuotationStore(),
      sent: CustomerEmailMessage[] = [];
    const { production, request } = await seed(orders, quotations, 1);
    await orders.updateStatus(production[0]!.id, 'completed', new Date().toISOString());
    await orders.updateStatus(production[0]!.id, 'in_production', new Date().toISOString());
    await worker(quotations, orders, sent).tick();
    assert.equal(sent.length, 3);
    assert.equal(
      (await quotations.emailStatus(request.id)).find((job) => job.kind === 'order_ready')!.state,
      'superseded',
    );
  });
  it('rechazar la cotización no produce una confirmación de compra', async () => {
    const quotations = new MemoryQuotationStore(),
      service = new QuotationService(quotations, undefined, { customerEmails: true });
    const request = await service.create(emailDraft(), emailOwner);
    await service.quote(request.id, emailQuote());
    await service.respond(request.id, { decision: 'rejected' });
    assert.equal((await quotations.emailStatus(request.id)).length, 2);
  });
  it('no notifica pruebas, vistas previas ni pedidos con prendas faltantes o sin vínculos verificables', async () => {
    const orders = new MemoryOrderStore(),
      quotations = new MemoryQuotationStore();
    const { request, production } = await seed(orders, quotations);
    const completed = production.map((order) => ({ ...order, status: 'completed' as const }));
    assert.ok(isCustomerOrderReady(request, completed));
    assert.equal(isCustomerOrderReady(request, completed.slice(1)), false);
    assert.equal(isCustomerOrderReady({ ...request, testOnly: true }, completed), false);
    assert.equal(isCustomerOrderReady({ ...request, previewOnly: true }, completed), false);
    assert.equal(
      isCustomerOrderReady(
        request,
        completed.map((order) => ({ ...order, testOnly: true })),
      ),
      false,
    );
    const { production: _metadata, ...legacy } = request;
    assert.equal(isCustomerOrderReady(legacy, completed), false);
    assert.equal(customerEmailJob({ ...request, testOnly: true }, 'order_ready'), undefined);
  });
  it('activar avisos no reenvía pedidos que ya estaban terminados', async () => {
    const orders = new MemoryOrderStore(),
      quotations = new MemoryQuotationStore();
    const { request, production } = await seed(orders, quotations, 1);
    orders.configureCustomerEmails();
    await orders.updateStatus(production[0]!.id, 'completed', new Date().toISOString());
    orders.configureCustomerEmails(quotations);
    await orders.list();
    await orders.updateStatus(production[0]!.id, 'completed', new Date().toISOString());
    assert.equal(
      (await quotations.emailStatus(request.id)).filter((job) => job.kind === 'order_ready').length,
      0,
    );
  });
});

async function postgresFixture() {
  const schema = `email_lifecycle_${randomUUID().replaceAll('-', '')}`;
  const config = {
    host: process.env.CAPACITY_TEST_PG_SOCKET!,
    port: Number(process.env.CAPACITY_TEST_PG_PORT ?? 5432),
    database: 'postgres',
    user: userInfo().username,
  };
  const admin = new Pool(config),
    pools: Pool[] = [];
  await admin.query(`CREATE SCHEMA ${schema}`);
  async function instance() {
    const pool = new Pool({ ...config, options: `-c search_path=${schema}` });
    pools.push(pool);
    const orders = new PostgresOrderStore(pool),
      quotations = new PostgresQuotationStore(pool);
    orders.configureCustomerEmails(quotations);
    await orders.list();
    return { pool, orders, quotations };
  }
  return {
    instance,
    async close() {
      await Promise.all(pools.map((pool) => pool.end()));
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

describe(
  'avisos de finalización transaccionales en PostgreSQL',
  { skip: !process.env.CAPACITY_TEST_PG_SOCKET },
  () => {
    it('las dos conexiones completan prendas simultáneamente y conservan un solo aviso tras reiniciar', async () => {
      const fixture = await postgresFixture();
      try {
        const first = await fixture.instance(),
          second = await fixture.instance();
        const { request, production } = await seed(first.orders, first.quotations);
        await Promise.all([
          first.orders.updateStatus(production[0]!.id, 'completed', new Date().toISOString()),
          second.orders.updateStatus(production[1]!.id, 'completed', new Date().toISOString()),
        ]);
        const reopened = await fixture.instance();
        assert.equal(
          (await reopened.quotations.emailStatus(request.id)).filter(
            (job) => job.kind === 'order_ready',
          ).length,
          1,
        );
        const sent: CustomerEmailMessage[] = [];
        await worker(reopened.quotations, reopened.orders, sent).tick();
        assert.equal(sent.length, 4);
        assert.match(sent[3]!.subject, /pedido está listo/);
      } finally {
        await fixture.close();
      }
    });
    it('serializa respuestas de dos talleres de una prenda sin perder sus estados', async () => {
      const fixture = await postgresFixture();
      try {
        const first = await fixture.instance(),
          second = await fixture.instance();
        const { request, production } = await seed(first.orders, first.quotations, 1);
        const workshops = new PostgresWorkshopStore(first.pool, [
          capacityWorkshop({ id: 'first' }),
          capacityWorkshop({ id: 'second' }),
        ]);
        await workshops.list();
        const order = production[0]!;
        const assignment: PortalOrder['assignment'] = {
          candidateId: 'synthetic-plan',
          workshopId: 'first',
          displayName: 'Primero',
          confirmedAt: new Date().toISOString(),
          allocations: [
            {
              workshopId: 'first',
              displayName: 'Primero',
              quantity: 20,
              assignedProcesses: ['cutting', 'sewing'],
              status: 'in_production',
            },
            {
              workshopId: 'second',
              displayName: 'Segundo',
              quantity: 20,
              assignedProcesses: ['finishing'],
              status: 'in_production',
            },
          ],
        };
        await first.pool.query(
          "UPDATE orders SET status='in_production',payload=payload || $2::jsonb WHERE id=$1",
          [order.id, { status: 'in_production', assignment }],
        );
        await Promise.all([
          first.orders.updateAllocationStatus(
            order.id,
            'first',
            'completed',
            new Date().toISOString(),
          ),
          second.orders.updateAllocationStatus(
            order.id,
            'second',
            'completed',
            new Date().toISOString(),
          ),
        ]);
        const saved = await first.orders.get(order.id);
        assert.equal(saved!.status, 'completed');
        assert.ok(
          saved!.assignment!.allocations.every((allocation) => allocation.status === 'completed'),
        );
        assert.equal(
          (await first.quotations.emailStatus(request.id)).filter(
            (job) => job.kind === 'order_ready',
          ).length,
          1,
        );
      } finally {
        await fixture.close();
      }
    });
    it('revierte el estado y su historial si no puede guardar el aviso', async () => {
      const fixture = await postgresFixture();
      try {
        const first = await fixture.instance();
        const { request, production } = await seed(first.orders, first.quotations, 1);
        const history = await first.orders.history(production[0]!.id);
        await first.pool
          .query(`CREATE FUNCTION reject_ready_email() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.payload->>'kind'='order_ready' THEN RAISE EXCEPTION 'synthetic_outbox_failure'; END IF; RETURN NEW; END; $$;
        CREATE TRIGGER reject_ready_email BEFORE INSERT ON customer_email_jobs FOR EACH ROW EXECUTE FUNCTION reject_ready_email()`);
        await assert.rejects(
          first.orders.updateStatus(production[0]!.id, 'completed', new Date().toISOString()),
        );
        assert.equal((await first.orders.get(production[0]!.id))!.status, production[0]!.status);
        assert.deepEqual(await first.orders.history(production[0]!.id), history);
        assert.equal(
          (await first.quotations.emailStatus(request.id)).filter(
            (job) => job.kind === 'order_ready',
          ).length,
          0,
        );
      } finally {
        await fixture.close();
      }
    });
  },
);
