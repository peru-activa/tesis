import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import type { DesignAttachment } from './designAttachment';

import { GarmentDesignCanvas } from './GarmentDesignCanvas';
import { DesignLogo } from './DesignLogo';
import {
  clamp,
  constrainTransform,
  designApplicationLabel,
  designLogoStyle,
  parseTransform,
  serializeTransform,
  availableGarmentViews,
  garmentViews,
  type View,
  type LogoTransform,
  type PreviewApplication,
} from './designPreviewModel';

type InteractionMode = 'drag' | 'resize';

const methodInitials = {
  embroidery: 'B',
  printing: 'E',
  sublimation: 'S',
  vinyl: 'V',
} as const;

export function DesignPlacementPreview({
  attachment,
  applications,
  activeApplication,
  color,
  garmentImage,
  garmentAlt,
  garmentBackImage,
  garmentBackAlt,
  sleeve,
  view,
  onViewChange,
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
  garmentBackImage?: string;
  garmentBackAlt?: string;
  sleeve?: string;
  view: View;
  onViewChange: (view: View) => void;
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

  const widthCm = applications[activeApplication]?.widthCm;
  const heightCm = applications[activeApplication]?.heightCm;

  useEffect(() => {
    const next = parseTransform(placement);
    if (widthCm) next.width = widthCm * 2;
    if (heightCm) next.height = heightCm * 2;
    transformRef.current = next;
    setTransform(next);
  }, [activeApplication, widthCm, heightCm, placement]);

  useEffect(() => {
    if (attachment && !placement.trim()) {
      onPlacementChange(serializeTransform(transformRef.current));
    }
  }, [activeApplication, attachment, onPlacementChange, placement]);

  function updateTransform(next: LogoTransform, commit = false) {
    const constrained = constrainTransform(next);
    transformRef.current = constrained;
    setTransform(constrained);
    if (commit) onPlacementChange(serializeTransform(constrained));
  }

  function selectApplication(index: number) {
    onViewChange(parseTransform(applications[index]?.placement ?? '').view);
    onSelectApplication(index);
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
      const radians = ((active.transform.rotation ?? 0) * Math.PI) / 180;
      const localX = deltaX * Math.cos(radians) + deltaY * Math.sin(radians);
      const localY = -deltaX * Math.sin(radians) + deltaY * Math.cos(radians);
      const change =
        Math.abs(localX / active.transform.width) >= Math.abs(localY / active.transform.height)
          ? localX / active.transform.width
          : localY / active.transform.height;
      const scale = clamp(
        1 + change,
        Math.max(2 / active.transform.width, 2 / active.transform.height),
        Math.min(90 / active.transform.width, 90 / active.transform.height),
      );
      const width = active.transform.width * scale;
      const height = active.transform.height * scale;
      updateTransform({
        ...active.transform,
        width,
        height,
      });
      return;
    }

    updateTransform({
      ...active.transform,
      x: active.transform.x + deltaX,
      y: active.transform.y + deltaY,
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
        x: current.x + delta[0],
        y: current.y + delta[1],
      },
      true,
    );
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key !== '+' && event.key !== '-' && event.key !== '=') return;
    event.preventDefault();
    const amount = event.key === '-' ? -2 : 2;
    const current = transformRef.current;
    const scale = clamp(
      1 + amount / current.width,
      Math.max(2 / current.width, 2 / current.height),
      Math.min(90 / current.width, 90 / current.height),
    );
    const next = {
      ...current,
      width: current.width * scale,
      height: current.height * scale,
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
                    aria-label={`Editar ${designApplicationLabel(application.attachment, index)}`}
                    aria-pressed={activeApplication === index}
                    onClick={() => selectApplication(index)}
                  >
                    {application.attachment.mediaType.startsWith('image/') ? (
                      <DesignLogo attachment={application.attachment} alt="" thumbnail />
                    ) : (
                      <span>PDF</span>
                    )}
                  </button>
                  <button
                    className="quote-design-logo-delete"
                    type="button"
                    aria-label={`Eliminar ${designApplicationLabel(application.attachment, index)}`}
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
            {availableGarmentViews(sleeve === 'manga_corta' || sleeve === 'manga_larga').map(
              (side) => (
                <button
                  key={side}
                  type="button"
                  className={view === side ? 'selected' : ''}
                  aria-pressed={view === side}
                  onClick={() => onViewChange(side)}
                >
                  {garmentViews[side].label}
                </button>
              ),
            )}
          </div>
          <GarmentDesignCanvas
            view={view}
            color={color}
            garmentImage={garmentImage}
            garmentAlt={garmentAlt}
            garmentBackImage={garmentBackImage}
            garmentBackAlt={garmentBackAlt}
            sleeve={sleeve}
            data-design-canvas
            data-testid="design-canvas"
            data-view={view}
            onPointerMove={moveLogo}
            onPointerUp={finishInteraction}
            onPointerCancel={finishInteraction}
          >
            {applications.map((application, index) => {
              const item = application.attachment;
              if (!item?.mediaType.startsWith('image/')) return null;
              const itemTransform =
                index === activeApplication ? transform : parseTransform(application.placement);
              if (itemTransform.view !== view) return null;
              const style = designLogoStyle(
                index === activeApplication
                  ? { ...application, widthCm: undefined, heightCm: undefined }
                  : application,
                itemTransform,
              );
              return index === activeApplication ? (
                <div
                  className="quote-design-logo-manipulator"
                  role="group"
                  tabIndex={0}
                  aria-label={`${item.text ? 'Texto' : 'Logo'} movible. Arrástralo o usa las flechas del teclado.`}
                  style={style}
                  onPointerDown={(event) => startInteraction(event, 'drag')}
                  onKeyDown={moveWithKeyboard}
                  key={index}
                >
                  <DesignLogo
                    attachment={item}
                    method={application.method}
                    alt={`Diseño adjunto: ${item.name}`}
                  />
                  <button
                    type="button"
                    className="quote-design-resize-handle"
                    aria-label={item.text ? 'Cambiar tamaño del texto' : 'Cambiar tamaño del logo'}
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
                  onClick={() => selectApplication(index)}
                  key={index}
                >
                  <DesignLogo
                    attachment={item}
                    method={application.method}
                    alt={`Diseño adjunto: ${item.name}`}
                  />
                </button>
              );
            })}
            {!attachment ||
            !applications.some(
              (application) =>
                application.attachment && parseTransform(application.placement).view === view,
            ) ? (
              <button
                className="quote-design-empty-logo"
                type="button"
                onClick={attachment ? onAddApplication : onRequestUpload}
                aria-label="Agregar logo o diseño"
              >
                <span className="quote-design-empty-logo-icon" aria-hidden="true">
                  +
                </span>
                <span>
                  <strong>Agrega un logo {garmentViews[view].at}</strong>
                  <small>Haz clic aquí para subirlo y ubicarlo sobre la prenda</small>
                </span>
              </button>
            ) : null}
          </GarmentDesignCanvas>
          <strong className="quote-design-view-caption">{garmentViews[view].caption}</strong>
          {garmentViews[view].kind === 'sleeve' ? (
            <small className="quote-configured-preview-note">
              Izquierda y derecha de quien viste la prenda · Arriba: hombro · Abajo: puño
            </small>
          ) : null}
          {attachment && transform.view !== view ? (
            <button
              type="button"
              className="quote-design-move-surface"
              onClick={() => updateTransform({ ...transformRef.current, view }, true)}
            >
              {`Mover ${designApplicationLabel(attachment, activeApplication)}`}{' '}
              {garmentViews[view].to}
            </button>
          ) : null}
          {isImage && transform.view === view ? (
            <>
              <button
                type="button"
                className="quote-design-move-surface"
                onClick={() =>
                  updateTransform(
                    {
                      ...transformRef.current,
                      rotation: ((transformRef.current.rotation ?? 0) + 90) % 360,
                    },
                    true,
                  )
                }
              >
                Girar diseño 90°
              </button>
              <p className="quote-design-drag-hint">
                Arrastra el logo para moverlo · Usa la esquina para cambiar su tamaño
              </p>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
