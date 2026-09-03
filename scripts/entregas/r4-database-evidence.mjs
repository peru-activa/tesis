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
  const percentileIndex = Math.ceil(sorted.length * 0.95) - 1;
  return {
    runs: samples.length,
    averageMs: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(3)),
    p95Ms: Number(sorted[Math.max(0, percentileIndex)].toFixed(3)),
    maximumMs: Number(sorted.at(-1).toFixed(3)),
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
  await orderStore.updateStatus(createdIds[0], 'assigned', '2026-09-03T15:10:00.000Z');
  await orderStore.updateStatus(createdIds[0], 'in_production', '2026-09-03T15:20:00.000Z');
  await orderStore.updateStatus(createdIds[0], 'completed', '2026-09-03T15:30:00.000Z');

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

  assert.equal(storedOrders.length, orderCount);
  assert.deepEqual(missingIds, []);
  assert.equal(storedWorkshops.length, week03DeclaredWorkshops.length);
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
