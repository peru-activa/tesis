import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import {
  quotationRequestDraftSchema,
  type QuotationRequestDraft,
} from '../../../../src/domain/quotation-requests';
import { ErrorMessage } from './QuoteUi';
import { useDeliveryEstimate } from './useDeliveryEstimate';
import {
  FieldValidationFeedback,
  FieldFeedbackContext,
  firstFieldIssue,
  type ValidationRequest,
} from './FieldValidationFeedback';
import { ProductStep } from './ProductStep';
import {
  ContactStep,
  DesignStep,
  ModelStep,
  QuantityStep,
  ReviewStep,
} from './QuotationDetailSteps';
import type { Product } from './quotationCatalog';
import { createEmptyDraft, garmentField, type GarmentPath } from './quotationFormModel';
import {
  clearQuotationSession,
  loadQuotationSession,
  saveQuotationSession,
} from './quotationSession';

interface QuotationRequestFormProps {
  busy: boolean;
  error: string;
  onSubmit: (draft: QuotationRequestDraft) => Promise<void | boolean>;
  deliveryRevision?: number;
  authenticatedEmail?: string;
  customerProfile?:
    Pick<QuotationRequestDraft['customer'], 'contactName' | 'businessName'> | undefined;
  initialDraft?: QuotationRequestDraft;
}

interface FormStep {
  label: string;
  fields: FieldPath<QuotationRequestDraft>[];
  content: React.ReactNode;
}

export function QuotationRequestForm({
  busy,
  error,
  onSubmit,
  authenticatedEmail,
  customerProfile,
  initialDraft,
  deliveryRevision = 0,
}: QuotationRequestFormProps) {
  const [restoredSession] = useState(() => {
    const restored = loadQuotationSession(window.sessionStorage);
    if (authenticatedEmail && restored?.draft.customer?.contact !== authenticatedEmail)
      return undefined;
    return restored;
  });
  const form = useForm<QuotationRequestDraft>({
    resolver: zodResolver(quotationRequestDraftSchema),
    defaultValues: initialDraft ?? restoredSession?.draft ?? createEmptyDraft(''),
    mode: 'onChange',
    shouldFocusError: false,
  });
  const [step, setStep] = useState(initialDraft ? 1 : (restoredSession?.step ?? 1));
  const [hasGarments, setHasGarments] = useState(
    Boolean(initialDraft) || (restoredSession?.hasGarments ?? false),
  );
  const formRef = useRef<HTMLFormElement>(null);
  const validationAttempt = useRef(0);
  const [validationRequest, setValidationRequest] = useState<ValidationRequest>();
  const primaryProduct = useWatch({ control: form.control, name: 'garment.product' });
  const additionalGarments = useWatch({ control: form.control, name: 'additionalGarments' });
  const draft = useWatch({ control: form.control });
  const garments = hasGarments
    ? [
        { path: 'garment' as const, product: primaryProduct },
        ...additionalGarments.map((garment, index) => ({
          path: `additionalGarments.${index}` as GarmentPath,
          product: garment.product,
        })),
      ]
    : [];

  useEffect(() => {
    if (initialDraft) {
      form.reset(structuredClone(initialDraft));
      setHasGarments(true);
      setStep(1);
    }
  }, [initialDraft, form]);

  useEffect(() => {
    if (authenticatedEmail) {
      form.setValue('customer.contact', authenticatedEmail, { shouldValidate: true });
    }
    if (customerProfile) {
      for (const field of ['contactName', 'businessName'] as const) {
        if (!form.getValues(`customer.${field}`))
          form.setValue(`customer.${field}`, customerProfile[field], { shouldValidate: true });
      }
    }
  }, [authenticatedEmail, customerProfile, initialDraft, form]);
  const detailSteps = garments.reduce<FormStep[]>((result, garment, index) => {
    result.push(...createGarmentSteps(garment.path, garment.product, index + 1, 2 + result.length));
    return result;
  }, []);
  const contactStepNumber = 2 + detailSteps.length;
  const availability = useDeliveryEstimate(
    form.getValues(),
    hasGarments && step >= contactStepNumber,
    deliveryRevision,
  );

  useEffect(() => {
    const minimum = availability.estimate?.earliestDate;
    const selected = form.getValues('delivery.requiredBy');
    if (minimum && selected && selected < minimum) {
      form.setValue('delivery.requiredBy', '', { shouldDirty: true, shouldValidate: true });
    }
  }, [availability.estimate, form]);
  const contactFields: FieldPath<QuotationRequestDraft>[] = [
    'delivery.requiredBy',
    'delivery.location',
    'customer.contactName',
    'customer.businessName',
    'customer.contact',
  ];
  const submissionFields: FieldPath<QuotationRequestDraft>[] = [
    ...garments.flatMap((garment) => [
      garmentField(garment.path, 'product'),
      garmentField(garment.path, 'model'),
      garmentField(garment.path, 'audience'),
      garmentField(garment.path, 'sleeve'),
      garmentField(garment.path, 'cut'),
      garmentField(garment.path, 'quantity'),
      garmentField(garment.path, 'sizes'),
      garmentField(garment.path, 'color'),
      garmentField(garment.path, 'fabric'),
      garmentField(garment.path, 'customization'),
      garmentField(garment.path, 'additionalCustomizations'),
      garmentField(garment.path, 'applicationCount'),
      garmentField(garment.path, 'customizationDetails'),
      garmentField(garment.path, 'designReference'),
      garmentField(garment.path, 'designAttachment'),
      garmentField(garment.path, 'designApplications'),
    ]),
    ...contactFields,
  ];
  const steps: FormStep[] = [
    {
      label: 'Agrega las prendas',
      fields: garments.flatMap((garment) => [
        garmentField(garment.path, 'product'),
        ...(garment.product === 'polo'
          ? [
              garmentField(garment.path, 'model'),
              garmentField(garment.path, 'cut'),
              garmentField(garment.path, 'audience'),
              garmentField(garment.path, 'sleeve'),
              garmentField(garment.path, 'fabric'),
            ]
          : []),
        garmentField(garment.path, 'quantity'),
      ]),
      content: <ProductStep hasGarments={hasGarments} onHasGarmentsChange={setHasGarments} />,
    },
    ...detailSteps,
    {
      label: 'Entrega',
      fields: contactFields,
      content: (
        <ContactStep
          number={formatStepNumber(contactStepNumber)}
          email={authenticatedEmail}
          availability={availability}
        />
      ),
    },
    {
      label: 'Revisión',
      fields: submissionFields,
      content: <ReviewStep number={formatStepNumber(contactStepNumber + 1)} />,
    },
  ];
  const currentStep = steps[step - 1] ?? steps[0];

  useEffect(() => {
    if (step > steps.length) setStep(steps.length);
  }, [step, steps.length]);

  useEffect(() => {
    saveQuotationSession(window.sessionStorage, {
      draft: draft as QuotationRequestDraft,
      hasGarments,
      step,
    });
  }, [draft, hasGarments, step]);

  function validateDeliveryDate() {
    const selected = form.getValues('delivery.requiredBy');
    const minimum = availability.estimate?.earliestDate;
    if (selected && minimum && selected < minimum) {
      form.setError('delivery.requiredBy', {
        type: 'delivery',
        message: `Elige una fecha desde el ${minimum}.`,
      });
      showFieldError(['delivery.requiredBy']);
      return false;
    }
    return true;
  }

  async function nextStep() {
    if (!currentStep || (step === 1 && !hasGarments)) return;
    if (step === contactStepNumber && (!availability.ready || !validateDeliveryDate())) return;
    if (await form.trigger(currentStep.fields)) {
      setValidationRequest(undefined);
      setStep((current) => Math.min(current + 1, steps.length));
      return;
    }
    showFieldError(currentStep.fields);
  }

  function showFieldError(fields: FieldPath<QuotationRequestDraft>[]) {
    const issue = fields
      .map((field) => firstFieldIssue(form.getFieldState(field).error, field))
      .find(Boolean);
    if (!issue) return;
    activateField(issue.field);
  }

  function activateField(fieldPath: string, message?: string) {
    const targetStep = steps.findIndex((item) =>
      item.fields.some((field) => fieldPath === field || fieldPath.startsWith(`${field}.`)),
    );
    if (
      targetStep >= 0 &&
      (step === steps.length ||
        !currentStep?.fields.some(
          (field) => fieldPath === field || fieldPath.startsWith(`${field}.`),
        ))
    )
      setStep(targetStep + 1);
    setValidationRequest({
      field: fieldPath,
      attempt: ++validationAttempt.current,
      ...(message ? { message } : {}),
    });
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length) {
      await nextStep();
      return;
    }
    if (!availability.ready) {
      setStep(contactStepNumber);
      return;
    }
    await form.handleSubmit(
      async (values) => {
        if (!validateDeliveryDate()) return;
        if ((await onSubmit(values)) !== false) clearQuotationSession(window.sessionStorage);
      },
      () => showFieldError(steps.slice(0, -1).flatMap((item) => item.fields)),
    )();
  }

  return (
    <FormProvider {...form}>
      <FieldFeedbackContext.Provider
        value={{
          show: ({ field, message }) => activateField(field, message),
          clear: (field) =>
            setValidationRequest((current) =>
              current?.message && current.field === field ? undefined : current,
            ),
        }}
      >
        <form
          ref={formRef}
          className="quote-form-shell mx-auto max-w-5xl"
          noValidate
          onSubmit={handleFormSubmit}
        >
          <ProgressBar step={step} labels={steps.map((item) => item.label)} />
          <section className={`quote-sheet${step === 1 && !hasGarments ? ' product-empty' : ''}`}>
            {currentStep?.content}
            <FieldValidationFeedback request={validationRequest} formRef={formRef} />
            {error && <ErrorMessage>{error}</ErrorMessage>}
            <div className="quote-step-actions mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
              {step > 1 ? (
                <button
                  className="quote-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setValidationRequest(undefined);
                    setStep((current) => Math.max(1, current - 1));
                  }}
                >
                  Atrás
                </button>
              ) : (
                <span />
              )}
              {step < steps.length ? (
                <button
                  className="quote-primary"
                  type="submit"
                  disabled={
                    busy ||
                    (step === 1 && !hasGarments) ||
                    (step === contactStepNumber && !availability.ready)
                  }
                >
                  Continuar <span>→</span>
                </button>
              ) : (
                <button
                  className="quote-primary"
                  type="submit"
                  disabled={busy || !availability.ready}
                >
                  {busy ? 'Enviando…' : 'Solicitar cotización'} <span>→</span>
                </button>
              )}
            </div>
          </section>
        </form>
      </FieldFeedbackContext.Provider>
    </FormProvider>
  );
}

function createGarmentSteps(
  path: GarmentPath,
  product: Product,
  garmentNumber: number,
  start: number,
): FormStep[] {
  const label = product === 'polo' ? 'Polo' : 'Buzo';
  const steps: FormStep[] = [];

  if (product === 'buzo') {
    steps.push({
      label: `${label} ${garmentNumber} · modelo`,
      fields: [
        garmentField(path, 'model'),
        garmentField(path, 'audience'),
        garmentField(path, 'sleeve'),
        garmentField(path, 'cut'),
      ],
      content: <ModelStep path={path} number={formatStepNumber(start)} />,
    });
  }

  const detailStart = start + steps.length;
  steps.push(
    {
      label: `${label} ${garmentNumber} · personalización`,
      fields: [
        garmentField(path, 'color'),
        garmentField(path, 'fabric'),
        garmentField(path, 'customization'),
        garmentField(path, 'additionalCustomizations'),
        garmentField(path, 'applicationCount'),
        garmentField(path, 'customizationDetails'),
        garmentField(path, 'designReference'),
        garmentField(path, 'designAttachment'),
        garmentField(path, 'designApplications'),
      ],
      content: <DesignStep path={path} />,
    },
    {
      label: `${label} ${garmentNumber} · tallas`,
      fields: [garmentField(path, 'sizes')],
      content: <QuantityStep path={path} number={formatStepNumber(detailStart + 1)} />,
    },
  );

  return steps;
}

function ProgressBar({ step, labels }: { step: number; labels: string[] }) {
  return (
    <div
      className="quote-progress"
      aria-label={`Paso ${step} de ${labels.length}: ${labels[step - 1]}`}
    >
      <div>
        <span>
          Paso {step} de {labels.length}
        </span>
        <strong>{labels[step - 1]}</strong>
      </div>
      <ol style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }}>
        {labels.map((label, index) => (
          <li key={`${label}-${index}`} className={index < step ? 'complete' : ''}>
            <span />
          </li>
        ))}
      </ol>
    </div>
  );
}

function formatStepNumber(value: number): string {
  return String(value).padStart(2, '0');
}
