import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { GarmentPreview } from './GarmentPreview';
import { findFabricOption, poloCollars, poloCuts, poloSleeves } from './quotationCatalog';

const customizationLabels: Record<QuotationRequestDraft['garment']['customization'], string> = {
  none: 'Sin personalización',
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimado',
  vinyl: 'Vinil',
};

const poloTypeLabels = {
  cotton_basic: 'Básico de algodón',
  cotton_advertising: 'Publicitario de algodón',
  collared: 'Camisero',
  sports: 'Deportivo',
  stretch: 'Licra',
};

export function QuotationRequestSummary({ draft }: { draft: QuotationRequestDraft }) {
  const garments = [draft.garment, ...draft.additionalGarments];

  return (
    <>
      <div className="mt-7 grid gap-4">
        {garments.map((garment, index) => {
          const cutLabel = poloCuts.find((option) => option.value === garment.cut)?.label;
          const sleeveLabel = poloSleeves.find((option) => option.value === garment.sleeve)?.label;
          const collar = poloCollars.find((option) => option.value === garment.model);
          const longSleeve = garment.sleeve === 'manga_larga';
          const fabricName = garment.fabric.mode === 'specified' ? garment.fabric.name : undefined;
          const fabric = findFabricOption(garment.product, fabricName);
          const garmentImage =
            garment.product === 'polo'
              ? longSleeve
                ? collar?.longSleeveImage
                : collar?.image
              : fabric?.image;
          const garmentAlt =
            garment.product === 'polo'
              ? longSleeve
                ? collar?.longSleeveAlt
                : collar?.alt
              : fabric?.alt;

          return (
            <div className="quote-review-item" key={`${garment.product}-${index}`}>
              {garmentImage && garmentAlt && (
                <GarmentPreview
                  garmentImage={garmentImage}
                  garmentAlt={garmentAlt}
                  title={
                    garment.product === 'polo'
                      ? [garment.model, sleeveLabel].filter(Boolean).join(' · ')
                      : garment.model
                  }
                  fabric={fabric}
                  fabricTitle={
                    garment.fabric.mode === 'proposal'
                      ? 'Tela por recomendar'
                      : (fabric?.title ?? garment.fabric.name)
                  }
                  fabricMode={false}
                />
              )}
              <section className="quote-review-garment">
                <h3>
                  {garment.product === 'polo' ? 'Polos' : 'Buzos'} · {garment.quantity}
                </h3>
                <p>
                  {garment.product === 'polo'
                    ? [
                        garment.poloType ? poloTypeLabels[garment.poloType] : undefined,
                        garment.model,
                        cutLabel,
                        sleeveLabel,
                        garment.color,
                      ]
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
                {garment.designAttachment && <p>Adjunto: {garment.designAttachment.name}</p>}
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
      <div className="quote-price-note">
        <span>S/ —</span>
        <div>
          <strong>El precio se enviará después.</strong>
          <p>No se calcula automáticamente con este formulario.</p>
        </div>
      </div>
    </>
  );
}
