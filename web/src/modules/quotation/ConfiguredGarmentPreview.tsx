import { useGarmentCalibration } from './useGarmentCalibration';
import { GarmentCalibrationNote } from './GarmentCalibrationNote';
import { useId, useState, type ReactNode } from 'react';
import { GarmentDesignCanvas } from './GarmentDesignCanvas';
import {
  designLogoStyle,
  garmentDesignApplications,
  designApplicationLabel,
  parseTransform,
  availableGarmentViews,
  garmentViews,
  calibrationForView,
  type PreviewApplication,
  type View,
} from './designPreviewModel';
import { DesignLogo, useDesignArtwork } from './DesignLogo';
import './configured-preview.css';
import type { Garment } from './quotationFormModel';

function InspectableLogo({
  application,
  index,
  selected,
  onSelect,
  onInspect,
  tooltipId,
}: {
  application: PreviewApplication;
  index: number;
  selected: boolean;
  onSelect: () => void;
  onInspect: (index: number | null) => void;
  tooltipId: string;
}) {
  const attachment = application.attachment!;
  const prepared = useDesignArtwork(attachment, application.method === 'embroidery');
  const geometry = prepared?.result?.geometry;
  const content = geometry?.content;
  const transform = parseTransform(application.placement);
  const width = application.widthCm ? application.widthCm * 2 : transform.width;
  const height = application.heightCm ? application.heightCm * 2 : transform.height;
  const scale = geometry ? Math.min(width / geometry.width, height / geometry.height) : 0;
  // The interaction follows the visible ink, while the original image frame stays intact.
  const hitArea =
    geometry && content
      ? {
          left: `${(((width - geometry.width * scale) / 2 + content.left * scale) / width) * 100}%`,
          top: `${(((height - geometry.height * scale) / 2 + content.top * scale) / height) * 100}%`,
          width: `${((content.width * scale) / width) * 100}%`,
          height: `${((content.height * scale) / height) * 100}%`,
        }
      : undefined;
  return (
    <div
      className="quote-design-logo-manipulator quote-design-logo-readonly quote-design-inspection-frame"
      style={designLogoStyle(application, transform)}
    >
      <DesignLogo
        attachment={attachment}
        method={application.method}
        alt={`Diseño adjunto: ${attachment.name}`}
      />
      {hitArea ? (
        <button
          type="button"
          className={`quote-design-logo-inspect${selected ? ' is-selected' : ''}`}
          style={hitArea}
          aria-label={`Ver ${designApplicationLabel(attachment, index)}: ${garmentViews[transform.view].label}`}
          aria-pressed={selected}
          aria-describedby={tooltipId}
          onPointerEnter={(event) => {
            if (event.pointerType !== 'touch') onInspect(index);
          }}
          onPointerLeave={() => onInspect(null)}
          onFocus={() => onInspect(index)}
          onBlur={() => onInspect(null)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') onInspect(null);
          }}
          onClick={() => {
            onInspect(null);
            onSelect();
          }}
        >
          <span className="quote-design-number" aria-hidden="true">
            {index + 1}
          </span>
        </button>
      ) : null}
    </div>
  );
}

export function ConfiguredGarmentPreview({
  garment,
  garmentImage,
  garmentAlt,
  garmentBackImage,
  garmentBackAlt,
  title,
  fabricTitle,
  layout = 'switch',
  selectedApplication,
  onSelectApplication,
  onInspectApplication,
  renderApplicationDetails,
}: {
  garment: Garment;
  garmentImage?: string;
  garmentAlt?: string;
  garmentBackImage?: string;
  garmentBackAlt?: string;
  title: string;
  fabricTitle: string;
  layout?: 'switch' | 'both';
  selectedApplication?: number | null;
  onSelectApplication?: (index: number) => void;
  onInspectApplication?: (index: number | null) => void;
  renderApplicationDetails?: (application: PreviewApplication, index: number) => ReactNode;
}) {
  const applications = garmentDesignApplications(garment);
  const calibration = useGarmentCalibration(garment);
  const [view, setView] = useState<View>('front');
  const views = availableGarmentViews(
    garment.sleeve === 'manga_corta' || garment.sleeve === 'manga_larga',
  ).filter(
    (side) =>
      layout === 'switch' ||
      garmentViews[side].kind === 'body' ||
      applications.some((application) => parseTransform(application.placement).view === side),
  );
  const id = useId();
  const [inspected, setInspected] = useState<number | null>(null);
  function inspect(index: number | null) {
    setInspected(index);
    onInspectApplication?.(index);
  }

  return (
    <section
      className={`quote-configured-preview${layout === 'both' ? ' quote-configured-preview-both' : ''}`}
      aria-label={`Vista previa: ${title}`}
    >
      <div className="quote-preview-heading">
        <strong>{title}</strong>
        <span>{fabricTitle} · Imagen referencial</span>
      </div>
      {layout === 'switch' ? (
        <div className="quote-design-view-switch" aria-label="Vista de la prenda">
          {views.map((side) => (
            <button
              type="button"
              key={side}
              className={view === side ? 'selected' : ''}
              aria-pressed={view === side}
              onClick={() => setView(side)}
            >
              {garmentViews[side].label}
            </button>
          ))}
        </div>
      ) : null}
      <div className="quote-configured-sides">
        {views
          .filter((side) => layout === 'both' || side === view)
          .map((side) => (
            <figure key={side} hidden={layout === 'switch' && view !== side}>
              <GarmentDesignCanvas
                view={side}
                color={garment.color}
                garmentImage={garmentImage}
                garmentAlt={garmentAlt}
                garmentBackImage={garmentBackImage}
                garmentBackAlt={garmentBackAlt}
                sleeve={garment.sleeve}
                data-view={side}
              >
                {applications.map((application, index) => {
                  const attachment = application.attachment;
                  if (!attachment?.mediaType.startsWith('image/')) return null;
                  const transform = parseTransform(application.placement);
                  if (transform.view !== side) return null;
                  const logo = (
                    <DesignLogo
                      attachment={attachment}
                      method={application.method}
                      alt={`Diseño adjunto: ${attachment.name}`}
                    />
                  );
                  return onSelectApplication ? (
                    <InspectableLogo
                      key={index}
                      application={application}
                      index={index}
                      selected={selectedApplication === index}
                      onSelect={() => onSelectApplication(index)}
                      onInspect={inspect}
                      tooltipId={`${id}-tooltip`}
                    />
                  ) : (
                    <div
                      key={index}
                      className="quote-design-logo-manipulator quote-design-logo-readonly"
                      style={designLogoStyle(application, transform)}
                    >
                      {logo}
                    </div>
                  );
                })}
              </GarmentDesignCanvas>
              {layout === 'both' ? <figcaption>{garmentViews[side].label}</figcaption> : null}
              {garmentViews[side].kind === 'sleeve' ||
              !(side === 'front' ? garmentImage : garmentBackImage) ? (
                <p className="quote-configured-preview-note">Silueta referencial de la prenda</p>
              ) : null}
            </figure>
          ))}
        {renderApplicationDetails && inspected !== null && applications[inspected] ? (
          <div className="quote-design-tooltip" role="tooltip" id={`${id}-tooltip`}>
            {renderApplicationDetails(applications[inspected], inspected)}
          </div>
        ) : null}
      </div>
      <GarmentCalibrationNote calibration={calibrationForView(calibration, view)} />
      {views.some(
        (side) => garmentViews[side].kind === 'sleeve' && (layout === 'both' || side === view),
      ) ? (
        <p className="quote-configured-preview-note">
          Mangas: izquierda y derecha de quien viste la prenda. Escala referencial por confirmar.
        </p>
      ) : null}
      {applications.some(
        (application) => application.attachment?.mediaType === 'application/pdf',
      ) ? (
        <p className="quote-configured-preview-note">
          Los archivos PDF se incluyen como adjuntos; su diseño no se representa sobre la prenda.
        </p>
      ) : null}
    </section>
  );
}
