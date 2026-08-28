import { useEffect, useState } from 'react';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { QuotationRequestForm } from './QuotationRequestForm';

export function QuotationDemo() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    void fetch('/v1/session')
      .then((response) => response.json())
      .then((payload) => setEmail(payload.identity?.email || ''));
  }, []);

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
        <QuotationRequestForm
          busy={busy}
          error={error}
          authenticatedEmail={email}
          onSubmit={createRequest}
        />
      </main>
    </div>
  );
}
