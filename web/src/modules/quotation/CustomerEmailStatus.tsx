import type { CustomerEmailDelivery } from '../../../../src/domain/customer-email';
import { customerEmailEventOrder } from '../../../../src/domain/customer-email-events';

export function CustomerEmailStatus({ delivery }: { delivery?: CustomerEmailDelivery }) {
  const messages = delivery?.messages?.filter((message) => message.state !== 'superseded') ?? [];
  const latest = messages
    .toSorted(
      (a, b) =>
        a.createdAt.localeCompare(b.createdAt) ||
        customerEmailEventOrder[a.kind] - customerEmailEventOrder[b.kind],
    )
    .at(-1);
  if (!latest) return null;
  const labels = {
    request_received: 'Constancia por correo',
    quotation_issued: 'Cotización por correo',
    order_confirmed: 'Confirmación por correo',
    order_ready: 'Pedido listo por correo',
  };
  const label = labels[latest.kind];
  const descriptions = {
    pending: 'Preparando el envío.',
    processing: 'Enviando el correo.',
    accepted: 'Correo enviado. Revisa tu bandeja.',
    failed: 'No se pudo enviar. La solicitud sigue disponible en el portal.',
    uncertain: 'No pudimos confirmar el envío. Revisa tu bandeja de correo.',
    superseded: '',
  };
  return (
    <p role="status">
      <strong>{label}:</strong> {descriptions[latest.state]}
    </p>
  );
}
