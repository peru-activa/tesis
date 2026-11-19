import { useEffect, useState } from 'react';
import {
  planningInputFromDraft,
  type DeliveryEstimate,
  type DeliveryPlanningInput,
} from '../../../../src/domain/delivery-estimate';

export function useDeliveryEstimate(draft: DeliveryPlanningInput, active: boolean, revision = 0) {
  let key = '';
  try {
    key = JSON.stringify(planningInputFromDraft(draft));
  } catch {
    /* Wait until the required garment fields are complete before estimating delivery. */
  }
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ key: string; estimate?: DeliveryEstimate; error?: string }>({
    key: '',
  });
  useEffect(() => {
    if (!active || !key) return;
    const controller = new AbortController();
    let current = true;
    setState({ key });
    void (async () => {
      try {
        const response = await fetch('/v1/quotation-requests/delivery-estimate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: key,
          signal: controller.signal,
        });
        const payload = await response.json();
        if (!response.ok || !payload.estimate)
          throw new Error(payload.message || 'No se pudo calcular la entrega.');
        if (current) setState({ key, estimate: payload.estimate });
      } catch (error) {
        if (current)
          setState({
            key,
            error: error instanceof Error ? error.message : 'No se pudo calcular la entrega.',
          });
      }
    })();
    return () => {
      current = false;
      controller.abort();
    };
  }, [key, active, attempt, revision]);
  const estimate = state.key === key ? state.estimate : undefined;
  const error = state.key === key ? state.error : undefined;
  return {
    estimate,
    error,
    loading: active && Boolean(key) && !estimate && !error,
    ready: active && estimate?.status === 'available' && Boolean(estimate.earliestDate),
    retry: () => setAttempt((value) => value + 1),
  };
}

export type DeliveryEstimateState = ReturnType<typeof useDeliveryEstimate>;
