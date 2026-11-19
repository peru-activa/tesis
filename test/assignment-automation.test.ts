import assert from 'node:assert/strict';
import { test } from 'node:test';
import { AssignmentAutomationService } from '../src/application/assignment-automation.js';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { availabilityReference, workshopAvailabilityReference, type ProductionStatus, type ProductionWhatsApp } from '../src/infrastructure/production-whatsapp.js';
import { capacityOrder, capacityWorkshop } from './fixtures/capacity.js';
import { recommendWorkshops } from '../src/domain/recommend.js';
import { WORKSHOP_RESPONSE_WINDOW_MINUTES } from '../src/domain/assignment-plans.js';
import { recommendationRequestSchema } from '../src/domain/contracts.js';

const now = '2026-11-02T18:00:00-05:00';
async function fixture() {
  const orders = new MemoryOrderStore();
  const workshops = new MemoryWorkshopStore(['a', 'b', 'c'].map((id, index) => capacityWorkshop({ id, displayName: `Taller ${id}`, contactPhone: `91111111${index}`, minimumUnits: 20 })));
  const assignment = new AssignmentDemoService(orders, workshops, () => now);
  const order = await capacityOrder(assignment, orders, 'PED-AUTOMATION', 20);
  const statuses = new Map<string, ProductionStatus>();
  const calls: string[] = [];
  const key = (id: string, workshop: string) => `${id}/${workshop}`;
  const channel: ProductionWhatsApp = {
    async consult(o, n) {
      calls.push(`consult:${n.content.workshopId}`);
      const status = { orderId: workshopAvailabilityReference(o, n.content.workshopId), workshopId: n.content.workshopId, state: 'capacity_pending', responseDeadline: new Date(Date.parse(clock) + WORKSHOP_RESPONSE_WINDOW_MINUTES * 60_000).toISOString(), effects: [{ phase: 'capacity', ordinal: 0, state: 'accepted', provider_receipt_id: 'fake-capacity', error: null }], lastError: null };
      statuses.set(key(status.orderId, status.workshopId), status); return status;
    },
    async status(id, workshop) { return statuses.get(key(id, workshop)) ?? null; },
    async expire(id, workshop) {
      const current = statuses.get(key(id, workshop))!;
      calls.push(`expire:${workshop}`);
      if (current.state === 'capacity_pending' && Date.parse(current.responseDeadline!) <= Date.parse(clock)) current.state = 'capacity_expired';
      return current;
    },
    async assign(o, n, _q, _recipient, reference) {
      assert.equal(reference, workshopAvailabilityReference(o, n.content.workshopId));
      assert.equal(statuses.get(key(reference!, n.content.workshopId))?.state, 'capacity_yes');
      calls.push(`assign:${n.content.workshopId}`);
      const status = { orderId: o.id, workshopId: n.content.workshopId, state: 'accepted', effects: [{ phase: 'order', ordinal: 0, state: 'accepted', provider_receipt_id: 'fake-receipt', error: null }], lastError: null };
      statuses.set(key(o.id, n.content.workshopId), status); return status;
    },
    async progress() { throw new Error('No progress in this test'); },
  };
  let clock = now;
  const setClock = (value: string) => { clock = value; };
  const service = () => new AssignmentAutomationService(orders, workshops, new MemoryQuotationStore(), channel, assignment, undefined, () => clock);
  const reply = (id: string, state: string) => { statuses.get(key(availabilityReference(order.id), id))!.state = state; };
  return { orders, workshops, order, channel, calls, statuses, key, reply, service, setClock };
}

test('consultar la vista no envía; un inicio doble consulta solo el principal; el silencio no activa alternativas', async () => {
  const f = await fixture(), service = f.service();
  const primary = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
  await service.view(f.order.id); assert.deepEqual(f.calls, []);
  await Promise.all([service.start(f.order.id, 'operator'), service.start(f.order.id, 'operator')]);
  await Promise.all([service.tick(), f.service().tick()]);
  assert.deepEqual(f.calls, [`consult:${primary}`]);
  await service.tick(); await service.tick(); assert.equal(f.calls.length, 1);
  assert.equal((await f.orders.get(f.order.id))!.assignment, undefined);
});

test('solo un rechazo explícito activa el siguiente plan y una respuesta positiva completa la asignación sin otro clic', async () => {
  const f = await fixture(), service = f.service();
  await service.start(f.order.id, 'operator'); await service.tick();
  const first = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
  f.reply(first, 'capacity_no'); await service.tick();
  const next = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
  assert.notEqual(next, first); assert.deepEqual(f.calls, [`consult:${first}`, `consult:${next}`]);
  f.reply(next, 'capacity_yes'); await f.service().tick();
  const finished = (await f.orders.get(f.order.id))!;
  assert.equal(finished.assignment!.workshopId, next);
  assert.equal(finished.automation!.phase, 'assigned');
  assert.equal(finished.automation!.authorizedBy, 'operator');
  await f.service().tick(); assert.deepEqual(f.calls, [`consult:${first}`, `consult:${next}`, `assign:${next}`]);
});

test('los fallos ambiguos pausan; reiniciar no vuelve a enviar ni pasa al siguiente taller', async () => {
  const f = await fixture(), service = f.service();
  f.channel.consult = async () => { f.calls.push('ambiguous'); throw new Error('timeout'); };
  await service.start(f.order.id, 'operator'); await service.tick();
  assert.equal((await f.orders.get(f.order.id))!.automation!.phase, 'paused');
  await f.service().tick(); assert.deepEqual(f.calls, ['ambiguous']);
});

test('agota alternativas únicamente por negativas y nunca crea una asignación', async () => {
  const f = await fixture(), service = f.service();
  await service.start(f.order.id, 'operator');
  for (let index = 0; index < 3; index++) {
    await service.tick();
    const id = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
    f.reply(id, 'capacity_no');
  }
  await service.tick();
  const order = (await f.orders.get(f.order.id))!;
  assert.equal(order.automation!.phase, 'exhausted'); assert.equal(order.assignment, undefined);
  assert.equal(f.calls.length, 3);
});

test('no sobrescribe una revisión concurrente ni inicia una demostración de solo lectura', async () => {
  const f = await fixture(), service = f.service();
  await service.start(f.order.id, 'operator');
  const before = (await f.orders.get(f.order.id))!.automation!;
  assert.equal(await f.orders.updateAutomation(f.order.id, 0, { ...before, revision: 1 }), undefined);
  const preview = { ...f.order, id: 'PED-PREVIEW', previewOnly: true };
  await f.orders.create(preview);
  await assert.rejects(service.start(preview.id, 'operator'));
  await service.view(preview.id); assert.deepEqual(f.calls, []);
});

test('evita repartir un pedido entre productores si uno cubre todo y respeta mínimos por taller', () => {
  const request = recommendationRequestSchema.parse({ evaluatedAt: now, order: { id: 'LOTS', product: 'polo', quantity: 100, material: 'algodón', fabricBuyer: 'peru_activa', requiredProcesses: ['cutting','sewing','finishing'], requiredBy: '2026-11-16T18:00:00-05:00' }, workshops: [capacityWorkshop({ id: 'large', minimumUnits: 20 }), capacityWorkshop({ id: 'small', minimumUnits: 20 })] });
  assert.ok(recommendWorkshops(request).candidates.every((candidate) => candidate.allocations.length === 1));
  assert.equal(recommendWorkshops({ ...request, order: { ...request.order, quantity: 4 } }).candidates.length, 0);
});

test('las respuestas positivas de un taller compartido se reutilizan al pasar a una alternativa', async () => {
  const f = await fixture();
  await f.workshops.upsertAll([capacityWorkshop({ id: 'shared', displayName: 'Bordados', contactPhone: '922222222', processes: ['embroidery'] })]);
  const recommendation = structuredClone(f.order.recommendation);
  for (const candidate of recommendation.candidates) {
    candidate.candidateId += '+shared';
    candidate.allocations.push({ ...candidate.allocations[0]!, workshopId: 'shared', displayName: 'Bordados', assignedProcesses: ['embroidery'] });
  }
  await f.orders.updateRecommendation(f.order.id, recommendation, { ...f.order.recommendationOrder!, requiredProcesses: [...f.order.requiredProcesses, 'embroidery'] }, now);
  const service = f.service();
  await service.start(f.order.id, 'operator'); await service.tick();
  const main = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
  f.reply('shared', 'capacity_yes'); f.reply(main, 'capacity_no');
  await service.tick();
  const next = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
  assert.equal(f.calls.filter((call) => call === 'consult:shared').length, 1);
  f.reply(next, 'capacity_yes'); await service.tick();
  assert.equal((await f.orders.get(f.order.id))!.automation!.phase, 'assigned');
  assert.equal(f.calls.filter((call) => call.startsWith('assign:')).length, 2);
});

test('una ejecución que pierde su instancia no repite el envío cuyo resultado aún se desconoce', async () => {
  const f = await fixture(), first = f.service();
  let release!: () => void, entered!: () => void;
  const started = new Promise<void>((resolve) => { entered = resolve; });
  const gate = new Promise<void>((resolve) => { release = resolve; });
  const consult = f.channel.consult!;
  f.channel.consult = async (...args) => { entered(); await gate; return consult(...args); };
  await first.start(f.order.id, 'operator');
  const pending = first.tick(); await started;
  await f.service().tick(); assert.equal(f.calls.length, 0);
  f.setClock(new Date(Date.parse(now) + 121_000).toISOString());
  await f.service().tick();
  assert.equal((await f.orders.get(f.order.id))!.automation!.phase, 'paused');
  release(); await pending; assert.equal(f.calls.length, 1);
  await f.service().tick(); assert.equal(f.calls.length, 1);
});

test('conserva distribuciones necesarias y nunca asigna un lote inferior al mínimo registrado', () => {
  const request = recommendationRequestSchema.parse({ evaluatedAt: now, order: { id: 'REQUIRED-SPLIT', product: 'polo', quantity: 200, material: 'algodón', fabricBuyer: 'peru_activa', requiredProcesses: ['cutting','sewing','finishing'], requiredBy: '2026-11-09T18:00:00-05:00' }, workshops: [capacityWorkshop({ id: 'one', minimumUnits: 20 }), capacityWorkshop({ id: 'two', minimumUnits: 20 })] });
  const candidates = recommendWorkshops(request).candidates;
  assert.ok(candidates.length > 0);
  assert.ok(candidates.every((candidate) => candidate.allocations.length === 2));
  assert.ok(candidates.every((candidate) => candidate.allocations.every((allocation) => allocation.quantity >= 20)));
});

test('rechaza un plan distinto del revisado antes de autorizar o enviar', async () => {
  const f = await fixture();
  await assert.rejects(f.service().start(f.order.id, 'operator', 'outdated-plan'), /propuesta cambió/);
  assert.equal((await f.orders.get(f.order.id))!.automation, undefined);
  assert.deepEqual(f.calls, []);
});

test('al vencer 12 horas cambia solo el pendiente y conserva al taller confirmado aunque otro plan tenga mejor rango', async () => {
  const f = await fixture();
  await f.workshops.upsertAll(['emb-1', 'emb-2'].map(id => capacityWorkshop({ id, displayName: id, contactPhone: '922222222', processes: ['embroidery'] })));
  const original = f.order.recommendation.candidates;
  const plan = (index: number, border: string) => ({ ...original[index]!, candidateId: `${original[index]!.candidateId}+${border}`, allocations: [...original[index]!.allocations, { ...original[index]!.allocations[0]!, workshopId: border, displayName: border, assignedProcesses: ['embroidery'] as const as unknown as Array<'embroidery'> }] });
  const recommendation = { ...f.order.recommendation, candidates: [plan(0, 'emb-1'), plan(1, 'emb-2'), plan(0, 'emb-2')] };
  await f.orders.updateRecommendation(f.order.id, recommendation, { ...f.order.recommendationOrder!, requiredProcesses: [...f.order.requiredProcesses, 'embroidery'] }, now);
  const service = f.service(); await service.start(f.order.id, 'operator'); await service.tick();
  const producer = original[0]!.allocations[0]!.workshopId;
  f.reply(producer, 'capacity_yes');
  f.setClock(new Date(Date.parse(now) + 21 * 60_000).toISOString()); await service.tick();
  assert.equal((await service.view(f.order.id)).candidate!.candidateId, recommendation.candidates[0]!.candidateId);
  assert.equal((await service.view(f.order.id)).responseWindowMinutes, 720);
  f.setClock(new Date(Date.parse(now) + 12 * 60 * 60_000 - 1).toISOString()); await service.tick();
  assert.equal((await service.view(f.order.id)).candidate!.candidateId, recommendation.candidates[0]!.candidateId);
  f.setClock(new Date(Date.parse(now) + 12 * 60 * 60_000).toISOString()); await service.tick();
  const current = (await service.view(f.order.id));
  assert.equal(current.candidate!.candidateId, recommendation.candidates[2]!.candidateId);
  assert.deepEqual(current.automation!.expiredWorkshopIds, ['emb-1']);
  assert.equal(current.automation!.rejections.length, 0);
  assert.equal(f.calls.filter(call=>call===`consult:${producer}`).length,1);
  assert.ok(f.calls.includes('consult:emb-2'));
  f.reply('emb-1','capacity_yes'); // A late upstream reply must never reactivate its old plan.
  f.reply('emb-2','capacity_yes'); await service.tick();
  assert.equal((await f.orders.get(f.order.id))!.automation!.phase,'assigned');
  assert.ok(!f.calls.includes('assign:emb-1'));
});

test('reconsulta vencidos con referencia nueva, conserva historial y no duplica con el mismo requestId', async () => {
  const f = await fixture(), service = f.service();
  await service.start(f.order.id, 'operator'); await service.tick();
  const first = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
  for (let index = 0; index < 3; index++) {
    f.setClock(new Date(Date.parse(now) + (index + 1) * 12 * 60 * 60_000).toISOString());
    await service.tick();
  }
  assert.equal((await service.view(f.order.id)).automation!.phase, 'exhausted');
  const attempts = await Promise.allSettled([service.retryExpired(f.order.id, 'kevin', 'retry-1'),
    service.retryExpired(f.order.id, 'kevin', 'retry-1')]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  await service.retryExpired(f.order.id, 'kevin', 'retry-1');
  const restarted = (await f.orders.get(f.order.id))!;
  const reference = workshopAvailabilityReference(restarted, first);
  assert.notEqual(reference, availabilityReference(f.order.id));
  assert.equal(restarted.automation!.priorRuns!.length, 1);
  assert.equal(restarted.automation!.priorRuns![0]!.phase, 'exhausted');
  await service.tick(); await service.retryExpired(f.order.id, 'kevin', 'retry-1'); await service.tick();
  assert.equal(f.calls.filter(call => call === `consult:${first}`).length, 2);
  assert.equal(f.statuses.get(f.key(availabilityReference(f.order.id), first))!.state, 'capacity_expired');
  const status = f.statuses.get(f.key(reference, first))!;
  assert.equal(status.state, 'capacity_pending');
  status.state = 'capacity_yes'; await service.tick();
  assert.equal((await f.orders.get(f.order.id))!.automation!.phase, 'assigned');
});

test('reconsulta solo el vencido y conserva la confirmación compartida y su referencia', async () => {
  const f = await fixture();
  await f.workshops.upsertAll([capacityWorkshop({ id: 'shared', processes: ['embroidery'], contactPhone: '922222222' })]);
  const candidate = structuredClone(f.order.recommendation.candidates[0]!);
  candidate.allocations.push({ ...candidate.allocations[0]!, workshopId: 'shared', assignedProcesses: ['embroidery'] });
  await f.orders.updateRecommendation(f.order.id, { ...f.order.recommendation, candidates: [candidate] }, f.order.recommendationOrder!, now);
  const service = f.service(); await service.start(f.order.id, 'operator'); await service.tick();
  f.reply('shared', 'capacity_yes');
  f.setClock(new Date(Date.parse(now) + 12 * 60 * 60_000).toISOString()); await service.tick();
  await service.retryExpired(f.order.id, 'kevin', 'retry-shared'); await service.tick();
  const order = (await f.orders.get(f.order.id))!;
  assert.equal(workshopAvailabilityReference(order, 'shared'), availabilityReference(order.id));
  assert.equal(f.calls.filter(call => call === 'consult:shared').length, 1);
  const producer = candidate.allocations[0]!.workshopId;
  f.statuses.get(f.key(workshopAvailabilityReference(order, producer), producer))!.state = 'capacity_yes';
  await service.tick();
  assert.equal((await f.orders.get(f.order.id))!.automation!.phase, 'assigned');
});

test('no reconsulta ejecuciones activas, negativas ni demostraciones', async () => {
  const f = await fixture(), service = f.service();
  await service.start(f.order.id, 'operator'); await service.tick();
  await assert.rejects(service.retryExpired(f.order.id, 'kevin', 'active'), /detenidas/);
  for (let index = 0; index < 3; index++) {
    const id = (await service.view(f.order.id)).candidate!.allocations[0]!.workshopId;
    f.reply(id, 'capacity_no'); await service.tick();
  }
  await assert.rejects(service.retryExpired(f.order.id, 'kevin', 'declined'), /No hay consultas vencidas/);
  const preview = { ...(await f.orders.get(f.order.id))!, id: 'PREVIEW-RETRY', previewOnly: true };
  await f.orders.create(preview);
  await assert.rejects(service.retryExpired(preview.id, 'kevin', 'preview'));
  assert.equal(f.calls.filter(call => call.startsWith('consult:')).length, 3);
});
