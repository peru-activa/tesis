import { useState } from 'react';

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
  const [isOpen, setIsOpen] = useState(false);
  const [draftColor, setDraftColor] = useState(() => pickerColor(value));

  function openPicker() {
    setDraftColor(pickerColor(value));
    setIsOpen(true);
  }

  function confirmColor() {
    onChange(draftColor.toUpperCase());
    setIsOpen(false);
  }

  return (
    <fieldset className="quote-color-field">
      <legend className="quote-field-label">Color de la prenda</legend>
      <button className="quote-color-picker" type="button" onClick={openPicker}>
        <span
          className="quote-color-swatch"
          style={{ backgroundColor: pickerColor(value) }}
          aria-hidden="true"
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
      </button>

      {isOpen && (
        <div
          className="quote-color-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setIsOpen(false);
          }}
        >
          <section
            className="quote-color-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-color-modal-title"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setIsOpen(false);
            }}
          >
            <button
              className="quote-color-modal-close"
              type="button"
              aria-label="Cerrar selector de color"
              onClick={() => setIsOpen(false)}
            >
              ×
            </button>
            <h2 id="quote-color-modal-title">Elige el color de la prenda</h2>
            <div className="quote-color-modal-notice" role="note">
              <p>
                El color en pantalla es referencial y está sujeto a disponibilidad de la tela
                seleccionada.
              </p>
              <p>
                Después de firmar el contrato, recibirás sin costo una muestra física para aprobar
                el color final antes de producir.
              </p>
            </div>
            <label className="quote-color-modal-control">
              <span>Color</span>
              <span className="quote-color-modal-selection">
                <input
                  type="color"
                  aria-label="Seleccionar color"
                  value={draftColor}
                  onChange={(event) => setDraftColor(event.target.value)}
                />
                <strong>{draftColor.toUpperCase()}</strong>
              </span>
            </label>
            <div className="quote-color-modal-actions">
              <button type="button" className="quote-secondary" onClick={() => setIsOpen(false)}>
                Cancelar
              </button>
              <button type="button" className="quote-primary" onClick={confirmColor}>
                Usar este color
              </button>
            </div>
          </section>
        </div>
      )}
    </fieldset>
  );
}
