import { createHash } from 'node:crypto';

export function jsonSha256(value: unknown): string {
  const canonical = JSON.stringify(value, (_key, item: unknown) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
    const record = item as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, record[key]]),
    );
  });
  if (canonical === undefined) throw new TypeError('Se requiere un valor JSON.');
  return createHash('sha256').update(canonical).digest('hex');
}
