import { zodResolver } from '@hookform/resolvers/zod';
import { useRef, useState, type FormEvent } from 'react';
import { FormProvider, useForm, useWatch, type FieldPath } from 'react-hook-form';
import {
  quotationRequestDraftSchema,
  type QuotationRequestDraft,
} from '../../../../src/domain/quotation-requests';
import { ErrorMessage, dateAfter } from './QuoteUi';
import { FormErrorSummary } from './FormErrorSummary';
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

interface QuotationRequestFormProps {
  busy: boolean;
  error: string;
  onSubmit: (draft: QuotationRequestDraft) => Promise<void>;
}

interface FormStep {
  label: string;
  fields: FieldPath<QuotationRequestDraft>[];
  content: React.ReactNode;
}

export function QuotationRequestForm({ busy, error, onSubmit }: QuotationRequestFormProps) {
  const form = useForm<QuotationRequestDraft>({
    resolver: zodResolver(quotationRequestDraftSchema),
    defaultValues: createEmptyDraft(dateAfter(14)),
    mode: 'onChange',
  });
  const [step, setStep] = useState(1);
  const [hasGarments, setHasGarments] = useState(false);
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const primaryProduct = useWatch({ control: form.control, name: 'garment.product' });
  const additionalGarments = useWatch({ control: form.control, name: 'additionalGarments' });
  const garments = hasGarments
    ? [
        { path: 'garment' as const, product: primaryProduct },
        ...additionalGarments.map((garment, index) => ({
          path: `additionalGarments.${index}` as GarmentPath,
          product: garment.product,
        })),
      ]
    : [];
  const detailSteps = garments.reduce<FormStep[]>((result, garment, index) => {
    result.push(...createGarmentSteps(garment.path, garment.product, index + 1, 2 + result.length));
    return result;
  }, []);
  const contactStepNumber = 2 + detailSteps.length;
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
      garmentField(garment.path, 'applicationCount'),
      garmentField(garment.path, 'customizationDetails'),
      garmentField(garment.path, 'designReference'),
      garmentField(garment.path, 'designAttachment'),
    ]),
    ...contactFields,
  ];
  const steps: FormStep[] = [
    {
      label: 'Agrega las prendas',
      fields: garments.flatMap((garment) => [
        garmentField(garment.path, 'product'),
        garmentField(garment.path, 'quantity'),
        ...(garment.product === 'polo'
          ? [
              garmentField(garment.path, 'model'),
              garmentField(garment.path, 'audience'),
              garmentField(garment.path, 'sleeve'),
              garmentField(garment.path, 'cut'),
              garmentField(garment.path, 'fabric'),
            ]
          : []),
      ]),
      content: <ProductStep hasGarments={hasGarments} onHasGarmentsChange={setHasGarments} />,
    },
    ...detailSteps,
    {
      label: 'Entrega',
      fields: contactFields,
      content: <ContactStep number={formatStepNumber(contactStepNumber)} />,
    },
    {
      label: 'Revisión',
      fields: submissionFields,
      content: <ReviewStep number={formatStepNumber(contactStepNumber + 1)} />,
    },
  ];
  const currentStep = steps[step - 1] ?? steps[0];

  async function nextStep() {
    if (!currentStep || (step === 1 && !hasGarments)) return;
    if (await form.trigger(currentStep.fields)) {
      setStep((current) => Math.min(current + 1, steps.length));
      return;
    }
    focusErrorSummary();
  }

  function focusErrorSummary() {
    requestAnimationFrame(() => errorSummaryRef.current?.focus());
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step < steps.length) {
      await nextStep();
      return;
    }
    await form.handleSubmit(onSubmit, focusErrorSummary)();
  }

  return (
    <FormProvider {...form}>
      <form className="quote-form-shell mx-auto max-w-5xl" noValidate onSubmit={handleFormSubmit}>
        <ProgressBar step={step} labels={steps.map((item) => item.label)} />
        <section className="quote-sheet">
          {currentStep?.content}
          <FormErrorSummary
            ref={errorSummaryRef}
            errors={form.formState.errors}
            fields={currentStep?.fields ?? []}
          />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="quote-step-actions mt-8 flex items-center justify-between border-t border-slate-200 pt-5">
            {step > 1 ? (
              <button
                className="quote-secondary"
                type="button"
                disabled={busy}
                onClick={() => setStep((current) => Math.max(1, current - 1))}
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
                disabled={busy || (step === 1 && !hasGarments)}
              >
                Continuar <span>→</span>
              </button>
            ) : (
              <button className="quote-primary" type="submit" disabled={busy}>
                {busy ? 'Enviando…' : 'Solicitar cotización'} <span>→</span>
              </button>
            )}
          </div>
        </section>
      </form>
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
      label: `${label} ${garmentNumber} · tallas`,
      fields: [garmentField(path, 'sizes')],
      content: <QuantityStep path={path} number={formatStepNumber(detailStart)} />,
    },
    {
      label: `${label} ${garmentNumber} · diseño`,
      fields: [
        garmentField(path, 'color'),
        garmentField(path, 'fabric'),
        garmentField(path, 'customization'),
        garmentField(path, 'applicationCount'),
        garmentField(path, 'customizationDetails'),
        garmentField(path, 'designReference'),
        garmentField(path, 'designAttachment'),
      ],
      content: <DesignStep path={path} number={formatStepNumber(detailStart + 1)} />,
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
