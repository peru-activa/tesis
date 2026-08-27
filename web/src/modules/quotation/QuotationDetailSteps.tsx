import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { readDesignAttachment } from './designAttachment';
import { Choice, dateAfter, InputField, StepTitle } from './QuoteUi';
import { fabricsByProduct, poloCuts, poloSleeves } from './quotationCatalog';
import { garmentField, type Garment, type GarmentPath } from './quotationFormModel';
import { SizeBreakdownEditor } from './SizeBreakdownEditor';

type Customization = QuotationRequestDraft['garment']['customization'];
const customizationLabels: Record<Customization, string> = {
  none: 'Sin personalización',
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimado',
};
const applicationCounts = Array.from({ length: 20 }, (_, index) => index + 1);

export function ModelStep({ path, number }: { path: GarmentPath; number: string }) {
  const { register } = useFormContext<QuotationRequestDraft>();

  return (
    <>
      <StepTitle
        number={number}
        title="¿Cómo será el buzo?"
        description="Indica el modelo y para quién es."
      />
      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <InputField label="Modelo" hint="Ejemplo: casaca y pantalón">
          <input {...register(garmentField(path, 'model'))} placeholder="Casaca y pantalón" />
        </InputField>
        <InputField label="Para">
          <select {...register(garmentField(path, 'audience'))}>
            <option value="unisex">Unisex</option>
            <option value="caballero">Caballero</option>
            <option value="dama">Dama</option>
          </select>
        </InputField>
      </div>
    </>
  );
}

export function QuantityStep({ path, number }: { path: GarmentPath; number: string }) {
  const { control } = useFormContext<QuotationRequestDraft>();
  const garment = useWatch({ control, name: path }) as Garment;

  return (
    <>
      <StepTitle
        number={number}
        title="¿Cómo se distribuyen las tallas?"
        description={`${garment.quantity} ${garment.product === 'polo' ? 'polos' : 'buzos'} en total.`}
      />
      <SizeBreakdownEditor path={path} quantity={garment.quantity} />
    </>
  );
}

export function DesignStep({ path, number }: { path: GarmentPath; number: string }) {
  const { register, setValue, control } = useFormContext<QuotationRequestDraft>();
  const garment = useWatch({ control, name: path }) as Garment;
  const [attachmentError, setAttachmentError] = useState('');
  const fabrics = fabricsByProduct[garment.product];
  const catalogNames = new Set(fabrics.map((option) => option.name));
  const customFabric =
    garment.fabric.mode === 'specified' && !catalogNames.has(garment.fabric.name);

  return (
    <>
      <StepTitle
        number={number}
        title={`¿Cómo debe quedar el ${garment.product}?`}
        description={
          garment.product === 'polo'
            ? 'Elige el color y la personalización.'
            : 'Elige el color, la tela y la personalización.'
        }
      />
      <InputField label="Color">
        <input {...register(garmentField(path, 'color'))} placeholder="Ejemplo: azul marino" />
      </InputField>
      {garment.product === 'buzo' && (
        <>
          <fieldset className="mt-6">
            <legend className="quote-field-label">Tela</legend>
            <div className="quote-fabric-options mt-2">
              {fabrics.map((option) => (
                <Choice
                  key={option.name}
                  selected={
                    garment.fabric.mode === 'specified' && garment.fabric.name === option.name
                  }
                  onClick={() =>
                    setValue(
                      garmentField(path, 'fabric'),
                      { mode: 'specified', name: option.name },
                      { shouldValidate: true },
                    )
                  }
                >
                  <strong>{option.title}</strong>
                  <small>{option.description}</small>
                </Choice>
              ))}
              <Choice
                selected={garment.fabric.mode === 'proposal'}
                onClick={() =>
                  setValue(
                    garmentField(path, 'fabric'),
                    { mode: 'proposal' },
                    {
                      shouldValidate: true,
                    },
                  )
                }
              >
                <strong>No sé cuál elegir</strong>
                <small>Perú Activa me recomendará una</small>
              </Choice>
              <Choice
                selected={customFabric}
                onClick={() =>
                  setValue(
                    garmentField(path, 'fabric'),
                    { mode: 'specified', name: '' },
                    { shouldValidate: true },
                  )
                }
              >
                <strong>Otra tela</strong>
                <small>No aparece en la lista</small>
              </Choice>
            </div>
          </fieldset>
          {customFabric && (
            <InputField label="¿Qué tela necesitas?">
              <input
                {...register(garmentField(path, 'fabric.name'))}
                placeholder="Escribe el nombre de la tela"
              />
            </InputField>
          )}
        </>
      )}
      <fieldset className="mt-6">
        <legend className="quote-field-label">Personalización</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.entries(customizationLabels) as Array<[Customization, string]>).map(
            ([value, label]) => (
              <Choice
                key={value}
                selected={garment.customization === value}
                onClick={() => {
                  setValue(garmentField(path, 'customization'), value, {
                    shouldValidate: true,
                  });
                  setValue(
                    garmentField(path, 'applicationCount'),
                    value === 'none' ? 0 : Math.max(1, garment.applicationCount),
                    { shouldValidate: true },
                  );
                }}
              >
                {label}
              </Choice>
            ),
          )}
        </div>
      </fieldset>
      {garment.customization !== 'none' && (
        <div className="mt-6 grid gap-5 sm:grid-cols-[minmax(14rem,.4fr)_1fr]">
          <InputField label="¿Cuántos logos o diseños?">
            <select {...register(garmentField(path, 'applicationCount'), { valueAsNumber: true })}>
              {applicationCounts.map((count) => (
                <option value={count} key={count}>
                  {count}
                </option>
              ))}
            </select>
          </InputField>
          <InputField label="¿Dónde van?">
            <input
              {...register(garmentField(path, 'customizationDetails'))}
              placeholder="Ejemplo: uno al pecho y otro en la espalda"
            />
          </InputField>
        </div>
      )}
      {garment.customization !== 'none' && (
        <div className="quote-design-reference-grid">
          <InputField label="Describe el diseño" hint="O pega un enlace">
            <textarea
              rows={2}
              {...register(garmentField(path, 'designReference'))}
              placeholder="Ejemplo: logo institucional bordado"
            />
          </InputField>
          <fieldset className="quote-attachment-field">
            <legend className="quote-field-label">O adjunta el diseño</legend>
            <label className="quote-file-picker">
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  try {
                    const attachment = await readDesignAttachment(file);
                    setValue(garmentField(path, 'designAttachment'), attachment, {
                      shouldDirty: true,
                      shouldValidate: true,
                    });
                    setAttachmentError('');
                  } catch (cause) {
                    setAttachmentError(
                      cause instanceof Error ? cause.message : 'No se pudo adjuntar el archivo.',
                    );
                    event.target.value = '';
                  }
                }}
              />
              <span>{garment.designAttachment ? 'Cambiar archivo' : 'Adjuntar archivo'}</span>
              <small>JPG, PNG, WEBP o PDF · máximo 2 MB</small>
            </label>
            {garment.designAttachment && (
              <div className="quote-attachment-summary">
                <span>
                  <strong>{garment.designAttachment.name}</strong>
                  <small>{formatFileSize(garment.designAttachment.sizeBytes)}</small>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setValue(garmentField(path, 'designAttachment'), undefined, {
                      shouldDirty: true,
                      shouldValidate: true,
                    })
                  }
                >
                  Quitar
                </button>
              </div>
            )}
            {attachmentError && <p className="quote-inline-error">{attachmentError}</p>}
          </fieldset>
        </div>
      )}
    </>
  );
}

export function ContactStep({ number }: { number: string }) {
  const { register } = useFormContext<QuotationRequestDraft>();

  return (
    <>
      <StepTitle
        number={number}
        title="¿Dónde enviamos la cotización?"
        description="Indica la entrega y un dato de contacto."
      />
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <InputField label="Fecha de entrega">
          <input type="date" min={dateAfter(1)} {...register('delivery.requiredBy')} />
        </InputField>
        <InputField label="Lugar de entrega">
          <input
            {...register('delivery.location')}
            placeholder="Distrito o dirección de referencia"
          />
        </InputField>
      </div>
      <div className="mt-7 border-t border-slate-200 pt-6">
        <h3 className="text-lg font-extrabold text-slate-900">Datos del solicitante</h3>
        <div className="grid gap-5 sm:grid-cols-2">
          <InputField label="Nombre de contacto">
            <input {...register('customer.contactName')} />
          </InputField>
          <InputField label="Empresa o razón social">
            <input {...register('customer.businessName')} />
          </InputField>
        </div>
        <InputField label="Correo o teléfono">
          <input {...register('customer.contact')} />
        </InputField>
      </div>
    </>
  );
}

export function ReviewStep({ number }: { number: string }) {
  const draft = useFormContext<QuotationRequestDraft>().getValues();
  const garments = [draft.garment, ...draft.additionalGarments];

  return (
    <>
      <StepTitle
        number={number}
        title="Revisa antes de enviar"
        description="Confirma que los datos estén correctos."
      />
      <div className="mt-7 grid gap-4">
        {garments.map((garment, index) => {
          const cutLabel = poloCuts.find((option) => option.value === garment.cut)?.label;
          const sleeveLabel = poloSleeves.find((option) => option.value === garment.sleeve)?.label;

          return (
            <section className="quote-review-garment" key={`${garment.product}-${index}`}>
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
                {garment.fabric.mode === 'proposal' ? 'Tela por recomendar' : garment.fabric.name} ·{' '}
                {customizationLabels[garment.customization]}
              </p>
              {garment.designAttachment && <p>Adjunto: {garment.designAttachment.name}</p>}
            </section>
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

function formatFileSize(sizeBytes: number): string {
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
}
