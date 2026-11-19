import { randomUUID } from 'node:crypto';
import type { DeliveryPlanningService } from './delivery-planning.js';
import type { DeliveryEstimate, DeliveryPlanningInput } from '../domain/delivery-estimate.js';
import {
  buyerDecisionSchema,
  quotationRequestDraftSchema,
  sellerQuotationDraftSchema,
  isDeliveryDateConfirmed,
  type BuyerDecisionDraft,
  type QuotationRequest,
  type QuotationRequestDraft,
  type SellerQuotationDraft,
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
    readonly code: 'not_found' | 'invalid_state' | 'delivery_unavailable',
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
    const quotation = sellerQuotationDraftSchema.parse(input);
    if (!isDeliveryDateConfirmed(quotation, current.request.delivery.requiredBy)) {
      throw new QuotationFlowError(
        'invalid_state',
        'Perú Activa debe confirmar expresamente la fecha solicitada antes de enviar la cotización.',
      );
    }
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
      quotation.totalPricePEN = Number(
        quotation.lineItems
          .reduce(
            (total, item) => total + garments[item.garmentIndex]!.quantity * item.unitPricePEN,
            0,
          )
          .toFixed(2),
      );
    }
    const deliveryEstimate = await this.ensureDelivery(current.request, {
      ...current, quotation: { ...quotation, quotedAt: this.now().toISOString() },
    });
    const quotedAt = this.now().toISOString();
    if (current.quotation) {
      const { quotedAt: _previousDate, ...previous } = current.quotation;
      if (jsonSha256(previous) === jsonSha256(quotation)) {
        return this.lifecycle.customerEmails
          ? this.saveAndPublish(current, 'quotation_issued')
          : current;
      }
    }
    return this.saveAndPublish({
      ...current,
      updatedAt: quotedAt,
      status: 'quoted',
      quotation: { ...quotation, quotedAt },
      ...(deliveryEstimate ? { deliveryEstimate } : {}),
    }, 'quotation_issued');
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
    if (
      parsed.decision === 'accepted' &&
      !isDeliveryDateConfirmed(current.quotation, current.request.delivery.requiredBy)
    ) {
      throw new QuotationFlowError(
        'invalid_state',
        'La fecha solicitada aún no está confirmada por Perú Activa. Solicita que actualice la cotización.',
      );
    }
    const deliveryEstimate = parsed.decision === 'accepted'
      ? await this.ensureDelivery(current.request, current, true) : undefined;
    const respondedAt = this.now().toISOString();
    const decided: QuotationRequest = {
      ...current,
      updatedAt: respondedAt,
      status: parsed.decision,
      buyerDecision: { ...parsed, respondedAt },
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
    const options = { ...(quotation ? { quotation } : {}), approving };
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
