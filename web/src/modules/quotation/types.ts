import type {
  QuotationRequestDraft,
  QuotationStatus,
  SellerQuotationDraft,
} from '../../../../src/domain/quotation-requests';

export interface QuotationRequest {
  id: string;
  status: QuotationStatus;
  request: QuotationRequestDraft;
  quotation?: SellerQuotationDraft;
}
