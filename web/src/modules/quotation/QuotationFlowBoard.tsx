import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  sellerQuotationDraftSchema,
  type QuotationStatus,
  type SellerQuotationDraft,
} from '../../../../src/domain/quotation-requests';
import { dateAfter, ErrorMessage, InputField, StepTitle } from './QuoteUi';
import { QuotationPriceBreakdown } from './QuotationPriceBreakdown';
import type { QuotationRequest } from './types';

export function QuotationFlowBoard({
  request,
  busy,
  error,
  onQuote,
  onDecision,
  onRestart,
}: {
  request: QuotationRequest;
  busy: boolean;
  error: string;
  onQuote: (quote: SellerQuotationDraft) => Promise<void>;
  onDecision: (decision: 'accepted' | 'rejected') => Promise<void>;
  onRestart: () => void;
}) {
  const [sellerMode, setSellerMode] = useState(false);
  const garments = [request.request.garment, ...request.request.additionalGarments];
  const garmentSummary = garments
    .map((garment) => (garment.product === 'polo' ? 'polos' : 'buzos'))
    .join(' y ');
  const totalUnits = garments.reduce((sum, garment) => sum + garment.quantity, 0);
  const requestedFabrics = garments
    .map((garment) => (garment.fabric.mode === 'specified' ? garment.fabric.name : ''))
    .filter(Boolean)
    .join(' / ');
  const quoteForm = useForm<SellerQuotationDraft>({
    resolver: zodResolver(sellerQuotationDraftSchema),
    defaultValues: {
      totalPricePEN: 0,
      selectedFabric: requestedFabrics,
      fabricBuyer: 'workshop',
      validUntil: dateAfter(7),
      conditions: 'Incluye confección y personalización. Pago y entrega según coordinación.',
    },
    mode: 'onChange',
  });
  const accepted = request.status === 'accepted';
  const rejected = request.status === 'rejected';

  return (
    <section className="mx-auto max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="quote-kicker">Flujo de demostración</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 sm:text-5xl">
            La solicitud avanza sin precio automático.
          </h1>
        </div>
        <button className="quote-secondary" onClick={onRestart}>
          Nueva simulación
        </button>
      </div>
      <div className="quote-timeline mt-8">
        <TimelineStep number="1" label="Solicitud enviada" active />
        <TimelineStep
          number="2"
          label="Perú Activa cotiza"
          active={request.status !== 'pending_quote'}
        />
        <TimelineStep number="3" label="Cliente responde" active={accepted || rejected} />
        <TimelineStep number="4" label="Pedido confirmado" active={accepted} />
      </div>
      <article className="quote-request-card mt-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <span className="quote-code">{request.id}</span>
            <h2>
              {totalUnits} prendas · {garmentSummary}
            </h2>
            <p>
              {request.request.customer.businessName} · Entrega{' '}
              {request.request.delivery.requiredBy}
            </p>
          </div>
          <StatusBadge status={request.status} />
        </div>
      </article>

      {request.status === 'pending_quote' && !sellerMode && (
        <section className="quote-role-panel mt-5">
          <div>
            <span className="quote-role">Vista de Perú Activa</span>
            <h2>La solicitud espera revisión.</h2>
            <p>Una persona define la tela final, el precio y las condiciones.</p>
          </div>
          <button className="quote-primary" onClick={() => setSellerMode(true)}>
            Preparar cotización <span>→</span>
          </button>
        </section>
      )}

      {request.status === 'pending_quote' && sellerMode && (
        <form className="quote-sheet mt-5" onSubmit={quoteForm.handleSubmit(onQuote)}>
          <StepTitle
            number="PA"
            title="Preparar cotización"
            description="Este precio lo ingresa Perú Activa; el sistema no lo calcula."
          />
          <div className="mt-6 grid gap-5 sm:grid-cols-2">
            <InputField label="Precio total (S/)">
              <input
                type="number"
                min="0.01"
                step="0.01"
                {...quoteForm.register('totalPricePEN', { valueAsNumber: true })}
              />
            </InputField>
            <InputField label="Tela cotizada">
              <input
                {...quoteForm.register('selectedFabric')}
                placeholder="Ejemplo: Zanetti 100 % poliéster"
              />
            </InputField>
            <InputField label="¿Quién compra la tela?">
              <select {...quoteForm.register('fabricBuyer')}>
                <option value="workshop">Taller productor</option>
                <option value="peru_activa">Perú Activa</option>
              </select>
            </InputField>
            <InputField label="Válida hasta">
              <input type="date" min={dateAfter(1)} {...quoteForm.register('validUntil')} />
            </InputField>
          </div>
          <InputField label="Condiciones">
            <textarea rows={3} {...quoteForm.register('conditions')} />
          </InputField>
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="mt-7 flex justify-end">
            <button
              className="quote-primary"
              type="submit"
              disabled={busy || !quoteForm.formState.isValid}
            >
              {busy ? 'Enviando…' : 'Enviar al cliente'} <span>→</span>
            </button>
          </div>
        </form>
      )}

      {request.status === 'quoted' && request.quotation && (
        <section className="quote-client-card mt-5">
          <span className="quote-role">Vista del cliente</span>
          <div className="mt-4 grid gap-7 sm:grid-cols-[1fr_auto] sm:items-end">
            <div>
              <h2>Cotización recibida</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {request.quotation.selectedFabric}
                <br />
                Compra de tela:{' '}
                {request.quotation.fabricBuyer === 'peru_activa'
                  ? 'Perú Activa'
                  : 'Taller productor'}
                <br />
                {request.quotation.conditions}
              </p>
              <small className="mt-3 block text-slate-500">
                Válida hasta {request.quotation.validUntil}
              </small>
            </div>
            <div className="sm:text-right">
              <span className="quote-amount">
                S/{' '}
                {request.quotation.totalPricePEN.toLocaleString('es-PE', {
                  minimumFractionDigits: 2,
                })}
              </span>
              <small className="block text-slate-500">Precio definido por Perú Activa</small>
            </div>
          </div>
          <QuotationPriceBreakdown request={request} />
          {error && <ErrorMessage>{error}</ErrorMessage>}
          <div className="mt-7 flex flex-wrap justify-end gap-3">
            <button
              className="quote-secondary"
              disabled={busy}
              onClick={() => onDecision('rejected')}
            >
              Rechazar
            </button>
            <button
              className="quote-primary"
              disabled={busy}
              onClick={() => onDecision('accepted')}
            >
              Aceptar cotización <span>✓</span>
            </button>
          </div>
        </section>
      )}

      {(accepted || rejected) && (
        <section className={`quote-final mt-5 ${accepted ? 'accepted' : 'rejected'}`}>
          <span className="quote-final-icon">{accepted ? '✓' : '×'}</span>
          <div>
            <span className="quote-role">Respuesta registrada</span>
            <h2>{accepted ? 'Pedido confirmado' : 'Cotización rechazada'}</h2>
            <p>
              {accepted
                ? request.production?.message || 'La aceptación quedó registrada.'
                : 'La solicitud se cierra sin crear un pedido de producción.'}
            </p>
            {accepted && request.production?.orderIds[0] && (
              <a className="quote-secondary mt-4 inline-flex" href="/peru-activa">
                Abrir mesa de Perú Activa →
              </a>
            )}
          </div>
        </section>
      )}
    </section>
  );
}

function TimelineStep({
  number,
  label,
  active,
}: {
  number: string;
  label: string;
  active: boolean;
}) {
  return (
    <div className={active ? 'active' : ''}>
      <span>{active ? '✓' : number}</span>
      <strong>{label}</strong>
    </div>
  );
}

function StatusBadge({ status }: { status: QuotationStatus }) {
  const labels: Record<QuotationStatus, string> = {
    pending_quote: 'Pendiente de cotización',
    quoted: 'Cotización enviada',
    accepted: 'Pedido confirmado',
    rejected: 'Rechazada',
  };
  return <span className={`quote-status ${status}`}>{labels[status]}</span>;
}
