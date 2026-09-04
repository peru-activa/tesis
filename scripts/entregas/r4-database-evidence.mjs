import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { Pool } from 'pg';
import { AssignmentDemoService } from '../../src/application/assignment-demo-service.js';
import { PostgresOrderStore } from '../../src/data/order-store.js';
import {
  week03AssignmentScenarios,
  week03DeclaredWorkshops,
} from '../../src/data/week-03-assignment-scenarios.js';
import { PostgresWorkshopStore } from '../../src/data/workshop-store.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('R4 requiere DATABASE_URL para verificar PostgreSQL; no se usa memoria.');
}

const orderCount = 100;
const queryRuns = 100;
const latencyLimitMs = 500;
const schema = `r4_evidence_${randomUUID().replaceAll('-', '')}`;
const outputDirectory = new URL('../../docs/entregas/evidencia-r4/', import.meta.url);
const admin = new Pool({ connectionString });
let isolatedPool;
let reopenedPool;

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const medianIndex = Math.ceil(sorted.length * 0.5) - 1;
  const percentileIndex = Math.ceil(sorted.length * 0.95) - 1;
  return {
    runs: samples.length,
    averageMs: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(3)),
    medianMs: Number(sorted[Math.max(0, medianIndex)].toFixed(3)),
    p95Ms: Number(sorted[Math.max(0, percentileIndex)].toFixed(3)),
    maximumMs: Number(sorted.at(-1).toFixed(3)),
    samplesMs: samples.map((sample) => Number(sample.toFixed(3))),
  };
}

async function timed(operation) {
  const startedAt = performance.now();
  await operation();
  return performance.now() - startedAt;
}

try {
  await admin.query(`CREATE SCHEMA ${schema}`);
  const poolOptions = { connectionString, options: `-c search_path=${schema}` };
  isolatedPool = new Pool(poolOptions);
  const orderStore = new PostgresOrderStore(isolatedPool);
  const workshopStore = new PostgresWorkshopStore(isolatedPool, week03DeclaredWorkshops);
  await workshopStore.list();

  let sequence = 0;
  const createdIds = [];
  const service = new AssignmentDemoService(
    orderStore,
    workshopStore,
    () => new Date(Date.UTC(2026, 8, 3, 15, sequence++)).toISOString(),
    () => `PED-R4-${String(sequence).padStart(4, '0')}`,
  );
  const scenarioId = week03AssignmentScenarios[0].id;
  for (let index = 0; index < orderCount; index += 1) {
    const created = await service.runScenario(scenarioId);
    createdIds.push(created.id);
  }
  const firstOrder = await orderStore.get(createdIds[0]);
  assert.ok(firstOrder?.recommendation.candidates[0]);
  const assignedOrder = await service.confirm(
    firstOrder.id,
    firstOrder.recommendation.candidates[0].candidateId,
  );
  assert.equal(assignedOrder.assignment?.allocations.length, 1);
  const assignedWorkshopId = assignedOrder.assignment.allocations[0].workshopId;
  await service.updateWorkshopStatus(firstOrder.id, assignedWorkshopId, 'in_production');
  await service.updateWorkshopStatus(firstOrder.id, assignedWorkshopId, 'completed');

  await isolatedPool.end();
  isolatedPool = undefined;

  reopenedPool = new Pool(poolOptions);
  const reopenedOrders = new PostgresOrderStore(reopenedPool);
  const reopenedWorkshops = new PostgresWorkshopStore(reopenedPool);
  const storedOrders = await reopenedOrders.list();
  const storedWorkshops = await reopenedWorkshops.list();
  const storedIds = new Set(storedOrders.map((order) => order.id));
  const missingIds = createdIds.filter((id) => !storedIds.has(id));
  const history = await reopenedOrders.history(createdIds[0]);
  const normalizedModel = await reopenedPool.query(`
    SELECT
      (SELECT count(*)::integer FROM orders) AS orders,
      (SELECT count(*)::integer FROM order_sizes) AS order_sizes,
      (SELECT count(*)::integer FROM order_processes) AS order_processes,
      (SELECT count(*)::integer FROM order_customizations) AS order_customizations,
      (SELECT count(*)::integer FROM workshops) AS workshops,
      (SELECT count(*)::integer FROM workshop_capabilities) AS workshop_capabilities,
      (SELECT count(*)::integer FROM workshop_availability) AS workshop_availability,
      (SELECT count(*)::integer FROM order_assignments) AS assignments,
      (SELECT count(*)::integer FROM assignment_allocations) AS allocations,
      (SELECT count(*)::integer FROM allocation_processes) AS allocation_processes,
      (
        SELECT count(*)::integer
        FROM orders AS orders
        JOIN (
          SELECT order_id, sum(quantity)::integer AS quantity
          FROM order_sizes
          GROUP BY order_id
        ) AS sizes ON sizes.order_id = orders.id AND sizes.quantity = orders.quantity
      ) AS orders_with_consistent_size_total
  `);
  const normalizedCounts = normalizedModel.rows[0];

  assert.equal(storedOrders.length, orderCount);
  assert.deepEqual(missingIds, []);
  assert.equal(storedWorkshops.length, week03DeclaredWorkshops.length);
  assert.equal(normalizedCounts.orders, orderCount);
  assert.equal(normalizedCounts.orders_with_consistent_size_total, orderCount);
  assert.ok(normalizedCounts.order_sizes >= orderCount);
  assert.ok(normalizedCounts.order_processes >= orderCount);
  assert.equal(normalizedCounts.workshops, week03DeclaredWorkshops.length);
  assert.ok(normalizedCounts.workshop_capabilities > 0);
  assert.equal(normalizedCounts.workshop_availability, week03DeclaredWorkshops.length);
  assert.equal(normalizedCounts.assignments, 1);
  assert.equal(normalizedCounts.allocations, 1);
  assert.ok(normalizedCounts.allocation_processes > 0);
  await assert.rejects(
    reopenedPool.query(
      `INSERT INTO order_status_history (order_id, status, occurred_at)
       VALUES ('PED-R4-INEXISTENTE', 'registered', now())`,
    ),
    (error) => error?.code === '23503',
  );
  await assert.rejects(
    reopenedPool.query(
      `INSERT INTO order_sizes (order_id, size, quantity)
       VALUES ($1, 'INVALID', -1)`,
      [createdIds[0]],
    ),
    (error) => error?.code === '23514',
  );
  const inconsistentSizes = await reopenedPool.connect();
  try {
    await inconsistentSizes.query('BEGIN');
    await inconsistentSizes.query(
      `UPDATE order_sizes
       SET quantity = quantity + 1
       WHERE order_id = $1
         AND size = (SELECT size FROM order_sizes WHERE order_id = $1 LIMIT 1)`,
      [createdIds[0]],
    );
    await assert.rejects(
      inconsistentSizes.query('SET CONSTRAINTS ALL IMMEDIATE'),
      (error) => error?.code === '23514',
    );
    await inconsistentSizes.query('ROLLBACK');
  } finally {
    inconsistentSizes.release();
  }
  const alternateWorkshop = storedWorkshops.find((workshop) => workshop.id !== assignedWorkshopId);
  assert.ok(alternateWorkshop);
  await assert.rejects(
    reopenedPool.query(
      `INSERT INTO assignment_allocations
        (order_id, workshop_id, display_name, quantity, status)
       VALUES ($1, $2, $3, $4, 'assigned')`,
      [
        createdIds[0],
        alternateWorkshop.id,
        alternateWorkshop.displayName,
        firstOrder.draft.quantity + 1,
      ],
    ),
    (error) => error?.code === '23514',
  );
  assert.deepEqual(
    history.map((entry) => entry.status),
    ['recommended', 'assigned', 'in_production', 'completed'],
  );

  const orderByIdSamples = [];
  const orderListSamples = [];
  const historySamples = [];
  const workshopByIdSamples = [];
  for (let index = 0; index < queryRuns; index += 1) {
    const orderId = createdIds[index % createdIds.length];
    const workshopId = week03DeclaredWorkshops[index % week03DeclaredWorkshops.length].id;
    orderByIdSamples.push(await timed(() => reopenedOrders.get(orderId)));
    orderListSamples.push(await timed(() => reopenedOrders.list()));
    historySamples.push(await timed(() => reopenedOrders.history(createdIds[0])));
    workshopByIdSamples.push(await timed(() => reopenedWorkshops.get(workshopId)));
  }

  const queries = {
    orderById: summarize(orderByIdSamples),
    orderList: summarize(orderListSamples),
    orderStatusHistory: summarize(historySamples),
    workshopById: summarize(workshopByIdSamples),
  };
  const maximumObservedMs = Math.max(...Object.values(queries).map((query) => query.maximumMs));
  const report = {
    result: 'R4',
    generatedAt: new Date().toISOString(),
    dataClassification: 'simulated',
    database: 'PostgreSQL 17',
    verification: {
      createdOrders: orderCount,
      storedOrdersAfterConnectionRestart: storedOrders.length,
      missingOrders: missingIds.length,
      storageIntegrityPercent: 100,
      storedWorkshopSpecifications: storedWorkshops.length,
      statusHistory: history.map((entry) => entry.status),
      normalizedModel: {
        ...normalizedCounts,
        orphanHistoryRejectedByForeignKey: true,
        negativeSizeQuantityRejectedByCheck: true,
        inconsistentSizeTotalRejectedAtCommit: true,
        oversizedAllocationRejected: true,
      },
    },
    latency: { limitMs: latencyLimitMs, maximumObservedMs, queries },
    iov: {
      allOrdersStoredWithoutLoss: missingIds.length === 0 && storedOrders.length === orderCount,
      frequentQueriesUnder500Ms: maximumObservedMs < latencyLimitMs,
    },
  };
  assert.equal(report.iov.allOrdersStoredWithoutLoss, true);
  assert.equal(report.iov.frequentQueriesUnder500Ms, true);

  const markdown = `# Evidencia técnica de R4: base de datos centralizada

Fecha de ejecución: ${report.generatedAt}

Los datos utilizados son simulados. Esta prueba verifica la estructura y la persistencia de la solución; no representa una validación con clientes ni resultados del piloto.

## Resultado

- Pedidos creados: ${orderCount}.
- Pedidos recuperados después de cerrar y reabrir la conexión: ${storedOrders.length}.
- Pedidos perdidos: ${missingIds.length}.
- Integridad de almacenamiento: ${report.verification.storageIntegrityPercent} %.
- Especificaciones técnicas de talleres almacenadas: ${storedWorkshops.length}.
- Historial verificado: ${report.verification.statusHistory.join(' → ')}.
- Pedidos con suma de tallas consistente: ${normalizedCounts.orders_with_consistent_size_total} de ${orderCount}.
- Filas normalizadas: ${normalizedCounts.order_sizes} tallas, ${normalizedCounts.order_processes} procesos, ${normalizedCounts.workshop_capabilities} capacidades de talleres, ${normalizedCounts.assignments} asignación y ${normalizedCounts.allocations} distribución.
- Integridad referencial: la clave foránea rechazó un historial sin pedido.
- Integridad de dominio: la restricción CHECK rechazó una cantidad de talla negativa.
- Integridad agregada: la restricción diferida rechazó una suma de tallas distinta de la cantidad del pedido.
- Límite de asignación: la base rechazó una cantidad de taller superior a la cantidad del pedido.
- Mayor latencia observada entre consultas frecuentes: ${maximumObservedMs.toFixed(3)} ms.

## Evaluación de los IOV

- 100 % de pedidos almacenados sin pérdida de datos: **CUMPLE**.
- Latencia de consultas frecuentes menor de 500 ms: **CUMPLE**.

El ensayo se ejecutó en un esquema PostgreSQL temporal y aislado. Al finalizar se eliminó exclusivamente dicho esquema para no mezclar los datos simulados con otros registros locales.
`;
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(new URL('reporte-r4.json', outputDirectory), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(new URL('reporte-r4.md', outputDirectory), markdown);
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
} finally {
  if (isolatedPool) await isolatedPool.end();
  if (reopenedPool) await reopenedPool.end();
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
  await admin.end();
}
