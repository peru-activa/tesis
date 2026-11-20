import { useEffect, useState } from 'react';
import { useWatch, type Control, type UseFormRegister } from 'react-hook-form';
import { fetchAsPeruActiva } from '../../lib/actor-api';
import {
  isDeliveryDateConfirmed,
  type SellerQuotationDraft,
  type SellerQuotation,
  sellerQuotationDraftSchema,
} from '../../../../src/domain/quotation-requests';

export function DeliveryConfirmationField({
  requiredBy,
  register,
  quotationId,
  control,
}: {
  requiredBy: string;
  register: UseFormRegister<SellerQuotationDraft>;
  quotationId: string;
  control: Control<SellerQuotationDraft>;
}) {
  const values = useWatch({ control });
  const parsed = sellerQuotationDraftSchema.safeParse({
    ...values,
    deliveryConfirmation: undefined,
  });
  const payload = parsed.success ? JSON.stringify(parsed.data) : '';
  const [preview, setPreview] = useState<{ payload: string; days?: number; error?: string }>();
  useEffect(() => {
    if (!payload) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void fetchAsPeruActiva(`/v1/quotation-requests/${quotationId}/quotation-preview`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
        signal: controller.signal,
      })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.message || 'No se pudo calcular el plazo.');
          if (!controller.signal.aborted)
            setPreview({ payload, days: result.quotation.deliveryTerms?.calendarDays });
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted) setPreview({ payload, error: error.message });
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [payload, quotationId]);
  const current = preview?.payload === payload ? preview : undefined;
  return (
    <fieldset className="quote-delivery-confirmation">
      <legend>Confirmación del plazo</legend>
      <p>
        {current?.days
          ? `Entrega: ${current.days} días calendario desde la aceptación.`
          : current?.error ||
            (payload ? 'Calculando plazo…' : 'Completa la cotización para calcular el plazo.')}
      </p>
      <input type="hidden" {...register('deliveryConfirmation.requiredBy')} />
      <label>
        <input
          type="checkbox"
          disabled={!current?.days || Boolean(current.error)}
          {...register('deliveryConfirmation.confirmed', { validate: (value) => value === true })}
        />
        <span>Confirmo que el plazo cumple la fecha solicitada: {formatDate(requiredBy)}.</span>
      </label>
    </fieldset>
  );
}

export function DeliveryConfirmationSummary({
  quotation,
  requiredBy,
  accepted = false,
}: {
  quotation: SellerQuotationDraft & Pick<Partial<SellerQuotation>, 'deliveryTerms'>;
  requiredBy: string;
  accepted?: boolean;
}) {
  const confirmed = isDeliveryDateConfirmed(quotation, requiredBy);
  if (confirmed && quotation.deliveryTerms)
    return (
      <div className="quote-delivery-summary confirmed">
        <strong>Plazo de entrega</strong>
        <span>{quotation.deliveryTerms.calendarDays} días calendario desde la aceptación</span>
      </div>
    );
  return (
    <div className={`quote-delivery-summary ${confirmed ? 'confirmed' : 'pending'}`}>
      <strong>
        {confirmed
          ? 'Fecha de entrega confirmada por Perú Activa'
          : 'Fecha de entrega pendiente de confirmación'}
      </strong>
      <span>{formatDate(requiredBy)}</span>
      {!confirmed && (
        <p>
          {accepted
            ? 'Esta cotización no incluye una confirmación expresa de fecha. Consulta el plazo con Perú Activa.'
            : 'Perú Activa debe confirmar expresamente esta fecha y actualizar la cotización antes de que la aceptes.'}
        </p>
      )}
    </div>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}
