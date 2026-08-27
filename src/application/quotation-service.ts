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
import type { QuotationStore } from '../infrastructure/quotation-store.js';

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
  ) {}

  list(): Promise<QuotationRequest[]> {
    return this.store.list();
  }

  async create(input: QuotationRequestDraft): Promise<QuotationRequest> {
    const request = quotationRequestDraftSchema.parse(input);
    const timestamp = this.now().toISOString();
    return this.store.save({
      id: `COT-${randomUUID().slice(0, 8).toUpperCase()}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      status: 'pending_quote',
      request,
    });
  }

  async quote(id: string, input: SellerQuotationDraft): Promise<QuotationRequest> {
    const current = await this.requireRequest(id);
    if (current.status !== 'pending_quote' && current.status !== 'quoted') {
      throw new QuotationFlowError('invalid_state', 'La solicitud ya recibió una respuesta del cliente.');
    }
    const quotation = sellerQuotationDraftSchema.parse(input);
    const quotedAt = this.now().toISOString();
    return this.store.save({
      ...current,
      updatedAt: quotedAt,
      status: 'quoted',
      quotation: { ...quotation, quotedAt },
    });
  }

  async respond(id: string, input: BuyerDecisionDraft): Promise<QuotationRequest> {
    const current = await this.requireRequest(id);
    if (current.status !== 'quoted' || !current.quotation) {
      throw new QuotationFlowError('invalid_state', 'La solicitud debe tener una cotización antes de responder.');
    }
    const parsed = buyerDecisionSchema.parse(input);
    const respondedAt = this.now().toISOString();
    return this.store.save({
      ...current,
      updatedAt: respondedAt,
      status: parsed.decision,
      buyerDecision: { ...parsed, respondedAt },
    });
  }

  private async requireRequest(id: string): Promise<QuotationRequest> {
    const request = await this.store.get(id);
    if (!request) throw new QuotationFlowError('not_found', 'Solicitud no encontrada.');
    return request;
  }
}
