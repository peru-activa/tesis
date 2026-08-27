import { spawn } from 'node:child_process';

const demoUrl = 'http://localhost:5173/demo/semana-3';

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit', ...options });
    child.on('error', reject);
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} terminó con ${signal ?? `código ${code}`}`));
    });
  });
}

async function waitForApi() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch('http://localhost:3100/health');
      if (response.ok) return;
    } catch {
      // El servidor todavía está iniciando.
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  throw new Error('La API no respondió dentro de 30 segundos.');
}

process.stdout.write('\nEntrega Semana 3 · flujo R1/R7/R8 parcial\n');
process.stdout.write('1/2 Verificando código y pruebas…\n\n');
await run('npm', ['run', 'verify']);

process.stdout.write('\n2/2 Iniciando la demostración…\n');
const dev = spawn('npm', ['run', 'dev'], { stdio: 'inherit' });

function stop(signal) {
  dev.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

try {
  await waitForApi();
  process.stdout.write(`\nDemostración lista: ${demoUrl}\n`);
  process.stdout.write('Presiona Ctrl+C para detenerla.\n\n');
  if (process.platform === 'darwin' && !process.env.CI) {
    const opener = spawn('open', [demoUrl], { stdio: 'ignore' });
    opener.unref();
  }
} catch (error) {
  stop('SIGTERM');
  throw error;
}

const exitCode = await new Promise((resolve, reject) => {
  dev.on('error', reject);
  dev.on('exit', (code) => resolve(code ?? 1));
});
process.exitCode = exitCode;
