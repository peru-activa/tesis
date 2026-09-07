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

function pickerColor(value: string): string {
  const normalized = value.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/i.test(normalized)) return normalized;
  return LEGACY_COLORS[normalized] ?? DEFAULT_PICKER_COLOR;
}

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = value.trim();

  return (
    <fieldset className="quote-color-field">
      <legend className="quote-field-label">Color</legend>
      <label className="quote-color-picker">
        <input
          type="color"
          aria-label={selected ? 'Cambiar color' : 'Elegir color'}
          value={pickerColor(value)}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
        <span className="quote-color-copy">
          <strong>{selected || 'Elegir color'}</strong>
          <small>
            {selected ? 'Pulsa el círculo para cambiarlo' : 'Pulsa el círculo para elegirlo'}
          </small>
        </span>
        <span className="quote-color-action" aria-hidden="true">
          {selected ? 'Cambiar' : 'Elegir'}
        </span>
      </label>
    </fieldset>
  );
}
