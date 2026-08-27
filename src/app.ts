import { randomUUID } from 'node:crypto';
import express from 'express';
import { fileURLToPath } from 'node:url';
import swaggerUi from 'swagger-ui-express';
import { z } from 'zod';
import { QuotationService } from './application/quotation-service.js';
import { createOrderStore, type OrderStore } from './data/order-store.js';
import { week02Demo } from './data/week-02-demo.js';
import { simulatedWorkshops } from './data/workshops.js';
import { recommendationRequestSchema } from './domain/contracts.js';
import { orderDraftSchema, type PortalOrder } from './domain/orders.js';
import { recommendWorkshops } from './domain/recommend.js';
import { createQuotationRouter } from './http/quotation-routes.js';
import { createQuotationStore, type QuotationStore } from './infrastructure/quotation-store.js';

const webDirectory = fileURLToPath(new URL('../public/app/', import.meta.url));
const confirmationSchema = z.object({ workshopId: z.string().min(1) });

const openApiDocument = {
  openapi: '3.0.3',
  info: {
    title: 'Portal de pedidos de Perú Activa',
    version: '0.1.0',
    description: 'API del MVP académico para registro, recomendación y seguimiento de pedidos.',
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
    '/v1/quotation-requests/{id}/decision': {
      post: {
        summary: 'Registrar aceptación o rechazo del cliente',
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
  },
} as const;

export interface AppOptions {
  orderStore?: OrderStore;
  quotationStore?: QuotationStore;
  onOrderUpdated?: (order: PortalOrder) => void;
}

export function createApp(options: AppOptions = {}): express.Express {
  const app = express();
  const orderStore = options.orderStore ?? createOrderStore();
  const quotationStore = options.quotationStore ?? createQuotationStore();

  app.disable('x-powered-by');
  app.use(express.json({ limit: '16mb' }));
  app.use('/v1/quotation-requests', createQuotationRouter(new QuotationService(quotationStore)));
  app.use(express.static(webDirectory));
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

  app.get('/', (_request, response) => response.redirect('/portal'));
  app.get('/demo', (_request, response) => response.redirect('/portal'));
  app.get('/demo/semana-2', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
  app.get('/demo/semana-3', (_request, response) =>
    response.sendFile('index.html', { root: webDirectory }),
  );
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

  app.get('/v1/orders', async (_request, response) => {
    response.json({ ok: true, orders: await orderStore.list(), simulated: true });
  });

  app.post('/v1/orders', async (request, response) => {
    const parsed = orderDraftSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({ ok: false, error: 'invalid_order', issues: parsed.error.issues });
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
        requiredProcesses: ['design', 'cutting', 'sewing', parsed.data.customization, 'finishing'],
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
      recommendation,
    };
    await orderStore.create(order);
    options.onOrderUpdated?.(order);
    response.status(201).json({ ok: true, order, simulated: true });
  });

  app.post('/v1/orders/:id/confirm', async (request, response) => {
    const parsed = confirmationSchema.safeParse(request.body);
    if (!parsed.success) {
      response
        .status(400)
        .json({ ok: false, error: 'invalid_confirmation', issues: parsed.error.issues });
      return;
    }
    const order = await orderStore.get(request.params.id);
    if (!order) {
      response.status(404).json({ ok: false, error: 'order_not_found' });
      return;
    }
    const candidate = order.recommendation.candidates.find(
      (item) => item.workshopId === parsed.data.workshopId,
    );
    if (!candidate) {
      response.status(409).json({ ok: false, error: 'workshop_not_recommended' });
      return;
    }
    const confirmedAt = new Date().toISOString();
    const updated = await orderStore.assign(order.id, {
      workshopId: candidate.workshopId,
      displayName: candidate.displayName,
      confirmedAt,
    });
    if (!updated) {
      response.status(404).json({ ok: false, error: 'order_not_found' });
      return;
    }
    options.onOrderUpdated?.(updated);
    response.json({ ok: true, order: updated });
  });

  return app;
}
