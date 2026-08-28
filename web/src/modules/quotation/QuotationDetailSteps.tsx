import { useState } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { readDesignAttachment } from './designAttachment';
import { Choice, dateAfter, InputField, StepTitle } from './QuoteUi';
import { garmentField, type Garment, type GarmentPath } from './quotationFormModel';
import { QuotationRequestSummary } from './QuotationRequestSummary';
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

  return (
    <>
      <StepTitle
        number={number}
        title={`¿Cómo debe quedar el ${garment.product}?`}
        description="Elige el color y la personalización."
      />
      <InputField label="Color">
        <input {...register(garmentField(path, 'color'))} placeholder="Ejemplo: azul marino" />
      </InputField>
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

export function ContactStep({ number, email }: { number: string; email?: string }) {
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
        <InputField label={email ? 'Correo de acceso' : 'Correo o teléfono'}>
          <input readOnly={Boolean(email)} {...register('customer.contact')} />
        </InputField>
      </div>
    </>
  );
}

export function ReviewStep({ number }: { number: string }) {
  const draft = useFormContext<QuotationRequestDraft>().getValues();

  return (
    <>
      <StepTitle
        number={number}
        title="Revisa antes de enviar"
        description="Confirma que los datos estén correctos."
      />
      <QuotationRequestSummary draft={draft} />
    </>
  );
}

function formatFileSize(sizeBytes: number): string {
  return `${(sizeBytes / 1_000_000).toFixed(1)} MB`;
}
