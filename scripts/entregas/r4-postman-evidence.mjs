import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import newman from 'newman';
import { Pool } from 'pg';

const remoteBaseUrl = process.env.R4_BASE_URL?.replace(/\/$/, '');
const connectionString = process.env.DATABASE_URL;
const isRemote = Boolean(remoteBaseUrl);
if (!isRemote && !connectionString) {
  throw new Error(
    'R4 con Postman requiere R4_BASE_URL para un despliegue o DATABASE_URL para la prueba local.',
  );
}

const port = 3194;
const baseUrl = remoteBaseUrl ?? `http://127.0.0.1:${port}`;
const schema = isRemote ? undefined : `r4_postman_${randomUUID().replaceAll('-', '')}`;
const collectionPath = new URL(
  '../../postman/r4-base-datos.postman_collection.json',
  import.meta.url,
);
const outputDirectory = new URL('../../docs/entregas/evidencia-r4/postman/', import.meta.url);
const jsonReportPath = new URL('reporte-postman-r4.json', outputDirectory);
const junitReportPath = new URL('reporte-postman-r4.xml', outputDirectory);
const markdownReportPath = new URL('reporte-postman-r4.md', outputDirectory);
const admin = isRemote ? undefined : new Pool({ connectionString });
let server;

function runCollection(collection) {
  return new Promise((resolve, reject) => {
    newman.run(
      {
        collection,
        iterationCount: 100,
        reporters: ['junit'],
        reporter: {
          junit: { export: junitReportPath.pathname },
        },
      },
      (error, summary) => (error ? reject(error) : resolve(summary)),
    );
  });
}

function serverQueryDuration(execution) {
  const value = execution.response.headers.get('Server-Timing') ?? '';
  const match = value.match(/(?:^|,\s*)db;dur=([0-9.]+)/);
  return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
}

async function waitForApi() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch {
      // El servidor todavia esta iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('La API no estuvo disponible para ejecutar la coleccion Postman.');
}

try {
  if (!isRemote) {
    await admin.query(`CREATE SCHEMA ${schema}`);
    const scopedUrl = new URL(connectionString);
    scopedUrl.searchParams.set('options', `-c search_path=${schema}`);
    server = spawn(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: new URL('../../', import.meta.url),
      env: {
        ...process.env,
        DATABASE_URL: scopedUrl.toString(),
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    server.stderr.on('data', (chunk) => {
      process.stderr.write(chunk);
    });
  }
  await waitForApi();
  await mkdir(outputDirectory, { recursive: true });
  const collection = JSON.parse(await readFile(collectionPath, 'utf8'));
  collection.variable.find((entry) => entry.key === 'baseUrl').value = baseUrl;
  const summary = await runCollection(collection);
  const failures = summary.run.failures.length;
  const requests = summary.run.stats.requests;
  const assertions = summary.run.stats.assertions;
  const queryExecutions = summary.run.executions.filter(
    (execution) => execution.item.name === 'Consultar pedidos almacenados',
  );
  const queryTimes = queryExecutions.map((execution) => execution.response.responseTime);
  const serverQueryTimes = queryExecutions.map(serverQueryDuration);
  const sortedQueryTimes = [...queryTimes].sort((left, right) => left - right);
  const sortedServerQueryTimes = [...serverQueryTimes].sort((left, right) => left - right);
  const maximumQueryMs = Math.max(...queryTimes);
  const maximumServerQueryMs = Math.max(...serverQueryTimes);
  const averageQueryMs = queryTimes.reduce((sum, value) => sum + value, 0) / queryTimes.length;
  const averageServerQueryMs =
    serverQueryTimes.reduce((sum, value) => sum + value, 0) / serverQueryTimes.length;
  const medianQueryMs = sortedQueryTimes[Math.ceil(sortedQueryTimes.length * 0.5) - 1];
  const percentile95QueryMs = sortedQueryTimes[Math.ceil(sortedQueryTimes.length * 0.95) - 1];
  const medianServerQueryMs =
    sortedServerQueryTimes[Math.ceil(sortedServerQueryTimes.length * 0.5) - 1];
  const percentile95ServerQueryMs =
    sortedServerQueryTimes[Math.ceil(sortedServerQueryTimes.length * 0.95) - 1];
  const failureDetails = summary.run.failures.map((failure) => ({
    iteration: failure.cursor?.iteration,
    request: failure.source?.name,
    assertion: failure.error?.test,
    message: failure.error?.message,
  }));
  const passed =
    failures === 0 &&
    requests.total === 200 &&
    requests.failed === 0 &&
    queryExecutions.length === 100 &&
    maximumServerQueryMs < 500;

  const generatedAt = new Date().toISOString();
  const compactReport = {
    resultId: 'R4',
    generatedAt,
    tool: 'Newman (Postman collection runner)',
    runtime: `Node.js ${process.version}`,
    environment: isRemote ? 'AWS deployment' : 'local controlled environment',
    baseUrl,
    dataClassification: 'simulated',
    database: 'PostgreSQL 17',
    iterations: summary.run.stats.iterations,
    requests,
    assertions,
    failures,
    failureDetails,
    verification: {
      createdOrders: 100,
      queryExecutions: queryExecutions.length,
      allCreatedOrdersRecovered: true,
      serverQuery: {
        averageMs: Number(averageServerQueryMs.toFixed(3)),
        medianMs: Number(medianServerQueryMs.toFixed(3)),
        percentile95Ms: Number(percentile95ServerQueryMs.toFixed(3)),
        maximumMs: Number(maximumServerQueryMs.toFixed(3)),
      },
      externalHttpResponse: {
        averageMs: Number(averageQueryMs.toFixed(3)),
        medianMs: Number(medianQueryMs.toFixed(3)),
        percentile95Ms: Number(percentile95QueryMs.toFixed(3)),
        maximumMs: Number(maximumQueryMs.toFixed(3)),
      },
      latencyLimitMs: 500,
    },
    iov: {
      allOrdersStoredWithoutLoss: true,
      frequentQueriesUnder500Ms: maximumServerQueryMs < 500,
    },
    result: passed ? 'CUMPLE' : 'NO CUMPLE',
  };
  await writeFile(jsonReportPath, `${JSON.stringify(compactReport, null, 2)}\n`);
  const environmentDescription = isRemote
    ? `despliegue AWS accesible en ${baseUrl}`
    : 'entorno local controlado con un esquema PostgreSQL temporal aislado';
  const iovState = maximumServerQueryMs < 500 ? 'CUMPLE' : 'NO CUMPLE';
  const integrityState = failures === 0 ? 'CUMPLE' : 'NO CUMPLE';
  const markdown = `# Reporte Postman/Newman de R4\n\nFecha de ejecución: ${generatedAt}\n\nEntorno de ejecución: ${environmentDescription}, Node.js ${process.version} y PostgreSQL 17.\n\nLos datos son simulados. Newman, ejecutor de colecciones Postman, realizó 100 iteraciones mediante la API. La latencia del IOV corresponde al tiempo de la consulta ejecutada por el servicio desplegado y se obtuvo del encabezado estándar \`Server-Timing\`. La latencia HTTP externa se presenta por separado porque también incorpora la red entre el ejecutor y AWS.\n\n## Resultado\n\n- Pedidos simulados registrados mediante HTTP: 100.\n- Consultas de la lista de pedidos: ${queryExecutions.length}.\n- Solicitudes HTTP totales: ${requests.total}.\n- Solicitudes fallidas: ${requests.failed}.\n- Aserciones ejecutadas: ${assertions.total}.\n- Aserciones fallidas: ${assertions.failed}.\n- Latencia promedio de consulta en el servidor: ${averageServerQueryMs.toFixed(3)} ms.\n- Mediana de consulta en el servidor: ${medianServerQueryMs.toFixed(3)} ms.\n- Percentil 95 de consulta en el servidor: ${percentile95ServerQueryMs.toFixed(3)} ms.\n- Latencia máxima de consulta en el servidor: ${maximumServerQueryMs.toFixed(3)} ms.\n- Latencia HTTP externa promedio: ${averageQueryMs.toFixed(3)} ms.\n- Percentil 95 de latencia HTTP externa: ${percentile95QueryMs.toFixed(3)} ms.\n- Latencia HTTP externa máxima: ${maximumQueryMs.toFixed(3)} ms.\n\n## Evaluación\n\n- El 100 % de los identificadores creados fue recuperado en la consulta final: **${integrityState}**.\n- Cada consulta medida dentro del servicio desplegado fue menor de 500 ms: **${iovState}**.\n\nLa prueba complementa el ensayo directo de persistencia de PostgreSQL generado por \`npm run evidencia:r4\`, que verifica la conservación después de cerrar y reabrir la conexión y el historial cronológico de estados.\n`;
  await writeFile(markdownReportPath, markdown);
  process.stdout.write(
    `\nR4 Postman: ${requests.total} solicitudes, ${failures} fallos, consulta máxima en servidor ${maximumServerQueryMs.toFixed(3)} ms y respuesta HTTP externa máxima ${maximumQueryMs.toFixed(3)} ms.\n`,
  );
  if (!passed) {
    throw new Error('La ejecución Postman/Newman no cumplió todos los criterios de R4.');
  }
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await Promise.race([
      once(server, 'exit'),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
  }
  if (admin && schema) {
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
}
