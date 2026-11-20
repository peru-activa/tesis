import type { UseFormRegister } from 'react-hook-form';
import {
  isDeliveryDateConfirmed,
  type SellerQuotationDraft,
} from '../../../../src/domain/quotation-requests';

export function DeliveryConfirmationField({
  requiredBy,
  register,
}: {
  requiredBy: string;
  register: UseFormRegister<SellerQuotationDraft>;
}) {
  return (
    <fieldset className="quote-delivery-confirmation">
      <legend>Confirmación del plazo</legend>
      <input type="hidden" {...register('deliveryConfirmation.requiredBy')} />
      <label>
        <input
          type="checkbox"
          {...register('deliveryConfirmation.confirmed', { validate: (value) => value === true })}
        />
        <span>
          Perú Activa confirma que puede atender la entrega solicitada para el{' '}
          {formatDate(requiredBy)}.
        </span>
      </label>
      <small>
        Revisa el plazo antes de confirmarlo. La estimación del sistema no sustituye esta revisión.
      </small>
    </fieldset>
  );
}

export function DeliveryConfirmationSummary({
  quotation,
  requiredBy,
  accepted = false,
}: {
  quotation: SellerQuotationDraft;
  requiredBy: string;
  accepted?: boolean;
}) {
  const confirmed = isDeliveryDateConfirmed(quotation, requiredBy);
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
