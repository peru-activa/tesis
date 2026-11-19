const DEFAULT_PICKER_COLOR = '#17243A';

const LEGACY_COLORS: Record<string, string> = {
  amarillo: '#FACC15',
  azul: '#2563EB',
  'azul marino': '#17243A',
  blanco: '#FFFFFF',
  gris: '#64748B',
  negro: '#111827',
  rojo: '#C5212E',
  verde: '#15803D',
};

export function knownGarmentColor(value: string): string | undefined {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
  return LEGACY_COLORS[normalized];
}

export function resolveGarmentColor(value: string): string {
  return knownGarmentColor(value) ?? DEFAULT_PICKER_COLOR;
}
