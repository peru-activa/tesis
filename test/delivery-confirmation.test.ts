import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { describe, it } from 'node:test';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { QuotationService } from '../src/application/quotation-service.js';
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
    deliveryConfirmation: { requiredBy, confirmed: true },
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

describe('Confirmación expresa de fecha', () => {
  it('exige confirmación humana para la fecha exacta y preserva la cotización histórica', async () => {
    const f = fixture();
    const service = new QuotationService(f.quotations);
    const request = await service.create(f.draft);
    const { deliveryConfirmation, ...legacy } = f.quote;
    await assert.rejects(service.quote(request.id, legacy), /confirmar expresamente/);
    await assert.rejects(
      service.quote(request.id, {
        ...f.quote,
        deliveryConfirmation: { requiredBy: '2027-12-31', confirmed: true },
      }),
      /confirmar expresamente/,
    );
    assert.equal((await f.quotations.get(request.id))?.status, 'pending_quote');
    const quoted = await service.quote(request.id, f.quote);
    assert.deepEqual(quoted.quotation?.deliveryConfirmation, deliveryConfirmation);
    await f.quotations.save({
      ...f.accepted,
      id: 'COT-LEGACY',
      status: 'quoted',
      quotation: legacy,
    });
    await assert.rejects(
      service.respond('COT-LEGACY', { decision: 'accepted' }),
      /aún no está confirmada/,
    );
    const accepted = await service.respond(request.id, { decision: 'accepted' });
    assert.equal(accepted.status, 'accepted');
    assert.equal(
      (await service.respond(request.id, { decision: 'accepted' })).buyerDecision?.respondedAt,
      accepted.buyerDecision?.respondedAt,
    );
  });

});
