import { DeliveryPlanningService } from './application/delivery-planning.js';
import type { DeliveryPolicy } from './domain/delivery-estimate.js';
import { RECOMMENDATION_VERSION } from './domain/contracts.js';
import { AssignmentAutomationService } from './application/assignment-automation.js';
import { recommendationFromOrderDraft } from './application/order-draft-adapter.js';
import { previewMutationGuard } from './http/preview-guard.js';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import compression from 'compression';
import express from 'express';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import {
  AssignmentDemoService,
  AssignmentFlowError,
} from './application/assignment-demo-service.js';
import { workshopAvailability } from './application/workshop-availability.js';
import { workshopAvailabilityReference } from './infrastructure/production-whatsapp.js';
import { QuotationService } from './application/quotation-service.js';
import { CustomerRegistration } from './application/customer-registration.js';
import { createOrderStore, type OrderStore } from './data/order-store.js';
import { week02Demo } from './data/week-02-demo.js';
import { week03DeclaredWorkshops } from './data/week-03-assignment-scenarios.js';
import { createWorkshopStore, type WorkshopStore } from './data/workshop-store.js';
import { productionWhatsAppFromEnvironment, type ProductionWhatsApp } from './infrastructure/production-whatsapp.js';
import {
  AccessAuthorizationError,
  requireRole,
  type AuthenticatedIdentity,
} from './domain/identity.js';
import { fabricBuyerSchema, recommendationRequestSchema } from './domain/contracts.js';
import { portalHomeByRole } from './domain/portal-navigation.js';
import { customerRegistrationSchema } from './domain/customer-registration.js';
import { researchConsentDocument } from './domain/research-consent.js';
import { renderConsentDocument, renderLegacyConsent } from './http/consent-document.js';
import { orderDraftSchema, workshopOrderStatusSchema, type PortalOrder } from './domain/orders.js';
import type { QuotationRequest } from './domain/quotation-requests.js';
import { createQuotationRouter } from './http/quotation-routes.js';
import { resolveIdentity } from './infrastructure/access-identity.js';
import { createCustomerProfileStore } from './infrastructure/customer-profile-store.js';
import { createQuotationStore, type QuotationStore } from './infrastructure/quotation-store.js';
import { CustomerEmailWorker } from './application/customer-email.js';
import { customerEmailConfiguration, CloudflareEmailTransport } from './infrastructure/cloudflare-email.js';
import { customerMessageBuilder } from './infrastructure/customer-email-message.js';
import type { CustomerEmailTransport } from './domain/customer-email.js';

const webDirectory = fileURLToPath(new URL('../public/app/', import.meta.url));
const confirmationSchema = z
  .object({
    candidateId: z.string().min(1).optional(),
    workshopId: z.string().min(1).optional(),
  })
  .refine((value) => value.candidateId || value.workshopId, {
    message: 'Se requiere el identificador del plan de asignación.',
  });

const assignmentScenarioOptionsSchema = z.object({
  fabricBuyer: fabricBuyerSchema.optional(),
});

const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Portal de pedidos de Perú Activa',
    version: '0.8.0',
    description: 'API del MVP académico para registro, recomendación y seguimiento de pedidos.',
  },
  components: {
    securitySchemes: {
      cloudflareAccess: {
        type: 'apiKey',
        in: 'header',
        name: 'Cf-Access-Jwt-Assertion',
        description: 'JWT emitido por Cloudflare Access y validado por la API en producción.',
      },
    },
  },
  paths: {
    '/v1/quotation-requests/delivery-estimate': {
      post: {
        summary: 'Calcular la primera fecha de entrega factible sin reservar capacidad',
        security: [{ cloudflareAccess: [] }],
        responses: { 200: { description: 'Estimación disponible o sin ruta dentro del horizonte' },
          400: { description: 'Especificaciones inválidas' }, 403: { description: 'Rol no autorizado' } },
      },
    },
    '/health': {
      get: {
        summary: 'Verificar el servicio',
        responses: { 200: { description: 'Servicio disponible' } },
      },
    },
    '/v1/orders/{id}': { get: { summary: 'Consultar una orden desde su detalle de Perú Activa', responses: { 200: { description: 'Orden y nombres vigentes de sus talleres' }, 404: { description: 'Orden no encontrada' } } } },
    '/v1/orders': {
      get: {
        summary: 'Listar pedidos de la sesión piloto',
        responses: { 200: { description: 'Lista de pedidos' } },
      },
      post: {
        summary: 'Registrar y evaluar un pedido',
        responses: {
          201: { description: 'Pedido registrado' },
          400: { description: 'Datos inválidos' },
        },
      },
    },
    '/v1/orders/{id}/confirm': {
      post: {
        summary: 'Confirmar humanamente el taller asignado',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Asignación confirmada' },
          404: { description: 'Pedido no encontrado' },
          409: { description: 'Capacidad modificada o pedido ya asignado a otro plan' },
        },
      },
    },
    '/v1/orders/{id}/recommendation': {
      post: {
        summary: 'Actualizar la propuesta usando la carga pendiente de los talleres',
        security: [{ cloudflareAccess: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          200: { description: 'Propuesta actualizada' },
          404: { description: 'Pedido no encontrado' },
          409: { description: 'Pedido ya asignado' },
        },
      },
    },
    '/v1/orders/{id}/status': {
      post: {
        summary: 'Actualizar el avance de una orden desde el taller asignado',
        security: [{ cloudflareAccess: [] }],
        responses: {
          200: { description: 'Estado actualizado' },
          404: { description: 'Orden no asignada al taller' },
          409: { description: 'Transición de estado inválida' },
        },
      },
    },
    '/v1/session': {
      get: {
        summary: 'Obtener la identidad y el rol de la sesión',
        security: [{ cloudflareAccess: [] }],
        responses: { 200: { description: 'Identidad autenticada' } },
      },
    },
    '/v1/customer-registration': {
      get: {
        summary: 'Consultar si la cuenta necesita registro de cliente',
        security: [{ cloudflareAccess: [] }],
        responses: { 200: { description: 'Estado del registro y aviso aplicable' } },
      },
      post: {
        summary: 'Registrar el perfil de la cuenta y su decisión sobre el uso académico',
        security: [{ cloudflareAccess: [] }],
        responses: {
          201: { description: 'Perfil registrado' },
          400: { description: 'Datos de registro inválidos' },
          403: { description: 'Cuenta sin acceso al registro' },
          409: { description: 'Cuenta ya registrada' },
        },
      },
    },
    '/v1/consent-documents/{version}': {
      get: {
        summary: 'Leer o descargar el consentimiento completo antes de participar',
        responses: { 200: { description: 'Documento paginado en HTML' }, 404: { description: 'Versión inexistente' } },
      },
    },
    '/v1/customer-registration/consent': {
      get: {
        summary: 'Obtener una copia del consentimiento y aceptación de la propia cuenta',
        security: [{ cloudflareAccess: [] }],
        responses: { 200: { description: 'Copia personal en HTML' }, 404: { description: 'Sin aceptación registrada' } },
      },
    },
    '/v1/my-orders': {
      get: {
        summary: 'Listar únicamente las solicitudes y pedidos del cliente autenticado',
        security: [{ cloudflareAccess: [] }],
        responses: { 200: { description: 'Historial propio del cliente' } },
      },
    },
    '/v1/my-orders/{quotationId}': {
      get: {
        summary: 'Consultar el estado de una solicitud propia',
        security: [{ cloudflareAccess: [] }],
        responses: {
          200: { description: 'Seguimiento del pedido' },
          404: { description: 'Pedido inexistente o perteneciente a otra cuenta' },
        },
      },
    },
    '/v1/quotation-requests': {
      get: {
        summary: 'Listar solicitudes de cotización simuladas',
        responses: { 200: { description: 'Lista de solicitudes' } },
      },
      post: {
        summary: 'Registrar una solicitud sin calcular precio',
        responses: {
          201: { description: 'Solicitud registrada' },
          400: { description: 'Datos inválidos' },
        },
      },
    },
    '/v1/quotation-requests/{id}/quotation': {
      post: {
        summary: 'Registrar manualmente la cotización de Perú Activa',
        responses: {
          200: { description: 'Cotización registrada' },
          409: { description: 'Estado incompatible' },
        },
      },
    },
    '/v1/quotation-requests/{id}/draft': {
      get: {
        summary:
          'Copiar datos editables de una solicitud propia, sin precio, aceptación ni asignación',
        security: [{ cloudflareAccess: [] }],
        responses: {
          200: { description: 'Borrador editable con nueva fecha pendiente' },
          404: { description: 'Solicitud inexistente o ajena' },
        },
      },
    },
    '/v1/quotation-requests/{id}': {
      get: {
        summary: 'Obtener una solicitud de cotización por su código visible',
        responses: {
          200: { description: 'Detalle completo de la solicitud' },
          404: { description: 'Solicitud no encontrada' },
        },
      },
    },
    '/v1/quotation-requests/{id}/decision': {
      post: {
        summary: 'Registrar la decisión y, al aceptar una prenda, crear la orden evaluada',
        responses: {
          200: { description: 'Decisión registrada' },
          409: { description: 'Cotización pendiente' },
        },
      },
    },
    '/v1/demos/week-02': {
      get: {
        summary: 'Obtener el escenario reproducible de Semana 2',
        responses: { 200: { description: 'Escenario simulado' } },
      },
    },
    '/v1/demos/week-02/run': {
      post: {
        summary: 'Ejecutar la línea base de asignación de Semana 2',
        responses: { 200: { description: 'Resultado explicable' } },
      },
    },
    '/v1/demos/week-03/assignment-scenarios': {
      get: {
        summary:
          'Listar cuatro productores, cuatro proveedores de proceso y nueve escenarios simulados de R5',
        responses: { 200: { description: 'Catálogo reproducible de Semana 3' } },
      },
    },
    '/v1/demos/week-03/assignment-scenarios/{scenarioId}/run': {
      post: {
        summary: 'Ejecutar un escenario simulado y crear un pedido recomendado',
        responses: {
          201: { description: 'Pedido evaluado con candidatos explicables' },
          422: { description: 'Ningún taller cumple todas las restricciones' },
        },
      },
    },
    '/v1/demos/week-03/assignment-scenarios/{scenarioId}/compare': {
      post: {
        summary: 'Comparar la línea base y el algoritmo genético con la misma entrada y semilla',
        responses: {
          200: { description: 'Comparación reproducible con métricas y convergencia' },
          404: { description: 'Escenario no encontrado' },
        },
      },
    },
    '/v1/workshop-notifications': {
      get: {
        summary: 'Listar publicaciones canónicas para web y vista previa de WhatsApp',
        responses: { 200: { description: 'Notificaciones publicadas' } },
      },
    },
    '/v1/orders/{id}/workshop-availability': {
      get: { summary: 'Consultar respuestas de disponibilidad por taller', responses: { 200: { description: 'Disponibilidad de talleres compatibles' } } },
      post: { summary: 'Enviar consultas de disponibilidad a los talleres compatibles', responses: { 200: { description: 'Resultado independiente por taller' } } },
    },
    '/v1/orders/{id}/assignment-automation': {
      get: { summary: 'Leer el plan principal y su ejecución, sin enviar mensajes', responses: { 200: { description: 'Plan y estado persistente' } } },
      post: { summary: 'Autorizar el plan y alternativas solo ante rechazo explícito', responses: { 200: { description: 'Autorización guardada' }, 409: { description: 'Requiere revisión' } } },
    },
    '/v1/orders/{id}/production-coordination': {
      get: {
        summary: 'Consultar recibos de Meta y aceptación explícita por taller',
        responses: { 200: { description: 'Estado por taller del plan confirmado' } },
      },
    },
    '/v1/orders/{id}/production-coordination/{workshopId}/progress': {
      post: {
        summary: 'Enviar consulta de avance a un taller que aceptó el pedido',
        responses: { 200: { description: 'Consulta enviada o ya pendiente' } },
      },
    },
  },
} as const;

export interface AppOptions {
  deliveryPolicy?: Partial<DeliveryPolicy>;
  customerEmail?: { transport: CustomerEmailTransport; portalUrl: string };
  orderStore?: OrderStore;
  quotationStore?: QuotationStore;
  workshopStore?: WorkshopStore;
  productionWhatsApp?: ProductionWhatsApp;
  onOrderUpdated?: (order: PortalOrder) => void;
  onQuotationUpdated?: (quotation: QuotationRequest) => void;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const orderStore = options.orderStore ?? createOrderStore();
  const quotationStore = options.quotationStore ?? createQuotationStore();
  const emailConfig = options.customerEmail ? undefined : customerEmailConfiguration();
  const emailOptions = options.customerEmail ?? (emailConfig ? {
    transport: new CloudflareEmailTransport(emailConfig), portalUrl: emailConfig.portalUrl,
  } : undefined);
  orderStore.configureCustomerEmails(emailOptions ? quotationStore : undefined);
  app.locals.customerEmailWorker = emailOptions ? new CustomerEmailWorker(
    quotationStore, quotationStore, emailOptions.transport, customerMessageBuilder(emailOptions.portalUrl),
    undefined, id => {
      void quotationStore.get(id).then(quotation => {
        if (quotation) options.onQuotationUpdated?.(quotation);
      }).catch(() => undefined);
    },
    orderStore,
  ) : undefined;
  const customerRegistration = new CustomerRegistration(
    createCustomerProfileStore(),
    quotationStore,
    !['production', 'demo'].includes(process.env.NODE_ENV ?? '') &&
      process.env.LOCAL_CUSTOMER_REGISTRATION === 'true',
  );
  const workshopStore = options.workshopStore ?? createWorkshopStore(week03DeclaredWorkshops);
  const productionWhatsApp = options.productionWhatsApp ?? productionWhatsAppFromEnvironment();
  const deliveryPlanning = new DeliveryPlanningService(orderStore, workshopStore, options.deliveryPolicy ?? {
    approvalDays: Number(process.env.DELIVERY_APPROVAL_DAYS ?? 2),
    deliveryDays: Number(process.env.DELIVERY_TRANSIT_DAYS ?? 1),
    handoffDays: Number(process.env.DELIVERY_HANDOFF_DAYS ?? 1),
    horizonDays: Number(process.env.DELIVERY_HORIZON_DAYS ?? 180),
    maximumPlanEvaluations: Number(process.env.DELIVERY_MAXIMUM_PLAN_EVALUATIONS ?? 10_000),
  });
  const assignmentService = new AssignmentDemoService(orderStore, workshopStore, undefined, undefined, deliveryPlanning.policy.deliveryDays, deliveryPlanning.policy.handoffDays);
  const automationService = productionWhatsApp?.consult
    ? new AssignmentAutomationService(orderStore, workshopStore, quotationStore, productionWhatsApp, assignmentService, options.onOrderUpdated)
    : undefined;
  app.locals.assignmentAutomation = automationService;

  const quotationService = new QuotationService(quotationStore, undefined, {
    deliveryPlanning,
    customerEmails: Boolean(emailOptions),
    ...(options.onQuotationUpdated ? { onUpdated: options.onQuotationUpdated } : {}),
    onAccepted: async (quotation) => {
      const outcome = await assignmentService.createFromAcceptedQuotation(quotation);
      outcome.orders.forEach((order) => options.onOrderUpdated?.(order));
      return {
        status: outcome.status,
        orderIds: outcome.orderIds,
        message: outcome.message,
      };
    },
  });

  app.disable('x-powered-by');
  app.use(compression());
  app.use(express.json({ limit: '16mb' }));
  app.use('/v1/orders/:id', previewMutationGuard((id) => orderStore.get(id)));
  app.use('/v1/quotation-requests/:id', previewMutationGuard((id) => quotationStore.get(id)));
  app.get('/v1/session', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      response.json({ ok: true, identity, simulated: identity.authentication === 'local_demo' });
    });
  });
  app.get('/v1/customer-registration', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    await runIdentityAction(request, response, async (identity) => {
      response.json({
        email: identity.email ?? '',
        ...(await customerRegistration.status(identity)),
      });
    });
  });
  app.get('/v1/consent-documents/:version', (request, response) => {
    if (request.params.version !== researchConsentDocument.version) {
      response.status(404).json({ message: 'Documento de consentimiento no encontrado.' });
      return;
    }
    const url = '/v1/consent-documents/' + researchConsentDocument.version + '?download=1';
    response.set('Cache-Control', 'private, no-store, no-transform');
    response.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    if (request.query.download === '1')
      response.attachment('consentimiento-piloto-v' + researchConsentDocument.version + '.html');
    response.type('html').send(renderConsentDocument(researchConsentDocument, url));
  });
  app.get('/v1/customer-registration/consent', async (request, response) => {
    response.set('Cache-Control', 'private, no-store, no-transform');
    response.set('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
    await runIdentityAction(request, response, async (identity) => {
      const profile = await customerRegistration.consent(identity);
      if (!profile?.thesisConsent) {
        response.status(404).json({ message: 'Tu cuenta no tiene una aceptación registrada.' });
        return;
      }
      if (request.query.download === '1')
        response.attachment('mi-consentimiento-v' + profile.thesisConsent.notice.version.replace(/[^a-zA-Z0-9_-]/g, '') + '.html');
      const url = '/v1/customer-registration/consent?download=1';
      const document = profile.thesisConsent.document;
      response.type('html').send(document
        ? renderConsentDocument(document, url, profile)
        : renderLegacyConsent(profile, url));
    });
  });
  app.post('/v1/customer-registration', async (request, response) => {
    response.set('Cache-Control', 'no-store');
    await runIdentityAction(request, response, async (identity) => {
      if (!customerRegistration.isEnabled(identity)) {
        throw new AccessAuthorizationError('forbidden', 'Esta cuenta no puede usar el registro.');
      }
      const parsed = customerRegistrationSchema.safeParse(request.body);
      if (!parsed.success) {
        response.status(400).json({
          message: parsed.error.issues[0]?.message ?? 'Revisa los datos del registro.',
        });
        return;
      }
      if (!(await customerRegistration.register(identity, parsed.data))) {
        response.status(409).json({
          message: 'Tu cuenta ya está registrada. Recarga la página para continuar.',
        });
        return;
      }
      response.status(201).json({ ok: true });
    });
  });
  app.get('/v1/my-orders', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'client', 'peru_activa');
      const quotations = await quotationService.listOwnedBy(identity.subject, identity.email || '');
      const orders = await orderStore.listBySourceQuotationIds(
        quotations.map((quotation) => quotation.id),
      );
      response.json({
        ok: true,
        items: quotations.map((quotation) => customerTrackingItem(quotation, orders)),
        simulated: identity.authentication === 'local_demo',
      });
    });
  });
  app.get('/v1/my-orders/:quotationId', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'client', 'peru_activa');
      const quotation = await quotationService.getOwnedBy(
        request.params.quotationId,
        identity.subject,
        identity.email || '',
      );
      if (!quotation) {
        response
          .status(404)
          .json({ ok: false, error: 'not_found', message: 'Pedido no encontrado.' });
        return;
      }
      const orders = await orderStore.listBySourceQuotationIds([quotation.id]);
      const histories = new Map(
        await Promise.all(
          orders.map(async (order) => [order.id, await orderStore.history(order.id)] as const),
        ),
      );
      response.json({
        ok: true,
        item: { ...customerTrackingItem(quotation, orders, histories), emailDelivery: await quotationService.emailStatus(quotation.id) },
        simulated: identity.authentication === 'local_demo',
      });
    });
  });
  app.use(
    '/v1/quotation-requests',
    createQuotationRouter(quotationService, resolveIdentity, customerRegistration),
  );
  app.use(express.static(webDirectory));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.get(['/', '/demo'], async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      response.redirect(portalHomeByRole[identity.role]);
    });
  });
  app.get('/demo/semana-2', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get(
    ['/nueva-solicitud', '/mis-pedidos', '/mis-pedidos/:quotationId'],
    async (request, response) => {
      await runIdentityAction(request, response, async (identity) => {
        response.set('Cache-Control', 'private, no-store');
        if (identity.role !== 'client') {
          response.redirect(portalHomeByRole[identity.role]);
          return;
        }
        response.sendFile('index.html', { root: webDirectory });
      });
    },
  );
  app.get('/peru-activa', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/peru-activa/pedidos/:quotationId', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/taller', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/evidencia-r5', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/demo/semana-3', (_request, response) => response.redirect('/nueva-solicitud'));
  app.get('/demo/semana-3/mis-pedidos', (_request, response) => response.redirect('/mis-pedidos'));
  app.get('/demo/semana-3/mis-pedidos/:quotationId', (request, response) =>
    response.redirect(`/mis-pedidos/${request.params.quotationId}`),
  );
  app.get('/demo/semana-3/peru-activa', (_request, response) => response.redirect('/peru-activa'));
  app.get('/demo/semana-3/peru-activa/pedidos/:quotationId', (request, response) =>
    response.redirect(`/peru-activa/pedidos/${request.params.quotationId}`),
  );
  app.get('/demo/semana-3/taller', (_request, response) => response.redirect('/taller'));
  app.get('/demo/semana-3/evidencia-r5', (_request, response) =>
    response.redirect('/evidencia-r5'),
  );
  app.get('/demo/asignacion-multicanal', (_request, response) => response.redirect('/peru-activa'));
  app.get('/portal', (_request, response) => response.redirect('/nueva-solicitud'));
  app.get('/openapi.json', (_request, response) => response.json(openApiDocument));

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'tesis', algorithmVersion: RECOMMENDATION_VERSION });
  });

  app.post('/v1/recommendations', async (request, response) => {
    const parsed = recommendationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ ok: false, error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    response.json({ ok: true, result: await assignmentService.recommend(parsed.data) });
  });

  app.get('/v1/demos/week-02', (_request, response) => {
    response.json({ ok: true, simulated: true, ...week02Demo });
  });

  app.post('/v1/demos/week-02/run', async (_request, response) => {
    response.json({
      ok: true,
      simulated: true,
      delivery: week02Demo.delivery,
      result: await assignmentService.recommend(week02Demo.request),
    });
  });

  app.get('/v1/demos/week-03/assignment-scenarios', async (request, response) => {
    const catalog = await assignmentService.catalog();
    let contactsVisible = !['production', 'demo'].includes(process.env.NODE_ENV ?? '');
    if (!contactsVisible) {
      try { contactsVisible = (await resolveIdentity(request)).role === 'peru_activa'; } catch { /* Public catalogue omits private contacts. */ }
    }
    response.json({ ok: true, ...catalog, workshops: catalog.workshops
      .filter((workshop) => contactsVisible || !workshop.testOnly)
      .map((workshop) => contactsVisible ? workshop : { ...workshop, contactPhone: undefined }) });
  });

  app.post('/v1/demos/week-03/assignment-scenarios/:scenarioId/run', async (request, response) => {
    try {
      const optionsInput = assignmentScenarioOptionsSchema.parse(request.body || {});
      const order = await assignmentService.runScenario(
        request.params.scenarioId,
        optionsInput.fabricBuyer,
      );
      options.onOrderUpdated?.(order);
      response.status(201).json({ ok: true, order, simulated: true });
    } catch (error) {
      if (error instanceof AssignmentFlowError && error.code === 'scenario_not_found') {
        response.status(404).json({ ok: false, error: error.code });
        return;
      }
      if (error instanceof AssignmentFlowError && error.code === 'no_eligible_workshops') {
        response.status(422).json({
          ok: false,
          error: error.code,
          message: 'Ningún taller simulado cumple todas las restricciones del escenario.',
          result: error.details,
        });
        return;
      }
      throw error;
    }
  });

  app.post(
    '/v1/demos/week-03/assignment-scenarios/:scenarioId/compare',
    async (request, response) => {
      try {
        const optionsInput = assignmentScenarioOptionsSchema.parse(request.body || {});
        response.json({
          ok: true,
          ...(await assignmentService.compareScenario(
            request.params.scenarioId,
            optionsInput.fabricBuyer,
          )),
        });
      } catch (error) {
        if (error instanceof AssignmentFlowError && error.code === 'scenario_not_found') {
          response.status(404).json({ ok: false, error: error.code });
          return;
        }
        throw error;
      }
    },
  );

  app.get('/v1/workshop-notifications', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa', 'workshop');
      const notifications = await assignmentService.notifications();
      response.json({
        ok: true,
        simulated: true,
        notifications:
          identity.role === 'peru_activa'
            ? notifications
            : notifications.filter(
                (notification) => notification.content.workshopId === identity.workshopId,
              ),
      });
    });
  });

  app.get('/v1/orders', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa', 'workshop');
      const queryStartedAt = performance.now();
      const orders = await orderStore.list();
      const queryDurationMs = performance.now() - queryStartedAt;
      response.set('Server-Timing', `db;dur=${queryDurationMs.toFixed(3)}`);
      response.json({
        ok: true,
        orders:
          identity.role === 'peru_activa'
            ? orders
            : orders.filter((order) => !order.previewOnly).filter(
                (order) =>
                  order.assignment?.allocations?.some(
                    (allocation) => allocation.workshopId === identity.workshopId,
                  ) || order.assignment?.workshopId === identity.workshopId,
              ),
        simulated: true,
      });
    });
  });

  app.get('/v1/orders/:id', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      const order = await orderStore.get(request.params.id);
      if (!order) { response.status(404).json({ ok: false, error: 'order_not_found', message: 'No se encontró la orden.' }); return; }
      const related = new Set([
        ...order.recommendation.candidates.flatMap((candidate) => candidate.allocations.map((allocation) => allocation.workshopId)),
        ...(order.assignment?.allocations.map((allocation) => allocation.workshopId) ?? []),
      ]);
      const workshopNames = Object.fromEntries((await workshopStore.list()).filter((workshop) => related.has(workshop.id)).map((workshop) => [workshop.id, workshop.displayName]));
      response.set('Cache-Control', 'private, no-store');
      response.json({ ok: true, order, workshopNames });
    });
  });

  app.post('/v1/orders', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      const parsed = orderDraftSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ ok: false, error: 'invalid_order', issues: parsed.error.issues });
        return;
      }

      const id = `PED-${randomUUID().slice(0, 8).toUpperCase()}`;
      const evaluatedAt = new Date().toISOString();
      const recommendationRequest = recommendationFromOrderDraft({id, draft: parsed.data, evaluatedAt, workshops: await workshopStore.list()});
      const recommendation = await assignmentService.recommend(recommendationRequest);
      if (recommendation.candidates.length === 0) {
        response.status(422).json({
          ok: false,
          error: 'no_eligible_workshops',
          message: 'No hay talleres que cumplan todos los requisitos del pedido.',
          rejected: recommendation.rejected,
        });
        return;
      }

      const order: PortalOrder = {
        id,
        createdAt: evaluatedAt,
        updatedAt: evaluatedAt,
        status: 'recommended',
        draft: parsed.data,
        requiredProcesses: recommendationRequest.order.requiredProcesses,
        fabricBuyer: 'peru_activa',
        recommendation,
        recommendationOrder: recommendationRequest.order,
      };
      await orderStore.create(order);
      options.onOrderUpdated?.(order);
      response.status(201).json({ ok: true, order, simulated: true });
    });
  });

  app.post('/v1/orders/:id/recommendation', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      try {
        const order = await assignmentService.refreshRecommendation(request.params.id);
        options.onOrderUpdated?.(order);
        response.json({ ok: true, order });
      } catch (error) {
        if (error instanceof AssignmentFlowError) {
          response
            .status(error.code === 'order_not_found' ? 404 : 409)
            .json({ ok: false, error: error.code });
          return;
        }
        throw error;
      }
    });
  });

  app.post('/v1/orders/:id/confirm', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      const parsed = confirmationSchema.safeParse(request.body);
      if (!parsed.success) {
        response
          .status(400)
          .json({ ok: false, error: 'invalid_confirmation', issues: parsed.error.issues });
        return;
      }
      try {
        const original = await orderStore.get(request.params.id);
        const contacts = await workshopStore.list();
        const candidate = original?.recommendation.candidates.find((item) =>
          item.candidateId === parsed.data.candidateId || item.workshopId === parsed.data.workshopId);
        if (candidate?.allocations.some((allocation) => original?.automation?.expiredWorkshopIds?.includes(allocation.workshopId))) {
          response.status(409).json({ ok: false, error: 'consultation_expired', message: 'La consulta a ese taller ya venció. Revisa el plan vigente.' }); return;
        }
        if (original?.automation?.phase === 'running' && candidate?.candidateId !== original.automation.candidateId) {
          response.status(409).json({ ok: false, error: 'automation_in_progress', message: 'La asignación está consultando el plan autorizado.' }); return;
        }
        const availability = new Map<string, string>();
        if (productionWhatsApp && original && candidate) {
          for (const allocation of candidate.allocations) {
            const workshop = contacts.find((item) => item.id === allocation.workshopId);
            if (!workshop?.contactPhone || Boolean(workshop.testOnly) !== Boolean(original.testOnly)) {
              response.status(409).json({ ok: false, error: 'workshop_contact_missing', message: 'Revisa el teléfono del taller antes de confirmar.' }); return;
            }
            if (productionWhatsApp.consult) {
              const status = await productionWhatsApp.status(workshopAvailabilityReference(original, workshop.id), workshop.id);
              if (status && status.state !== 'capacity_yes') {
                response.status(409).json({ ok: false, error: 'availability_not_confirmed', message: 'Espera la confirmación de disponibilidad de los talleres del plan.' }); return;
              }
              if (status) availability.set(workshop.id, workshopAvailabilityReference(original, workshop.id));
            }
          }
        }
        const updated = await assignmentService.confirm(
          request.params.id,
          parsed.data.candidateId || parsed.data.workshopId || '',
        );
        options.onOrderUpdated?.(updated);
        if (!productionWhatsApp) {
          response.json({ ok: true, order: updated });
          return;
        }
        const quotation = updated.source ? await quotationStore.get(updated.source.quotationId) : undefined;
        const coordination = [];
        for (const notification of updated.notifications ?? []) {
          coordination.push(await productionWhatsApp.assign(updated, notification, quotation, `51${contacts.find((item) => item.id === notification.content.workshopId)!.contactPhone}`, availability.get(notification.content.workshopId)));
        }
        response.json({ ok: true, order: updated, coordination });
      } catch (error) {
        if (error instanceof AssignmentFlowError && error.code === 'order_not_found') {
          response.status(404).json({ ok: false, error: error.code });
          return;
        }
        if (
          error instanceof AssignmentFlowError &&
          ['workshop_not_recommended', 'capacity_changed', 'invalid_order_transition'].includes(
            error.code,
          )
        ) {
          response.status(409).json({
            ok: false,
            error: error.code,
            ...(error.code === 'capacity_changed'
              ? {
                  message:
                    'La capacidad disponible cambió. Actualice la propuesta antes de confirmar.',
                  details: error.details,
                }
              : {}),
          });
          return;
        }
        if (error instanceof AssignmentFlowError && error.code === 'invalid_order_transition') {
          response.status(409).json({ ok: false, error: error.code });
          return;
        }
        if (productionWhatsApp && !(error instanceof AssignmentFlowError)) {
          response.status(424).json({
            ok: false,
            error: 'production_coordination_failed',
            message: error instanceof Error ? error.message : 'No se completó el envío a WhatsApp.',
            order: await orderStore.get(request.params.id),
          });
          return;
        }
        throw error;
      }
    });
  });

  const automationRead: express.RequestHandler = async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      if (!automationService) { response.status(503).json({ ok: false, error: 'coordination_unconfigured' }); return; }
      if (!await orderStore.get(String(request.params.id))) { response.status(404).json({ ok: false, error: 'order_not_found' }); return; }
      response.json({ ok: true, ...await automationService.view(String(request.params.id)) });
    });
  };
  app.get('/v1/orders/:id/assignment-automation', automationRead);
  app.get('/v1/orders/:id/workshop-availability', automationRead);
  const automationStart: express.RequestHandler = async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      if (!automationService) { response.status(503).json({ ok: false, error: 'coordination_unconfigured' }); return; }
      try {
        const origin = request.get('origin');
        if (request.get('sec-fetch-site') === 'cross-site' || (origin && new URL(origin).host !== request.get('host'))) {
          response.status(403).json({ ok: false, error: 'cross_origin_write_forbidden' }); return;
        }
        const modern = request.path.endsWith('/assignment-automation');
        if (modern && typeof request.body?.candidateId !== 'string') {
          response.status(400).json({ ok: false, message: 'Revisa el plan antes de iniciar la asignación.' }); return;
        }
        await automationService.start(String(request.params.id), identity.subject, modern ? request.body.candidateId : undefined);
        // The intent is durable before the worker can send its first consultation.
        // The old endpoint waits for that first tick for legacy clients.
        if (request.path.endsWith('/workshop-availability')) await automationService.tick();
        else void automationService.tick().catch(() => undefined);
        response.json({ ok: true, ...await automationService.view(String(request.params.id)) });
      } catch (error) {
        response.status(409).json({ ok: false, error: 'automation_not_started', message: error instanceof Error ? error.message : 'No se pudo iniciar la asignación.' });
      }
    });
  };
  app.post('/v1/orders/:id/assignment-automation', automationStart);
  app.post('/v1/orders/:id/workshop-availability', automationStart);

  app.get('/v1/orders/:id/production-coordination', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      const order = await orderStore.get(request.params.id);
      if (!order?.assignment) { response.status(404).json({ ok: false, error: 'order_not_assigned' }); return; }
      if (!productionWhatsApp) { response.status(503).json({ ok: false, error: 'coordination_unconfigured' }); return; }
      const coordination = await Promise.all(order.assignment.allocations.map((item) =>
        productionWhatsApp.status(order.id, item.workshopId)));
      response.json({ ok: true, coordination });
    });
  });

  app.post('/v1/orders/:id/production-coordination/:workshopId/progress', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'peru_activa');
      const order = await orderStore.get(request.params.id);
      if (!order?.assignment?.allocations.some((item) => item.workshopId === request.params.workshopId)) {
        response.status(404).json({ ok: false, error: 'workshop_not_assigned' });
        return;
      }
      if (!productionWhatsApp) { response.status(503).json({ ok: false, error: 'coordination_unconfigured' }); return; }
      const coordination = await productionWhatsApp.progress(order.id, request.params.workshopId);
      response.json({ ok: true, coordination });
    });
  });

  app.post('/v1/orders/:id/status', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'workshop');
      const parsed = workshopOrderStatusSchema.safeParse(request.body?.status);
      if (!parsed.success) {
        response.status(400).json({ ok: false, error: 'invalid_order_status' });
        return;
      }
      try {
        const updated = await assignmentService.updateWorkshopStatus(
          request.params.id,
          identity.workshopId || '',
          parsed.data,
        );
        options.onOrderUpdated?.(updated);
        response.json({ ok: true, order: updated, simulated: true });
      } catch (error) {
        if (
          error instanceof AssignmentFlowError &&
          ['order_not_found', 'workshop_not_assigned'].includes(error.code)
        ) {
          response.status(404).json({ ok: false, error: 'order_not_found' });
          return;
        }
        if (error instanceof AssignmentFlowError && error.code === 'invalid_order_transition') {
          response.status(409).json({ ok: false, error: error.code });
          return;
        }
        throw error;
      }
    });
  });

  return app;
}

function customerTrackingItem(
  quotation: QuotationRequest,
  orders: PortalOrder[],
  histories: Map<string, Awaited<ReturnType<OrderStore['history']>>> = new Map(),
) {
  const orderIds = new Set(quotation.production?.orderIds || []);
  const productionOrders = orders
    .filter((order) => orderIds.has(order.id) || order.source?.quotationId === quotation.id)
    .map((order) => ({
      id: order.id,
      garmentIndex: order.source?.garmentIndex,
      product: order.draft.product,
      quantity: order.draft.quantity,
      status: order.status,
      updatedAt: order.updatedAt,
      assignment: order.assignment,
      history: histories.get(order.id) || [],
    }));
  const timestamps = [quotation.updatedAt, ...productionOrders.map((order) => order.updatedAt)];
  return {
    quotation,
    productionOrders,
    lastUpdatedAt: timestamps.reduce((latest, timestamp) =>
      timestamp > latest ? timestamp : latest,
    ),
    timeline: customerTimeline(quotation, productionOrders),
  };
}

function customerTimeline(
  quotation: QuotationRequest,
  orders: Array<{
    id: string;
    history: Awaited<ReturnType<OrderStore['history']>>;
  }>,
) {
  const events = [
    { key: 'request-created', label: 'Solicitud registrada', occurredAt: quotation.createdAt },
    ...(quotation.quotation
      ? [
          {
            key: 'quotation-sent',
            label: 'Cotización enviada por Perú Activa',
            occurredAt: quotation.quotation.quotedAt,
          },
        ]
      : []),
    ...(quotation.buyerDecision
      ? [
          {
            key: `quotation-${quotation.buyerDecision.decision}`,
            label:
              quotation.buyerDecision.decision === 'accepted'
                ? 'Pedido confirmado'
                : 'Cotización rechazada',
            occurredAt: quotation.buyerDecision.respondedAt,
          },
        ]
      : []),
    ...orders.flatMap((order) =>
      order.history.filter((entry) => ['in_production', 'completed'].includes(entry.status)).map((entry, index) => ({
        key: `${order.id}-${entry.status}-${index}`,
        label: entry.status === 'completed' ? 'Producción terminada' : 'Producción iniciada',
        occurredAt: entry.occurredAt,
      })),
    ),
  ].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));

  return events.map((event, index) => ({
    ...event,
    status: index === events.length - 1 ? ('current' as const) : ('complete' as const),
  }));
}

async function runIdentityAction(
  request: express.Request,
  response: express.Response,
  action: (identity: AuthenticatedIdentity) => Promise<void>,
): Promise<void> {
  try {
    await action(await resolveIdentity(request));
  } catch (error) {
    if (error instanceof AccessAuthorizationError) {
      const status =
        error.code === 'configuration_error' ? 500 : error.code === 'unauthenticated' ? 401 : 403;
      response.status(status).json({ ok: false, error: error.code, message: error.message });
      return;
    }
    throw error;
  }
}
