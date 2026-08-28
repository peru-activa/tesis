import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { trackingLabel, type CustomerTrackingItem } from './customerTracking';

type Session = {
  identity: { email?: string; authentication: 'cloudflare_access' | 'local_demo' };
};

export function CustomerOrdersPage() {
  const [items, setItems] = useState<CustomerTrackingItem[]>([]);
  const [session, setSession] = useState<Session>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [sessionResponse, requestsResponse] = await Promise.all([
        fetch('/v1/session'),
        fetch('/v1/my-orders'),
      ]);
      const sessionPayload = await sessionResponse.json();
      const requestsPayload = await requestsResponse.json();
      if (!sessionResponse.ok || !requestsResponse.ok) {
        throw new Error(
          requestsPayload.message || sessionPayload.message || 'No se pudieron cargar tus pedidos.',
        );
      }
      setSession(sessionPayload);
      setItems(requestsPayload.items);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudieron cargar tus pedidos.');
    } finally {
      setLoading(false);
    }
  }, []);

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

  return (
    <div className="quote-demo customer-orders-shell">
      <PeruActivaHeader
        homeHref="/mis-pedidos"
        right={
          <span className="customer-session">
            <i /> {session?.identity.email || 'Cliente'}
          </span>
        }
      />
      <main className="customer-orders-main">
        <section className="customer-orders-heading">
          <div>
            <p className="quote-kicker">TU CUENTA</p>
            <h1>Mis pedidos</h1>
            <p>Revisa aquí tus solicitudes actuales y anteriores.</p>
          </div>
          <a className="quote-primary" href="/nueva-solicitud">
            Nueva solicitud <span>+</span>
          </a>
        </section>

        {loading && <p className="customer-orders-message">Cargando tus pedidos…</p>}
        {error && <p className="customer-orders-error">{error}</p>}
        {!loading && !error && items.length === 0 && (
          <section className="customer-orders-empty">
            <h2>Aún no tienes pedidos</h2>
            <p>Cuando envíes una solicitud aparecerá aquí automáticamente.</p>
            <a className="quote-primary" href="/nueva-solicitud">
              Crear mi primera solicitud <span>→</span>
            </a>
          </section>
        )}
        {items.length > 0 && (
          <section className="customer-orders-list">
            {items.map((item) => {
              const request = item.quotation;
              const garments = [request.request.garment, ...request.request.additionalGarments];
              const units = garments.reduce((total, garment) => total + garment.quantity, 0);
              return (
                <a
                  key={request.id}
                  className="customer-order-row"
                  href={`/mis-pedidos/${request.id}`}
                >
                  <div>
                    <small>{request.id}</small>
                    <strong>
                      {units} prendas ·{' '}
                      {garments
                        .map((garment) => (garment.product === 'polo' ? 'Polos' : 'Buzos'))
                        .join(' + ')}
                    </strong>
                    <span>Entrega {formatDate(request.request.delivery.requiredBy)}</span>
                  </div>
                  <div
                    className={`customer-order-status ${request.status} ${item.productionOrders[0]?.status || ''}`}
                  >
                    {trackingLabel(item)}
                  </div>
                  <b aria-hidden="true">→</b>
                </a>
              );
            })}
          </section>
        )}
        <p className="customer-auth-note">
          {session?.identity.authentication === 'cloudflare_access'
            ? 'Acceso protegido por Cloudflare Access.'
            : 'Identidad simulada para la demostración local.'}
        </p>
      </main>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('es-PE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
