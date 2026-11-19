import { useGarmentCalibration } from './useGarmentCalibration';
import { GarmentCalibrationNote } from './GarmentCalibrationNote';
import { lazy, Suspense, useContext, useRef, useState, type ChangeEvent } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { readDesignAttachment, type DesignAttachment } from './designAttachment';
import { ColorPicker } from './ColorPicker';
import { DesignPlacementPreview } from './DesignPlacementPreview';
import { DesignLogo } from './DesignLogo';
import { DesignSizeFields } from './DesignSizeFields';
import { prepareDesignArtwork } from './designArtwork';
import { resolveGarmentColor } from './garmentColor';
import { LogoAppearanceControls } from './LogoAppearanceControls';
import {
  parseTransform,
  serializeTransform,
  calibrationForView,
  designApplicationLabel,
  type View,
} from './designPreviewModel';
import { InputField, StepTitle } from './QuoteUi';
import { DeliveryDateField } from './DeliveryDateField';
import type { DeliveryEstimateState } from './useDeliveryEstimate';
import { findFabricOption, findPoloPreview } from './quotationCatalog';
import { garmentField, type Garment, type GarmentPath } from './quotationFormModel';
import { QuotationRequestSummary } from './QuotationRequestSummary';
import { SizeBreakdownEditor } from './SizeBreakdownEditor';
import { FieldFeedbackContext } from './FieldValidationFeedback';

const DesignTextDialog = lazy(() =>
  import('./DesignTextDialog').then((module) => ({ default: module.DesignTextDialog })),
);

type Customization = Exclude<QuotationRequestDraft['garment']['customization'], 'none'>;
const customizationLabels: Record<Customization, string> = {
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimado',
  vinyl: 'Vinil',
};

function defaultDesignPlacement(index: number, view: View): string {
  const columns = [50, 30, 70];
  const x = columns[index % columns.length];
  const y = Math.min(82, 40 + Math.floor(index / columns.length) * 14);
  return serializeTransform({ view, x, y, width: 16, height: 10 });
}

function roundCentimeters(value: number): number {
  return Math.round(value * 10) / 10;
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
  const fieldFeedback = useContext(FieldFeedbackContext);
  const { setValue, control } = useFormContext<QuotationRequestDraft>();
  const garment = useWatch({ control, name: path }) as Garment;
  const calibration = useGarmentCalibration(garment);
  const [textEditor, setTextEditor] = useState<{ index?: number; view: View }>();
  const [attachmentError, setAttachmentError] = useState('');
  const [preparingDesign, setPreparingDesign] = useState(false);
  const [activeDesign, setActiveDesign] = useState(0);
  const [view, setView] = useState<View>(
    () =>
      parseTransform(garment.designApplications?.[0]?.placement ?? garment.customizationDetails)
        .view,
  );
  const [pendingDesign, setPendingDesign] = useState<{
    attachment: DesignAttachment;
    index?: number;
    view: View;
  }>();
  const designFileInputs = useRef<Array<HTMLInputElement | null>>([]);
  const newDesignFileInput = useRef<HTMLInputElement>(null);
  const poloPreview = findPoloPreview(garment);
  const fabric =
    garment.fabric.mode === 'specified'
      ? findFabricOption(garment.product, garment.fabric.name)
      : undefined;
  const garmentImage = garment.product === 'polo' ? poloPreview?.image : fabric?.image;
  const garmentAlt = garment.product === 'polo' ? poloPreview?.alt : fabric?.alt;
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
          widthCm: roundCentimeters(garment.designApplications[index].widthCm ?? 8),
          heightCm: roundCentimeters(garment.designApplications[index].heightCm ?? 5),
        }
      : {
          placement: index === 0 ? garment.customizationDetails : '',
          attachment: index === 0 ? garment.designAttachment : undefined,
          method: legacyMethods[index] ?? legacyMethods[0],
          widthCm: 8,
          heightCm: 5,
        },
  );
  const activeAttachment = designApplications[activeDesign]?.attachment;

  function applyDesignApplications(next: typeof designApplications) {
    const populated = next
      .filter((application) => application.attachment)
      .map((application) => ({
        ...application,
        widthCm: roundCentimeters(application.widthCm),
        heightCm: roundCentimeters(application.heightCm),
      }));
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

  function selectDesign(index: number) {
    setActiveDesign(index);
    setView(parseTransform(designApplications[index]?.placement ?? '').view);
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
    const uploadView = view;
    try {
      setPendingDesign({ attachment: await readDesignAttachment(file), index, view: uploadView });
      setAttachmentError('');
      fieldFeedback?.clear(garmentField(path, 'designApplications'));
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : 'No se pudo adjuntar el archivo.';
      if (fieldFeedback)
        fieldFeedback.show({ field: garmentField(path, 'designApplications'), message });
      else setAttachmentError(message);
    } finally {
      event.target.value = '';
    }
  }

  function saveDesignAttachment(
    attachment: DesignAttachment,
    method: Customization,
    surface: View,
    target?: number,
    aspectRatio?: number,
  ) {
    const empty = designApplications.findIndex((application) => !application.attachment);
    const index = target ?? (empty >= 0 ? empty : designApplications.length);
    const existing = designApplications[index];
    const widthCm = attachment.text
      ? existing?.attachment
        ? existing.widthCm
        : Math.min(16, 24 * (aspectRatio ?? 1))
      : (existing?.widthCm ?? 8);
    const heightCm = aspectRatio
      ? Math.max(1, Math.min(45, widthCm / aspectRatio))
      : (existing?.heightCm ?? 5);
    const textOrdinal = designApplications.filter(
      (application) =>
        application.attachment && parseTransform(application.placement).view === surface,
    ).length;
    const textPlacement = serializeTransform({
      view: surface,
      x: 50,
      y: Math.min(76, 38 + textOrdinal * 14),
      width: widthCm * 2,
      height: heightCm * 2,
    });
    const next = [...designApplications];
    next[index] = {
      ...existing,
      attachment,
      method,
      widthCm,
      heightCm,
      placement: existing?.attachment
        ? existing.placement
        : attachment.text
          ? textPlacement
          : defaultDesignPlacement(index, surface),
    };
    applyDesignApplications(next);
    setActiveDesign(index);
    setView(surface);
  }

  async function confirmDesignMethod(method: Customization) {
    if (!pendingDesign) return;
    const pending = pendingDesign;
    setPreparingDesign(true);
    // Dimensions describe the visible design, not the original file's empty canvas.
    const prepared = await prepareDesignArtwork(pending.attachment).catch(() => undefined);
    saveDesignAttachment(
      pending.attachment,
      method,
      pending.view,
      pending.index,
      prepared?.aspectRatio,
    );
    setPendingDesign(undefined);
    setPreparingDesign(false);
  }

  return (
    <>
      <div className="quote-personalization-layout">
        <div className="quote-personalization-controls">
          <ColorPicker
            validationField={garmentField(path, 'color')}
            value={garment.color}
            onChange={(color) =>
              setValue(garmentField(path, 'color'), color, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
          <div
            className="quote-design-summary"
            aria-label="Resumen de logos"
            data-validation-fields={[
              'customization',
              'additionalCustomizations',
              'applicationCount',
              'customizationDetails',
              'designReference',
              'designAttachment',
              'designApplications',
            ]
              .map((field) => `${path}.${field}`)
              .join(' ')}
          >
            <h3>Logos y textos</h3>
            <p>Las medidas corresponden al diseño visible, sin márgenes transparentes.</p>
            <GarmentCalibrationNote calibration={calibrationForView(calibration, view)} />
            <div className="quote-design-add-actions">
              <button type="button" onClick={addDesignApplication}>
                ＋ Subir logo
              </button>
              <button type="button" onClick={() => setTextEditor({ view })}>
                <span aria-hidden="true">T</span> Agregar texto
              </button>
            </div>
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
                      aria-label={`Editar ${designApplicationLabel(application.attachment, index)} desde el resumen`}
                      onClick={() => selectDesign(index)}
                    >
                      {application.attachment.mediaType.startsWith('image/') ? (
                        <DesignLogo attachment={application.attachment} alt="" thumbnail />
                      ) : (
                        <span>PDF</span>
                      )}
                    </button>
                    <span className="quote-design-summary-name">
                      <strong>{designApplicationLabel(application.attachment, index)}</strong>
                      <small>
                        {application.method ? customizationLabels[application.method] : ''}
                      </small>
                    </span>
                    <DesignSizeFields
                      calibration={calibrationForView(
                        calibration,
                        parseTransform(application.placement).view,
                      )}
                      attachment={application.attachment}
                      label={designApplicationLabel(application.attachment, index)}
                      name={`${path}.designApplications.${index}`}
                      widthCm={application.widthCm}
                      heightCm={application.heightCm}
                      onChange={(size) => updateDesignApplication(index, size)}
                    />
                  </div>
                ) : null,
              )
            ) : (
              <p>Agrega un logo o escribe un texto para personalizar la prenda.</p>
            )}
          </div>
          {activeAttachment?.mediaType.startsWith('image/') ? (
            <LogoAppearanceControls
              key={`${activeDesign}-${activeAttachment.name}`}
              attachment={activeAttachment}
              method={designApplications[activeDesign]?.method}
              index={activeDesign}
              color={garment.color}
              onEditText={() =>
                setTextEditor({
                  index: activeDesign,
                  view: parseTransform(designApplications[activeDesign]?.placement ?? '').view,
                })
              }
              onAttachmentChange={(attachment) =>
                updateDesignApplication(activeDesign, { attachment })
              }
              onMethodChange={(method) => updateDesignApplication(activeDesign, { method })}
            />
          ) : null}
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
          garmentBackImage={poloPreview?.backImage}
          garmentBackAlt={poloPreview?.backAlt}
          sleeve={garment.sleeve}
          placement={designApplications[activeDesign]?.placement ?? ''}
          view={view}
          onViewChange={setView}
          onSelectApplication={selectDesign}
          onAddApplication={addDesignApplication}
          onDeleteApplication={removeDesignApplication}
          onRequestUpload={() => designFileInputs.current[activeDesign]?.click()}
          onSizeChange={(widthCm, heightCm) =>
            updateDesignApplication(activeDesign, { widthCm, heightCm })
          }
          onPlacementChange={(placement) => updateDesignApplication(activeDesign, { placement })}
        />
      </div>
      {textEditor ? (
        <Suspense fallback={<p role="status">Abriendo editor de texto…</p>}>
          <DesignTextDialog
            initial={
              textEditor.index !== undefined
                ? (() => {
                    const attachment = designApplications[textEditor.index!]?.attachment;
                    return attachment?.text
                      ? {
                          ...attachment.text,
                          color: attachment.preview?.inkColor ?? attachment.text.color,
                        }
                      : undefined;
                  })()
                : undefined
            }
            initialMethod={
              textEditor.index !== undefined
                ? designApplications[textEditor.index]?.method
                : undefined
            }
            background={resolveGarmentColor(garment.color) || '#334155'}
            onClose={() => setTextEditor(undefined)}
            onSave={(attachment, method, ratio) => {
              saveDesignAttachment(attachment, method, textEditor.view, textEditor.index, ratio);
              setTextEditor(undefined);
            }}
          />
        </Suspense>
      ) : null}
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
              disabled={preparingDesign}
              onClick={() => setPendingDesign(undefined)}
            >
              ×
            </button>
            <h2 id="quote-design-method-title">¿Cómo aplicaremos este logo?</h2>
            <p>Selecciona el acabado para {pendingDesign.attachment.name}.</p>
            {preparingDesign ? <p role="status">Preparando las medidas del diseño…</p> : null}
            <div className="quote-design-method-options">
              {(Object.entries(customizationLabels) as Array<[Customization, string]>).map(
                ([method, label]) => (
                  <button
                    type="button"
                    key={method}
                    disabled={preparingDesign}
                    onClick={() => void confirmDesignMethod(method)}
                  >
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

export function ContactStep({
  number,
  email,
  availability,
}: {
  number: string;
  email?: string;
  availability: DeliveryEstimateState;
}) {
  const { register } = useFormContext<QuotationRequestDraft>();

  return (
    <>
      <StepTitle
        number={number}
        title="¿Dónde enviamos la cotización?"
        description="Indica la entrega y un dato de contacto."
      />
      <div className="mt-7 grid gap-5 sm:grid-cols-2">
        <DeliveryDateField availability={availability} />
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
