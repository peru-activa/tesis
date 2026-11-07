import { useEffect, useState } from 'react';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { QuotationRequestForm } from './QuotationRequestForm';

export function QuotationDemo() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [initialDraft, setInitialDraft] = useState<QuotationRequestDraft>();
  const copyFrom = new URLSearchParams(window.location.search).get('copiar');
  const [loading, setLoading] = useState(Boolean(copyFrom));

  useEffect(() => {
    let active = true;
    async function load() {
      const [session, copy] = await Promise.all([
        fetch('/v1/session').then(async (response) => {
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || 'No se pudo validar la sesión.');
          return payload;
        }),
        copyFrom
          ? fetch(`/v1/quotation-requests/${encodeURIComponent(copyFrom)}/draft`).then(
              async (response) => {
                const payload = await response.json();
                if (!response.ok)
                  throw new Error(payload.message || 'No se pudo copiar el pedido.');
                return payload;
              },
            )
          : undefined,
      ]);
      if (!active) return;
      setEmail(session.identity?.email || '');
      if (copy) setInitialDraft(copy.draft);
    }
    void load()
      .catch((cause) => {
        if (active)
          setLoadError(cause instanceof Error ? cause.message : 'No se pudo cargar el pedido.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [copyFrom]);

  async function createRequest(draft: QuotationRequestDraft) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/v1/quotation-requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.message ?? payload.issues?.[0]?.message ?? 'Revisa los datos ingresados.',
        );
      window.location.assign(`/mis-pedidos/${payload.request.id}`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="quote-demo min-h-screen">
      <PeruActivaHeader
        right={
          <a className="quote-account-link" href="/mis-pedidos">
            Mis pedidos
          </a>
        }
      />
      <main className="mx-auto max-w-7xl px-4 py-3 sm:px-7 sm:py-4">
        {loading && <p>Cargando los datos del pedido…</p>}
        {loadError && (
          <p role="alert" className="customer-orders-error">
            {loadError}
          </p>
        )}
        {initialDraft && (
          <p className="customer-copy-notice">
            Pedido copiado. Ajusta cantidades, tallas y la nueva fecha de entrega. El precio y la
            asignación se evaluarán de nuevo.
          </p>
        )}
        {!loading && !loadError && (
          <QuotationRequestForm
            busy={busy}
            error={error}
            authenticatedEmail={email}
            initialDraft={initialDraft}
            onSubmit={createRequest}
          />
        )}
      </main>
    </div>
  );
}
