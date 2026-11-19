import { DeliveryPlanningService } from '../src/application/delivery-planning.js';
import { QuotationService } from '../src/application/quotation-service.js';
import { PostgresQuotationStore } from '../src/infrastructure/quotation-store.js';
import { quotationRequestDraftSchema } from '../src/domain/quotation-requests.js';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { userInfo } from 'node:os';
import { describe, it } from 'node:test';
import { Pool } from 'pg';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { PostgresOrderStore } from '../src/data/order-store.js';
import { PostgresWorkshopStore } from '../src/data/workshop-store.js';
import { capacityOrder, capacityWorkshop } from './fixtures/capacity.js';

const socket = process.env.CAPACITY_TEST_PG_SOCKET;
const now = '2026-11-02T18:00:00-05:00';

async function withDatabase(run: (fixture: Awaited<ReturnType<typeof database>>) => Promise<void>) {
  const fixture = await database();
  try {
    await run(fixture);
  } finally {
    await fixture.close();
  }
}

async function database() {
  const schema = `capacity_test_${randomUUID().replaceAll('-', '')}`;
  const config = {
    host: socket!,
    port: Number(process.env.CAPACITY_TEST_PG_PORT ?? 5432),
    database: 'postgres',
    user: userInfo().username,
    max: 3,
  };
  const admin = new Pool(config);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pools: Pool[] = [];
  async function instance(seed = false) {
    const pool = new Pool({ ...config, options: `-c search_path=${schema}` });
    pools.push(pool);
    const orders = new PostgresOrderStore(pool);
    const workshops = new PostgresWorkshopStore(pool, seed ? [capacityWorkshop()] : []);
    await orders.list();
    await workshops.list();
    const service = new AssignmentDemoService(orders, workshops, () => now);
    return {
      orders,
      workshops,
      service,
      pool,
      create: (id: string, quantity: number) => capacityOrder(service, orders, id, quantity),
    };
  }
  return {
    instance,
    async close() {
      await Promise.all(pools.map((pool) => (pool.ended ? undefined : pool.end())));
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
      await admin.end();
    },
  };
}

describe('PostgreSQL capacity reservation transactions', { skip: !socket }, () => {
  it('preserva la condición de entrega y su política al reabrir PostgreSQL', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      await first.workshops.upsertAll([capacityWorkshop({
        workingDays: undefined, processes: ['design', 'cutting', 'sewing', 'finishing'],
      })]);
      const now = () => new Date('2099-11-02T10:00:00-05:00');
      const planning = new DeliveryPlanningService(first.orders, first.workshops, {}, now);
      const draft = quotationRequestDraftSchema.parse({
        customer: { contactName: 'Cliente sintético', businessName: 'Empresa de prueba', contact: 'cliente@example.test' },
        garment: { product: 'polo', model: 'Cuello redondo', quantity: 100, color: 'Azul',
          fabric: { mode: 'specified', name: 'Algodón' }, audience: 'unisex', sleeve: 'manga_corta', cut: 'estandar',
          sizes: [{ size: 'M', quantity: 100 }], customization: 'none', applicationCount: 0,
          customizationDetails: '', designReference: '' }, additionalGarments: [],
        delivery: { requiredBy: '2099-11-20', location: 'Lima' }, notes: '',
      });
      const service = new QuotationService(new PostgresQuotationStore(first.pool), now, { deliveryPlanning: planning });
      const saved = await service.create(draft);
      const reopened = await db.instance();
      const restored = await new PostgresQuotationStore(reopened.pool).get(saved.id);
      assert.equal(restored?.deliveryEstimate?.earliestDate, '2099-11-10');
      assert.deepEqual(restored?.deliveryEstimate?.policy, planning.policy);
      assert.equal((await reopened.orders.list()).length, 0);
    }));

  it('migra el límite antiguo para throughput, conserva el ratio y mantiene el límite fijo', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      await first.pool.query('ALTER TABLE workshop_availability DROP CONSTRAINT workshop_availability_check, ADD CONSTRAINT workshop_availability_check CHECK (maximum_units >= minimum_units)');
      const reopened = await db.instance();
      const profile = capacityWorkshop({ minimumUnits: 20, maximumUnits: 15, productionRate: { quantity: 15, days: 3 }, capacityPlanningMode: 'throughput' });
      await reopened.workshops.upsertAll([profile], now);
      assert.deepEqual((await reopened.workshops.get(profile.id))!.productionRate, profile.productionRate);
      assert.equal((await reopened.workshops.get(profile.id))!.minimumUnits, 20);
      await assert.rejects(reopened.workshops.upsertAll([{ ...profile, capacityPlanningMode: 'fixed' }], now));
      const { capacityPlanningMode: _mode, ...legacy } = profile;
      await assert.rejects(reopened.workshops.upsertAll([legacy], now));
    }));

  it('la revisión de automatización se gana una vez y no sobrescribe una asignación concurrente', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true), second = await db.instance();
      const order = await first.create('automation-cas', 20);
      const state = { revision: 1, phase: 'running' as const, authorizedAt: now, authorizedBy: 'operator', candidateIds: [order.recommendation.candidates[0]!.candidateId], candidateId: order.recommendation.candidates[0]!.candidateId, attemptedWorkshopIds: [], notifiedWorkshopIds: [], declinedWorkshopIds: [], rejections: [] };
      const claims = await Promise.all([first.orders.updateAutomation(order.id, 0, state), second.orders.updateAutomation(order.id, 0, state)]);
      assert.equal(claims.filter(Boolean).length, 1);
      await first.service.confirm(order.id, state.candidateId);
      await second.orders.updateAutomation(order.id, 1, { ...state, revision: 2, phase: 'assigned' });
      const saved = (await second.orders.get(order.id))!;
      assert.equal(saved.automation!.phase, 'assigned');
      assert.ok(saved.assignment);
      assert.deepEqual(saved.draft, order.draft);
    }));

  it('conserva la configuración existente al reiniciar e inicializa solo talleres faltantes', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      const customized = capacityWorkshop({
        displayName: 'Configuración conservada',
        availableCapacity: 43,
        productionRate: { quantity: 43, days: 5 },
      });
      await first.workshops.upsertAll([customized], now);
      const before = await first.pool.query('SELECT updated_at FROM workshops WHERE id=$1', [
        customized.id,
      ]);
      const extra = capacityWorkshop({ id: 'new-resource', displayName: 'Nuevo recurso' });
      const restarted = new PostgresWorkshopStore(first.pool, [capacityWorkshop(), extra]);
      assert.deepEqual(await restarted.get(customized.id), customized);
      assert.equal((await restarted.get(extra.id))?.displayName, 'Nuevo recurso');
      const after = await first.pool.query('SELECT updated_at FROM workshops WHERE id=$1', [
        customized.id,
      ]);
      assert.deepEqual(after.rows, before.rows);
      const rate = await first.pool.query(
        'SELECT production_rate_quantity FROM workshop_availability WHERE workshop_id=$1',
        [customized.id],
      );
      assert.equal(Number(rate.rows[0].production_rate_quantity), 43);
    }));
  it('persiste todas las prendas atómicamente y deduplica reintentos entre conexiones', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      const other = await db.instance();
      const template = await first.create('template', 10);
      await first.pool.query(
        'INSERT INTO quotation_requests (id, created_at, updated_at, status, payload) VALUES ($1, $2, $2, $3, $4)',
        ['COT-BATCH', now, 'accepted', {}],
      );
      const batch = [0, 1].map((index) => ({
        ...template,
        id: `batch-${index}`,
        source: { type: 'quotation' as const, quotationId: 'COT-BATCH', garmentIndex: index },
      }));
      const retry = batch.map((order) => ({ ...order, id: `retry-${order.id}` }));
      const [saved, repeated] = await Promise.all([
        first.orders.createMany(batch),
        other.orders.createMany(retry),
      ]);
      assert.deepEqual(
        saved.map((o) => o.id),
        repeated.map((o) => o.id),
      );
      assert.equal((await first.orders.listBySourceQuotationIds(['COT-BATCH'])).length, 2);
      const rollback = [{ ...template, id: 'must-rollback' }, template];
      await assert.rejects(other.orders.createMany(rollback));
      assert.equal(await first.orders.get('must-rollback'), undefined);
    }));
  it('persists reservations across reopening and releases completed work', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      const order = await first.create('first', 80);
      await first.service.confirm(order.id, 'resource');
      await first.pool.end();
      const restarted = await db.instance();
      const remaining = await restarted.create('second', 20);
      assert.equal(remaining.recommendation.candidates[0]?.allocations[0]?.availableCapacity, 20);
      assert.equal((await restarted.create('blocked', 21)).recommendation.candidates.length, 0);
      await restarted.service.updateWorkshopStatus(order.id, 'resource', 'in_production');
      await restarted.service.updateWorkshopStatus(order.id, 'resource', 'completed');
      assert.ok((await restarted.create('released', 100)).recommendation.candidates.length);
    }));

  it('prevents oversubscription across two independent database connections', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      const other = await db.instance();
      await first.create('first', 80);
      await other.create('second', 80);
      const results = await Promise.allSettled([
        first.service.confirm('first', 'resource'),
        other.service.confirm('second', 'resource'),
      ]);
      assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1);
      assert.equal(
        results.find((result) => result.status === 'rejected')?.reason.code,
        'capacity_changed',
      );
      const orders = await first.orders.list();
      assert.equal(orders.filter((order) => order.assignment).length, 1);
      const unassigned = orders.find((order) => !order.assignment)!;
      assert.equal(unassigned.status, 'recommended');
      assert.equal((await other.orders.history(unassigned.id)).length, 1);
    }));

  it('makes simultaneous retries of the same confirmation idempotent', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      const other = await db.instance();
      await first.create('first', 80);
      const results = await Promise.all([
        first.service.confirm('first', 'resource'),
        other.service.confirm('first', 'resource'),
      ]);
      assert.deepEqual(results[0].assignment, results[1].assignment);
      assert.equal((await first.orders.history('first')).length, 2);
      assert.equal(
        (await other.create('remaining', 20)).recommendation.candidates[0]?.allocations[0]
          ?.availableCapacity,
        20,
      );
    }));

  it('refreshes only unassigned proposals and preserves assignments', async () =>
    withDatabase(async (db) => {
      const first = await db.instance(true);
      await first.create('first', 80);
      await first.create('second', 80);
      await first.service.confirm('first', 'resource');
      const changed = await first.service.refreshRecommendation('second');
      assert.equal(changed.status, 'registered');
      assert.equal(changed.recommendation.candidates.length, 0);
      await assert.rejects(first.service.refreshRecommendation('first'), {
        code: 'invalid_order_transition',
      });
    }));
});
