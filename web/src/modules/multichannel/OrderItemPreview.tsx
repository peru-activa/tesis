import { useGarmentCalibration } from '../quotation/useGarmentCalibration';
import type { GarmentCalibration } from '../quotation/garmentCalibration';
import { useId, useState } from 'react';
import { garmentSizeOrderLabel } from '../../../../src/domain/quotation-requests';
import { DesignMeasurements } from '../quotation/DesignMeasurements';
import { ConfiguredGarmentPreview } from '../quotation/ConfiguredGarmentPreview';
import { DesignLogo } from '../quotation/DesignLogo';
import {
  designPlacementLabel,
  parseTransform,
  calibrationForView,
  garmentDesignApplications,
  designApplicationLabel,
  type PreviewApplication,
} from '../quotation/designPreviewModel';
import { knownGarmentColor } from '../quotation/garmentColor';
import { garmentPreviewDetails } from '../quotation/garmentPreviewDetails';
import type { Garment } from '../quotation/quotationFormModel';

const methodLabels = {
  none: 'Sin personalización',
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimado',
  vinyl: 'Vinil',
};

function OrderDesignDetails({
  application,
  index,
  method,
  calibration,
}: {
  application: PreviewApplication;
  index: number;
  method: Garment['customization'];
  calibration: GarmentCalibration;
}) {
  return (
    <>
      <strong>
        {designApplicationLabel(application.attachment, index)} ·{' '}
        {methodLabels[application.method ?? method]}
      </strong>
      <span>{designPlacementLabel(application.placement) || 'Ubicación por definir'}</span>
      {application.attachment ? (
        <DesignMeasurements
          calibration={calibrationForView(calibration, parseTransform(application.placement).view)}
          attachment={application.attachment}
          widthCm={application.widthCm}
          heightCm={application.heightCm}
        />
      ) : (
        <span>Medidas del logo por definir</span>
      )}
      {application.attachment?.text ? (
        <span className="pa-design-text-description">
          «{application.attachment.text.value}» · {application.attachment.text.fontFamily}
        </span>
      ) : null}
      {application.attachment ? <small>Archivo: {application.attachment.name}</small> : null}
    </>
  );
}

export function OrderItemPreview({ garment, index }: { garment: Garment; index: number }) {
  const preview = garmentPreviewDetails(garment);
  const calibration = useGarmentCalibration(garment);
  const color = knownGarmentColor(garment.color);
  const applications = garmentDesignApplications(garment);
  const [selected, setSelected] = useState<number | null>(null);
  const [inspected, setInspected] = useState<number | null>(null);
  const id = useId();
  const details = (application: PreviewApplication, logoIndex: number) => (
    <OrderDesignDetails
      calibration={calibration}
      application={application}
      index={logoIndex}
      method={garment.customization}
    />
  );

  return (
    <article className="pa-item-preview" aria-label={`Prenda ${index + 1}: ${preview.title}`}>
      <header className="pa-item-information">
        <h3>
          {garment.quantity} {garment.product === 'polo' ? 'polos' : 'buzos'}
        </h3>
        <p>{preview.title}</p>
        <div className="pa-item-material">
          <span>{preview.fabricTitle}</span>
          <span className="pa-item-color">
            <span
              className="pa-color-swatch"
              style={{ backgroundColor: color }}
              aria-hidden="true"
            />
            <span>Color: {garment.color}</span>
          </span>
        </div>
        <ul className="pa-size-chips" aria-label="Tallas y cantidades">
          {garment.sizes
            .filter((size) => size.quantity > 0)
            .map((size) => (
              <li key={`${size.category ?? 'adult'}-${size.size}`}>
                {garmentSizeOrderLabel(size)} <b>× {size.quantity}</b>
              </li>
            ))}
        </ul>
      </header>
      <div className="pa-item-image">
        <ConfiguredGarmentPreview
          garment={garment}
          {...preview}
          layout="both"
          selectedApplication={inspected ?? selected}
          onSelectApplication={setSelected}
          onInspectApplication={setInspected}
          renderApplicationDetails={details}
        />
        <small>
          Imagen referencial{!color ? ' · Color según indicación' : ''}
          {applications.some((a) => a.attachment?.mediaType.startsWith('image/'))
            ? ' · Toca un diseño para ver sus detalles'
            : ''}
        </small>
      </div>
      {applications.length ? (
        <ul className="pa-item-logos" aria-label="Logos y medidas">
          {applications.map((application, logoIndex) => (
            <li
              key={logoIndex}
              className={(inspected ?? selected) === logoIndex ? 'is-selected' : ''}
            >
              <button
                type="button"
                className="pa-design-summary"
                aria-label={`Detalles de ${designApplicationLabel(application.attachment, logoIndex)}`}
                aria-expanded={selected === logoIndex}
                aria-controls={`${id}-${logoIndex}`}
                onClick={() => setSelected(selected === logoIndex ? null : logoIndex)}
              >
                <span className="pa-design-thumbnail" aria-hidden="true">
                  {application.attachment?.mediaType.startsWith('image/') ? (
                    <DesignLogo
                      attachment={application.attachment}
                      method={application.method}
                      thumbnail
                      alt=""
                    />
                  ) : (
                    <span>PDF</span>
                  )}
                  <b>{logoIndex + 1}</b>
                </span>
                <span className="pa-design-summary-label">
                  <strong>{designApplicationLabel(application.attachment, logoIndex)}</strong>
                  <span>
                    {designPlacementLabel(application.placement) || 'Ubicación por definir'} ·{' '}
                    {methodLabels[application.method ?? garment.customization]}
                  </span>
                </span>
                <span className="pa-design-summary-toggle" aria-hidden="true">
                  {selected === logoIndex ? '−' : '+'}
                </span>
              </button>
              <div
                className="pa-design-details"
                id={`${id}-${logoIndex}`}
                hidden={selected !== logoIndex}
              >
                {details(application, logoIndex)}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="pa-muted">
          {[garment.customization, ...(garment.additionalCustomizations ?? [])]
            .map((method) => methodLabels[method])
            .join(' + ')}
        </p>
      )}
    </article>
  );
}
