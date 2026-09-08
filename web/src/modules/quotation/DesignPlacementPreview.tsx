import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { DesignAttachment } from './designAttachment';
import { RecolorableGarmentImage } from './RecolorableGarmentImage';

type View = 'front' | 'back';
type InteractionMode = 'drag' | 'resize';

interface LogoTransform {
  view: View;
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PreviewApplication {
  attachment?: DesignAttachment;
  placement: string;
  method?: 'printing' | 'embroidery' | 'sublimation' | 'vinyl';
  widthCm?: number;
  heightCm?: number;
}

const methodInitials = {
  embroidery: 'B',
  printing: 'E',
  sublimation: 'S',
  vinyl: 'V',
} as const;

const DEFAULT_TRANSFORM: LogoTransform = {
  view: 'front',
  x: 52,
  y: 40,
  width: 16,
  height: 10,
};
const TRANSFORM_PATTERN =
  /^(Frente|Espalda) · posición (\d+(?:\.\d+)?)%, (\d+(?:\.\d+)?)% · tamaño (\d+(?:\.\d+)?)%$/;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseTransform(value: string): LogoTransform {
  const match = value.match(TRANSFORM_PATTERN);
  if (match) {
    return {
      view: match[1] === 'Espalda' ? 'back' : 'front',
      x: clamp(Number(match[2]), 5, 95),
      y: clamp(Number(match[3]), 5, 95),
      width: clamp(Number(match[4]), 8, 45),
      height: clamp(Number(match[4]), 5, 45),
    };
  }
  if (value === 'Espalda') return { ...DEFAULT_TRANSFORM, view: 'back', x: 50, y: 42 };
  return DEFAULT_TRANSFORM;
}

function serializeTransform(transform: LogoTransform): string {
  const view = transform.view === 'front' ? 'Frente' : 'Espalda';
  return `${view} · posición ${Math.round(transform.x)}%, ${Math.round(transform.y)}% · tamaño ${Math.round(transform.width)}%`;
}

export function DesignPlacementPreview({
  attachment,
  applications,
  activeApplication,
  color,
  garmentImage,
  garmentAlt,
  placement,
  onSelectApplication,
  onAddApplication,
  onDeleteApplication,
  onRequestUpload,
  onSizeChange,
  onPlacementChange,
}: {
  attachment?: DesignAttachment;
  applications: PreviewApplication[];
  activeApplication: number;
  color: string;
  garmentImage?: string;
  garmentAlt?: string;
  placement: string;
  onSelectApplication: (index: number) => void;
  onAddApplication: () => void;
  onDeleteApplication: (index: number) => void;
  onRequestUpload: () => void;
  onSizeChange: (widthCm: number, heightCm: number) => void;
  onPlacementChange: (placement: string) => void;
}) {
  const [transform, setTransform] = useState<LogoTransform>(() => parseTransform(placement));
  const transformRef = useRef(transform);
  const interaction = useRef<
    | {
        mode: InteractionMode;
        pointerX: number;
        pointerY: number;
        transform: LogoTransform;
      }
    | undefined
  >(undefined);
  const isImage = attachment?.mediaType.startsWith('image/') ?? false;

  useEffect(() => {
    const next = parseTransform(placement);
    const application = applications[activeApplication];
    if (application?.widthCm) next.width = clamp(application.widthCm * 2, 2, 90);
    if (application?.heightCm) next.height = clamp(application.heightCm * 2, 2, 90);
    transformRef.current = next;
    setTransform(next);
  }, [activeApplication, applications, placement]);

  useEffect(() => {
    if (attachment && !placement.trim()) {
      onPlacementChange(serializeTransform(transformRef.current));
    }
  }, [activeApplication, attachment, onPlacementChange, placement]);

  function updateTransform(next: LogoTransform, commit = false) {
    transformRef.current = next;
    setTransform(next);
    if (commit) onPlacementChange(serializeTransform(next));
  }

  function selectView(view: View) {
    updateTransform({ ...transformRef.current, view }, true);
  }

  function startInteraction(event: PointerEvent<HTMLElement>, mode: InteractionMode) {
    event.preventDefault();
    event.stopPropagation();
    const canvas = event.currentTarget.closest<HTMLElement>('[data-design-canvas]');
    canvas?.setPointerCapture?.(event.pointerId);
    interaction.current = {
      mode,
      pointerX: event.clientX,
      pointerY: event.clientY,
      transform: transformRef.current,
    };
  }

  function moveLogo(event: PointerEvent<HTMLDivElement>) {
    const active = interaction.current;
    if (!active) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;

    const deltaX = ((event.clientX - active.pointerX) / bounds.width) * 100;
    const deltaY = ((event.clientY - active.pointerY) / bounds.height) * 100;
    if (active.mode === 'resize') {
      const width = clamp(active.transform.width + deltaX, 2, 90);
      const height = clamp(active.transform.height + deltaY, 2, 90);
      updateTransform({
        ...active.transform,
        width,
        height,
      });
      return;
    }

    const halfWidth = active.transform.width / 2;
    updateTransform({
      ...active.transform,
      x: clamp(active.transform.x + deltaX, halfWidth, 100 - halfWidth),
      y: clamp(
        active.transform.y + deltaY,
        active.transform.height / 2,
        100 - active.transform.height / 2,
      ),
    });
  }

  function finishInteraction(event: PointerEvent<HTMLDivElement>) {
    const active = interaction.current;
    if (!active) return;
    interaction.current = undefined;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    onPlacementChange(serializeTransform(transformRef.current));
    if (active.mode === 'resize') {
      onSizeChange(transformRef.current.width / 2, transformRef.current.height / 2);
    }
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLDivElement>) {
    const movement: Partial<Record<string, [number, number]>> = {
      ArrowLeft: [-2, 0],
      ArrowRight: [2, 0],
      ArrowUp: [0, -2],
      ArrowDown: [0, 2],
    };
    const delta = movement[event.key];
    if (!delta) return;
    event.preventDefault();
    const current = transformRef.current;
    updateTransform(
      {
        ...current,
        x: clamp(current.x + delta[0], current.width / 2, 100 - current.width / 2),
        y: clamp(current.y + delta[1], current.height / 2, 100 - current.height / 2),
      },
      true,
    );
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== '+' && event.key !== '-' && event.key !== '=') return;
    event.preventDefault();
    const amount = event.key === '-' ? -2 : 2;
    const next = {
      ...transformRef.current,
      width: clamp(transformRef.current.width + amount, 2, 90),
      height: clamp(transformRef.current.height + amount, 2, 90),
    };
    updateTransform(next, true);
    onSizeChange(next.width / 2, next.height / 2);
  }

  return (
    <section className="quote-design-preview" aria-label="Vista previa referencial del diseño">
      <div className="quote-design-preview-layout">
        <div className="quote-design-preview-stage">
          <aside className="quote-design-logo-rail" aria-label="Logos agregados">
            {applications.map((application, index) =>
              application.attachment ? (
                <div
                  className="quote-design-logo-thumbnail"
                  key={`${application.attachment.name}-${index}`}
                >
                  <button
                    type="button"
                    className={activeApplication === index ? 'selected' : ''}
                    aria-label={`Editar Logo ${index + 1}`}
                    aria-pressed={activeApplication === index}
                    onClick={() => onSelectApplication(index)}
                  >
                    {application.attachment.mediaType.startsWith('image/') ? (
                      <img src={application.attachment.dataUrl} alt="" />
                    ) : (
                      <span>PDF</span>
                    )}
                  </button>
                  <button
                    className="quote-design-logo-delete"
                    type="button"
                    aria-label={`Eliminar Logo ${index + 1}`}
                    onClick={() => onDeleteApplication(index)}
                  >
                    ×
                  </button>
                  {application.method ? (
                    <small
                      className="quote-design-logo-method"
                      title={application.method}
                      aria-label={`Método: ${application.method}`}
                    >
                      {methodInitials[application.method]}
                    </small>
                  ) : null}
                </div>
              ) : null,
            )}
            <button
              className="quote-design-logo-add"
              type="button"
              aria-label="Agregar otro logo"
              title="Agregar otro logo"
              onClick={onAddApplication}
            >
              <span aria-hidden="true">+</span>
            </button>
          </aside>
          <div className="quote-design-view-switch" aria-label="Vista de la prenda">
            <button
              type="button"
              className={transform.view === 'front' ? 'selected' : ''}
              onClick={() => selectView('front')}
            >
              Frente
            </button>
            <button
              type="button"
              className={transform.view === 'back' ? 'selected' : ''}
              onClick={() => selectView('back')}
            >
              Espalda
            </button>
          </div>
          <div
            className="quote-design-shirt"
            data-design-canvas
            data-testid="design-canvas"
            data-view={transform.view}
            onPointerMove={moveLogo}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
          >
            {transform.view === 'front' && garmentImage ? (
              <RecolorableGarmentImage
                className="quote-design-product-photo"
                src={garmentImage}
                color={color}
                alt={garmentAlt ?? 'Prenda seleccionada'}
              />
            ) : (
              <svg
                viewBox="0 0 320 340"
                role="img"
                aria-label={`${transform.view === 'front' ? 'Frente' : 'Espalda'} referencial de la prenda`}
              >
                <path
                  className="quote-design-shirt-shadow"
                  d="M92 31 39 55 8 124l44 22 22-38v205h172V108l22 38 44-22-31-69-53-24-25-18c-13 16-73 16-86 0L92 31Z"
                />
                <path
                  className="quote-design-shirt-body"
                  style={{ fill: color || '#17243A' }}
                  d="M92 25 39 49 8 118l44 22 22-38v205h172V102l22 38 44-22-31-69-53-24-25-18c-13 16-73 16-86 0L92 25Z"
                />
                <path className="quote-design-shirt-seam" d="M117 8c12 21 74 21 86 0" />
              </svg>
            )}
            {applications.map((application, index) => {
              const item = application.attachment;
              if (!item?.mediaType.startsWith('image/')) return null;
              const itemTransform =
                index === activeApplication ? transform : parseTransform(application.placement);
              if (itemTransform.view !== transform.view) return null;
              const style = {
                left: `${itemTransform.x}%`,
                top: `${itemTransform.y}%`,
                width: `${application.widthCm ? application.widthCm * 2 : itemTransform.width}%`,
                height: `${application.heightCm ? application.heightCm * 2 : itemTransform.height}%`,
              };
              return index === activeApplication ? (
                <div
                  className="quote-design-logo-manipulator"
                  role="group"
                  tabIndex={0}
                  aria-label="Logo movible. Arrástralo o usa las flechas del teclado."
                  style={style}
                  onPointerDown={(event) => startInteraction(event, 'drag')}
                  onKeyDown={moveWithKeyboard}
                  key={index}
                >
                  <img src={item.dataUrl} alt={`Diseño adjunto: ${item.name}`} />
                  <button
                    type="button"
                    className="quote-design-resize-handle"
                    aria-label="Cambiar tamaño del logo"
                    title="Arrastra para cambiar el tamaño"
                    onPointerDown={(event) => startInteraction(event, 'resize')}
                    onKeyDown={resizeWithKeyboard}
                  >
                    ↘
                  </button>
                </div>
              ) : (
                <button
                  className="quote-design-logo-manipulator quote-design-logo-inactive"
                  type="button"
                  aria-label={`Seleccionar Logo ${index + 1} en la prenda`}
                  style={style}
                  onClick={() => onSelectApplication(index)}
                  key={index}
                >
                  <img src={item.dataUrl} alt={`Diseño adjunto: ${item.name}`} />
                </button>
              );
            })}
            {!attachment ? (
              <button
                className="quote-design-empty-logo"
                type="button"
                onClick={onRequestUpload}
                aria-label="Agregar logo o diseño"
              >
                <span className="quote-design-empty-logo-icon" aria-hidden="true">
                  +
                </span>
                <span>
                  <strong>Agrega el logo {activeApplication + 1}</strong>
                  <small>Haz clic aquí para subirlo y ubicarlo sobre la prenda</small>
                </span>
              </button>
            ) : null}
          </div>
          <strong className="quote-design-view-caption">
            {transform.view === 'front' ? 'Tu prenda seleccionada' : 'Vista posterior referencial'}
          </strong>
          {isImage ? (
            <p className="quote-design-drag-hint">
              Arrastra el logo para moverlo · Usa la esquina para cambiar su tamaño
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
