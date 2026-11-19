import { useFormContext } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import type { DeliveryEstimateState } from './useDeliveryEstimate';
import { InputField } from './QuoteUi';

const dateLabel = (date: string) =>
  new Intl.DateTimeFormat('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Lima',
  }).format(new Date(`${date}T12:00:00-05:00`));

export function DeliveryDateField({ availability }: { availability: DeliveryEstimateState }) {
  const { register } = useFormContext<QuotationRequestDraft>();
  const { estimate, loading, error, ready, retry } = availability;
  return (
    <InputField label="Fecha de entrega">
      <input
        type="date"
        aria-label="Fecha de entrega"
        min={estimate?.earliestDate ?? undefined}
        disabled={!ready}
        aria-describedby="delivery-estimate-status"
        {...register('delivery.requiredBy')}
      />
      <small id="delivery-estimate-status" aria-live="polite">
        {loading ? (
          'Calculando la primera entrega disponible…'
        ) : error ? (
          <>
            {error}{' '}
            <button type="button" onClick={retry}>
              Volver a calcular
            </button>
          </>
        ) : estimate?.earliestDate ? (
          <>
            Entrega estimada desde el {dateLabel(estimate.earliestDate)}, si apruebas hasta el{' '}
            {dateLabel(estimate.approvalBy)}.
            {estimate.materialPending ? ' Sujeta a confirmar la tela propuesta.' : ''} La
            disponibilidad se revisará al confirmar.
          </>
        ) : estimate?.reason === 'search_limit' ? (
          'No se pudo completar el cálculo. Consulta con Perú Activa.'
        ) : (
          'No hay una fecha disponible para estas prendas. Revisa las cantidades o consulta con Perú Activa.'
        )}
      </small>
    </InputField>
  );
}
