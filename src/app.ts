import express from 'express';
import { recommendationRequestSchema } from './domain/contracts.js';
import { recommendWorkshops } from './domain/recommend.js';

export function createApp(): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  app.get('/health', (_request, response) => {
    response.json({ ok: true, service: 'tesis', algorithmVersion: '0.1.0' });
  });

  app.post('/v1/recommendations', (request, response) => {
    const parsed = recommendationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      response.status(400).json({
        ok: false,
        error: 'invalid_request',
        issues: parsed.error.issues,
      });
      return;
    }

    response.json({ ok: true, result: recommendWorkshops(parsed.data) });
  });

  return app;
}

