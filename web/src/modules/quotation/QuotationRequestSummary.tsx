import {
  resolveGarmentSizeCategory,
  type GarmentSizeCategory,
  type QuotationRequestDraft,
} from '../../../../src/domain/quotation-requests';
import { ConfiguredGarmentPreview } from './ConfiguredGarmentPreview';
import { poloCuts, poloSleeves } from './quotationCatalog';
import { garmentDesignApplications } from './designPreviewModel';
import { garmentPreviewDetails } from './garmentPreviewDetails';

const customizationLabels: Record<QuotationRequestDraft['garment']['customization'], string> = {
  none: 'Sin personalización',
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimado',
  vinyl: 'Vinil',
};

export function QuotationRequestSummary({
  draft,
  showPendingPrice = true,
}: {
  draft: QuotationRequestDraft;
  showPendingPrice?: boolean;
}) {
  const garments = [draft.garment, ...draft.additionalGarments];

  return (
    <>
      <div className="mt-7 grid gap-4">
        {garments.map((garment, index) => {
          const cutLabel = poloCuts.find((option) => option.value === garment.cut)?.label;
          const sleeveLabel = poloSleeves.find((option) => option.value === garment.sleeve)?.label;
          const sizesByCategory = garment.sizes.reduce<
            Record<GarmentSizeCategory, typeof garment.sizes>
          >(
            (result, size) => {
              if (size.quantity > 0) result[resolveGarmentSizeCategory(size)].push(size);
              return result;
            },
            { adult: [], child: [] },
          );

          return (
            <div className="quote-review-item" key={`${garment.product}-${index}`}>
              <ConfiguredGarmentPreview garment={garment} {...garmentPreviewDetails(garment)} />
              <section className="quote-review-garment">
                <h3>
                  {garment.product === 'polo' ? 'Polos' : 'Buzos'} · {garment.quantity}
                </h3>
                <p>
                  {garment.product === 'polo'
                    ? [garment.model, cutLabel, sleeveLabel, garment.color]
                        .filter(Boolean)
                        .join(' · ')
                    : `${garment.model} para ${garment.audience} · ${garment.color}`}
                </p>
                <p>
                  {garment.fabric.mode === 'proposal' ? 'Tela por recomendar' : garment.fabric.name}{' '}
                  ·{' '}
                  {[
                    customizationLabels[garment.customization],
                    ...(garment.additionalCustomizations ?? []).map(
                      (item) => customizationLabels[item],
                    ),
                  ].join(' + ')}
                </p>
                {sizesByCategory.adult.length > 0 && (
                  <p>
                    <strong>Adultos:</strong>{' '}
                    {sizesByCategory.adult
                      .map((size) => size.size + ' × ' + size.quantity)
                      .join(', ')}
                  </p>
                )}
                {sizesByCategory.child.length > 0 && (
                  <p>
                    <strong>Niños:</strong>{' '}
                    {sizesByCategory.child
                      .map((size) => size.size + ' × ' + size.quantity)
                      .join(', ')}
                  </p>
                )}
                {garmentDesignApplications(garment).map((application, index) =>
                  application.attachment?.text ? (
                    <p key={`text-${index}`}>
                      Texto {index + 1}: «{application.attachment.text.value}» ·{' '}
                      {application.attachment.text.fontFamily}
                    </p>
                  ) : null,
                )}
                {garmentDesignApplications(garment).map((application, index) =>
                  application.attachment?.preview?.inkColor ? (
                    <p key={`ink-${index}`}>
                      Color del {application.attachment.text ? 'Texto' : 'Logo'} {index + 1}:{' '}
                      {application.attachment.preview.inkColor.toUpperCase()}
                    </p>
                  ) : null,
                )}
                {(garment.designApplications ?? [])
                  .map((application) => application.attachment?.name)
                  .filter(Boolean).length > 0 ? (
                  <p>
                    Adjuntos:{' '}
                    {(garment.designApplications ?? [])
                      .map((application) => application.attachment?.name)
                      .filter(Boolean)
                      .join(', ')}
                  </p>
                ) : (
                  garment.designAttachment && <p>Adjunto: {garment.designAttachment.name}</p>
                )}
              </section>
            </div>
          );
        })}
      </div>
      <dl className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
        <div className="grid gap-1 py-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <dt className="quote-field-label">Entrega</dt>
          <dd className="m-0 text-sm font-semibold">
            {draft.delivery.requiredBy} · {draft.delivery.location}
          </dd>
        </div>
        <div className="grid gap-1 py-4 sm:grid-cols-[150px_minmax(0,1fr)]">
          <dt className="quote-field-label">Contacto</dt>
          <dd className="m-0 text-sm font-semibold">
            {draft.customer.contactName} · {draft.customer.businessName}
          </dd>
        </div>
      </dl>
      {showPendingPrice ? (
        <div className="quote-price-note">
          <span>S/ —</span>
          <div>
            <strong>El precio se enviará después.</strong>
            <p>No se calcula automáticamente con este formulario.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
