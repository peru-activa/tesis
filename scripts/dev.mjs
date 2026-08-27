import { spawn } from 'node:child_process';

const children = [
  spawn('npm', ['run', 'dev:api'], { stdio: 'inherit' }),
  spawn('npm', ['run', 'dev:web'], { stdio: 'inherit' }),
];

function stop(signal) {
  for (const child of children) child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

const exitCodes = await Promise.all(children.map((child) => new Promise((resolve) => {
  child.on('exit', (code) => resolve(code ?? 1));
})));

process.exitCode = exitCodes.find((code) => code !== 0) ?? 0;
