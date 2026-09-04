import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const profile = process.env.AWS_PROFILE ?? 'tesis-deployer';
const region = process.env.AWS_REGION ?? 'us-east-1';
const stackName = process.env.R4_STACK_NAME ?? 'tesis-r4-demo';
const expectedAccount = '479494991128';
const outputDirectory = new URL('../../docs/entregas/evidencia-r4/postman/', import.meta.url);

async function aws(args) {
  const { stdout } = await execFileAsync(
    'aws',
    [...args, '--profile', profile, '--region', region, '--output', 'json'],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  return JSON.parse(stdout);
}

async function runSsm(instanceId, commands) {
  const sent = await aws([
    'ssm',
    'send-command',
    '--instance-ids',
    instanceId,
    '--document-name',
    'AWS-RunShellScript',
    '--comment',
    'R4: verificar persistencia tras reiniciar PostgreSQL y API',
    '--parameters',
    JSON.stringify({ commands }),
  ]);
  const commandId = sent.Command.CommandId;

  for (let attempt = 0; attempt < 90; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 2_000));
    try {
      const invocation = await aws([
        'ssm',
        'get-command-invocation',
        '--command-id',
        commandId,
        '--instance-id',
        instanceId,
      ]);
      if (invocation.Status === 'Success') return { commandId, invocation };
      if (['Cancelled', 'Cancelling', 'Failed', 'TimedOut'].includes(invocation.Status)) {
        throw new Error(
          `SSM ${commandId} terminó en ${invocation.Status}: ${invocation.StandardErrorContent}`,
        );
      }
    } catch (error) {
      if (!String(error).includes('InvocationDoesNotExist')) throw error;
    }
  }
  throw new Error(`SSM ${commandId} no terminó dentro del tiempo de espera.`);
}

function stackOutput(stack, key) {
  return stack.Outputs.find((output) => output.OutputKey === key)?.OutputValue;
}

function parseMarker(output, marker) {
  const match = output.match(new RegExp(`^${marker}=(\\d+)$`, 'm'));
  assert.ok(match, `No se encontró ${marker} en la salida remota.`);
  return Number(match[1]);
}

const identity = await aws(['sts', 'get-caller-identity']);
assert.equal(identity.Account, expectedAccount, 'La evidencia solo puede ejecutarse en la cuenta de tesis.');

const described = await aws(['cloudformation', 'describe-stacks', '--stack-name', stackName]);
const stack = described.Stacks[0];
const instanceId = stackOutput(stack, 'InstanceId');
const baseUrl = stackOutput(stack, 'ApiBaseUrl');
const containerImage = stack.Parameters.find(
  (parameter) => parameter.ParameterKey === 'ContainerImage',
)?.ParameterValue;
assert.ok(instanceId, 'La pila no expone InstanceId.');
assert.ok(baseUrl, 'La pila no expone ApiBaseUrl.');

const schemaSql = `SELECT json_build_object(
  'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'thesis_%'),
  'foreign_keys', (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'thesis_%')),
  'checks', (SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND conrelid IN (SELECT oid FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relname LIKE 'thesis_%')),
  'indexes', (SELECT count(*) FROM pg_indexes WHERE schemaname = 'public' AND tablename LIKE 'thesis_%')
)::text;`;
const schemaSqlBase64 = Buffer.from(schemaSql).toString('base64');

const command = `set -euo pipefail
before_orders=$(docker exec tesis-r4-postgres psql -U tesis -d tesis -At -c 'SELECT count(*) FROM thesis_orders')
before_history=$(docker exec tesis-r4-postgres psql -U tesis -d tesis -At -c 'SELECT count(*) FROM thesis_order_status_history')
schema_inventory=$(printf %s ${schemaSqlBase64} | base64 -d | docker exec -i tesis-r4-postgres psql -U tesis -d tesis -At)
printf 'BEFORE_ORDERS=%s\n' "$before_orders"
printf 'BEFORE_HISTORY=%s\n' "$before_history"
printf 'SCHEMA_INVENTORY=%s\n' "$schema_inventory"
docker restart tesis-r4-postgres >/dev/null
for attempt in $(seq 1 60); do
  if docker exec tesis-r4-postgres pg_isready -U tesis -d tesis >/dev/null 2>&1; then break; fi
  sleep 1
done
docker exec tesis-r4-postgres pg_isready -U tesis -d tesis >/dev/null
docker restart tesis-r4-api >/dev/null
for attempt in $(seq 1 60); do
  if curl -fsS http://127.0.0.1:3100/health >/dev/null 2>&1; then break; fi
  sleep 1
done
after_orders=$(docker exec tesis-r4-postgres psql -U tesis -d tesis -At -c 'SELECT count(*) FROM thesis_orders')
after_history=$(docker exec tesis-r4-postgres psql -U tesis -d tesis -At -c 'SELECT count(*) FROM thesis_order_status_history')
api_orders=$(docker exec tesis-r4-api node -e "fetch('http://127.0.0.1:3100/v1/orders',{headers:{'x-demo-actor':'peru_activa'}}).then(async response=>{if(!response.ok)throw new Error(String(response.status));const body=await response.json();process.stdout.write(String(body.orders.length))})")
printf 'AFTER_ORDERS=%s\n' "$after_orders"
printf 'AFTER_HISTORY=%s\n' "$after_history"
printf 'API_ORDERS=%s\n' "$api_orders"`;

const run = await runSsm(instanceId, [command]);
const output = run.invocation.StandardOutputContent;
const beforeRestart = {
  orders: parseMarker(output, 'BEFORE_ORDERS'),
  historyEntries: parseMarker(output, 'BEFORE_HISTORY'),
};
const afterRestart = {
  orders: parseMarker(output, 'AFTER_ORDERS'),
  historyEntries: parseMarker(output, 'AFTER_HISTORY'),
  ordersReturnedByApi: parseMarker(output, 'API_ORDERS'),
};
const schemaMatch = output.match(/^SCHEMA_INVENTORY=(.+)$/m);
assert.ok(schemaMatch, 'No se encontró el inventario del esquema en la salida remota.');
const schemaInventory = JSON.parse(schemaMatch[1]);
assert.deepEqual(schemaInventory, {
  tables: 12,
  foreign_keys: 11,
  checks: 36,
  indexes: 23,
});
assert.deepEqual(afterRestart, {
  orders: beforeRestart.orders,
  historyEntries: beforeRestart.historyEntries,
  ordersReturnedByApi: beforeRestart.orders,
});

const report = {
  resultId: 'R4',
  generatedAt: new Date().toISOString(),
  environment: 'AWS deployment',
  dataClassification: 'simulated',
  accountId: identity.Account,
  region,
  stackName,
  instanceId,
  baseUrl,
  containerImage,
  schemaInventory,
  procedure: 'restart PostgreSQL container, wait for readiness, restart API container and query both database and API',
  ssmCommandId: run.commandId,
  beforeRestart,
  afterRestart,
  recoveryPercentage: 100,
  result: 'CUMPLE',
};

const markdown = `# Evidencia de persistencia de R4 en AWS

Fecha de ejecución: ${report.generatedAt}

Se utilizaron únicamente datos simulados. Antes del reinicio, PostgreSQL contenía ${beforeRestart.orders} pedidos y ${beforeRestart.historyEntries} entradas de historial. Se reinició el contenedor de PostgreSQL, se esperó hasta que estuviera disponible y luego se reinició el contenedor de la API.

Después del procedimiento, PostgreSQL conservó los ${afterRestart.orders} pedidos y las ${afterRestart.historyEntries} entradas de historial. La API devolvió los mismos ${afterRestart.ordersReturnedByApi} pedidos. La recuperación fue de 100 % y, por tanto, la persistencia frente al reinicio de ambos servicios **CUMPLE**.

El despliegue contiene ${schemaInventory.tables} tablas de R4, ${schemaInventory.foreign_keys} claves foráneas, ${schemaInventory.checks} restricciones de comprobación y ${schemaInventory.indexes} índices.

La ejecución remota reproducible quedó identificada por el comando de AWS Systems Manager \`${run.commandId}\`. La imagen desplegada fue \`${containerImage}\`.
`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  new URL('evidencia-persistencia-aws-r4.json', outputDirectory),
  `${JSON.stringify(report, null, 2)}\n`,
);
await writeFile(
  new URL('evidencia-persistencia-aws-r4.md', outputDirectory),
  markdown,
);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
