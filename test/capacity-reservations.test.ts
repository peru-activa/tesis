import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AssignmentDemoService } from '../src/application/assignment-demo-service.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';
import { recommendationRequestSchema } from '../src/domain/contracts.js';
import { recommendWorkshops } from '../src/domain/recommend.js';
import { recommendWorkshopsGenetically } from '../src/domain/genetic-recommend.js';

import { capacityOrder, capacityWorkshop } from './fixtures/capacity.js';

const now = '2026-11-02T18:00:00-05:00';
const requiredBy = '2026-11-09';

function fixture(workshops = [capacityWorkshop()]) {
  const orders = new MemoryOrderStore();
  const profiles = new MemoryWorkshopStore(workshops);
  const service = new AssignmentDemoService(orders, profiles, () => now);
  return {
    orders,
    profiles,
    service,
    create: (id: string, quantity: number, date?: string) =>
      capacityOrder(service, orders, id, quantity, date),
  };
}

describe('capacity reservations shared by all orders', () => {
  for (const mode of ['throughput', 'fixed'] as const) {
    it(`reserves 80 of 100 units and leaves only 20 (${mode})`, async () => {
      const f = fixture([
        capacityWorkshop({
          capacityPlanningMode: mode,
          ...(mode === 'fixed' ? { productionRate: undefined } : {}),
        }),
      ]);
      const first = await f.create('first', 80);
      await f.service.confirm(first.id, 'resource');
      const remaining = await f.create('remaining', 20);
      assert.equal(remaining.recommendation.candidates[0]?.allocations[0]?.availableCapacity, 20);
      const excessive = await f.create('excessive', 21);
      assert.equal(excessive.recommendation.candidates.length, 0);
    });
  }

  it('does not reserve capacity for unconfirmed recommendations', async () => {
    const f = fixture();
    await f.create('unconfirmed', 100);
    assert.ok((await f.create('next', 100)).recommendation.candidates.length);
  });

  it('rejects stale proposals atomically across two service instances', async () => {
    const f = fixture();
    const first = await f.create('first', 80);
    const second = await f.create('second', 80);
    const other = new AssignmentDemoService(f.orders, f.profiles, () => now);
    const results = await Promise.allSettled([
      f.service.confirm(first.id, 'resource'),
      other.confirm(second.id, 'resource'),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    const rejected = results.find((r) => r.status === 'rejected');
    assert.equal(rejected?.reason.code, 'capacity_changed');
    assert.equal((await f.orders.list()).filter((o) => o.assignment).length, 1);
  });

  it('keeps capacity while in production and releases it after completion', async () => {
    const f = fixture();
    const first = await f.create('first', 100);
    await f.service.confirm(first.id, 'resource');
    await f.service.updateWorkshopStatus(first.id, 'resource', 'in_production');
    assert.equal((await f.create('blocked', 1)).recommendation.candidates.length, 0);
    await f.service.updateWorkshopStatus(first.id, 'resource', 'completed');
    assert.ok((await f.create('released', 100)).recommendation.candidates.length);
  });

  it('does not duplicate reservations or histories when confirmation is retried', async () => {
    const f = fixture();
    const order = await f.create('first', 80);
    await Promise.all([
      f.service.confirm(order.id, 'resource'),
      f.service.confirm(order.id, 'resource'),
    ]);
    assert.equal((await f.orders.history(order.id)).length, 2);
    assert.equal(
      (await f.create('remaining', 20)).recommendation.candidates[0]?.allocations[0]
        ?.availableCapacity,
      20,
    );
  });

  it('allows later deadlines to use additional production time', async () => {
    const f = fixture();
    const first = await f.create('first', 100);
    await f.service.confirm(first.id, 'resource');
    assert.equal((await f.create('same-window', 100)).recommendation.candidates.length, 0);
    assert.ok((await f.create('next-window', 100, '2026-11-16')).recommendation.candidates.length);
  });

  it('distributes across workshops using their respective remaining capacities', async () => {
    const f = fixture([capacityWorkshop(), capacityWorkshop({ id: 'other' })]);
    const first = await f.create('first', 80);
    await f.service.confirm(first.id, 'resource');
    const next = await f.create('distributed', 110);
    const candidate = next.recommendation.candidates[0]!;
    assert.equal(candidate.allocations.length, 2);
    assert.equal(
      candidate.allocations.find((a) => a.workshopId === 'resource')?.availableCapacity,
      20,
    );
    assert.equal(
      candidate.allocations.find((a) => a.workshopId === 'other')?.availableCapacity,
      100,
    );
    await f.service.confirm(next.id, candidate.candidateId);
  });

  it('rechecks a capacity profile changed after the proposal was issued', async () => {
    const f = fixture([
      capacityWorkshop({ capacityPlanningMode: 'fixed', productionRate: undefined }),
    ]);
    const order = await f.create('first', 80);
    await f.profiles.upsertAll([
      capacityWorkshop({
        capacityPlanningMode: 'fixed',
        productionRate: undefined,
        availableCapacity: 20,
      }),
    ]);
    await assert.rejects(f.service.confirm(order.id, 'resource'), { code: 'capacity_changed' });
    assert.equal((await f.orders.get(order.id))?.assignment, undefined);
  });

  it('releases only the completed allocation of a distributed order', async () => {
    const f = fixture([capacityWorkshop(), capacityWorkshop({ id: 'other' })]);
    const order = await f.create('distributed', 150);
    await f.service.confirm(order.id, order.recommendation.candidates[0]!.candidateId);
    await f.service.updateWorkshopStatus(order.id, 'resource', 'in_production');
    await f.service.updateWorkshopStatus(order.id, 'resource', 'completed');
    const next = await f.create('next', 100);
    assert.equal(next.recommendation.candidates.length, 1);
    assert.equal(next.recommendation.candidates[0]?.workshopId, 'resource');
    assert.equal((await f.orders.get(order.id))?.status, 'in_production');
  });

  it('refreshes a stale proposal and recovers it after capacity is released', async () => {
    const f = fixture();
    const first = await f.create('first', 100);
    await f.create('second', 100);
    await f.service.confirm(first.id, 'resource');
    assert.equal((await f.service.refreshRecommendation('second')).status, 'registered');
    await f.service.updateWorkshopStatus(first.id, 'resource', 'in_production');
    await f.service.updateWorkshopStatus(first.id, 'resource', 'completed');
    const refreshed = await f.service.refreshRecommendation('second');
    assert.equal(refreshed.status, 'recommended');
    await f.service.confirm(refreshed.id, refreshed.recommendation.candidates[0]!.candidateId);
  });

  it('uses the same workload constraints in the deterministic and genetic algorithms', async () => {
    const f = fixture();
    const first = await f.create('first', 80);
    await f.service.confirm(first.id, 'resource');
    const base = (await f.create('request', 21)).recommendationOrder!;
    const request = await f.service.withCommittedWork(
      recommendationRequestSchema.parse({
        evaluatedAt: now,
        order: base,
        workshops: await f.profiles.list(),
      }),
    );
    assert.equal(recommendWorkshops(request).candidates.length, 0);
    assert.equal(recommendWorkshopsGenetically(request, 1).result.candidates.length, 0);
  });

  it('converts embroidery reservations to production time using applications per garment', () => {
    const shop = capacityWorkshop({
      processes: ['embroidery'],
      productionRate: { quantity: 100, days: 1 },
      embroideryProfile: {
        headCount: 1,
        availableHeadCount: 1,
        includesCleanup: true,
        includesBackingRemoval: true,
      },
    });
    const request = recommendationRequestSchema.parse({
      evaluatedAt: now,
      workshops: [shop],
      order: {
        id: 'new',
        product: 'polo',
        material: 'algodón',
        quantity: 150,
        fabricBuyer: 'peru_activa',
        requiredProcesses: ['embroidery'],
        embroideryApplicationsPerGarment: 2,
        requiredBy: `${requiredBy}T18:00:00-05:00`,
      },
      committedWork: [
        {
          orderId: 'previous',
          workshopId: shop.id,
          quantity: 100,
          assignedProcesses: ['embroidery'],
          embroideryApplicationsPerGarment: 2,
        },
      ],
    });
    assert.equal(recommendWorkshops(request).candidates[0]?.allocations[0]?.availableCapacity, 150);
    assert.equal(
      recommendWorkshops({ ...request, order: { ...request.order, quantity: 151 } }).candidates
        .length,
      0,
    );
  });

  it('also converts fixed embroidery capacity when there is no production rate', () => {
    const shop = capacityWorkshop({
      processes: ['embroidery'],
      capacityUnit: 'logos',
      capacityPlanningMode: 'fixed',
      productionRate: undefined,
      maximumUnits: 100,
      availableCapacity: 100,
    });
    const request = recommendationRequestSchema.parse({
      evaluatedAt: now,
      workshops: [shop],
      order: {
        id: 'new',
        product: 'polo',
        material: 'algodón',
        quantity: 30,
        fabricBuyer: 'peru_activa',
        requiredProcesses: ['embroidery'],
        embroideryApplicationsPerGarment: 2,
        requiredBy: `${requiredBy}T18:00:00-05:00`,
      },
      committedWork: [
        {
          orderId: 'previous',
          workshopId: shop.id,
          quantity: 20,
          assignedProcesses: ['embroidery'],
          embroideryApplicationsPerGarment: 2,
        },
      ],
    });
    assert.equal(recommendWorkshops(request).candidates[0]?.allocations[0]?.availableCapacity, 30);
    assert.equal(
      recommendWorkshops({ ...request, order: { ...request.order, quantity: 31 } }).candidates
        .length,
      0,
    );
  });
});
