import { randomUUID } from 'node:crypto';
import express from 'express';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import {
  AssignmentDemoService,
  AssignmentFlowError,
} from './application/assignment-demo-service.js';
import { QuotationService } from './application/quotation-service.js';
import { createOrderStore, type OrderStore } from './data/order-store.js';
import { week02Demo } from './data/week-02-demo.js';
import { simulatedWorkshops } from './data/workshops.js';
import {
  AccessAuthorizationError,
  requireRole,
  type AuthenticatedIdentity,
} from './domain/identity.js';
import { recommendationRequestSchema } from './domain/contracts.js';
import { orderDraftSchema, workshopOrderStatusSchema, type PortalOrder } from './domain/orders.js';
import type { QuotationRequest } from './domain/quotation-requests.js';
import { recommendWorkshops } from './domain/recommend.js';
import { createQuotationRouter } from './http/quotation-routes.js';
import { resolveIdentity } from './infrastructure/access-identity.js';
import { createQuotationStore, type QuotationStore } from './infrastructure/quotation-store.js';

const webDirectory = fileURLToPath(new URL('../public/app/', import.meta.url));
const confirmationSchema = z
  .object({
    candidateId: z.string().min(1).optional(),
    workshopId: z.string().min(1).optional(),
  })
  .refine((value) => value.candidateId || value.workshopId, {
    message: 'Se requiere el identificador del plan de asignación.',
  });

const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Portal de pedidos de Perú Activa',
    version: '0.1.0',
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
    '/health': {
      get: {
        summary: 'Verificar el servicio',
        responses: { 200: { description: 'Servicio disponible' } },
      },
    },
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
        summary: 'Listar los cinco talleres y ocho escenarios simulados de R5',
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
    '/v1/workshop-notifications': {
      get: {
        summary: 'Listar publicaciones canónicas para web y vista previa de WhatsApp',
        responses: { 200: { description: 'Notificaciones publicadas' } },
      },
    },
  },
} as const;

export interface AppOptions {
  orderStore?: OrderStore;
  quotationStore?: QuotationStore;
  onOrderUpdated?: (order: PortalOrder) => void;
  onQuotationUpdated?: (quotation: QuotationRequest) => void;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const orderStore = options.orderStore ?? createOrderStore();
  const quotationStore = options.quotationStore ?? createQuotationStore();
  const assignmentService = new AssignmentDemoService(orderStore);
  const quotationService = new QuotationService(quotationStore, undefined, {
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
  app.use(express.json({ limit: '16mb' }));
  app.get('/v1/session', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      response.json({ ok: true, identity, simulated: identity.authentication === 'local_demo' });
    });
  });
  app.get('/v1/my-orders', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'client');
      const quotations = await quotationService.listOwnedBy(identity.subject, identity.email || '');
      const orders = await orderStore.list();
      response.json({
        ok: true,
        items: quotations.map((quotation) => customerTrackingItem(quotation, orders)),
        simulated: identity.authentication === 'local_demo',
      });
    });
  });
  app.get('/v1/my-orders/:quotationId', async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      requireRole(identity, 'client');
      const quotations = await quotationService.listOwnedBy(identity.subject, identity.email || '');
      const quotation = quotations.find((item) => item.id === request.params.quotationId);
      if (!quotation) {
        response
          .status(404)
          .json({ ok: false, error: 'not_found', message: 'Pedido no encontrado.' });
        return;
      }
      response.json({
        ok: true,
        item: customerTrackingItem(quotation, await orderStore.list()),
        simulated: identity.authentication === 'local_demo',
      });
    });
  });
  app.use('/v1/quotation-requests', createQuotationRouter(quotationService, resolveIdentity));
  app.use(express.static(webDirectory));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.get(['/', '/demo'], async (request, response) => {
    await runIdentityAction(request, response, async (identity) => {
      const destination = {
        client: '/mis-pedidos',
        peru_activa: '/peru-activa',
        workshop: '/taller',
      }[identity.role];
      response.redirect(destination);
    });
  });
  app.get('/demo/semana-2', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/nueva-solicitud', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/mis-pedidos', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/mis-pedidos/:quotationId', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
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
  app.get('/portal', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/openapi.json', (_request, response) => response.json(openApiDocument));

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'tesis', algorithmVersion: '0.1.0' });
  });

  app.post('/v1/recommendations', (request, response) => {
    const parsed = recommendationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ ok: false, error: 'invalid_request', issues: parsed.error.issues });
      return;
    }
    response.json({ ok: true, result: recommendWorkshops(parsed.data) });
  });

  app.get('/v1/demos/week-02', (_request, response) => {
    response.json({ ok: true, simulated: true, ...week02Demo });
  });

  app.post('/v1/demos/week-02/run', (_request, response) => {
    response.json({
      ok: true,
      simulated: true,
      delivery: week02Demo.delivery,
      result: recommendWorkshops(week02Demo.request),
    });
  });

  app.get('/v1/demos/week-03/assignment-scenarios', (_request, response) => {
    response.json({ ok: true, ...assignmentService.catalog() });
  });

  app.post('/v1/demos/week-03/assignment-scenarios/:scenarioId/run', async (request, response) => {
    try {
      const order = await assignmentService.runScenario(request.params.scenarioId);
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
      const orders = await orderStore.list();
      response.json({
        ok: true,
        orders:
          identity.role === 'peru_activa'
            ? orders
            : orders.filter(
                (order) =>
                  order.assignment?.allocations?.some(
                    (allocation) => allocation.workshopId === identity.workshopId,
                  ) || order.assignment?.workshopId === identity.workshopId,
              ),
        simulated: true,
      });
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
      const recommendationRequest = recommendationRequestSchema.parse({
        evaluatedAt,
        order: {
          id,
          product: parsed.data.product,
          material: parsed.data.material,
          quantity: parsed.data.quantity,
          requiredProcesses: [
            'design',
            'cutting',
            'sewing',
            ...(parsed.data.customization === 'none' ? [] : [parsed.data.customization]),
            'finishing',
          ],
          requiredBy: `${parsed.data.requiredBy}T18:00:00-05:00`,
        },
        workshops: simulatedWorkshops,
      });
      const recommendation = recommendWorkshops(recommendationRequest);
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
        recommendation,
      };
      await orderStore.create(order);
      options.onOrderUpdated?.(order);
      response.status(201).json({ ok: true, order, simulated: true });
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
        const updated = await assignmentService.confirm(
          request.params.id,
          parsed.data.candidateId || parsed.data.workshopId || '',
        );
        options.onOrderUpdated?.(updated);
        response.json({ ok: true, order: updated });
      } catch (error) {
        if (error instanceof AssignmentFlowError && error.code === 'order_not_found') {
          response.status(404).json({ ok: false, error: error.code });
          return;
        }
        if (error instanceof AssignmentFlowError && error.code === 'workshop_not_recommended') {
          response.status(409).json({ ok: false, error: error.code });
          return;
        }
        throw error;
      }
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

function customerTrackingItem(quotation: QuotationRequest, orders: PortalOrder[]) {
  const orderIds = new Set(quotation.production?.orderIds || []);
  return {
    quotation,
    productionOrders: orders
      .filter((order) => orderIds.has(order.id))
      .map((order) => ({
        id: order.id,
        status: order.status,
        updatedAt: order.updatedAt,
        assignment: order.assignment,
      })),
  };
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
