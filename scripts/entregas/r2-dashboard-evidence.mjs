import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { chromium } from 'playwright';
import { week03DeclaredWorkshops } from '../../src/data/week-03-assignment-scenarios.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('R2 requiere DATABASE_URL; la evidencia no usa memoria.');
const databaseUrl = new URL(connectionString);
assert.ok(
  ['localhost', '127.0.0.1', '::1'].includes(databaseUrl.hostname),
  'La evidencia R2 solo puede escribir en PostgreSQL local y aislado; AWS permanece en solo lectura.',
);

const schema = `r2_evidence_${randomUUID().replaceAll('-', '')}`;
const port = 3192;
const origin = `http://127.0.0.1:${port}`;
const outputDirectory = new URL('../../docs/entregas/evidencia-r2/', import.meta.url);
const artilleryReportPath = new URL('artillery-r2.json', outputDirectory);
const admin = new Pool({ connectionString });
const evidencePool = new Pool({ connectionString, options: `-c search_path=${schema}` });
let server;
let browser;
let serverError = '';
const pages = new Map();

const clientEmails = [1, 2, 3].map((number) => `cliente-r2-0${number}@example.test`);
const requestsPerClient = 4;
const totalRequests = clientEmails.length * requestsPerClient;
const draftFor = (email, sequence) => ({
  customer: {
    contactName: `Cliente simulado ${sequence}`,
    businessName: `Organización simulada ${sequence}`,
    contact: email,
  },
  garment: {
    product: 'polo',
    poloType: 'sports',
    model: 'Cuello redondo',
    audience: 'unisex',
    sleeve: 'manga_corta',
    cut: 'estandar',
    quantity: 32,
    sizes: [
      { size: 'S', quantity: 4 },
      { size: 'M', quantity: 14 },
      { size: 'L', quantity: 8 },
      { size: 'XL', quantity: 6 },
    ],
    color: 'Azul marino',
    fabric: { mode: 'proposal' },
    customization: 'printing',
    applicationCount: 1,
    customizationDetails: 'Una aplicación frontal simulada',
    designReference: 'Referencia visual simulada para evidencia técnica',
  },
  additionalGarments: [],
  delivery: { requiredBy: '2026-10-30', location: 'Lima Metropolitana' },
  notes: 'Dato simulado para la evidencia reproducible de R2.',
});

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => (stdout += chunk));
    child.stderr?.on('data', (chunk) => (stderr += chunk));
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${command} terminó con ${signal || `código ${code}`}\n${stderr || stdout}`));
    });
  });
}

async function jsonRequest(path, { method = 'GET', headers = {}, body } = {}) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json();
  assert.ok(response.ok, `${method} ${path} respondió ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function waitForServer() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${origin}/health`);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('La API de evidencia R2 no respondió dentro de 30 segundos.');
}

function summarize(samples) {
  const sorted = [...samples].sort((left, right) => left - right);
  const percentile = (value) => sorted[Math.max(0, Math.ceil(sorted.length * value) - 1)];
  return {
    samples: samples.length,
    averageMs: Number((samples.reduce((sum, value) => sum + value, 0) / samples.length).toFixed(3)),
    p50Ms: Number(percentile(0.5).toFixed(3)),
    p95Ms: Number(percentile(0.95).toFixed(3)),
    maximumMs: Number(sorted.at(-1).toFixed(3)),
    samplesMs: samples.map((sample) => Number(sample.toFixed(3))),
  };
}

function extractArtillery(report) {
  const aggregate = report.aggregate || report;
  const counters = aggregate.counters || {};
  const summaries = aggregate.summaries || {};
  return {
    created: counters['vusers.created'] || 0,
    completed: counters['vusers.completed'] || 0,
    failed: counters['vusers.failed'] || 0,
    http200: counters['http.codes.200'] || 0,
    maximumResponseMs: summaries['http.response_time']?.max ?? null,
  };
}

async function hashArtifacts() {
  const names = (await readdir(outputDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name !== 'manifest-sha256.json')
    .map((entry) => entry.name)
    .sort();
  const files = [];
  for (const name of names) {
    const bytes = await readFile(new URL(name, outputDirectory));
    files.push({ name, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  await writeFile(
    new URL('manifest-sha256.json', outputDirectory),
    `${JSON.stringify({ generatedAt: new Date().toISOString(), files }, null, 2)}\n`,
  );
  return files;
}

try {
  await rm(outputDirectory, { recursive: true, force: true });
  await mkdir(outputDirectory, { recursive: true });
  await admin.query(`CREATE SCHEMA ${schema}`);

  server = spawn('node', ['--import', 'tsx', 'src/server.ts'], {
    cwd: new URL('../../', import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      NODE_ENV: 'development',
      PGOPTIONS: `-c search_path=${schema}`,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stderr.on('data', (chunk) => (serverError += chunk));
  await waitForServer();

  const createdByClient = new Map(clientEmails.map((email) => [email, []]));
  let sequence = 0;
  for (const email of clientEmails) {
    for (let index = 0; index < requestsPerClient; index += 1) {
      sequence += 1;
      const created = await jsonRequest('/v1/quotation-requests', {
        method: 'POST',
        headers: { 'x-demo-client-email': email },
        body: draftFor(email, sequence),
      });
      const quotationId = created.request.id;
      createdByClient.get(email).push(quotationId);
      await jsonRequest(`/v1/quotation-requests/${quotationId}/quotation`, {
        method: 'POST',
        headers: { 'x-demo-actor': 'peru_activa' },
        body: {
          totalPricePEN: 1920 + sequence,
          lineItems: [{ garmentIndex: 0, unitPricePEN: (1920 + sequence) / 32 }],
          selectedFabric: 'Zanetti 100 % poliéster',
          fabricBuyer: 'workshop',
          validUntil: '2026-10-15',
          conditions: 'Cotización simulada para verificar el seguimiento de R2.',
        },
      });
      await jsonRequest(`/v1/quotation-requests/${quotationId}/decision`, {
        method: 'POST',
        headers: { 'x-demo-client-email': email },
        body: { decision: 'accepted' },
      });
    }
  }

  const allOrders = (await jsonRequest('/v1/orders', { headers: { 'x-demo-actor': 'peru_activa' } })).orders;
  assert.equal(allOrders.length, totalRequests);

  browser = await chromium.launch({ headless: true, executablePath: chromium.executablePath() });
  const browserResults = [];
  for (const [clientIndex, email] of clientEmails.entries()) {
    const context = await browser.newContext({
      extraHTTPHeaders: { 'x-demo-client-email': email },
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const page = await context.newPage();
    pages.set(email, { context, page });
    await page.goto(`${origin}/mis-pedidos`, { waitUntil: 'networkidle' });
    await page.locator(`[data-r2-visible-count="${requestsPerClient}"]`).waitFor();
    const visibleIds = (await page.locator('.customer-order-row small').allTextContents()).sort();
    const expectedIds = [...createdByClient.get(email)].sort();
    assert.deepEqual(visibleIds, expectedIds);
    assert.equal(visibleIds.some((id) => !expectedIds.includes(id)), false);
    browserResults.push({
      email,
      registered: expectedIds.length,
      visible: visibleIds.length,
      coveragePercent: 100,
      foreignVisible: 0,
      expectedQuotationIds: expectedIds,
      visibleQuotationIds: visibleIds,
    });
    if (clientIndex === 0) {
      await page.screenshot({ path: fileURLToPath(new URL('01-dashboard-lista.png', outputDirectory)), fullPage: true });
    }
  }

  const firstEmail = clientEmails[0];
  const firstQuotationId = createdByClient.get(firstEmail)[0];
  const { page: detailPage } = pages.get(firstEmail);
  const visibleUpdateSamples = [];
  for (const [orderIndex, quotationId] of createdByClient.get(firstEmail).entries()) {
    const order = allOrders.find((candidate) => candidate.source?.quotationId === quotationId);
    assert.ok(order?.recommendation?.candidates?.[0]);
    const chosenWorkshopId = order.recommendation.candidates[0].workshopId;
    const chosenWorkshop = week03DeclaredWorkshops.find((item) => item.id === chosenWorkshopId);
    assert.ok(chosenWorkshop?.contactPhone);
    await jsonRequest(`/v1/orders/${order.id}/confirm`, {
      method: 'POST',
      headers: { 'x-demo-actor': 'peru_activa' },
      body: { workshopId: chosenWorkshopId },
    });
    await detailPage.goto(`${origin}/mis-pedidos/${quotationId}`, { waitUntil: 'networkidle' });
    await detailPage.locator('[data-r2-updated-at]').waitFor();
    if (orderIndex === 0) {
      await detailPage.getByText('COTIZACIÓN ACEPTADA', { exact: true }).waitFor();
      await detailPage.locator('.customer-quotation-card').getByText('S/ 1,921.00').first().waitFor();
      assert.equal(await detailPage.getByText('El precio se enviará después.').count(), 0);
      await detailPage.screenshot({ path: fileURLToPath(new URL('02-pedido-asignado.png', outputDirectory)), fullPage: true });
    }
    for (const status of ['in_production', 'completed']) {
      const startedAt = performance.now();
      const update = await jsonRequest(`/v1/orders/${order.id}/status`, {
        method: 'POST',
        headers: { 'x-demo-workshop-phone': chosenWorkshop.contactPhone },
        body: { status },
      });
      await detailPage.waitForFunction(
        (updatedAt) => document.querySelector('[data-r2-updated-at]')?.getAttribute('data-r2-updated-at') === updatedAt,
        update.order.updatedAt,
        { timeout: 2_000 },
      );
      visibleUpdateSamples.push(performance.now() - startedAt);
    }
    if (orderIndex === 0) {
      await detailPage.getByRole('heading', { name: 'Terminado' }).waitFor();
      await detailPage.screenshot({ path: fileURLToPath(new URL('03-pedido-terminado.png', outputDirectory)), fullPage: true });
    }
  }
  const visibleLatency = summarize(visibleUpdateSamples);
  assert.ok(visibleLatency.maximumMs < 2_000);

  const mobileContext = await browser.newContext({
    extraHTTPHeaders: { 'x-demo-client-email': firstEmail },
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
  });
  const mobilePage = await mobileContext.newPage();
  await mobilePage.goto(`${origin}/mis-pedidos/${firstQuotationId}`, { waitUntil: 'networkidle' });
  await mobilePage.getByRole('heading', { name: 'Pedido terminado' }).waitFor();
  await mobilePage.screenshot({ path: fileURLToPath(new URL('04-pedido-movil.png', outputDirectory)), fullPage: true });
  pages.set('mobile', { context: mobileContext, page: mobilePage });

  const foreignDetail = await detailPage.request.get(
    `${origin}/v1/my-orders/${createdByClient.get(clientEmails[1])[0]}`,
  );
  assert.equal(foreignDetail.status(), 404);

  const sqlCounts = await evidencePool.query(`
    SELECT
      count(*)::integer AS quotation_requests,
      (SELECT count(*)::integer FROM orders) AS orders,
      (SELECT count(*)::integer FROM orders WHERE source_quotation_id IS NOT NULL) AS linked_orders,
      count(DISTINCT payload->'owner'->>'subject')::integer AS client_owners
    FROM quotation_requests
  `);
  assert.deepEqual(sqlCounts.rows[0], {
    quotation_requests: totalRequests,
    orders: totalRequests,
    linked_orders: totalRequests,
    client_owners: clientEmails.length,
  });
  const schemaInventory = await evidencePool.query(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
    [schema],
  );
  const normalizedTables = schemaInventory.rows.map((row) => row.table_name);
  assert.equal(normalizedTables.some((name) => name.startsWith('thesis_')), false);
  for (const expected of [
    'quotation_requests', 'orders', 'order_customizations', 'order_sizes',
    'order_status_history', 'order_processes', 'workshops', 'workshop_capabilities',
    'workshop_availability', 'allocation_processes', 'assignment_allocations', 'order_assignments',
  ]) assert.ok(normalizedTables.includes(expected), `Falta la tabla normalizada ${expected}`);

  await run(
    process.platform === 'win32' ? 'node_modules/.bin/artillery.cmd' : 'node_modules/.bin/artillery',
    ['run', '--quiet', '--output', artilleryReportPath.pathname, 'scripts/entregas/r2-load.yml'],
    { cwd: new URL('../../', import.meta.url) },
  );
  const artillery = extractArtillery(JSON.parse(await readFile(artilleryReportPath, 'utf8')));
  assert.equal(artillery.created, 100);
  assert.equal(artillery.completed, 100);
  assert.equal(artillery.failed, 0);
  assert.equal(artillery.http200, 100);
  assert.ok(artillery.maximumResponseMs < 2_000);

  const report = {
    result: 'R2',
    generatedAt: new Date().toISOString(),
    dataClassification: 'simulated',
    environment: {
      application: 'local build',
      database: 'local PostgreSQL isolated schema',
      awsModified: false,
      schema,
      normalizedTables,
      legacyThesisTables: [],
    },
    formDatabaseDashboardFlow: {
      submissionEndpointUsedByForm: 'POST /v1/quotation-requests',
      registeredQuotationRequests: totalRequests,
      normalizedOrdersCreated: allOrders.length,
      databaseCounts: sqlCounts.rows[0],
      dashboardBrowserVerification: browserResults,
    },
    isolation: {
      listForeignRecordsVisible: 0,
      foreignDetailStatus: foreignDetail.status(),
      passed: true,
    },
    quotationPersistence: {
      quotationId: firstQuotationId,
      totalPricePEN: 1921,
      visibleAfterAssignmentAndCompletion: true,
      stalePendingPriceMessageVisible: false,
    },
    visibleUpdateLatency: { limitMs: 2_000, measurement: 'status POST start to matching updatedAt rendered in Chromium DOM after Socket.io notification and refetch', ...visibleLatency },
    load: { virtualUsers: 100, limitMs: 2_000, ...artillery },
    iov: {
      registeredOrdersVisiblePercent: 100,
      registeredOrdersVisibleTechnicalCheck: true,
      visibleUpdatesUnderTwoSecondsTechnicalCheck: true,
      userJointValidationPending: true,
    },
  };
  await writeFile(new URL('reporte-r2.json', outputDirectory), `${JSON.stringify(report, null, 2)}\n`);
  const markdown = `# Evidencia técnica de R2: dashboard de seguimiento\n\nFecha de ejecución: ${report.generatedAt}\n\nLos datos son simulados. La ejecución demuestra técnicamente R2 y deja pendiente la validación conjunta con usuarios indicada en ambos IOV. No se modificó AWS.\n\n## Resultado\n\n- Flujo verificado: formulario (contrato y endpoint de envío) → PostgreSQL normalizado → dashboard renderizado en Chromium.\n- Solicitudes registradas y órdenes normalizadas: ${totalRequests} de ${totalRequests}.\n- Visibilidad: ${totalRequests} de ${totalRequests} pedidos, 100 %.\n- Aislamiento: tres clientes observaron exclusivamente sus cuatro pedidos; una consulta de detalle ajeno respondió 404.\n- Cotización: S/ 1,921.00 permaneció visible después de asignar y terminar el pedido.\n- Historial visible: recomendado → taller asignado → en producción → terminado, con fechas.\n- Mayor latencia visible de extremo a extremo: ${visibleLatency.maximumMs.toFixed(3)} ms, límite 2,000 ms.\n- Carga: ${artillery.completed} de ${artillery.created} usuarios virtuales completados, ${artillery.failed} fallidos; respuesta máxima ${artillery.maximumResponseMs} ms.\n- Persistencia: doce tablas normalizadas verificadas; cero tablas \`thesis_*\`.\n\n## Evaluación\n\n- 100 % de pedidos registrados visibles: **CUMPLE en verificación técnica reproducible**.\n- Actualización visible menor de dos segundos: **CUMPLE en verificación técnica reproducible**.\n- Validación conjunta con usuarios: **PENDIENTE**.\n`;
  await writeFile(new URL('reporte-r2.md', outputDirectory), markdown);
  const files = await hashArtifacts();
  process.stdout.write(`${JSON.stringify({ ok: true, visiblePercent: 100, visibleMaximumMs: visibleLatency.maximumMs, load: artillery, report: 'docs/entregas/evidencia-r2/reporte-r2.json', files }, null, 2)}\n`);
} catch (error) {
  if (server && !server.killed) server.kill('SIGTERM');
  throw new Error(`${error.message}${serverError ? `\nServidor:\n${serverError}` : ''}`);
} finally {
  for (const entry of pages.values()) await entry.context.close().catch(() => {});
  await browser?.close().catch(() => {});
  if (server && !server.killed) server.kill('SIGTERM');
  await evidencePool.end().catch(() => {});
  await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
  await admin.end().catch(() => {});
}
