import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const forbiddenDependencies = [
  'ai',
  'langchain',
  'ollama',
  'openai',
  '@anthropic-ai/sdk',
  '@google/generative-ai',
];

const packageJson = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const dependencies = {
  ...(packageJson.dependencies || {}),
  ...(packageJson.devDependencies || {}),
  ...(packageJson.optionalDependencies || {}),
};

const invalidDependencies = forbiddenDependencies.filter((name) => name in dependencies);
if (invalidDependencies.length > 0) {
  throw new Error(`Forbidden AI dependencies: ${invalidDependencies.join(', ')}`);
}

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : [path];
  }));
  return files.flat().filter((path) => ['.ts', '.tsx', '.js', '.mjs'].includes(extname(path)));
}

const sourceDirectory = fileURLToPath(new URL('../src', import.meta.url));
for (const file of await sourceFiles(sourceDirectory)) {
  const source = await readFile(file, 'utf8');
  for (const dependency of forbiddenDependencies) {
    const escaped = dependency.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const importPattern = new RegExp(`(?:from\\s+|import\\s*\\(|require\\s*\\()(['\"])${escaped}(?:/[^'\"]*)?\\1`);
    if (importPattern.test(source)) {
      throw new Error(`Forbidden AI import in ${file}: ${dependency}`);
    }
  }
}

process.stdout.write('No AI dependencies or imports detected.\n');
