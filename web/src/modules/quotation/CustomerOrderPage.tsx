import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { QuotationPriceBreakdown } from './QuotationPriceBreakdown';
import { QuotationRequestSummary } from './QuotationRequestSummary';
import { trackingLabel, type CustomerTrackingItem } from './customerTracking';

export function CustomerOrderPage({ quotationId }: { quotationId: string }) {
  const [item, setItem] = useState<CustomerTrackingItem>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
                    Entrega solicitada {formatDate(item.quotation.request.delivery.requiredBy)}
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

            {item.productionOrders.length > 0 && <ProductionProgress item={item} />}

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
                {item.quotation.status === 'accepted' ? (
                  <p className="customer-color-sample-note">
                    Cuando firmes el contrato, te enviaremos gratuitamente una muestra física para
                    confirmar el color final.
                  </p>
                ) : null}
                {error && <p className="customer-orders-error">{error}</p>}
                {item.quotation.status === 'quoted' ? (
                  <div className="customer-decision-actions">
                    <button
                      className="quote-secondary"
                      disabled={busy}
                      onClick={() => void decide('rejected')}
                    >
                      Rechazar
                    </button>
                    <button
                      className="quote-primary"
                      disabled={busy}
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
  const production = item.productionOrders[0];
  if (production?.status === 'completed') {
    return 'La producción terminó. Este pedido queda guardado en tu historial.';
  }
  if (production?.status === 'in_production') {
    const started = production.history?.find((entry) => entry.status === 'in_production');
    return started
      ? `En producción desde ${formatDateTime(started.occurredAt)}.`
      : 'El taller ya está trabajando en tu pedido.';
  }
  if (production?.status === 'assigned') {
    return 'Perú Activa confirmó el taller que realizará el trabajo.';
  }
  if (production?.status === 'recommended')
    return 'Perú Activa está revisando el taller propuesto.';
  if (request.status === 'pending_quote') return 'Perú Activa está preparando el precio.';
  if (request.status === 'quoted') return 'Revisa el precio y responde cuando estés listo.';
  if (request.status === 'rejected') return 'Registramos que no aceptaste esta cotización.';
  return request.production?.message || 'Perú Activa continuará con la coordinación del pedido.';
}

function NextAction({ item }: { item: CustomerTrackingItem }) {
  const request = item.quotation;
  const production = item.productionOrders[0];
  let title = 'No necesitas hacer nada por ahora';
  let description = 'Te avisaremos aquí cuando Perú Activa registre el siguiente cambio.';

  if (request.status === 'quoted') {
    title = 'Revisa y responde la cotización';
    description = 'Confirma si aceptas el precio y las condiciones para iniciar el pedido.';
  } else if (request.status === 'rejected') {
    title = 'La cotización quedó rechazada';
    description = 'Crea una nueva solicitud si deseas pedir otra propuesta.';
  } else if (production?.status === 'completed') {
    title = 'La producción terminó';
    description = 'Perú Activa coordinará contigo la entrega del pedido.';
  } else if (production?.status === 'in_production') {
    title = 'El taller está produciendo tu pedido';
    description = `La entrega solicitada es el ${formatDate(request.request.delivery.requiredBy)}.`;
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
  const status = item.productionOrders[0]?.status;
  const currentIndex =
    status === 'completed' ? 4 : status === 'in_production' ? 2 : status === 'assigned' ? 1 : 0;
  const stages = ['Confirmado', 'Taller asignado', 'En producción', 'Terminado'];
  return (
    <section className="customer-production-progress" aria-labelledby="production-progress-title">
      <h2 id="production-progress-title">Progreso de producción</h2>
      <ol>
        {stages.map((label, index) => {
          const state =
            currentIndex === 4 || index < currentIndex
              ? 'complete'
              : index === currentIndex
                ? 'current'
                : 'upcoming';
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
