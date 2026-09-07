import { readFile } from 'node:fs/promises';
import type { Pool } from 'pg';

const schemaUrl = new URL('../../db/schema.sql', import.meta.url);
const initializationByPool = new WeakMap<Pool, Promise<void>>();

async function applyPostgresSchema(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1, $2)', [20260903, 4]);
    await client.query(await readFile(schemaUrl, 'utf8'));
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export function ensurePostgresSchema(pool: Pool): Promise<void> {
  const current = initializationByPool.get(pool);
  if (current) return current;

  const initialization = applyPostgresSchema(pool).catch((error) => {
    initializationByPool.delete(pool);
    throw error;
  });
  initializationByPool.set(pool, initialization);
  return initialization;
}
