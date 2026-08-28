import { randomUUID } from 'node:crypto';
import {
  buyerDecisionSchema,
  quotationRequestDraftSchema,
  sellerQuotationDraftSchema,
  type BuyerDecisionDraft,
  type QuotationRequest,
  type QuotationRequestDraft,
  type SellerQuotationDraft,
} from '../domain/quotation-requests.js';
import type { QuotationOwner } from '../domain/identity.js';
import type { QuotationStore } from '../infrastructure/quotation-store.js';

interface QuotationLifecycle {
  onUpdated?: (request: QuotationRequest) => void;
  onAccepted?: (request: QuotationRequest) => Promise<NonNullable<QuotationRequest['production']>>;
}

export class QuotationFlowError extends Error {
  constructor(
    readonly code: 'not_found' | 'invalid_state',
    message: string,
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

  get(id: string): Promise<QuotationRequest> {
    return this.requireRequest(id);
  }

  async create(input: QuotationRequestDraft, owner?: QuotationOwner): Promise<QuotationRequest> {
    const request = quotationRequestDraftSchema.parse(input);
    const timestamp = this.now().toISOString();
    return this.saveAndPublish({
      id: `COT-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'pending_quote',
      ...(owner ? { owner } : {}),
      request,
    });
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
    const quotedAt = this.now().toISOString();
    return this.saveAndPublish({
      ...current,
      updatedAt: quotedAt,
      status: 'quoted',
      quotation: { ...quotation, quotedAt },
    });
  }

  async respond(id: string, input: BuyerDecisionDraft): Promise<QuotationRequest> {
    const current = await this.requireRequest(id);
    if (current.status !== 'quoted' || !current.quotation) {
      throw new QuotationFlowError(
        'invalid_state',
        'La solicitud debe tener una cotización antes de responder.',
      );
    }
    const parsed = buyerDecisionSchema.parse(input);
    const respondedAt = this.now().toISOString();
    const decided: QuotationRequest = {
      ...current,
      updatedAt: respondedAt,
      status: parsed.decision,
      buyerDecision: { ...parsed, respondedAt },
    };
    const production =
      parsed.decision === 'accepted' ? await this.lifecycle.onAccepted?.(decided) : undefined;
    return this.saveAndPublish(production ? { ...decided, production } : decided);
  }

  private async saveAndPublish(request: QuotationRequest): Promise<QuotationRequest> {
    const saved = await this.store.save(request);
    this.lifecycle.onUpdated?.(saved);
    return saved;
  }

  private async requireRequest(id: string): Promise<QuotationRequest> {
    const request = await this.store.get(id);
    if (!request) throw new QuotationFlowError('not_found', 'Solicitud no encontrada.');
    return request;
  }
}
