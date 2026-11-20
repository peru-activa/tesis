import { useCallback, useEffect, useState } from 'react';
import { WorkshopStatus } from './WorkshopStatus';
import { fetchAsPeruActiva } from '../../lib/actor-api';

export type Availability = { workshopId: string; displayName: string; phone?: string; state: string; lastError: string | null };

export function WorkshopAvailabilityPanel({ orderId, testOnly, onChange }: { orderId: string; testOnly?: boolean; onChange?: (rows: Availability[]) => void }) {
  const [rows, setRows] = useState<Availability[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { onChange?.(rows); }, [rows, onChange]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const response = await fetchAsPeruActiva(`/v1/orders/${orderId}/workshop-availability`, { signal });
    const payload = await response.json();
    if (!response.ok) throw new Error('No se pudo consultar la disponibilidad.');
    if (!Array.isArray(payload.availability)) throw new Error('Invalid availability response');
    return payload.availability as Availability[];
  }, [orderId]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setRows([]);
    setError('');
    async function refresh() {
      if (document.visibilityState === 'hidden') return;
      try {
        const next = await load(controller.signal);
        if (active) { setRows(next); setError(''); }
      } catch {
        if (active) setError('No se pudo actualizar. Vuelve a consultar el estado.');
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 5000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [load]);

  async function send() {
    setBusy(true);
    setError('');
    try {
      const response = await fetchAsPeruActiva(`/v1/orders/${orderId}/workshop-availability`, { method: 'POST' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'No se pudo iniciar la consulta.');
      setRows(payload.availability);
    } catch {
      setError('No pudimos confirmar el envío. Revisa el estado antes de volver a intentarlo.');
    } finally { setBusy(false); }
  }

  const pending = rows.filter((row) => row.state === 'not_contacted' && row.phone).length;
  return (
    <section className="mc-availability" aria-label="Disponibilidad de talleres">
      <header className="mc-workshops-heading">
        <h3>Talleres</h3>
        {testOnly && <small>Prueba</small>}
      </header>
      <ul aria-live="polite" aria-label="Estado de los talleres">
        {rows.map((row) => <li key={row.workshopId}>
          <div className="mc-workshop-contact">
            <strong>{row.displayName}</strong>
            {row.phone && <small>{row.phone}</small>}
          </div>
          <WorkshopStatus state={row.state} />
          {row.lastError && <p className="mc-workshop-error">{row.lastError}</p>}
        </li>)}
      </ul>
      <div className="mc-workshops-actions">
        {pending > 0 && <button type="button" className="mc-primary" disabled={busy} onClick={() => void send()}>
          {busy ? 'Enviando…' : rows.length === 1 ? 'Consultar al taller' : 'Consultar a los talleres'}
        </button>}
        <button type="button" className="mc-workshops-refresh" disabled={busy} onClick={() => void load().then(setRows).catch(() => setError('No se pudo actualizar el estado.'))}>Actualizar</button>
      </div>
      {rows.length > 0 && <small className="mc-workshops-help">Las respuestas se actualizan automáticamente.</small>}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
