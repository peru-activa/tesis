import { useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import type { PortalOrder } from '../../../../src/domain/orders';
import { fetchAsPeruActiva, readApiResponse } from '../../lib/actor-api';
import { AssignmentAutomationPanel } from './AssignmentAutomationPanel';
import { WorkshopStatus } from './WorkshopStatus';
import { OrderIcon } from './OrderIcon';
import { processLabels } from './processLabels';

type Coordination = { workshopId: string; state: string; lastError: string | null };
type OrderDetail = { order: PortalOrder; workshopNames: Record<string, string> };

export function OrderAssignmentPanel({
  orderId,
  onAssignedChange,
}: {
  orderId: string;
  onAssignedChange?: (assigned: boolean) => void;
}) {
  const [detail, setDetail] = useState<OrderDetail>();
  const [coordination, setCoordination] = useState<Coordination[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    const payload = await readApiResponse<OrderDetail>(
      await fetchAsPeruActiva(`/v1/orders/${orderId}`),
    );
    if (!payload.order) throw new Error('No se encontró la orden.');
    return payload;
  }, [orderId]);

  useEffect(() => {
    let active = true;
    const refresh = () =>
      void load()
        .then((next) => {
          if (active) setDetail(next);
        })
        .catch((cause: Error) => {
          if (active) setError(cause.message);
        });
    refresh();
    const socket = io(
      import.meta.env.VITE_API_ORIGIN ||
        (import.meta.env.DEV ? 'http://localhost:3100' : undefined),
    );
    socket.on('orders.changed', refresh);
    return () => {
      active = false;
      socket.disconnect();
    };
  }, [load]);

  const order = detail?.order;
  const assigned = Boolean(order?.assignment);
  useEffect(() => {
    onAssignedChange?.(assigned);
  }, [assigned, onAssignedChange]);
  const loadCoordination = useCallback(
    async (signal?: AbortSignal) => {
      const payload = await readApiResponse<{ coordination: Coordination[] }>(
        await fetchAsPeruActiva(`/v1/orders/${orderId}/production-coordination`, { signal }),
      );
      return (payload.coordination || []).filter(Boolean);
    },
    [orderId],
  );

  useEffect(() => {
    if (!assigned || order?.previewOnly) return;
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const next = await loadCoordination(controller.signal);
        if (active) setCoordination(next);
      } catch {
        if (active) setError('No se pudo actualizar la respuesta del taller.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [assigned, order?.previewOnly, loadCoordination]);

  async function updateProposal() {
    setBusy(true);
    setError('');
    try {
      await readApiResponse(
        await fetchAsPeruActiva(`/v1/orders/${orderId}/recommendation`, { method: 'POST' }),
      );
      setDetail(await load());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo actualizar la propuesta.');
    } finally {
      setBusy(false);
    }
  }

  const updateOrder = useCallback((updated: PortalOrder) => {
    setDetail((current) => (current ? { ...current, order: updated } : current));
  }, []);

  async function requestProgress(workshopId: string) {
    setBusy(true);
    setError('');
    try {
      await readApiResponse(
        await fetchAsPeruActiva(
          `/v1/orders/${orderId}/production-coordination/${workshopId}/progress`,
          { method: 'POST' },
        ),
      );
      setCoordination(await loadCoordination());
    } catch {
      setError('No se pudo confirmar el envío de la consulta de avance.');
    } finally {
      setBusy(false);
    }
  }

  const name = (id: string, fallback: string) => detail?.workshopNames?.[id] || fallback;
  if (!order)
    return (
      <section className="pa-assignment">
        <p role={error ? 'alert' : 'status'}>{error || 'Cargando talleres…'}</p>
      </section>
    );
  return (
    <section className="pa-assignment" aria-label="Asignación del pedido">
      <div className="pa-assignment-title">
        <span>
          <OrderIcon name={assigned ? 'check' : 'workshop'} />
          <h2>
            {order.previewOnly
              ? 'Distribución de ejemplo'
              : assigned
                ? 'Asignación confirmada'
                : 'Talleres'}
          </h2>
        </span>
        <small>
          {order.draft.quantity} {order.draft.product === 'polo' ? 'polos' : 'buzos'}
        </small>
      </div>
      {order.previewOnly && (
        <p className="pa-order-notice">
          <OrderIcon name="info" />
          Demostración de solo lectura. Los avances son simulados; no fabrica ni envía mensajes.
        </p>
      )}
      {assigned ? (
        <>
          {order.automation?.phase === 'paused' && <p role="alert" className="pa-order-error">{order.automation.message}</p>}
          <ul className="pa-assigned-list" aria-live="polite">
            {order.assignment!.allocations.map((allocation) => {
              const status = coordination.find((item) => item.workshopId === allocation.workshopId);
              return (
                <li key={allocation.workshopId}>
                  <OrderIcon name="workshop" />
                  <div>
                    <strong>{name(allocation.workshopId, allocation.displayName)}</strong>
                    <small>
                      {allocation.quantity} prendas ·{' '}
                      {allocation.assignedProcesses?.length
                        ? allocation.assignedProcesses
                            .map((process) => processLabels[process] || 'Proceso por revisar')
                            .join(', ')
                        : 'Procesos por revisar'}
                    </small>
                  </div>
                  <WorkshopStatus
                    state={
                      status?.state ||
                      (allocation.status === 'completed'
                        ? 'finished'
                        : allocation.status === 'in_production'
                          ? 'in_progress'
                          : 'assigned')
                    }
                  />
                  {status?.lastError && <p role="alert">{status.lastError}</p>}
                  {status && ['accepted', 'in_progress', 'blocked'].includes(status.state) && (
                    <button
                      className="pa-text-action"
                      disabled={busy}
                      onClick={() => void requestProgress(allocation.workshopId)}
                    >
                      <OrderIcon name="clock" />
                      Consultar avance
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          {!order.previewOnly && (
            <p className="pa-muted">Las respuestas se actualizan automáticamente.</p>
          )}
        </>
      ) : order.previewOnly ? (
        <p className="pa-muted">Vista de ejemplo, sin acciones operativas.</p>
      ) : (
        <AssignmentAutomationPanel
          orderId={orderId}
          onOrder={updateOrder}
          onRefresh={updateProposal}
        />
      )}
      {error && (
        <p role="alert" className="pa-order-error">
          {error}
        </p>
      )}
    </section>
  );
}
