import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { DeliveryPlanningService } from '../src/application/delivery-planning.js';
import { QuotationService, QuotationFlowError } from '../src/application/quotation-service.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { addDateDays, limaDate, type DeliveryPlanningInput } from '../src/domain/delivery-estimate.js';
import { quotationRequestDraftSchema } from '../src/domain/quotation-requests.js';
import { planLeadTimeDays } from '../src/domain/recommend.js';
import { recommendationRequestSchema } from '../src/domain/contracts.js';
import { capacityOrder, capacityWorkshop } from './fixtures/capacity.js';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';

const garment: DeliveryPlanningInput['garment'] = {
  product: 'polo', model: 'Cuello redondo', quantity: 100,
  fabric: { mode: 'specified', name: 'Algodón' }, customization: 'none', applicationCount: 0,
};
const input = { garment, additionalGarments: [] };
const start = new Date('2099-11-02T10:00:00-05:00');
const workshop = () => capacityWorkshop({
  workingDays: undefined, processes: ['design', 'cutting', 'sewing', 'finishing'],
});
function setup(profiles = [workshop()]) {
  const orders = new MemoryOrderStore();
  const workshops = new MemoryWorkshopStore(profiles);
  const planning = new DeliveryPlanningService(orders, workshops, { approvalDays: 2, deliveryDays: 1, horizonDays: 40 }, () => start);
  return { planning, orders, workshops };
}

describe('delivery feasibility before requesting a quotation', () => {
  it('adds approval and delivery, rejects the day before and accepts the boundary', async () => {
    const { planning } = setup();
    const estimate = await planning.estimate(input);
    assert.equal(estimate.status, 'available');
    assert.equal(estimate.approvalBy, '2099-11-04');
    assert.equal(estimate.earliestDate, '2099-11-10');
    assert.equal((await planning.estimate(input, { requiredBy: '2099-11-09' })).status, 'unavailable');
    assert.equal((await planning.estimate(input, { requiredBy: '2099-11-10' })).status, 'available');
    assert.equal((await planning.estimate(input, { approving: true })).earliestDate, '2099-11-08');
  });

  it('recalculates quantity, calendars, supplier readiness and imported materials', async () => {
    const { planning } = setup();
    const smaller = await planning.estimate({ ...input, garment: { ...garment, quantity: 20 } });
    const standard = await planning.estimate(input);
    assert.ok(smaller.earliestDate! < standard.earliestDate!);
    const calendars = setup([workshopWith({ workingDays: ['monday'] })]);
    assert.ok((await calendars.planning.estimate(input)).earliestDate! > standard.earliestDate!);
    const readiness = setup([workshopWith({ availableFrom: '2099-11-20T10:00:00-05:00' })]);
    assert.ok((await readiness.planning.estimate(input)).earliestDate! >= '2099-11-26');
    const imported = setup([workshopWith({ materials: ['Tejido especial'], materialMatchingMode: 'declared_only' })]);
    assert.ok((await imported.planning.estimate({ ...input, garment: { ...garment, fabric: { mode: 'specified', name: 'Tejido especial' } } })).earliestDate! > standard.earliestDate!);
  });

  it('never invents a date without a compatible route and excludes test-only providers', async () => {
    const { planning } = setup([workshopWith({ products: ['buzo'] }), workshopWith({ id: 'test', testOnly: true })]);
    assert.equal((await planning.estimate(input)).earliestDate, null);
    assert.equal((await setup([]).planning.estimate(input)).status, 'unavailable');
  });

  it('evaluates all garments together, reserving hypothetical work only inside the calculation', async () => {
    const { planning, orders } = setup();
    const one = await planning.estimate(input);
    const two = await planning.estimate({ ...input, additionalGarments: [garment] });
    assert.ok(two.earliestDate! > one.earliestDate!);
    assert.equal((await orders.list()).length, 0);
    assert.equal((await planning.estimate({ ...input, additionalGarments: [garment] }, { requiredBy: one.earliestDate! })).status, 'unavailable');
    assert.equal((await planning.estimate(input)).earliestDate, one.earliestDate);
  });

  it('uses persistent reservations and releases capacity after completion', async () => {
    const { planning, orders, workshops } = setup();
    const before = await planning.estimate(input);
    const assignment = new AssignmentDemoService(orders, workshops);
    const order = await capacityOrder(assignment, orders, 'committed', 100, '2099-12-31');
    await assignment.confirm(order.id, 'resource');
    const during = await planning.estimate(input);
    assert.ok(during.earliestDate! > before.earliestDate!);
    await assignment.updateWorkshopStatus(order.id, 'resource', 'in_production');
    await assignment.updateWorkshopStatus(order.id, 'resource', 'completed');
    assert.equal((await planning.estimate(input)).earliestDate, before.earliestDate);
  });

  it('does not assume that consecutive providers finish in parallel', () => {
    const request = recommendationRequestSchema.parse({ evaluatedAt: start.toISOString(), routeTiming: 'sequential_phases', order: {
      id: 'route', product: 'polo', quantity: 100, material: 'Algodón', fabricBuyer: 'peru_activa',
      requiredProcesses: ['cutting', 'sewing'], requiredBy: '2099-12-30T18:00:00-05:00',
    }, workshops: [workshop(), workshopWith({ id: 'second' })] });
    const allocations = request.workshops.map((item) => ({ workshopId: item.id, displayName: item.displayName,
      quantity: 100, effectiveLeadTimeDays: 0, estimatedCost: 0, availableCapacity: 100 }));
    assert.equal(planLeadTimeDays(request, allocations), 5);
    assert.equal(planLeadTimeDays(request, allocations, [
      { sequence: 1, workshopId: 'resource', displayName: 'A', process: 'cutting' },
      { sequence: 2, workshopId: 'second', displayName: 'B', process: 'sewing' },
    ]), 10);
  });

  it('revalidates before saving and on late acceptance without creating production on failure', async () => {
    const { planning, workshops } = setup();
    const store = new MemoryQuotationStore();
    let now = start;
    let accepted = 0;
    const livePlanning = new DeliveryPlanningService(new MemoryOrderStore(), workshops,
      planning.policy, () => now);
    const service = new QuotationService(store, () => now, { deliveryPlanning: livePlanning,
      onAccepted: async () => { accepted++; return { status: 'recommended', orderIds: [], message: '' }; } });
    const draft = quotationRequestDraftSchema.parse({
      customer: { contactName: 'Cliente sintético', businessName: 'Empresa de prueba', contact: 'cliente@example.test' },
      garment: { ...garment, audience: 'unisex', sleeve: 'manga_corta', cut: 'estandar', color: 'Azul',
        sizes: [{ size: 'M', quantity: 100 }], customizationDetails: '', designReference: '' },
      additionalGarments: [], delivery: { requiredBy: '2099-11-09', location: 'Lima' }, notes: '',
    });
    await assert.rejects(service.create(draft), (error: unknown) => error instanceof QuotationFlowError && error.code === 'delivery_unavailable');
    assert.equal((await store.list()).length, 0);
    draft.delivery.requiredBy = '2099-11-10';
    const created = await service.create(draft);
    assert.equal(created.deliveryEstimate?.earliestDate, '2099-11-10');
    await service.quote(created.id, { selectedFabric: 'Algodón', fabricBuyer: 'peru_activa', totalPricePEN: 100,
      validUntil: '2099-11-03', conditions: 'Datos de prueba', deliveryConfirmation: { requiredBy: '2099-11-10', confirmed: true } });
    now = new Date('2099-11-09T10:00:00-05:00');
    await assert.rejects(service.respond(created.id, { decision: 'accepted' }), (error: unknown) => error instanceof QuotationFlowError && error.code === 'quotation_expired');
    assert.equal(accepted, 0);
    assert.equal((await store.get(created.id))?.status, 'quoted');
    now = start;
    await service.respond(created.id, { decision: 'accepted' });
    assert.equal(accepted, 1);
  });

  it('can use independent workshops in parallel and does not spend a shared restricted resource twice', async () => {
    const cotton = workshopWith({ id: 'cotton', materialMatchingMode: 'declared_only', materials: ['Algodón'] });
    const sports = workshopWith({ id: 'sports', materialMatchingMode: 'declared_only', materials: ['Zanetti'] });
    const planning = setup([cotton, sports]).planning;
    const one = await planning.estimate(input);
    const both = await planning.estimate({ ...input, additionalGarments: [{ ...garment, fabric: { mode: 'specified', name: 'Zanetti' } }] });
    assert.equal(both.earliestDate, one.earliestDate);
  });

  it('reports an incomplete search instead of inventing an impossible capacity claim', async () => {
    const { orders, workshops } = setup();
    const planning = new DeliveryPlanningService(orders, workshops, { maximumPlanEvaluations: 1 }, () => start);
    const estimate = await planning.estimate(input);
    assert.equal(estimate.status, 'unavailable');
    assert.equal(estimate.reason, 'search_limit');
    assert.equal(estimate.earliestDate, null);
  });

  it('uses Lima dates at the UTC day boundary', () => {
    assert.equal(limaDate('2099-11-03T02:00:00Z'), '2099-11-02');
    assert.equal(addDateDays('2099-12-31', 1), '2100-01-01');
  });
});
function workshopWith(overrides: Parameters<typeof capacityWorkshop>[0]) { return { ...workshop(), ...overrides }; }
