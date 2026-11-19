import { jsonSha256 } from '../infrastructure/json-integrity.js';
import {
  EmailDeliveryError,
  type CustomerEmailJob,
  type CustomerEmailMessage,
  type CustomerEmailQueue,
  type CustomerEmailTransport,
} from '../domain/customer-email.js';
import type { QuotationStore } from '../infrastructure/quotation-store.js';
import type { OrderStore } from '../data/order-store.js';
import { isCustomerOrderReady } from '../domain/customer-email.js';
export { customerEmailJob } from '../domain/customer-email.js';

export type CustomerMessageBuilder = (job: CustomerEmailJob) => Promise<CustomerEmailMessage>;

export class CustomerEmailWorker {
  private busy = false;
  constructor(
    private readonly queue: CustomerEmailQueue,
    private readonly quotations: Pick<QuotationStore, 'get'>,
    private readonly transport: CustomerEmailTransport,
    private readonly buildMessage: CustomerMessageBuilder,
    private readonly now: () => Date = () => new Date(),
    private readonly onChanged?: (quotationId: string) => void,
    private readonly orders?: Pick<OrderStore, 'listBySourceQuotationIds'>,
  ) {}

  async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      for (let count = 0; count < 10; count++) {
        const job = await this.queue.claimEmail(this.now().toISOString());
        if (!job) return;
        await this.deliver(job);
        this.onChanged?.(job.quotationId);
      }
    } finally {
      this.busy = false;
    }
  }

  private async deliver(job: Awaited<ReturnType<CustomerEmailQueue['claimEmail']>> & {}) {
    const token = job.claimToken!;
    const current = await this.quotations.get(job.quotationId);
    if (
      !current ||
      current.previewOnly ||
      current.testOnly ||
      current.owner?.email !== job.recipient ||
      (job.kind === 'quotation_issued' &&
        (!current.quotation ||
          !job.snapshot.quotation ||
          jsonSha256(current.quotation) !== jsonSha256(job.snapshot.quotation)))
    ) {
      await this.queue.finishEmail(job.id, token, { state: 'superseded' });
      return;
    }
    if (
      (job.kind === 'order_confirmed' && current.status !== 'accepted') ||
      (job.kind === 'order_ready' &&
        (!this.orders ||
          !isCustomerOrderReady(current, await this.orders.listBySourceQuotationIds([current.id]))))
    ) {
      await this.queue.finishEmail(job.id, token, { state: 'superseded' });
      return;
    }
    let message: CustomerEmailMessage;
    try {
      message = await this.buildMessage(job);
    } catch {
      await this.queue.finishEmail(job.id, token, {
        state: 'failed',
        errorCode: 'message_render_failed',
      });
      return;
    }
    // After calling the provider, a timeout or crash may mean it accepted the
    // message. Such outcomes are kept for review, never retried blindly.
    let result: { messageId: string; queued: boolean };
    try {
      result = await this.transport.send(message);
    } catch (error) {
      const failure =
        error instanceof EmailDeliveryError
          ? error
          : new EmailDeliveryError('provider_result_unknown', 'uncertain');
      const retry = failure.outcome === 'retry' && job.attempts < 5;
      await this.queue.finishEmail(job.id, token, {
        state: retry ? 'pending' : failure.outcome === 'uncertain' ? 'uncertain' : 'failed',
        errorCode: failure.code,
        ...(retry
          ? {
              nextAttemptAt: new Date(
                this.now().getTime() + Math.min(3_600_000, 30_000 * 2 ** job.attempts),
              ).toISOString(),
            }
          : {}),
      });
      return;
    }
    await this.queue.finishEmail(job.id, token, {
      state: 'accepted',
      providerMessageId: result.messageId,
      providerQueued: result.queued,
    });
  }
}
