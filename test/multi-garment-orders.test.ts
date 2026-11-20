import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { week03DeclaredWorkshops } from '../src/data/week-03-assignment-scenarios.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import {
  quotationRequestDraftSchema,
  type QuotationRequest,
} from '../src/domain/quotation-requests.js';

function fixture(count = 1) {
  const requiredBy = new Date(Date.now() + 45 * 86400000).toISOString().slice(0, 10);
  const garment = {
    product: 'polo',
    model: 'Cuello redondo',
    audience: 'unisex',
    sleeve: 'manga_corta',
    cut: 'estandar',
    quantity: 20,
    sizes: [{ size: 'M', quantity: 20 }],
    color: 'Azul',
    fabric: { mode: 'specified', name: 'Zanetti' },
    customization: 'none',
    applicationCount: 0,
    customizationDetails: '',
    designReference: '',
  };
  const draft = quotationRequestDraftSchema.parse({
    customer: {
      contactName: 'Cliente técnico',
      businessName: 'Empresa de prueba',
      contact: 'cliente@example.test',
    },
    garment,
    additionalGarments: Array.from({ length: count - 1 }, (_, index) => ({
      ...garment,
      color: `Azul ${index + 1}`,
    })),
    delivery: { requiredBy, location: 'Lima' },
    notes: '',
  });
  const quote = {
    totalPricePEN: 520 * count,
    lineItems: Array.from({ length: count }, (_, garmentIndex) => ({
      garmentIndex,
      unitPricePEN: 26,
    })),
    selectedFabric: 'Zanetti',
    fabricBuyer: 'peru_activa' as const,
    validUntil: requiredBy,
    conditions: 'Condiciones de prueba',
    quotedAt: new Date().toISOString(),
  };
  const orders = new MemoryOrderStore();
  const quotations = new MemoryQuotationStore();
  const assignment = new AssignmentDemoService(
    orders,
    new MemoryWorkshopStore(week03DeclaredWorkshops),
  );
  const accepted: QuotationRequest = {
    id: 'COT-TECH',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: 'accepted',
    owner: { subject: 'local-email:cliente@example.test', email: 'cliente@example.test' },
    request: draft,
    quotation: quote,
  };
  return { draft, quote, orders, quotations, assignment, accepted };
}

describe('Órdenes por prenda', () => {
  for (const count of [1, 2, 5])
    it(`crea una orden por cada una de ${count} prendas, sin duplicar en reintentos concurrentes`, async () => {
      const f = fixture(count);
      const [first, second] = await Promise.all([
        f.assignment.createFromAcceptedQuotation(f.accepted),
        f.assignment.createFromAcceptedQuotation(f.accepted),
      ]);
      assert.equal(first.orders.length, count);
      assert.deepEqual(first.orderIds, second.orderIds);
      assert.deepEqual(
        first.orders.map((o) => o.source?.garmentIndex),
        Array.from({ length: count }, (_, i) => i),
      );
      assert.equal((await f.orders.list()).length, count);
      assert.equal(
        first.orders.every((o) => o.draft.quantity === 20),
        true,
      );
    });

  it('no persiste una parte del pedido si otra prenda no se puede convertir', async () => {
    const f = fixture(2);
    f.accepted.request.additionalGarments[0]!.quantity = -1;
    await assert.rejects(f.assignment.createFromAcceptedQuotation(f.accepted));
    assert.equal((await f.orders.list()).length, 0);
  });

  it('conserva la tela cotizada por prenda cuando las telas son diferentes', async () => {
    const f = fixture(2);
    f.accepted.quotation!.lineItems = [
      { garmentIndex: 0, unitPricePEN: 26, selectedFabric: 'Pima 20/1 algodón' },
      { garmentIndex: 1, unitPricePEN: 40, selectedFabric: 'Microtec poliéster' },
    ];
    const outcome = await f.assignment.createFromAcceptedQuotation(f.accepted);
    assert.deepEqual(
      outcome.orders.map((order) => order.draft.material),
      ['pima 20/1', 'microtec poliéster'],
    );
  });

  it('conserva las órdenes sin taller y explica que Perú Activa debe revisar alternativas', async () => {
    const f = fixture(2);
    const service = new AssignmentDemoService(
      f.orders,
      new MemoryWorkshopStore(
        week03DeclaredWorkshops.map((workshop) => ({ ...workshop, products: ['buzo'] })),
      ),
    );
    const outcome = await service.createFromAcceptedQuotation(f.accepted);
    assert.equal(outcome.status, 'no_eligible_workshop');
    assert.equal(outcome.orders.length, 2);
    assert.ok(outcome.orders.every((o) => o.status === 'registered'));
    assert.match(outcome.message, /2 pendientes/);
  });
});
