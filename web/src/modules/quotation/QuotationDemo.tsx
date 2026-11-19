import { useEffect, useState } from 'react';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { QuotationRequestForm } from './QuotationRequestForm';

export function QuotationDemo({
  email,
  customer,
}: {
  email: string;
  customer: Pick<QuotationRequestDraft['customer'], 'contactName' | 'businessName'> | undefined;
}) {
  const [busy, setBusy] = useState(false);
  const [deliveryRevision, setDeliveryRevision] = useState(0);
  const [error, setError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [initialDraft, setInitialDraft] = useState<QuotationRequestDraft>();
  const copyFrom = new URLSearchParams(window.location.search).get('copiar');
  const [loading, setLoading] = useState(Boolean(copyFrom));

  useEffect(() => {
    if (!copyFrom) return;
    let active = true;
    const url = `/v1/quotation-requests/${encodeURIComponent(copyFrom)}/draft`;
    async function load() {
      const response = await fetch(url);
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.message || 'No se pudo preparar el pedido para repetirlo.');
      if (active) setInitialDraft(payload.draft);
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
      if (!response.ok) {
        if (payload.error === 'delivery_unavailable') setDeliveryRevision((value) => value + 1);
        throw new Error(
          payload.message ?? payload.issues?.[0]?.message ?? 'Revisa los datos ingresados.',
        );
      }
      window.location.assign(`/mis-pedidos/${payload.request.id}`);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
      return false;
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
            Repetir pedido: ajusta cantidades, tallas y la nueva fecha de entrega. El precio y la
            asignación se evaluarán de nuevo.
          </p>
        )}
        {!loading && !loadError && (
          <QuotationRequestForm
            busy={busy}
            deliveryRevision={deliveryRevision}
            error={error}
            authenticatedEmail={email}
            customerProfile={customer}
            initialDraft={initialDraft}
            onSubmit={createRequest}
          />
        )}
      </main>
    </div>
  );
}
