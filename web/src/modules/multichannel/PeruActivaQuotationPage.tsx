import { QuotationPdfDownloadButton } from '../quotation/QuotationPdfDownloadButton';
import { zodResolver } from '@hookform/resolvers/zod';
import { useCallback, useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { io } from 'socket.io-client';
import {
  sellerQuotationDraftSchema,
  type QuotationRequest,
  type SellerQuotationDraft,
} from '../../../../src/domain/quotation-requests';
import { PeruActivaOrderLayout } from './PeruActivaOrderLayout';
import { OrderAssignmentPanel } from './OrderAssignmentPanel';
import { OrderIcon } from './OrderIcon';
import { OrderItemPreview } from './OrderItemPreview';
import { fetchAsPeruActiva } from '../../lib/actor-api';
import { dateAfter, ErrorMessage, InputField, StepTitle } from '../quotation/QuoteUi';
import { QuotationPriceBreakdown } from '../quotation/QuotationPriceBreakdown';
import { CustomerEmailStatus } from '../quotation/CustomerEmailStatus';
import type { CustomerEmailDelivery } from '../../../../src/domain/customer-email';
import { QuotationRequestSummary } from '../quotation/QuotationRequestSummary';
import {
  DeliveryConfirmationField,
  DeliveryConfirmationSummary,
} from '../quotation/DeliveryConfirmation';
import './multichannel.css';

export function PeruActivaQuotationPage({ quotationId }: { quotationId: string }) {
  const [request, setRequest] = useState<QuotationRequest>();
  const [emailDelivery, setEmailDelivery] = useState<CustomerEmailDelivery>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selectedOrderId, setSelectedOrderId] = useState('');
  const [assignmentConfirmed, setAssignmentConfirmed] = useState(false);
  const form = useForm<SellerQuotationDraft>({
    resolver: zodResolver(sellerQuotationDraftSchema),
    defaultValues: {
      totalPricePEN: 0,
      lineItems: [],
      selectedFabric: '',
      fabricBuyer: 'workshop',
      validUntil: dateAfter(7),
      conditions: 'Incluye confección y personalización. Pago y entrega según coordinación.',
      deliveryConfirmation: { requiredBy: '', confirmed: false },
    },
    mode: 'onChange',
  });

  const load = useCallback(async () => {
    const response = await fetchAsPeruActiva(`/v1/quotation-requests/${quotationId}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || 'No se encontró la solicitud.');
    setRequest(payload.request);
    setEmailDelivery(payload.emailDelivery);
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
      setEmailDelivery(payload.emailDelivery);
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
      totalPricePEN: request.quotation?.totalPricePEN ?? 0,
      lineItems: garments.map((garment, garmentIndex) => ({
        garmentIndex,
        unitPricePEN:
          request.quotation?.lineItems?.find((item) => item.garmentIndex === garmentIndex)
            ?.unitPricePEN ?? 0,
        selectedFabric:
          request.quotation?.lineItems?.find((item) => item.garmentIndex === garmentIndex)
            ?.selectedFabric ??
          request.quotation?.selectedFabric ??
          (garment.fabric.mode === 'specified' ? garment.fabric.name : ''),
      })),
      selectedFabric: request.quotation?.selectedFabric ?? requestedFabrics,
      fabricBuyer: request.quotation?.fabricBuyer ?? 'workshop',
      validUntil: request.quotation?.validUntil ?? dateAfter(7),
      conditions:
        request.quotation?.conditions ??
        'Incluye confección y personalización. Pago y entrega según coordinación.',
      deliveryConfirmation: request.quotation?.deliveryConfirmation ?? {
        requiredBy: request.request.delivery.requiredBy,
        confirmed: false,
      },
    });
  }, [form, request?.id]);

  useEffect(() => {
    form.setValue('totalPricePEN', totalPricePEN, { shouldValidate: true });
    form.setValue('selectedFabric', lineItems[0]?.selectedFabric ?? '', { shouldValidate: true });
  }, [form, totalPricePEN, lineItems]);

  const orderIds = request?.production?.orderIds ?? [];
  const activeOrderId = orderIds.includes(selectedOrderId) ? selectedOrderId : orderIds[0];
  const stage = request?.status === 'accepted' ? (assignmentConfirmed ? 2 : 1) : 0;
  const quantity = garments.reduce((sum, garment) => sum + garment.quantity, 0);
  const labels = {
    pending_quote: 'Por cotizar',
    quoted: 'Espera al cliente',
    accepted: 'Aceptada',
    rejected: 'Rechazada',
  };
  const money = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  return (
    <PeruActivaOrderLayout>
      {!request && !error && <p role="status">Cargando pedido…</p>}
      {!request && error && <ErrorMessage>{error}</ErrorMessage>}
      {request && (
        <>
          <header className="pa-order-heading">
            <div>
              <h1>
                {request.request.customer.businessName ||
                  request.request.customer.contactName ||
                  'Pedido'}
              </h1>
              <p>
                {request.id}
                {request.testOnly ? ' · Prueba' : ''}
              </p>
            </div>
            <span className={`quote-status ${request.status}`}>{labels[request.status]}</span>
          </header>
          <ol className="pa-order-progress" aria-label="Progreso del pedido">
            {(['Cotización', 'Talleres', 'Asignación'] as const).map((label, index) => (
              <li
                key={label}
                className={index === stage ? 'is-current' : index < stage ? 'is-done' : ''}
                aria-current={index === stage ? 'step' : undefined}
              >
                <OrderIcon
                  name={index < stage ? 'check' : (['price', 'workshop', 'check'] as const)[index]!}
                />
                <span>{label}</span>
              </li>
            ))}
          </ol>
          <dl className="pa-order-facts">
            <div>
              <dt>
                <OrderIcon name="shirt" />
                Prendas
              </dt>
              <dd>
                {quantity}{' '}
                {garments.every((garment) => garment.product === 'polo') ? 'polos' : 'prendas'}
              </dd>
            </div>
            <div>
              <dt>
                <OrderIcon name="calendar" />
                Entrega
              </dt>
              <dd>
                {new Date(`${request.request.delivery.requiredBy}T12:00:00`).toLocaleDateString(
                  'es-PE',
                  { day: 'numeric', month: 'short' },
                )}
              </dd>
            </div>
            <div>
              <dt>
                <OrderIcon name="price" />
                Cotización
              </dt>
              <dd>
                {request.quotation ? money.format(request.quotation.totalPricePEN) : 'Por cotizar'}
              </dd>
            </div>
          </dl>
          <CustomerEmailStatus delivery={emailDelivery} />
          {request.quotation && (
            <QuotationPdfDownloadButton quotationId={quotationId} fetcher={fetchAsPeruActiva} />
          )}
          <div className="pa-detail-layout">
            <section className="pa-detail-specifications" aria-label="Resumen del pedido">
              <h2>
                <OrderIcon name="shirt" />
                Pedido
              </h2>
              <div className="pa-item-previews">
                {garments.map((garment, index) => (
                  <OrderItemPreview key={index} garment={garment} index={index} />
                ))}
              </div>
              <details className="pa-order-disclosure">
                <summary>
                  <OrderIcon name="info" />
                  Ver especificaciones
                </summary>
                <QuotationRequestSummary
                  draft={request.request}
                  showPendingPrice={!request.quotation}
                />
                {request.request.notes && <p>{request.request.notes}</p>}
              </details>
              {request.quotation && (
                <details className="pa-order-disclosure">
                  <summary>
                    <OrderIcon name="price" />
                    Ver cotización
                  </summary>
                  <QuotationPriceBreakdown request={request} />
                  <p>{request.quotation.conditions}</p>
                  <DeliveryConfirmationSummary
                    quotation={request.quotation}
                    requiredBy={request.request.delivery.requiredBy}
                    accepted={request.status === 'accepted'}
                  />
                </details>
              )}
            </section>
            <div className="pa-detail-action">
              {request.status === 'accepted' ? (
                <>
                  {orderIds.length > 1 && (
                    <label className="pa-order-selector">
                      Prenda
                      <select
                        aria-label="Prenda"
                        value={activeOrderId}
                        onChange={(event) => {
                          setSelectedOrderId(event.target.value);
                          setAssignmentConfirmed(false);
                        }}
                      >
                        {orderIds.map((id, index) => (
                          <option key={id} value={id}>
                            {garments[index]
                              ? `${garments[index]!.product === 'polo' ? 'Polos' : 'Buzos'} · ${garments[index]!.color} · ${garments[index]!.quantity}`
                              : `Prenda ${index + 1}`}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                  {activeOrderId ? (
                    <OrderAssignmentPanel
                      key={activeOrderId}
                      orderId={activeOrderId}
                      onAssignedChange={setAssignmentConfirmed}
                    />
                  ) : (
                    <p className="pa-order-notice">Preparando la evaluación del pedido.</p>
                  )}
                </>
              ) : request.previewOnly ? (
                <p className="pa-order-notice">Demostración de solo lectura, sin envíos.</p>
              ) : (
                <>
                  {request.status === 'quoted' && (
                    <p className="pa-order-notice">
                      <OrderIcon name="clock" />
                      Esperando la aceptación del cliente.
                    </p>
                  )}
                  <details className="pa-quote-editor" open={request.status === 'pending_quote'}>
                    <summary>
                      <OrderIcon name="price" />
                      {request.status === 'pending_quote'
                        ? 'Preparar cotización'
                        : request.status === 'quoted'
                          ? 'Editar cotización'
                          : 'Cotización cerrada'}
                    </summary>
                    <aside className="quote-sheet pa-quotation-panel">
                      {request.status === 'pending_quote' || request.status === 'quoted' ? (
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
                                  <div
                                    className="pa-line-item-description"
                                    hidden={garments.length === 1}
                                  >
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
                                  <InputField
                                    label={`Tela ofrecida para ${garment.product === 'polo' ? 'polos' : 'buzos'}`}
                                  >
                                    <input
                                      {...form.register(`lineItems.${index}.selectedFabric`)}
                                      placeholder="Tela acordada para esta prenda"
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
                              S/{' '}
                              {totalPricePEN.toLocaleString('es-PE', { minimumFractionDigits: 2 })}
                            </strong>
                          </div>
                          <input type="hidden" {...form.register('selectedFabric')} />
                          <div className="pa-quote-options">
                            <InputField label="¿Quién compra la tela?">
                              <select {...form.register('fabricBuyer')}>
                                <option value="workshop">Taller productor</option>
                                <option value="peru_activa">Perú Activa</option>
                              </select>
                            </InputField>
                            <InputField label="Cotización válida hasta">
                              <input
                                type="date"
                                min={dateAfter(1)}
                                {...form.register('validUntil')}
                              />
                            </InputField>
                          </div>
                          <InputField label="Condiciones">
                            <textarea rows={2} {...form.register('conditions')} />
                          </InputField>
                          <DeliveryConfirmationField
                            requiredBy={request.request.delivery.requiredBy}
                            register={form.register}
                          />
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
                          <p>
                            Compra de tela:{' '}
                            {request.quotation.fabricBuyer === 'peru_activa'
                              ? 'Perú Activa'
                              : 'Taller productor'}
                          </p>
                          <p>{request.quotation.conditions}</p>
                          <DeliveryConfirmationSummary
                            quotation={request.quotation}
                            requiredBy={request.request.delivery.requiredBy}
                            accepted={false}
                          />
                          <small>Válida hasta {request.quotation.validUntil}</small>
                        </div>
                      ) : null}
                    </aside>
                  </details>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </PeruActivaOrderLayout>
  );
}
