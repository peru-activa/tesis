import { Router } from 'express';
import { ZodError } from 'zod';
import { QuotationFlowError, QuotationService } from '../application/quotation-service.js';
import {
  buyerDecisionSchema,
  quotationRequestDraftSchema,
  sellerQuotationDraftSchema,
} from '../domain/quotation-requests.js';

export function createQuotationRouter(service: QuotationService): Router {
  const router = Router();

  router.get('/', async (_request, response) => {
    response.json({ ok: true, requests: await service.list(), simulated: true });
  });

  router.post('/', async (request, response) => {
    const parsed = quotationRequestDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: 'invalid_quotation_request', issues: parsed.error.issues });
      return;
    }
    response.status(201).json({ ok: true, request: await service.create(parsed.data), simulated: true });
  });

  router.post('/:id/quotation', async (request, response) => {
    const parsed = sellerQuotationDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: 'invalid_quotation', issues: parsed.error.issues });
      return;
    }
    await runFlowAction(response, () => service.quote(request.params.id, parsed.data));
  });

  router.post('/:id/decision', async (request, response) => {
    const parsed = buyerDecisionSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: 'invalid_decision', issues: parsed.error.issues });
      return;
    }
    await runFlowAction(response, () => service.respond(request.params.id, parsed.data));
  });

  return router;
}

async function runFlowAction(
  response: Parameters<Parameters<Router['post']>[1]>[1],
  action: () => Promise<unknown>,
): Promise<void> {
  try {
    response.json({ ok: true, request: await action(), simulated: true });
  } catch (error) {
    if (error instanceof QuotationFlowError) {
      response.status(error.code === 'not_found' ? 404 : 409).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({ ok: false, error: 'invalid_payload', issues: error.issues });
      return;
    }
    throw error;
  }
}
