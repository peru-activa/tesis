import { useEffect, useRef, useState } from 'react';
import {
  designFontFamilies,
  designTextSchema,
  type DesignText,
} from '../../../../src/domain/design-text';
import { createTextAttachment, designFonts, loadDesignFont } from './designText';
import type { DesignAttachment } from './designAttachment';

type Method = 'printing' | 'embroidery' | 'sublimation' | 'vinyl';
export function DesignTextDialog({
  initial,
  initialMethod = 'printing',
  background,
  onSave,
  onClose,
}: {
  initial?: DesignText;
  initialMethod?: Method;
  background: string;
  onSave: (attachment: DesignAttachment, method: Method, aspectRatio: number) => void;
  onClose: () => void;
}) {
  const rgb = [1, 3, 5].map((n) => Number.parseInt(background.slice(n, n + 2), 16));
  const defaultInk =
    rgb[0]! * 0.2126 + rgb[1]! * 0.7152 + rgb[2]! * 0.0722 > 180 ? '#17243a' : '#ffffff';
  const [text, setText] = useState<DesignText>(
    initial ?? { value: '', fontFamily: 'Montserrat', weight: 700, color: defaultInk },
  );
  const [method, setMethod] = useState<Method>(initialMethod);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const launcher = useRef(document.activeElement);
  useEffect(() => {
    dialog.current?.showModal();
    return () => {
      if (launcher.current instanceof HTMLElement && launcher.current.isConnected)
        launcher.current.focus();
    };
  }, []);
  useEffect(() => {
    let active = true;
    setReady(false);
    setError('');
    void loadDesignFont(text.fontFamily).then(
      () => {
        if (active) setReady(true);
      },
      () => {
        if (active) setError('No se pudo cargar la fuente. Elige otra o vuelve a abrir el editor.');
      },
    );
    return () => {
      active = false;
    };
  }, [text.fontFamily]);
  async function save() {
    const parsed = designTextSchema.safeParse(text);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Revisa el texto.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await createTextAttachment(parsed.data);
      onSave(result.attachment, method, result.aspectRatio);
    } catch {
      setError('No se pudo preparar el texto. Reintenta.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="quote-text-dialog"
      aria-labelledby="quote-text-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <button
        type="button"
        className="quote-text-close"
        aria-label="Cerrar editor de texto"
        disabled={busy}
        onClick={onClose}
      >
        ×
      </button>
      <h2 id="quote-text-dialog-title">{initial ? 'Editar texto' : 'Agregar texto'}</h2>
      <div className="quote-text-content">
        <label>
          Tu texto
          <textarea
            autoFocus
            rows={3}
            wrap="off"
            maxLength={160}
            value={text.value}
            placeholder="Nombre, equipo o frase"
            onChange={(event) => setText({ ...text, value: event.target.value })}
          />
        </label>
        <small>Hasta 160 caracteres y cuatro líneas. Usa Enter para cambiar de línea.</small>
        <div className="quote-text-options">
          <label>
            Fuente
            <select
              value={text.fontFamily}
              onChange={(event) =>
                setText({ ...text, fontFamily: event.target.value as DesignText['fontFamily'] })
              }
            >
              {designFontFamilies.map((family) => (
                <option value={family} key={family}>
                  {family} · {designFonts[family].sample}
                </option>
              ))}
            </select>
          </label>
          <label>
            Grosor
            <select
              value={text.weight}
              onChange={(event) =>
                setText({ ...text, weight: Number(event.target.value) as DesignText['weight'] })
              }
            >
              <option value={400}>Normal</option>
              <option value={700}>Negrita</option>
            </select>
          </label>
          <label>
            Color del texto
            <input
              type="color"
              value={text.color}
              onChange={(event) => setText({ ...text, color: event.target.value })}
            />
          </label>
          <label>
            Acabado del texto
            <select value={method} onChange={(event) => setMethod(event.target.value as Method)}>
              <option value="printing">Estampado</option>
              <option value="embroidery">Bordado</option>
              <option value="sublimation">Sublimado</option>
              <option value="vinyl">Vinil</option>
            </select>
          </label>
        </div>
        <div
          className="quote-text-sample"
          aria-label="Vista previa del texto"
          style={{
            backgroundColor: background,
            color: text.color,
            fontFamily: ready ? `"Design ${text.fontFamily}"` : 'sans-serif',
            fontWeight: text.weight,
          }}
        >
          {ready ? text.value || 'Tu texto aquí' : 'Cargando fuente…'}
        </div>
        <p className="quote-text-help">
          Después puedes arrastrarlo y ajustar su ancho y alto sobre la prenda.
        </p>
        {error ? (
          <p role="alert" className="quote-inline-error">
            {error}
          </p>
        ) : null}
      </div>
      <div className="quote-text-actions">
        <button type="button" className="quote-secondary" disabled={busy} onClick={onClose}>
          Cancelar
        </button>
        <button
          type="button"
          className="quote-primary"
          disabled={!ready || busy}
          onClick={() => void save()}
        >
          {busy ? 'Preparando…' : initial ? 'Guardar texto' : 'Agregar a la prenda'}
        </button>
      </div>
    </dialog>
  );
}
