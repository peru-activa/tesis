import type { QuotationRequest } from './quotation-requests.js';
import type { PortalOrder } from './orders.js';
import { jsonSha256 } from './json-integrity.js';
import type { CustomerEmailKind } from './customer-email-events.js';
export type { CustomerEmailKind } from './customer-email-events.js';

export type CustomerEmailState =
  'pending' | 'processing' | 'accepted' | 'failed' | 'uncertain' | 'superseded';

export interface CustomerEmailJob {
  id: string;
  quotationId: string;
  kind: CustomerEmailKind;
  recipient: string;
  createdAt: string;
  snapshot: QuotationRequest;
}

export interface CustomerEmailRecord extends CustomerEmailJob {
  state: CustomerEmailState;
  attempts: number;
  nextAttemptAt: string;
  claimedAt?: string;
  claimToken?: string;
  providerMessageId?: string;
  providerQueued?: boolean;
  errorCode?: string;
}

export type CustomerEmailSummary = Pick<
  CustomerEmailRecord,
  'id' | 'kind' | 'createdAt' | 'state' | 'providerQueued'
>;

export interface CustomerEmailDelivery {
  enabled: boolean;
  messages: CustomerEmailSummary[];
}

export interface CustomerEmailQueue {
  enqueueEmail(job: CustomerEmailJob): Promise<void>;
  emailStatus(quotationId: string): Promise<CustomerEmailSummary[]>;
  claimEmail(now: string): Promise<CustomerEmailRecord | undefined>;
  finishEmail(
    id: string,
    token: string,
    result: {
      state: CustomerEmailState;
      nextAttemptAt?: string;
      providerMessageId?: string;
      providerQueued?: boolean;
      errorCode?: string;
    },
  ): Promise<void>;
}

export interface CustomerEmailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  attachments: Array<{
    filename: string;
    content: Buffer;
    type: string;
    disposition?: 'attachment' | 'inline';
    contentId?: string;
  }>;
}

export interface CustomerEmailTransport {
  send(message: CustomerEmailMessage): Promise<{ messageId: string; queued: boolean }>;
}

export interface CustomerEmailQuotationRepository {
  get(id: string): Promise<QuotationRequest | undefined>;
  enqueueEmail(job: CustomerEmailJob): Promise<void>;
}

export function customerEmailJob(
  request: QuotationRequest,
  kind: CustomerEmailKind,
  occurredAt = request.updatedAt,
): CustomerEmailJob | undefined {
  if (request.previewOnly || request.testOnly || !request.owner?.email) return undefined;
  const snapshot = structuredClone(request);
  for (const garment of [snapshot.request.garment, ...snapshot.request.additionalGarments]) {
    delete garment.designAttachment;
    for (const application of garment.designApplications ?? []) delete application.attachment;
  }
  const revision =
    kind === 'request_received'
      ? request.createdAt
      : kind === 'quotation_issued'
        ? request.quotation
        : null;
  return {
    id: jsonSha256([request.id, kind, revision]),
    quotationId: request.id,
    kind,
    recipient: request.owner.email,
    createdAt: occurredAt,
    snapshot,
  };
}

export function isCustomerOrderReady(request: QuotationRequest, orders: PortalOrder[]): boolean {
  if (request.status !== 'accepted' || request.previewOnly || request.testOnly) return false;
  const ids = request.production?.orderIds ?? [];
  const expected = 1 + request.request.additionalGarments.length;
  if (new Set(ids).size !== expected) return false;
  return ids.every((id) =>
    orders.some(
      (order) =>
        order.id === id &&
        order.source?.quotationId === request.id &&
        !order.previewOnly &&
        !order.testOnly &&
        order.status === 'completed',
    ),
  );
}

export function customerOrderReadyEmail(
  request: QuotationRequest,
  orders: PortalOrder[],
): CustomerEmailJob | undefined {
  if (!isCustomerOrderReady(request, orders)) return undefined;
  const ids = new Set(request.production!.orderIds);
  const times = [
    request.updatedAt,
    ...orders.filter((order) => ids.has(order.id)).map((order) => order.updatedAt),
  ].map(Date.parse);
  if (times.some((time) => !Number.isFinite(time))) return undefined;
  return customerEmailJob(request, 'order_ready', new Date(Math.max(...times)).toISOString());
}

export class EmailDeliveryError extends Error {
  constructor(
    readonly code: string,
    readonly outcome: 'retry' | 'failed' | 'uncertain',
  ) {
    super(code);
  }
}
