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
      <main className="customer-order-main">
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
              </div>
              <span className={`quote-status ${item.quotation.status}`}>{trackingLabel(item)}</span>
            </section>

            {item.productionOrders.length > 0 && <ProductionProgress item={item} />}

            {item.quotation.status === 'quoted' && item.quotation.quotation && (
              <section className="customer-quotation-card">
                <p className="quote-kicker">COTIZACIÓN DE PERÚ ACTIVA</p>
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
                {error && <p className="customer-orders-error">{error}</p>}
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
              </section>
            )}

            <section className="quote-sheet customer-request-summary">
              <div>
                <p className="quote-kicker">TU SOLICITUD</p>
                <h2>Detalle enviado</h2>
              </div>
              <QuotationRequestSummary draft={item.quotation.request} />
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
  if (production?.status === 'in_production') return 'El taller ya está trabajando en tu pedido.';
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

function ProductionProgress({ item }: { item: CustomerTrackingItem }) {
  const status = item.productionOrders[0]?.status;
  const stages = [
    { label: 'Confirmado', done: true },
    {
      label: 'Taller asignado',
      done: ['assigned', 'in_production', 'completed'].includes(status || ''),
    },
    { label: 'En producción', done: ['in_production', 'completed'].includes(status || '') },
    { label: 'Terminado', done: status === 'completed' },
  ];
  return (
    <section className="customer-production-progress">
      {stages.map((stage) => (
        <div className={stage.done ? 'done' : ''} key={stage.label}>
          <span>{stage.done ? '✓' : ''}</span>
          <b>{stage.label}</b>
        </div>
      ))}
    </section>
  );
}
