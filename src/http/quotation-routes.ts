import { deliveryPlanningInputSchema } from '../domain/delivery-estimate.js';
import { Router, type Request, type Response } from 'express';
import { ZodError } from 'zod';
import { renderQuotationDocument } from '../infrastructure/quotation-document.js';
import type { CustomerRegistration } from '../application/customer-registration.js';
import { QuotationFlowError, QuotationService } from '../application/quotation-service.js';
import {
  AccessAuthorizationError,
  requireRole,
  type AuthenticatedIdentity,
} from '../domain/identity.js';
import {
  buyerDecisionSchema,
  quotationRequestDraftSchema,
  sellerQuotationDraftSchema,
  type QuotationRequest,
} from '../domain/quotation-requests.js';

type IdentityResolver = (request: Request) => Promise<AuthenticatedIdentity>;

export function createQuotationRouter(
  service: QuotationService,
  resolveIdentity: IdentityResolver,
  customerRegistration: CustomerRegistration,
): Router {
  const router = Router();

  router.get('/', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      if (identity.role === 'workshop') {
        throw new AccessAuthorizationError('forbidden', 'El taller no consulta cotizaciones.');
      }
      const requests =
        identity.role === 'peru_activa'
          ? await service.list()
          : await service.listOwnedBy(identity.subject, identity.email || '');
      response.json({
        ok: true,
        requests,
        simulated: true,
      });
    });
  });

  router.post('/delivery-estimate', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      requireRole(identity, 'client', 'peru_activa');
      response.set('Cache-Control', 'private, no-store');
      response.json({ ok: true, estimate: await service.estimateDelivery(deliveryPlanningInputSchema.parse(request.body)) });
    });
  });

  router.post('/', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      requireRole(identity, 'client', 'peru_activa');
      if (!identity.email) {
        throw new AccessAuthorizationError(
          'unauthenticated',
          'La identidad del cliente no contiene correo.',
        );
      }
      if ((await customerRegistration.status(identity)).required) {
        response.status(409).json({
          ok: false,
          error: 'customer_registration_required',
          message: 'Completa el registro de tu cuenta antes de enviar una solicitud.',
        });
        return;
      }
      const parsed = quotationRequestDraftSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ ok: false, error: 'invalid_quotation_request', issues: parsed.error.issues });
        return;
      }
      response.status(201).json({
        ok: true,
        request: await service.create(parsed.data, {
          subject: identity.subject,
          email: identity.email,
        }),
        simulated: true,
      });
    });
  });

  router.get('/:id', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      const quotation = await service.get(request.params.id);
      ensureCanRead(quotation, identity);
      response.json({ ok: true, request: quotation, emailDelivery: await service.emailStatus(quotation.id), simulated: true });
    });
  });

  router.get('/:id/email-status', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      const quotation = await service.get(request.params.id);
      ensureCanRead(quotation, identity);
      response.json({ ok: true, ...(await service.emailStatus(quotation.id)) });
    });
  });

  router.get('/:id/quotation.pdf', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      const quotation = await service.get(request.params.id);
      ensureCanRead(quotation, identity);
      if (!quotation.quotation) throw new QuotationFlowError('invalid_state', 'La solicitud aún no tiene cotización.');
      const pdf = await renderQuotationDocument(quotation);
      response.set('Cache-Control', 'private, no-store');
      response.set('Content-Disposition', `attachment; filename="Peru-Activa_Cotizacion_${quotation.id.replace(/[^a-zA-Z0-9-]/g, '')}.pdf"`);
      response.type('application/pdf').send(pdf);
    });
  });

  router.post('/:id/quotation', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      requireRole(identity, 'peru_activa');
      const parsed = sellerQuotationDraftSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ ok: false, error: 'invalid_quotation', issues: parsed.error.issues });
        return;
      }
      response.json({
        ok: true,
        request: await service.quote(request.params.id, parsed.data),
        emailDelivery: await service.emailStatus(request.params.id),
        simulated: true,
      });
    });
  });

  router.post('/:id/quotation-preview', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      requireRole(identity, 'peru_activa');
      response.set('Cache-Control', 'private, no-store');
      response.json({ ok: true, ...(await service.previewQuotation(request.params.id,
        sellerQuotationDraftSchema.parse(request.body))) });
    });
  });

  router.get('/:id/draft', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      requireRole(identity, 'client', 'peru_activa');
      const quotation = await service.get(request.params.id);
      ensureIsOwner(quotation, identity);
      const draft = structuredClone(quotation.request);
      draft.delivery.requiredBy = '';
      response.json({ ok: true, draft, sourceQuotationId: quotation.id });
    });
  });

  router.post('/:id/decision', async (request, response) => {
    await runAuthorizedAction(request, response, resolveIdentity, async (identity) => {
      requireRole(identity, 'client', 'peru_activa');
      const quotation = await service.get(request.params.id);
      ensureIsOwner(quotation, identity);
      const parsed = buyerDecisionSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ ok: false, error: 'invalid_decision', issues: parsed.error.issues });
        return;
      }
      response.json({
        ok: true,
        request: await service.respond(request.params.id, parsed.data),
        simulated: true,
      });
    });
  });

  return router;
}

function isOwnedBy(quotation: QuotationRequest, identity: AuthenticatedIdentity): boolean {
  if (quotation.owner) return quotation.owner.subject === identity.subject;
  return Boolean(
    identity.email && quotation.request.customer.contact.trim().toLowerCase() === identity.email,
  );
}

function ensureCanRead(quotation: QuotationRequest, identity: AuthenticatedIdentity): void {
  if (identity.role === 'peru_activa') return;
  if (identity.role === 'client' && isOwnedBy(quotation, identity)) return;
  throw new QuotationFlowError('not_found', 'Solicitud no encontrada.');
}

function ensureIsOwner(quotation: QuotationRequest, identity: AuthenticatedIdentity): void {
  if (isOwnedBy(quotation, identity)) return;
  throw new QuotationFlowError('not_found', 'Solicitud no encontrada.');
}

async function runAuthorizedAction(
  request: Request,
  response: Response,
  resolveIdentity: IdentityResolver,
  action: (identity: AuthenticatedIdentity) => Promise<void>,
): Promise<void> {
  try {
    await action(await resolveIdentity(request));
  } catch (error) {
    if (error instanceof AccessAuthorizationError) {
      response
        .status(error.code === 'unauthenticated' ? 401 : 403)
        .json({ ok: false, error: error.code, message: error.message });
      return;
    }
    if (error instanceof QuotationFlowError) {
      response
        .status(error.code === 'not_found' ? 404 : 409)
        .json({ ok: false, error: error.code, message: error.message, ...(error.estimate ? { estimate: error.estimate } : {}) });
      return;
    }
    if (error instanceof ZodError) {
      response.status(400).json({ ok: false, error: 'invalid_payload', issues: error.issues });
      return;
    }
    throw error;
  }
}
