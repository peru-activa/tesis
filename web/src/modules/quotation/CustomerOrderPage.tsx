import { QuotationPdfDownloadButton } from './QuotationPdfDownloadButton';
import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { QuotationPriceBreakdown } from './QuotationPriceBreakdown';
import { QuotationRequestSummary } from './QuotationRequestSummary';
import { productionStage, trackingLabel, type CustomerTrackingItem } from './customerTracking';
import { isDeliveryDateConfirmed } from '../../../../src/domain/quotation-requests';
import { DeliveryConfirmationSummary } from './DeliveryConfirmation';
import { CustomerEmailStatus } from './CustomerEmailStatus';
import { quotationExpired } from '../../../../src/domain/delivery-estimate';

export function CustomerOrderPage({ quotationId }: { quotationId: string }) {
  const [item, setItem] = useState<CustomerTrackingItem>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const expired = item?.quotation.quotation
    ? quotationExpired(item.quotation.quotation.validUntil)
    : false;
  const [connection, setConnection] = useState<'connecting' | 'live' | 'reconnecting'>(
    'connecting',
  );

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/v1/my-orders/${quotationId}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'No se encontró este pedido.');
      setItem(payload.item);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se encontró este pedido.');
    }
  }, [quotationId]);

  useEffect(() => {
    void load();
    const apiOrigin =
      import.meta.env.VITE_API_ORIGIN ||
      (import.meta.env.DEV ? 'http://localhost:3100' : undefined);
    const socket = io(apiOrigin);
    socket.on('connect', () => {
      setConnection('live');
      void load();
    });
    socket.on('disconnect', () => setConnection('reconnecting'));
    socket.on('connect_error', () => setConnection('reconnecting'));
    socket.on('quotations.changed', () => void load());
    socket.on('orders.changed', () => void load());
    return () => {
      socket.disconnect();
    };
  }, [load]);

  async function decide(decision: 'accepted' | 'rejected') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/v1/quotation-requests/${quotationId}/decision`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'No se pudo registrar tu respuesta.');
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo registrar tu respuesta.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quote-demo customer-order-shell">
      <PeruActivaHeader homeHref="/mis-pedidos" />
      <main
        className="customer-order-main"
        data-r2-updated-at={item?.lastUpdatedAt || ''}
        data-r2-quotation-id={quotationId}
      >
        <a className="customer-back" href="/mis-pedidos">
          ← Mis pedidos
        </a>
        {!item && !error && <p className="customer-orders-message">Cargando pedido…</p>}
        {!item && error && <p className="customer-orders-error">{error}</p>}
        {item && (
          <>
            <section className="customer-order-heading">
              <div>
                <p className="quote-kicker">{item.quotation.id}</p>
                <h1>{trackingLabel(item)}</h1>
                <p>{statusDescription(item)}</p>
                <div className="customer-order-meta">
                  <span>Actualizado {formatDateTime(item.lastUpdatedAt)}</span>
                  <span>
                    {item.quotation.buyerDecision?.deliveryDate
                      ? 'Entrega confirmada '
                      : 'Entrega solicitada '}
                    {formatDate(
                      item.quotation.buyerDecision?.deliveryDate ??
                        item.quotation.request.delivery.requiredBy,
                    )}
                  </span>
                  <span className={`customer-live-state ${connection}`} aria-live="polite">
                    <i />
                    {connection === 'live' ? 'En vivo' : 'Reconectando…'}
                  </span>
                </div>
              </div>
              <span className={`quote-status ${item.quotation.status}`}>{trackingLabel(item)}</span>
            </section>

            <NextAction item={item} />
            <CustomerEmailStatus delivery={item.emailDelivery} />

            <a
              className="quote-secondary customer-copy-order"
              href={`/nueva-solicitud?copiar=${encodeURIComponent(quotationId)}`}
            >
              Repetir pedido
            </a>
            <p className="customer-copy-hint">
              Reutiliza las características y cambia cantidades, tallas y fecha. Recibirás una nueva
              cotización.
            </p>

            {item.quotation.status === 'accepted' && <ProductionProgress item={item} />}
            {item.quotation.status === 'accepted' && <GarmentAssignments item={item} />}

            {item.quotation.quotation && (
              <section className="customer-quotation-card">
                <p className="quote-kicker">
                  {item.quotation.status === 'quoted'
                    ? 'COTIZACIÓN PARA REVISAR'
                    : item.quotation.status === 'accepted'
                      ? 'COTIZACIÓN ACEPTADA'
                      : 'COTIZACIÓN REGISTRADA'}
                </p>
                <QuotationPriceBreakdown request={item.quotation} />
                <QuotationPdfDownloadButton quotationId={quotationId} />
                <dl>
                  <div>
                    <dt>Tela ofrecida</dt>
                    <dd>{item.quotation.quotation.selectedFabric}</dd>
                  </div>
                  <div>
                    <dt>Válida hasta</dt>
                    <dd>{item.quotation.quotation.validUntil}</dd>
                  </div>
                </dl>
                <p>{item.quotation.quotation.conditions}</p>
                <DeliveryConfirmationSummary
                  quotation={item.quotation.quotation}
                  requiredBy={item.quotation.request.delivery.requiredBy}
                  accepted={item.quotation.status === 'accepted'}
                />
                {item.quotation.status === 'accepted' ? (
                  <p className="customer-color-sample-note">
                    <strong>Siguiente paso:</strong> cuando se firme el contrato, enviaremos la
                    muestra física sin costo para confirmar el color final.
                  </p>
                ) : null}
                {error && <p className="customer-orders-error">{error}</p>}
                {item.quotation.status === 'quoted' ? (
                  <div className="customer-decision-actions">
                    {expired && (
                      <p>La cotización venció. Solicita a Perú Activa una propuesta actualizada.</p>
                    )}
                    <button
                      className="quote-secondary"
                      disabled={busy}
                      onClick={() => void decide('rejected')}
                    >
                      Rechazar
                    </button>
                    <button
                      className="quote-primary"
                      disabled={
                        busy ||
                        expired ||
                        !isDeliveryDateConfirmed(
                          item.quotation.quotation,
                          item.quotation.request.delivery.requiredBy,
                        )
                      }
                      onClick={() => void decide('accepted')}
                    >
                      {busy ? 'Guardando…' : 'Aceptar cotización'} <span>✓</span>
                    </button>
                  </div>
                ) : null}
              </section>
            )}

            <StatusHistory item={item} />

            <section className="quote-sheet customer-request-summary">
              <div>
                <p className="quote-kicker">TU SOLICITUD</p>
                <h2>Detalle enviado</h2>
              </div>
              <QuotationRequestSummary
                draft={item.quotation.request}
                showPendingPrice={!item.quotation.quotation}
              />
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function statusDescription(item: CustomerTrackingItem) {
  const request = item.quotation;
  const stage = productionStage(item);
  if (request.status === 'accepted' && stage === 3) {
    return 'La producción terminó. Este pedido queda guardado en tu historial.';
  }
  if (request.status === 'accepted' && stage === 2) {
    return 'Tu pedido está en producción. Aquí verás sus avances.';
  }
  if (request.status === 'accepted')
    return 'Tu pedido está confirmado. Estamos preparando el inicio de producción.';
  if (request.status === 'pending_quote') return 'Perú Activa está preparando el precio.';
  if (request.status === 'quoted') return 'Revisa el precio y responde cuando estés listo.';
  if (request.status === 'rejected') return 'Registramos que no aceptaste esta cotización.';
  return request.production?.message || 'Perú Activa continuará con la coordinación del pedido.';
}

function NextAction({ item }: { item: CustomerTrackingItem }) {
  const request = item.quotation;
  const stage = productionStage(item);
  let title = 'No necesitas hacer nada por ahora';
  let description = 'Te avisaremos aquí cuando Perú Activa registre el siguiente cambio.';

  if (request.status === 'quoted') {
    title = 'Revisa y responde la cotización';
    description = 'Revisa el precio, el plazo y las condiciones. Al aceptar, confirmas tu pedido.';
  } else if (request.status === 'rejected') {
    title = 'La cotización quedó rechazada';
    description = 'Crea una nueva solicitud si deseas pedir otra propuesta.';
  } else if (request.status === 'accepted' && stage === 3) {
    title = 'La producción terminó';
    description = 'Perú Activa coordinará contigo la entrega del pedido.';
  } else if (request.status === 'accepted' && stage === 2) {
    title = 'Tu pedido está en producción';
    description = request.buyerDecision?.deliveryDate
      ? `La entrega confirmada es el ${formatDate(request.buyerDecision.deliveryDate)}.`
      : `La entrega solicitada es el ${formatDate(request.request.delivery.requiredBy)}.`;
  }

  return (
    <section className="customer-next-action" aria-labelledby="customer-next-action-title">
      <span aria-hidden="true">→</span>
      <div>
        <h2 id="customer-next-action-title">{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}

function ProductionProgress({ item }: { item: CustomerTrackingItem }) {
  const currentIndex = Math.max(0, productionStage(item) - 1);
  const stages = ['Pedido confirmado', 'En producción', 'Terminado'];
  return (
    <section className="customer-production-progress" aria-labelledby="production-progress-title">
      <h2 id="production-progress-title">Progreso de producción</h2>
      <ol>
        {stages.map((label, index) => {
          const state =
            index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';
          return (
            <li
              className={state}
              key={label}
              aria-current={state === 'current' ? 'step' : undefined}
            >
              <span aria-hidden="true">{state === 'complete' ? '✓' : index + 1}</span>
              <b>{label}</b>
              <small>
                {state === 'current'
                  ? 'Etapa actual'
                  : state === 'complete'
                    ? 'Completado'
                    : 'Pendiente'}
              </small>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function GarmentAssignments({ item }: { item: CustomerTrackingItem }) {
  const garments = [item.quotation.request.garment, ...item.quotation.request.additionalGarments];
  const labels = {
    registered: 'En preparación',
    recommended: 'En preparación',
    assigned: 'En preparación',
    in_production: 'En producción',
    completed: 'Terminado',
  };
  return (
    <section className="customer-garment-assignments" aria-label="Avance por prenda">
      <h2>Avance por prenda</h2>
      {garments.map((garment, index) => {
        const order =
          item.productionOrders.find((entry) => entry.garmentIndex === index) ??
          (item.productionOrders.every((entry) => entry.garmentIndex === undefined)
            ? item.productionOrders[index]
            : undefined);
        return (
          <article key={index}>
            <strong>
              {garment.product === 'polo' ? 'Polos' : 'Buzos'} · {garment.quantity} unidades ·{' '}
              {garment.model}
            </strong>
            <span>{order ? labels[order.status] : 'En preparación'}</span>
          </article>
        );
      })}
    </section>
  );
}

function StatusHistory({ item }: { item: CustomerTrackingItem }) {
  return (
    <section className="customer-status-history" aria-labelledby="status-history-title">
      <div>
        <p className="quote-kicker">HISTORIAL</p>
        <h2 id="status-history-title">Cambios registrados</h2>
      </div>
      <ol>
        {item.timeline.map((event) => (
          <li className={event.status} key={event.key}>
            <span aria-hidden="true" />
            <div>
              <strong>{event.label}</strong>
              <time dateTime={event.occurredAt}>{formatDateTime(event.occurredAt)}</time>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Lima',
  });
}
