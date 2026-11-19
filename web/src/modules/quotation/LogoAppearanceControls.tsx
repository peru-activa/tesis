import { useId } from 'react';
import type { DesignAttachment } from './designAttachment';
import { DesignLogo, useDesignArtwork } from './DesignLogo';
import { resolveGarmentColor } from './garmentColor';

type Preview = NonNullable<DesignAttachment['preview']>;
const methods = {
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimado',
  vinyl: 'Vinil',
} as const;

export function LogoAppearanceControls({
  attachment,
  method,
  index,
  color,
  onAttachmentChange,
  onMethodChange,
  onEditText,
}: {
  attachment: DesignAttachment;
  method?: keyof typeof methods;
  index: number;
  color: string;
  onAttachmentChange: (attachment: DesignAttachment) => void;
  onMethodChange: (method: keyof typeof methods) => void;
  onEditText?: () => void;
}) {
  const id = useId();
  const prepared = useDesignArtwork(attachment, method === 'embroidery');
  const settings: Preview = attachment.preview ?? { backgroundMode: 'auto' };
  function change(update: Partial<Preview>) {
    onAttachmentChange({ ...attachment, preview: { ...settings, ...update } });
  }
  const kind = attachment.text ? 'Texto' : 'Logo';
  const ink = settings.inkColor?.toLowerCase();
  const inkChoice = !ink
    ? 'original'
    : ink === '#ffffff'
      ? 'white'
      : ink === '#000000'
        ? 'black'
        : 'custom';
  return (
    <section className="quote-logo-appearance" aria-label={`Acabado del ${kind} ${index + 1}`}>
      <h3>
        Acabado del {kind} {index + 1}
      </h3>
      {attachment.text ? (
        <button type="button" className="quote-edit-text" onClick={onEditText}>
          Editar texto y fuente
        </button>
      ) : null}
      <div className="quote-logo-appearance-fields">
        <label>
          Acabado
          <select
            aria-label="Acabado"
            value={method ?? 'printing'}
            onChange={(event) => onMethodChange(event.target.value as keyof typeof methods)}
          >
            {Object.entries(methods).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {!attachment.text ? (
          <>
            <label>
              Fondo del logo
              <select
                aria-label="Fondo del logo"
                value={settings.backgroundMode}
                onChange={(event) =>
                  change({ backgroundMode: event.target.value as Preview['backgroundMode'] })
                }
              >
                <option value="auto">Quitar automáticamente</option>
                <option value="keep">Conservar original</option>
                <option value="remove">Elegir color para quitar</option>
              </select>
            </label>
          </>
        ) : null}
        <label>
          {attachment.text ? 'Color del texto' : 'Color del logo'}
          <select
            aria-label={attachment.text ? 'Color del texto' : 'Color del logo'}
            value={inkChoice}
            onChange={(event) =>
              change({
                inkColor: {
                  original: undefined,
                  white: '#ffffff',
                  black: '#000000',
                  custom: '#b93235',
                }[event.target.value],
              })
            }
          >
            <option value="original">Original</option>
            <option value="white">Blanco</option>
            <option value="black">Negro</option>
            <option value="custom">Otro color</option>
          </select>
        </label>
        {inkChoice === 'custom' ? (
          <label>
            Elegir color del logo
            <input
              type="color"
              value={ink}
              onChange={(event) => change({ inkColor: event.target.value })}
            />
          </label>
        ) : null}
        {!attachment.text && settings.backgroundMode === 'remove' ? (
          <>
            <label>
              Color que se quitará
              <input
                type="color"
                value={settings.backgroundColor ?? '#ffffff'}
                onChange={(event) => change({ backgroundColor: event.target.value })}
              />
            </label>
            <label>
              Precisión del recorte
              <input
                type="range"
                min="2"
                max="80"
                value={settings.tolerance ?? 18}
                onChange={(event) => change({ tolerance: Number(event.target.value) })}
              />
            </label>
          </>
        ) : null}
      </div>
      <p id={id} className="quote-logo-appearance-hint" role="status">
        {prepared?.error
          ? `${prepared.error} Se muestra el archivo original.`
          : !prepared?.result
            ? 'Preparando la vista del logo…'
            : prepared.result.background === 'unrecognized'
              ? 'No se detectó un fondo uniforme. Puedes elegir el color que deseas quitar.'
              : prepared.result.background === 'removed'
                ? 'Fondo quitado. Revisa los detalles; puedes volver al original.'
                : prepared.result.background === 'transparent'
                  ? 'Tu archivo ya tiene transparencia.'
                  : 'Se conserva el fondo del archivo original.'}
      </p>
      {method === 'embroidery' ? (
        <details className="quote-logo-detail">
          <summary>Ver detalle del bordado</summary>
          <div
            className="quote-logo-thread-swatch"
            style={{ backgroundColor: resolveGarmentColor(color) || '#bdc8d8' }}
            aria-describedby={id}
          >
            <DesignLogo
              attachment={attachment}
              method={method}
              alt={`Detalle de bordado del Logo ${index + 1}`}
            />
          </div>
          <p>Textura referencial de hilos. El acabado final depende del diseño y del bordado.</p>
        </details>
      ) : null}
    </section>
  );
}
