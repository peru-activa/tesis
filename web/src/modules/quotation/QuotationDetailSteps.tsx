import { useRef, useState, type ChangeEvent } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { readDesignAttachment, type DesignAttachment } from './designAttachment';
import { ColorPicker } from './ColorPicker';
import { DesignPlacementPreview } from './DesignPlacementPreview';
import { dateAfter, InputField, StepTitle } from './QuoteUi';
import { findFabricOption, poloCollars } from './quotationCatalog';
import { garmentField, type Garment, type GarmentPath } from './quotationFormModel';
import { QuotationRequestSummary } from './QuotationRequestSummary';
import { SizeBreakdownEditor } from './SizeBreakdownEditor';

type Customization = Exclude<QuotationRequestDraft['garment']['customization'], 'none'>;
const customizationLabels: Record<Customization, string> = {
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimado',
  vinyl: 'Vinil',
};

function defaultDesignPlacement(index: number): string {
  const columns = [50, 30, 70];
  const x = columns[index % columns.length];
  const y = Math.min(82, 40 + Math.floor(index / columns.length) * 14);
  return `Frente · posición ${x}%, ${y}% · tamaño 16%`;
}

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

export function DesignStep({ path }: { path: GarmentPath }) {
  const { setValue, control } = useFormContext<QuotationRequestDraft>();
  const garment = useWatch({ control, name: path }) as Garment;
  const [attachmentError, setAttachmentError] = useState('');
  const [activeDesign, setActiveDesign] = useState(0);
  const [pendingDesign, setPendingDesign] = useState<{
    attachment: DesignAttachment;
    index?: number;
  }>();
  const designFileInputs = useRef<Array<HTMLInputElement | null>>([]);
  const newDesignFileInput = useRef<HTMLInputElement>(null);
  const collar = poloCollars.find((option) => option.value === garment.model);
  const fabric =
    garment.fabric.mode === 'specified'
      ? findFabricOption(garment.product, garment.fabric.name)
      : undefined;
  const garmentImage =
    garment.product === 'polo'
      ? garment.sleeve === 'manga_larga'
        ? collar?.longSleeveImage
        : collar?.image
      : fabric?.image;
  const garmentAlt =
    garment.product === 'polo'
      ? garment.sleeve === 'manga_larga'
        ? collar?.longSleeveAlt
        : collar?.alt
      : fabric?.alt;
  const designCount = Math.max(
    1,
    garment.applicationCount,
    garment.designApplications?.length ?? 0,
  );
  const legacyMethods = [
    ...(garment.customization === 'none' ? [] : [garment.customization]),
    ...(garment.additionalCustomizations ?? []),
  ] as Customization[];
  const designApplications = Array.from({ length: designCount }, (_, index) =>
    garment.designApplications?.[index]
      ? {
          ...garment.designApplications[index],
          method:
            garment.designApplications[index].method ?? legacyMethods[index] ?? legacyMethods[0],
          widthCm: garment.designApplications[index].widthCm ?? 8,
          heightCm: garment.designApplications[index].heightCm ?? 5,
        }
      : {
          placement: index === 0 ? garment.customizationDetails : '',
          attachment: index === 0 ? garment.designAttachment : undefined,
          method: legacyMethods[index] ?? legacyMethods[0],
          widthCm: 8,
          heightCm: 5,
        },
  );

  function applyDesignApplications(next: typeof designApplications) {
    const populated = next.filter((application) => application.attachment);
    const methods = [
      ...new Set(populated.map((application) => application.method).filter(Boolean)),
    ] as Customization[];
    setValue(garmentField(path, 'designApplications'), populated, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(garmentField(path, 'applicationCount'), populated.length, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(garmentField(path, 'customization'), methods[0] ?? 'none', {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(garmentField(path, 'additionalCustomizations'), methods.slice(1), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(garmentField(path, 'designAttachment'), populated[0]?.attachment, {
      shouldDirty: true,
      shouldValidate: true,
    });
    setValue(garmentField(path, 'customizationDetails'), populated[0]?.placement ?? '', {
      shouldDirty: true,
      shouldValidate: true,
    });
  }

  function updateDesignApplication(
    index: number,
    update: Partial<(typeof designApplications)[number]>,
  ) {
    const next = designApplications.map((application, applicationIndex) =>
      applicationIndex === index ? { ...application, ...update } : application,
    );
    applyDesignApplications(next);
  }

  function addDesignApplication() {
    newDesignFileInput.current?.click();
  }

  function removeDesignApplication(index: number) {
    const next = designApplications.filter((_, applicationIndex) => applicationIndex !== index);
    applyDesignApplications(next);
    setActiveDesign((current) =>
      Math.max(0, Math.min(current > index ? current - 1 : current, next.length - 1)),
    );
  }

  async function queueDesignFile(event: ChangeEvent<HTMLInputElement>, index?: number) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      setPendingDesign({ attachment: await readDesignAttachment(file), index });
      setAttachmentError('');
    } catch (cause) {
      setAttachmentError(
        cause instanceof Error ? cause.message : 'No se pudo adjuntar el archivo.',
      );
    } finally {
      event.target.value = '';
    }
  }

  function confirmDesignMethod(method: Customization) {
    if (!pendingDesign) return;
    const targetIndex =
      pendingDesign.index ??
      Math.max(
        0,
        designApplications.findIndex((application) => !application.attachment),
      );
    const isNew = pendingDesign.index === undefined && designApplications[targetIndex]?.attachment;
    const index = isNew ? designApplications.length : targetIndex;
    const next = isNew
      ? [
          ...designApplications,
          {
            placement: defaultDesignPlacement(index),
            attachment: pendingDesign.attachment,
            method,
            widthCm: 8,
            heightCm: 5,
          },
        ]
      : designApplications.map((application, applicationIndex) =>
          applicationIndex === index
            ? { ...application, attachment: pendingDesign.attachment, method }
            : application,
        );
    applyDesignApplications(next);
    setActiveDesign(index);
    setPendingDesign(undefined);
  }

  return (
    <>
      <div className="quote-personalization-layout">
        <div className="quote-personalization-controls">
          <ColorPicker
            value={garment.color}
            onChange={(color) =>
              setValue(garmentField(path, 'color'), color, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <div className="quote-design-summary" aria-label="Resumen de logos">
            <h3>Logos agregados</h3>
            {designApplications.some((application) => application.attachment) ? (
              designApplications.map((application, index) =>
                application.attachment ? (
                  <div
                    className="quote-design-summary-row"
                    key={`${application.attachment.name}-${index}`}
                  >
                    <button
                      type="button"
                      className={activeDesign === index ? 'selected' : ''}
                      aria-label={`Editar Logo ${index + 1} desde el resumen`}
                      onClick={() => setActiveDesign(index)}
                    >
                      {application.attachment.mediaType.startsWith('image/') ? (
                        <img src={application.attachment.dataUrl} alt="" />
                      ) : (
                        <span>PDF</span>
                      )}
                    </button>
                    <span className="quote-design-summary-name">
                      <strong>Logo {index + 1}</strong>
                      <small>
                        {application.method ? customizationLabels[application.method] : ''}
                      </small>
                    </span>
                    <label>
                      <span>Ancho</span>
                      <span className="quote-design-size-input">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          step="0.5"
                          aria-label={`Ancho del Logo ${index + 1} en centímetros`}
                          value={application.widthCm}
                          onChange={(event) =>
                            updateDesignApplication(index, {
                              widthCm: Number(event.target.value) || 1,
                            })
                          }
                        />
                        <small>cm</small>
                      </span>
                    </label>
                    <label>
                      <span>Alto</span>
                      <span className="quote-design-size-input">
                        <input
                          type="number"
                          min="1"
                          max="100"
                          step="0.5"
                          aria-label={`Alto del Logo ${index + 1} en centímetros`}
                          value={application.heightCm}
                          onChange={(event) =>
                            updateDesignApplication(index, {
                              heightCm: Number(event.target.value) || 1,
                            })
                          }
                        />
                        <small>cm</small>
                      </span>
                    </label>
                  </div>
                ) : null,
              )
            ) : (
              <p>Aún no has agregado logos.</p>
            )}
          </div>
          <div className="quote-design-upload-state">
            <div className="quote-design-hidden-inputs" aria-hidden="true">
              <input
                ref={newDesignFileInput}
                type="file"
                tabIndex={-1}
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => void queueDesignFile(event)}
              />
              {designApplications.map((_, index) => (
                <input
                  key={index}
                  ref={(element) => {
                    designFileInputs.current[index] = element;
                  }}
                  type="file"
                  tabIndex={-1}
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => void queueDesignFile(event, index)}
                />
              ))}
            </div>
            {attachmentError && <p className="quote-inline-error">{attachmentError}</p>}
          </div>
        </div>
        <DesignPlacementPreview
          attachment={designApplications[activeDesign]?.attachment}
          applications={designApplications}
          activeApplication={activeDesign}
          color={garment.color}
          garmentImage={garmentImage}
          garmentAlt={garmentAlt}
          placement={designApplications[activeDesign]?.placement ?? ''}
          onSelectApplication={setActiveDesign}
          onAddApplication={addDesignApplication}
          onDeleteApplication={removeDesignApplication}
          onRequestUpload={() => designFileInputs.current[activeDesign]?.click()}
          onSizeChange={(widthCm, heightCm) =>
            updateDesignApplication(activeDesign, { widthCm, heightCm })
          }
          onPlacementChange={(placement) => updateDesignApplication(activeDesign, { placement })}
        />
      </div>
      {pendingDesign ? (
        <div className="quote-color-modal-backdrop" role="presentation">
          <section
            className="quote-color-modal quote-design-method-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="quote-design-method-title"
          >
            <button
              className="quote-color-modal-close"
              type="button"
              aria-label="Cancelar carga del logo"
              onClick={() => setPendingDesign(undefined)}
            >
              ×
            </button>
            <h2 id="quote-design-method-title">¿Cómo aplicaremos este logo?</h2>
            <p>Selecciona el acabado para {pendingDesign.attachment.name}.</p>
            <div className="quote-design-method-options">
              {(Object.entries(customizationLabels) as Array<[Customization, string]>).map(
                ([method, label]) => (
                  <button type="button" key={method} onClick={() => confirmDesignMethod(method)}>
                    {label}
                  </button>
                ),
              )}
            </div>
          </section>
        </div>
      ) : null}
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
