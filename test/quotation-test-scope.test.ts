import assert from 'node:assert/strict';
import { test } from 'node:test';
import { QuotationService } from '../src/application/quotation-service.js';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { week03DeclaredWorkshops } from '../src/data/week-03-assignment-scenarios.js';
import type { QuotationRequestDraft } from '../src/domain/quotation-requests.js';
const requiredBy = new Date(Date.now() + 35 * 86400000).toISOString().slice(0, 10);
const draft: QuotationRequestDraft = {
  customer: { contactName: 'Cliente de prueba', businessName: 'Prueba del portal', contact: 'test@example.invalid' },
  garment: { product: 'polo', model: 'Cuello redondo', audience: 'unisex', sleeve: 'manga_corta', cut: 'estandar', quantity: 20, sizes: [{ size: 'M', quantity: 10 }, { size: 'L', quantity: 10 }], color: 'Azul', fabric: { mode: 'specified', name: 'algodón' }, customization: 'none', applicationCount: 0, customizationDetails: '', designReference: 'Sin logo' },
  additionalGarments: [], delivery: { requiredBy, location: 'Lima, prueba sin entrega' }, notes: 'PRUEBA sin fabricación',
};
test('la solicitud de prueba cotiza y se acepta por el servicio normal antes de crear una orden aislada', async () => {
  const template = week03DeclaredWorkshops.find(w => w.id === 'sim-workshop-b')!;
  const selected = { ...template, id: 'technical-one', testOnly: true };
  const other = { ...template, id: 'technical-other', testOnly: true };
  const orders = new MemoryOrderStore();
  const assignments = new AssignmentDemoService(orders, new MemoryWorkshopStore([template, selected, other]));
  const store = new MemoryQuotationStore();
  const service = new QuotationService(store, undefined, { onAccepted: async q => {
    const result = await assignments.createFromAcceptedQuotation(q);
    return { status: result.status, orderIds: result.orderIds, message: result.message };
  } });
  const initial = await service.create(draft);
  await store.save({ ...initial, testOnly: true, allowedWorkshopIds: [selected.id] });
  assert.equal(initial.status, 'pending_quote'); assert.equal((await orders.list()).length, 0);
  const quoted = await service.quote(initial.id, { totalPricePEN: 400, selectedFabric: 'algodón', fabricBuyer: 'peru_activa', validUntil: requiredBy, conditions: 'Solo prueba, sin fabricar.', deliveryConfirmation: { requiredBy, confirmed: true } });
  assert.equal(quoted.status, 'quoted'); assert.equal((await orders.list()).length, 0);
  await service.respond(initial.id, { decision: 'accepted' });
  const result = (await orders.list())[0]!;
  assert.equal(result.testOnly, true); assert.deepEqual(result.allowedWorkshopIds, [selected.id]);
  assert.equal(result.assignment, undefined);
  assert.deepEqual([...new Set(result.recommendation.candidates.flatMap(c => c.allocations.map(a => a.workshopId)))], [selected.id]);
  const refreshed = await assignments.refreshRecommendation(result.id);
  assert.deepEqual([...new Set(refreshed.recommendation.candidates.flatMap(c => c.allocations.map(a => a.workshopId)))], [selected.id]);
  const normal = await service.create({ ...draft, testOnly: true, allowedWorkshopIds: [selected.id] } as QuotationRequestDraft);
  assert.equal(normal.testOnly, undefined); assert.equal(normal.allowedWorkshopIds, undefined);
});
