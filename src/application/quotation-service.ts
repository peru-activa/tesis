import { randomUUID } from 'node:crypto';
import type { DeliveryPlanningService } from './delivery-planning.js';
import type { DeliveryEstimate, DeliveryPlanningInput } from '../domain/delivery-estimate.js';
import { addDateDays, calendarDaysBetween, limaDate, quotationExpired } from '../domain/delivery-estimate.js';
import { IGV_RATE, quotationLineAmount, quotationPricing } from '../domain/quotation-pricing.js';
import {
  buyerDecisionSchema,
  quotationRequestDraftSchema,
  sellerQuotationDraftSchema,
  isDeliveryDateConfirmed,
  type BuyerDecisionDraft,
  type QuotationRequest,
  type QuotationRequestDraft,
  type SellerQuotationDraft,
  type SellerQuotation,
} from '../domain/quotation-requests.js';
import type { QuotationOwner } from '../domain/identity.js';
import type { QuotationStore } from '../infrastructure/quotation-store.js';
import { customerEmailJob } from './customer-email.js';
import type { CustomerEmailKind } from '../domain/customer-email.js';
import { jsonSha256 } from '../infrastructure/json-integrity.js';

interface QuotationLifecycle {
  deliveryPlanning?: DeliveryPlanningService;
  customerEmails?: boolean;
  onUpdated?: (request: QuotationRequest) => void;
  onAccepted?: (request: QuotationRequest) => Promise<NonNullable<QuotationRequest['production']>>;
}

export class QuotationFlowError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_state' | 'delivery_unavailable' | 'quotation_expired',
    message: string,
    readonly estimate?: DeliveryEstimate,
  ) {
    super(message);
  }
}

export class QuotationService {
  constructor(
    private readonly store: QuotationStore,
    private readonly now: () => Date = () => new Date(),
    private readonly lifecycle: QuotationLifecycle = {},
  ) {}

  list(): Promise<QuotationRequest[]> {
    return this.store.list();
  }

  listOwnedBy(subject: string, email: string): Promise<QuotationRequest[]> {
    return this.store.listOwnedBy(subject, email);
  }

  getOwnedBy(id: string, subject: string, email: string): Promise<QuotationRequest | undefined> {
    return this.store.getOwnedBy(id, subject, email);
  }

  get(id: string): Promise<QuotationRequest> {
    return this.requireRequest(id);
  }

  async emailStatus(id: string) {
    return { enabled: this.lifecycle.customerEmails === true, messages: await this.store.emailStatus(id) };
  }

  async create(input: QuotationRequestDraft, owner?: QuotationOwner): Promise<QuotationRequest> {
    const request = quotationRequestDraftSchema.parse(input);
    const deliveryEstimate = await this.ensureDelivery(request);
    const timestamp = this.now().toISOString();
    return this.saveAndPublish({
      id: `COT-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'pending_quote',
      ...(deliveryEstimate ? { deliveryEstimate } : {}),
      ...(owner ? { owner } : {}),
      request,
    }, 'request_received');
  }

  async quote(id: string, input: SellerQuotationDraft): Promise<QuotationRequest> {
    const current = await this.requireRequest(id);
    if (current.status !== 'pending_quote' && current.status !== 'quoted') {
      throw new QuotationFlowError(
        'invalid_state',
        'La solicitud ya recibió una respuesta del cliente.',
      );
    }
    if (!isDeliveryDateConfirmed(input, current.request.delivery.requiredBy)) {
      throw new QuotationFlowError(
        'invalid_state',
        'Perú Activa debe confirmar expresamente la fecha solicitada antes de enviar la cotización.',
      );
    }
    const { quotation, deliveryEstimate } = await this.prepareQuotation(current, input);
    const quotedAt = this.now().toISOString();
    if (current.quotation) {
      const { quotedAt: _previousDate, ...previous } = current.quotation;
      const { quotedAt: _newDate, ...next } = quotation;
      if (jsonSha256(previous) === jsonSha256(next)) {
        return this.lifecycle.customerEmails
          ? this.saveAndPublish(current, 'quotation_issued')
          : current;
      }
    }
    return this.saveAndPublish({
      ...current,
      updatedAt: quotedAt,
      status: 'quoted',
      quotation,
      ...(deliveryEstimate ? { deliveryEstimate } : {}),
    }, 'quotation_issued');
  }

  async previewQuotation(id: string, input: SellerQuotationDraft) {
    const current = await this.requireRequest(id);
    return this.prepareQuotation(current, input);
  }

  private async prepareQuotation(current: QuotationRequest, input: SellerQuotationDraft) {
    const parsed = sellerQuotationDraftSchema.parse(input);
    if (quotationExpired(parsed.validUntil, this.now().toISOString())) {
      throw new QuotationFlowError('quotation_expired', 'La vigencia debe ser hoy o una fecha posterior.');
    }
    const quotation: SellerQuotation = { ...parsed, quotedAt: this.now().toISOString() };
    const garments = [current.request.garment, ...current.request.additionalGarments];
    if (quotation.lineItems) {
      const indexes = new Set(quotation.lineItems.map((item) => item.garmentIndex));
      const completeBreakdown =
        quotation.lineItems.length === garments.length &&
        garments.every((_garment, index) => indexes.has(index));
      if (!completeBreakdown) {
        throw new QuotationFlowError(
          'invalid_state',
          'La cotización debe incluir un precio unitario por cada tipo de prenda.',
        );
      }
      quotation.priceAmountPEN = quotationLineAmount(garments.map((g) => g.quantity), quotation.lineItems);
    } else {
      quotation.priceAmountPEN = quotation.priceAmountPEN ?? quotation.totalPricePEN;
    }
    if (quotation.taxMode) quotation.taxRate = IGV_RATE;
    quotation.totalPricePEN = quotationPricing(quotation.priceAmountPEN, quotation.taxMode).totalPricePEN;
    const deliveryEstimate = await this.ensureDelivery(current.request, { ...current, quotation });
    if (deliveryEstimate?.earliestDate) {
      let calendarDays = Math.max(1, calendarDaysBetween(deliveryEstimate.approvalBy, deliveryEstimate.earliestDate));
      // A single advertised duration must cover every acceptance day, including
      // calendar gaps or workshops occupied early in the validity window.
      for (let day = limaDate(this.now().toISOString()); day < quotation.validUntil; day = addDateDays(day, 1)) {
        const estimate = await this.ensureDelivery(current.request, { ...current,
          quotation: { ...quotation, validUntil: day } });
        calendarDays = Math.max(calendarDays, calendarDaysBetween(day, estimate!.earliestDate!));
      }
      if (addDateDays(quotation.validUntil, calendarDays) > current.request.delivery.requiredBy) {
        throw new QuotationFlowError('delivery_unavailable',
          'Acorta la vigencia: el plazo calculado desde el último día de aceptación supera la fecha solicitada.');
      }
      quotation.deliveryTerms = {
        calendarDays,
        startsOn: 'acceptance',
      };
    }
    return { quotation, deliveryEstimate };
  }

  async respond(id: string, input: BuyerDecisionDraft): Promise<QuotationRequest> {
    const current = await this.requireRequest(id);
    const parsed = buyerDecisionSchema.parse(input);
    if (current.status === parsed.decision && current.buyerDecision?.decision === parsed.decision)
      return current;
    if (current.status !== 'quoted' || !current.quotation) {
      throw new QuotationFlowError(
        'invalid_state',
        'La solicitud debe tener una cotización antes de responder.',
      );
    }
    if (parsed.decision === 'accepted' && quotationExpired(current.quotation.validUntil, this.now().toISOString())) {
      throw new QuotationFlowError('quotation_expired', 'La cotización venció. Solicita a Perú Activa una propuesta actualizada.');
    }
    if (
      parsed.decision === 'accepted' &&
      !isDeliveryDateConfirmed(current.quotation, current.request.delivery.requiredBy)
    ) {
      throw new QuotationFlowError(
        'invalid_state',
        'La fecha solicitada aún no está confirmada por Perú Activa. Solicita que actualice la cotización.',
      );
    }
    const deliveryDate = parsed.decision === 'accepted' && current.quotation.deliveryTerms
      ? addDateDays(limaDate(this.now().toISOString()), current.quotation.deliveryTerms.calendarDays)
      : undefined;
    if (deliveryDate && deliveryDate > current.request.delivery.requiredBy) {
      throw new QuotationFlowError('delivery_unavailable', 'El plazo supera la fecha solicitada. Pide actualizar la cotización.');
    }
    const deliveryEstimate = parsed.decision === 'accepted'
      ? await this.ensureDelivery(deliveryDate ? {
        ...current.request, delivery: { ...current.request.delivery, requiredBy: deliveryDate },
      } : current.request, current, true) : undefined;
    const respondedAt = this.now().toISOString();
    const decided: QuotationRequest = {
      ...current,
      updatedAt: respondedAt,
      status: parsed.decision,
      buyerDecision: { ...parsed, respondedAt, ...(deliveryDate ? { deliveryDate } : {}) },
      ...(deliveryEstimate ? { deliveryEstimate } : {}),
    };
    const production =
      parsed.decision === 'accepted' ? await this.lifecycle.onAccepted?.(decided) : undefined;
    return this.saveAndPublish(production ? { ...decided, production } : decided,
      parsed.decision === 'accepted' ? 'order_confirmed' : undefined);
  }

  async estimateDelivery(input: DeliveryPlanningInput): Promise<DeliveryEstimate> {
    if (!this.lifecycle.deliveryPlanning) throw new QuotationFlowError('invalid_state', 'El cálculo de entrega no está disponible.');
    return this.lifecycle.deliveryPlanning.estimate(input);
  }

  private async ensureDelivery(input: QuotationRequestDraft, quotation?: QuotationRequest, approving = false) {
    if (!this.lifecycle.deliveryPlanning) return undefined;
    const options = {
      ...(quotation ? { quotation } : {}),
      ...(quotation?.quotation ? { approvalDate: quotation.quotation.validUntil } : {}), approving,
    };
    const estimate = await this.lifecycle.deliveryPlanning.estimate(input, { ...options, requiredBy: input.delivery.requiredBy });
    if (estimate.status === 'available') return estimate;
    throw new QuotationFlowError('delivery_unavailable', estimate.reason === 'search_limit'
      ? 'No se pudo completar el cálculo de entrega. Consulta con Perú Activa antes de continuar.' : estimate.earliestDate
      ? `La entrega debe ser a partir del ${estimate.earliestDate}. La capacidad se ha vuelto a calcular; revisa la fecha antes de continuar.`
      : 'No hay una entrega viable con estas prendas y la capacidad actual. Revisa las cantidades o consulta con Perú Activa.', estimate);
  }

  private async saveAndPublish(request: QuotationRequest, kind?: CustomerEmailKind): Promise<QuotationRequest> {
    const email = this.lifecycle.customerEmails && kind ? customerEmailJob(request, kind) : undefined;
    const saved = await this.store.save(request, email);
    this.lifecycle.onUpdated?.(saved);
    return saved;
  }

  private async requireRequest(id: string): Promise<QuotationRequest> {
    const request = await this.store.get(id);
    if (!request) throw new QuotationFlowError('not_found', 'Solicitud no encontrada.');
    return request;
  }
}
