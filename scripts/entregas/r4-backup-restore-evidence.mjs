import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const profile = process.env.AWS_PROFILE ?? 'tesis-deployer';
const region = process.env.AWS_REGION ?? 'us-east-1';
const stackName = process.env.R4_STACK_NAME ?? 'tesis-r4-demo';
const expectedAccount = '479494991128';
const outputDirectory = new URL('../../docs/entregas/evidencia-r4/backup/', import.meta.url);

async function aws(args) {
  const { stdout } = await execFileAsync('aws', [
    ...args,
    '--profile',
    profile,
    '--region',
    region,
    '--output',
    'json',
  ], { maxBuffer: 10 * 1024 * 1024 });
  return JSON.parse(stdout);
}

async function runSsm(instanceId, commands, comment) {
  const sent = await aws([
    'ssm',
    'send-command',
    '--instance-ids',
    instanceId,
    '--document-name',
    'AWS-RunShellScript',
    '--comment',
    comment,
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

const identity = await aws(['sts', 'get-caller-identity']);
assert.equal(identity.Account, expectedAccount, 'La evidencia solo puede ejecutarse en la cuenta de tesis.');

const described = await aws(['cloudformation', 'describe-stacks', '--stack-name', stackName]);
const stack = described.Stacks[0];
const instanceId = stackOutput(stack, 'InstanceId');
const bucketName = stackOutput(stack, 'BackupBucketName');
assert.ok(instanceId, 'La pila no expone InstanceId.');
assert.ok(bucketName, 'La pila no expone BackupBucketName.');

const backupRun = await runSsm(
  instanceId,
  ['set -euo pipefail', 'sudo systemctl start tesis-r4-backup.service'],
  'R4: generar copia PostgreSQL cifrada',
);

const listed = await aws(['s3api', 'list-objects-v2', '--bucket', bucketName, '--prefix', 'r4/']);
const dumps = (listed.Contents ?? [])
  .filter((object) => object.Key.endsWith('.dump'))
  .sort((left, right) => new Date(right.LastModified) - new Date(left.LastModified));
const backupObject = dumps[0];
assert.ok(backupObject, 'No se encontró una copia .dump en S3.');

const head = await aws([
  's3api',
  'head-object',
  '--bucket',
  bucketName,
  '--key',
  backupObject.Key,
]);
assert.equal(head.ServerSideEncryption, 'AES256');
assert.ok(backupObject.Size > 0);

const fileName = backupObject.Key.split('/').at(-1);
const restoreDatabase = 'tesis_restore_verification';
const countSql = [
  "SELECT json_build_object(",
  "'orders', (SELECT count(*) FROM thesis_orders),",
  "'history', (SELECT count(*) FROM thesis_order_status_history),",
  "'workshops', (SELECT count(*) FROM thesis_workshops),",
  "'order_sizes', (SELECT count(*) FROM thesis_order_sizes),",
  "'workshop_capabilities', (SELECT count(*) FROM thesis_workshop_capabilities),",
  "'allocations', (SELECT count(*) FROM thesis_assignment_allocations)",
  ")::text;",
].join(' ');
const restoreCommand = `set -euo pipefail
backup_file='/var/tmp/${fileName}'
checksum_file="$backup_file.sha256"
aws s3 cp 's3://${bucketName}/${backupObject.Key}' "$backup_file" --only-show-errors
aws s3 cp 's3://${bucketName}/${backupObject.Key}.sha256' "$checksum_file" --only-show-errors
cd /var/tmp
sha256sum -c "$checksum_file"
docker exec tesis-r4-postgres dropdb -U tesis --if-exists ${restoreDatabase}
docker exec tesis-r4-postgres createdb -U tesis ${restoreDatabase}
docker cp "$backup_file" tesis-r4-postgres:/tmp/${fileName}
docker exec tesis-r4-postgres pg_restore -U tesis -d ${restoreDatabase} /tmp/${fileName}
source_counts=$(docker exec tesis-r4-postgres psql -U tesis -d tesis -At -c "${countSql}")
restored_counts=$(docker exec tesis-r4-postgres psql -U tesis -d ${restoreDatabase} -At -c "${countSql}")
printf 'SOURCE_COUNTS=%s\n' "$source_counts"
printf 'RESTORED_COUNTS=%s\n' "$restored_counts"
test "$source_counts" = "$restored_counts"
docker exec tesis-r4-postgres dropdb -U tesis ${restoreDatabase}
docker exec tesis-r4-postgres rm -f /tmp/${fileName}
rm -f "$backup_file" "$checksum_file"`;

const restoreRun = await runSsm(
  instanceId,
  [restoreCommand],
  'R4: restaurar copia y comparar conteos',
);
const output = restoreRun.invocation.StandardOutputContent;
const sourceMatch = output.match(/^SOURCE_COUNTS=(.+)$/m);
const restoredMatch = output.match(/^RESTORED_COUNTS=(.+)$/m);
assert.ok(sourceMatch && restoredMatch, 'La restauración no devolvió los conteos esperados.');
const sourceCounts = JSON.parse(sourceMatch[1]);
const restoredCounts = JSON.parse(restoredMatch[1]);
assert.deepEqual(restoredCounts, sourceCounts);

const report = {
  resultId: 'R4',
  generatedAt: new Date().toISOString(),
  environment: 'AWS deployment',
  dataClassification: 'simulated',
  accountId: identity.Account,
  region,
  stackName,
  instanceId,
  backup: {
    bucketName,
    objectKey: backupObject.Key,
    sizeBytes: backupObject.Size,
    serverSideEncryption: head.ServerSideEncryption,
    versionId: head.VersionId ?? null,
    commandId: backupRun.commandId,
  },
  restoration: {
    temporaryDatabase: restoreDatabase,
    sourceCounts,
    restoredCounts,
    countsMatch: true,
    checksumVerified: true,
    commandId: restoreRun.commandId,
  },
  result: 'CUMPLE',
};

const markdown = `# Evidencia de copia y restauración de R4

Fecha de ejecución: ${report.generatedAt}

Los datos son simulados. La prueba generó una copia de PostgreSQL en un repositorio S3 independiente del volumen del servidor, verificó su checksum, la restauró en una base temporal y comparó los conteos con la base de origen.

## Copia

- Bucket: ${bucketName}.
- Objeto: ${backupObject.Key}.
- Tamaño: ${backupObject.Size} bytes.
- Cifrado del servidor: ${head.ServerSideEncryption}.
- Versión S3: ${head.VersionId ?? 'no informada'}.

## Restauración

- Checksum verificado: **SÍ**.
- Conteos de origen: ${JSON.stringify(sourceCounts)}.
- Conteos restaurados: ${JSON.stringify(restoredCounts)}.
- Coincidencia exacta: **SÍ**.
- Base temporal eliminada después de la verificación: **SÍ**.

## Resultado

La copia automatizada y su restauración reproducible: **CUMPLEN**.
`;

await mkdir(outputDirectory, { recursive: true });
await writeFile(new URL('evidencia-backup-restauracion-r4.json', outputDirectory), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(new URL('evidencia-backup-restauracion-r4.md', outputDirectory), markdown);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
