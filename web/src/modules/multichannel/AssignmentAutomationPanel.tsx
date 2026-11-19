import { WORKSHOP_RESPONSE_WINDOW_MINUTES } from '../../../../src/domain/assignment-plans';
import { useCallback, useEffect, useState } from 'react';
import type { PortalOrder } from '../../../../src/domain/orders';
import type { RecommendationResult } from '../../../../src/domain/contracts';
import type { AssignmentAutomation } from '../../../../src/domain/assignment-plans';
import { fetchAsPeruActiva, readApiResponse } from '../../lib/actor-api';
import { OrderIcon } from './OrderIcon';
import { WorkshopStatus } from './WorkshopStatus';
import { processLabels } from './processLabels';

type Candidate = RecommendationResult['candidates'][number];
type View = {
  responseWindowMinutes?: number;
  order: PortalOrder;
  automation: AssignmentAutomation | null;
  candidate?: Candidate;
  alternatives: Candidate[];
  availability: Array<{
    workshopId: string;
    displayName: string;
    phone?: string;
    state: string;
    lastError: string | null;
  }>;
};

export function AssignmentAutomationPanel({
  orderId,
  onOrder,
  onRefresh,
}: {
  orderId: string;
  onOrder: (order: PortalOrder) => void;
  onRefresh: () => Promise<void>;
}) {
  const [view, setView] = useState<View>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const load = useCallback(
    async (signal?: AbortSignal) =>
      readApiResponse<View>(
        await fetchAsPeruActiva(`/v1/orders/${orderId}/assignment-automation`, { signal }),
      ),
    [orderId],
  );
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const refresh = async () => {
      if (document.visibilityState === 'hidden') return;
      try {
        const next = await load(controller.signal);
        if (active) {
          setView(next);
          setError('');
          onOrder(next.order);
        }
      } catch {
        if (active) setError('No se pudo actualizar la asignación.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => {
      active = false;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load, onOrder]);

  async function start() {
    if (busy || view?.automation) return;
    setBusy(true);
    setError('');
    try {
      const next = await readApiResponse<View>(
        await fetchAsPeruActiva(`/v1/orders/${orderId}/assignment-automation`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ candidateId: view?.candidate?.candidateId }),
        }),
      );
      setView(next);
      onOrder(next.order);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo iniciar la asignación.');
    } finally {
      setBusy(false);
    }
  }
  const workflow = view?.automation;
  const candidate = view?.candidate;
  const minutes = view?.responseWindowMinutes ?? WORKSHOP_RESPONSE_WINDOW_MINUTES;
  const responseWindow = minutes % 60 === 0
    ? `${minutes / 60} ${minutes === 60 ? 'hora' : 'horas'}`
    : `${minutes} ${minutes === 1 ? 'minuto' : 'minutos'}`;
  return (
    <div className="pa-automation">
      {!view && !error && (
        <p role="status" className="pa-muted">
          Preparando el plan…
        </p>
      )}
      {candidate && (
        <>
          <p className="pa-plan-label">
            <OrderIcon name={workflow ? 'clock' : 'workshop'} />
            {workflow?.phase === 'paused'
              ? 'Requiere revisión'
              : workflow?.phase === 'exhausted'
                ? 'Sin opciones disponibles'
                : workflow?.rejections.length || workflow?.expirations?.length
                  ? 'Consultando una alternativa'
                  : workflow
                    ? 'Asignación en curso'
                    : 'Plan principal'}
          </p>
          <ul
            className="pa-plan-workshops"
            aria-label="Talleres del plan actual"
            aria-live="polite"
          >
            {candidate.allocations.map((allocation) => {
              const response = view?.availability.find(
                (item) => item.workshopId === allocation.workshopId,
              );
              const state =
                workflow?.attemptedWorkshopIds.includes(allocation.workshopId) &&
                response?.state === 'not_contacted'
                  ? 'capacity_pending'
                  : (response?.state ?? 'not_contacted');
              return (
                <li key={allocation.workshopId}>
                  <div>
                    <div className="pa-workshop-identity">
                      <strong>{response?.displayName || allocation.displayName}</strong>
                      {response?.phone && (
                        <span className="pa-workshop-number">{response.phone}</span>
                      )}
                    </div>
                    <small>
                      {allocation.quantity} prendas ·{' '}
                      {allocation.assignedProcesses
                        ?.map((process) => processLabels[process])
                        .join(', ')}
                    </small>
                  </div>
                  <WorkshopStatus state={state} />
                </li>
              );
            })}
          </ul>
          {!workflow && (
            <>
              <p className="pa-muted">
                Consultaremos primero a estos talleres. Si rechazan o no responden en{' '}
                {responseWindow},
                probaremos otra opción.
              </p>
              <button
                type="button"
                className="mc-primary"
                disabled={busy}
                onClick={() => void start()}
              >
                <OrderIcon name="check" />
                {busy ? 'Iniciando…' : 'Iniciar asignación'}
              </button>
            </>
          )}
        </>
      )}
      {workflow && (
        <p
          role={workflow.phase === 'paused' ? 'alert' : 'status'}
          className={workflow.phase === 'paused' ? 'pa-order-error' : 'pa-order-notice'}
        >
          {workflow.message ||
            `Esperando respuestas: hasta ${responseWindow} por consulta. La asignación continuará automáticamente.`}
        </p>
      )}
      {workflow?.rejections.length ? (
        <p className="pa-muted">
          Se descartaron los talleres que respondieron que no podían. Las respuestas positivas se
          conservan.
        </p>
      ) : null}
      {view && !candidate && !workflow && (
        <>
          <p className="pa-order-notice">
            No hay un plan compatible con los mínimos, capacidades y plazo.
          </p>
          <button
            className="pa-text-action"
            onClick={() =>
              void onRefresh()
                .then(() => load().then(setView))
                .catch(() => setError('No se pudo actualizar la propuesta.'))
            }
          >
            Actualizar propuesta
          </button>
        </>
      )}
      {view && view.alternatives.length > 0 && (
        <details className="pa-order-disclosure">
          <summary>
            <OrderIcon name="info" />
            Ver alternativas
          </summary>
          <p className="pa-muted">Se consultarán solo si un taller del plan actual rechaza.</p>
          <ol className="pa-alternative-plans">
            {view.alternatives.map((alternative) => (
              <li key={alternative.candidateId}>
                {alternative.allocations
                  .map((allocation) => `${allocation.displayName}: ${allocation.quantity}`)
                  .join(' + ')}
              </li>
            ))}
          </ol>
        </details>
      )}
      {candidate && (
        <details className="pa-order-disclosure">
          <summary>
            <OrderIcon name="info" />
            Por qué este plan
          </summary>
          <ul className="pa-muted">
            {candidate.reasons.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
      {workflow?.expirations?.length ? (
        <p className="pa-muted">
          La consulta anterior venció sin respuesta. Se conservan los talleres confirmados.
        </p>
      ) : null}
      {error && (
        <p role="alert" className="pa-order-error">
          {error}
        </p>
      )}
    </div>
  );
}
