/** Trusted presentation metadata; never accepted from public form input. */
export interface PreviewScope {
  previewOnly?: boolean;
}

export function requireOperationalRecord(record: PreviewScope): void {
  if (record.previewOnly) throw new Error('preview_read_only');
}
