import { z } from 'zod';
import {
  EmailDeliveryError,
  type CustomerEmailMessage,
  type CustomerEmailTransport,
} from '../domain/customer-email.js';

const configuration = z.object({
  accountId: z.string().regex(/^[a-f0-9]{32}$/),
  token: z.string().min(1),
  from: z.email(),
  replyTo: z.email(),
  name: z.string().min(1).max(100),
  portalUrl: z
    .url()
    .refine((value) => new URL(value).protocol === 'https:', 'Usa HTTPS para el portal.'),
});
export type CustomerEmailConfiguration = z.infer<typeof configuration>;

export function customerEmailConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): CustomerEmailConfiguration | undefined {
  if (environment.CUSTOMER_EMAIL_ENABLED !== 'true') return undefined;
  if (environment.NODE_ENV !== 'production') {
    throw new Error(
      'Customer email requires Cloudflare Access authentication (NODE_ENV=production).',
    );
  }
  return configuration.parse({
    accountId: environment.CUSTOMER_EMAIL_CF_ACCOUNT_ID,
    token: environment.CUSTOMER_EMAIL_CF_API_TOKEN,
    from: environment.CUSTOMER_EMAIL_FROM,
    replyTo: environment.CUSTOMER_EMAIL_REPLY_TO,
    name: environment.CUSTOMER_EMAIL_FROM_NAME || 'Perú Activa',
    portalUrl: environment.CUSTOMER_EMAIL_PORTAL_URL,
  });
}

export class CloudflareEmailTransport implements CustomerEmailTransport {
  constructor(
    private readonly config: CustomerEmailConfiguration,
    private readonly fetchImpl = fetch,
  ) {}

  async send(message: CustomerEmailMessage): Promise<{ messageId: string; queued: boolean }> {
    let response: Response;
    try {
      response = await this.fetchImpl(
        `https://api.cloudflare.com/client/v4/accounts/${this.config.accountId}/email/sending/send`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${this.config.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: { address: this.config.from, name: this.config.name },
            reply_to: this.config.replyTo,
            to: message.to,
            subject: message.subject,
            text: message.text,
            html: message.html,
            attachments: message.attachments.map((file) => ({
              filename: file.filename,
              type: file.type,
              content: file.content.toString('base64'),
              disposition: file.disposition ?? 'attachment',
              ...(file.contentId ? { content_id: file.contentId } : {}),
            })),
          }),
          signal: AbortSignal.timeout(30_000),
        },
      );
    } catch {
      throw new EmailDeliveryError('provider_result_unknown', 'uncertain');
    }
    if (response.status === 429) throw new EmailDeliveryError('provider_rate_limited', 'retry');
    if (!response.ok)
      throw new EmailDeliveryError(
        `provider_http_${response.status}`,
        response.status >= 500 ? 'uncertain' : 'failed',
      );
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new EmailDeliveryError('provider_invalid_response', 'uncertain');
    }
    const parsed = z
      .object({
        success: z.boolean(),
        result: z
          .object({
            message_id: z.string().optional(),
            delivered: z.array(z.string()),
            queued: z.array(z.string()),
            permanent_bounces: z.array(z.string()),
            suppressed_recipients: z.array(z.string()).optional(),
          })
          .nullable(),
      })
      .safeParse(body);
    if (!parsed.success || !parsed.data.success || !parsed.data.result)
      throw new EmailDeliveryError('provider_unconfirmed', 'uncertain');
    const result = parsed.data.result;
    const matches = (addresses: string[]) =>
      addresses.some((address) => address.toLowerCase() === message.to.toLowerCase());
    if (matches(result.permanent_bounces) || matches(result.suppressed_recipients ?? []))
      throw new EmailDeliveryError('recipient_rejected', 'failed');
    if (!matches(result.delivered) && !matches(result.queued))
      throw new EmailDeliveryError('recipient_unconfirmed', 'uncertain');
    return { messageId: result.message_id || '', queued: matches(result.queued) };
  }
}
