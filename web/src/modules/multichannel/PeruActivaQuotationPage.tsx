import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { io } from 'socket.io-client';
import {
  sellerQuotationDraftSchema,
  type QuotationRequest,
  type SellerQuotationDraft,
} from '../../../../src/domain/quotation-requests';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { fetchAsPeruActiva } from '../../lib/actor-api';
import { dateAfter, ErrorMessage, InputField, StepTitle } from '../quotation/QuoteUi';
import { QuotationPriceBreakdown } from '../quotation/QuotationPriceBreakdown';
import { QuotationRequestSummary } from '../quotation/QuotationRequestSummary';
import './multichannel.css';

export function PeruActivaQuotationPage({ quotationId }: { quotationId: string }) {
  const [request, setRequest] = useState<QuotationRequest>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const form = useForm<SellerQuotationDraft>({
    resolver: zodResolver(sellerQuotationDraftSchema),
    defaultValues: {
      totalPricePEN: 0,
      lineItems: [],
      selectedFabric: '',
      validUntil: dateAfter(7),
      conditions: 'Incluye confección y personalización. Pago y entrega según coordinación.',
    },
    mode: 'onChange',
  });

  const load = useCallback(async () => {
    const response = await fetchAsPeruActiva(`/v1/quotation-requests/${quotationId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'No se encontró la solicitud.');
    setRequest(payload.request);
  }, [quotationId]);

  useEffect(() => {
    let active = true;
    void load().catch((cause: Error) => {
      if (active) setError(cause.message);
    });

    const apiOrigin =
      import.meta.env.VITE_API_ORIGIN ||
      (import.meta.env.DEV ? 'http://localhost:3100' : undefined);
    const socket = io(apiOrigin);
    socket.on('quotations.changed', () => void load());
    return () => {
      active = false;
      socket.disconnect();
    };
  }, [load]);

  async function sendQuotation(values: SellerQuotationDraft) {
    setBusy(true);
    setError('');
    try {
      const response = await fetchAsPeruActiva(`/v1/quotation-requests/${quotationId}/quotation`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.message || 'No se pudo enviar la cotización.');
      setRequest(payload.request);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo enviar la cotización.');
    } finally {
      setBusy(false);
    }
  }

  const garments = request ? [request.request.garment, ...request.request.additionalGarments] : [];
  const lineItems = useWatch({ control: form.control, name: 'lineItems' }) ?? [];
  const totalPricePEN = Number(
    garments
      .reduce(
        (total, garment, index) => total + garment.quantity * (lineItems[index]?.unitPricePEN || 0),
        0,
      )
      .toFixed(2),
  );

  useEffect(() => {
    if (!request) return;
    const requestedFabrics = garments
      .map((garment) => (garment.fabric.mode === 'specified' ? garment.fabric.name : ''))
      .filter(Boolean)
      .join(' / ');
    form.reset({
      totalPricePEN: 0,
      lineItems: garments.map((_garment, garmentIndex) => ({
        garmentIndex,
        unitPricePEN: 0,
      })),
      selectedFabric: requestedFabrics,
      validUntil: dateAfter(7),
      conditions: 'Incluye confección y personalización. Pago y entrega según coordinación.',
    });
  }, [form, request?.id]);

  useEffect(() => {
    form.setValue('totalPricePEN', totalPricePEN, { shouldValidate: true });
  }, [form, totalPricePEN]);

  return (
    <div className="quote-demo mc-shell">
      <PeruActivaHeader
        homeHref="/peru-activa"
        right={
          <span className="mc-local-badge">
            <i /> Perú Activa · acceso local
          </span>
        }
      />
      <main className="mc-main">
        <div className="mc-backbar">
          <a href="/peru-activa">← Volver a pedidos</a>
        </div>

        {!request && !error && <p className="pa-quote-loading">Cargando solicitud…</p>}
        {!request && error && <ErrorMessage>{error}</ErrorMessage>}

        {request && (
          <>
            <section className="pa-quote-heading">
              <div>
                <p className="mc-kicker">{request.id}</p>
                <h1>{request.status === 'pending_quote' ? 'Preparar cotización' : 'Cotización'}</h1>
                <p>Revisa el pedido tal como lo envió el cliente y completa el precio.</p>
              </div>
              <span className={`quote-status ${request.status}`}>
                {request.status === 'pending_quote'
                  ? 'Pendiente'
                  : request.status === 'quoted'
                    ? 'Enviada al cliente'
                    : request.status === 'accepted'
                      ? 'Aceptada'
                      : 'Rechazada'}
              </span>
            </section>

            <div className="pa-quote-layout">
              <section className="quote-sheet pa-client-preview">
                <StepTitle
                  number="01"
                  title="Solicitud del cliente"
                  description="Este es el mismo resumen que el cliente revisó antes de enviarlo."
                />
                <QuotationRequestSummary draft={request.request} />
                {request.request.notes && (
                  <div className="pa-request-notes">
                    <b>Nota del cliente</b>
                    <p>{request.request.notes}</p>
                  </div>
                )}
              </section>

              <aside className="quote-sheet pa-quotation-panel">
                {request.status === 'pending_quote' ? (
                  <form onSubmit={form.handleSubmit(sendQuotation)}>
                    <StepTitle
                      number="02"
                      title="Completar cotización"
                      description="Ingresa los datos que recibirá el cliente."
                    />
                    <div className="pa-line-items">
                      {garments.map((garment, index) => {
                        const unitPrice = lineItems[index]?.unitPricePEN || 0;
                        const subtotal = garment.quantity * unitPrice;
                        return (
                          <div className="pa-line-item" key={`${garment.product}-${index}`}>
                            <input
                              type="hidden"
                              {...form.register(`lineItems.${index}.garmentIndex`, {
                                valueAsNumber: true,
                              })}
                            />
                            <div>
                              <b>
                                {garment.product === 'polo' ? 'Polos' : 'Buzos'} ·{' '}
                                {garment.quantity} unidades
                              </b>
                              <small>
                                {garment.model} · {garment.color}
                              </small>
                            </div>
                            <InputField label="Precio por prenda (S/)">
                              <input
                                autoFocus={index === 0}
                                type="number"
                                min="0.01"
                                step="0.01"
                                {...form.register(`lineItems.${index}.unitPricePEN`, {
                                  valueAsNumber: true,
                                })}
                              />
                            </InputField>
                            <span className="pa-line-subtotal">
                              Subtotal: S/{' '}
                              {subtotal.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="pa-quote-total">
                      <span>Total de la cotización</span>
                      <strong>
                        S/ {totalPricePEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                      </strong>
                    </div>
                    <InputField label="Tela ofrecida">
                      <input
                        {...form.register('selectedFabric')}
                        placeholder="Ejemplo: algodón jersey 30/1"
                      />
                    </InputField>
                    <InputField label="Cotización válida hasta">
                      <input type="date" min={dateAfter(1)} {...form.register('validUntil')} />
                    </InputField>
                    <InputField label="Condiciones">
                      <textarea rows={4} {...form.register('conditions')} />
                    </InputField>
                    {error && <ErrorMessage>{error}</ErrorMessage>}
                    <button
                      className="quote-primary pa-send-quotation"
                      type="submit"
                      disabled={busy || !form.formState.isValid}
                    >
                      {busy ? 'Enviando…' : 'Enviar cotización al cliente'} <span>→</span>
                    </button>
                  </form>
                ) : request.quotation ? (
                  <div className="pa-quotation-sent">
                    <span>✓</span>
                    <h2>Cotización enviada</h2>
                    <QuotationPriceBreakdown request={request} />
                    <p>{request.quotation.selectedFabric}</p>
                    <p>{request.quotation.conditions}</p>
                    <small>Válida hasta {request.quotation.validUntil}</small>
                  </div>
                ) : null}
              </aside>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
