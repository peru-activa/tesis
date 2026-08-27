import { useState } from 'react';
import type {
  QuotationRequestDraft,
  SellerQuotationDraft,
} from '../../../../src/domain/quotation-requests';
import { QuotationFlowBoard } from './QuotationFlowBoard';
import { QuotationRequestForm } from './QuotationRequestForm';
import type { QuotationRequest } from './types';

export function QuotationDemo() {
  const [request, setRequest] = useState<QuotationRequest>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function callApi(url: string, body: unknown): Promise<QuotationRequest> {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await response.json();
      if (!response.ok)
        throw new Error(
          payload.message ?? payload.issues?.[0]?.message ?? 'Revisa los datos ingresados.',
        );
      setRequest(payload.request);
      return payload.request;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo completar la acción.');
      throw cause;
    } finally {
      setBusy(false);
    }
  }

  async function createRequest(draft: QuotationRequestDraft) {
    try {
      await callApi('/v1/quotation-requests', draft);
    } catch {
      /* El mensaje queda visible. */
    }
  }

  async function quoteRequest(quote: SellerQuotationDraft) {
    if (!request) return;
    try {
      await callApi(`/v1/quotation-requests/${request.id}/quotation`, quote);
    } catch {
      /* El mensaje queda visible. */
    }
  }

  async function decide(decision: 'accepted' | 'rejected') {
    if (!request) return;
    try {
      await callApi(`/v1/quotation-requests/${request.id}/decision`, { decision });
    } catch {
      /* El mensaje queda visible. */
    }
  }

  function restart() {
    setRequest(undefined);
    setError('');
  }

  return (
    <div className="quote-demo min-h-screen">
      <header className="quote-header">
        <div className="mx-auto flex min-h-14 max-w-7xl items-center px-4 sm:px-7">
          <img className="quote-logo" src="/logos/peru-activa-logo.webp" alt="Perú Activa" />
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-3 sm:px-7 sm:py-4">
        {request ? (
          <QuotationFlowBoard
            request={request}
            busy={busy}
            error={error}
            onQuote={quoteRequest}
            onDecision={decide}
            onRestart={restart}
          />
        ) : (
          <QuotationRequestForm busy={busy} error={error} onSubmit={createRequest} />
        )}
      </main>
    </div>
  );
}
