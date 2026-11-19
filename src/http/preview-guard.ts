import type { RequestHandler } from 'express';
import type { PreviewScope } from '../domain/preview-scope.js';

/** Apply to every mutation of a preview resource, including future subroutes. */
export function previewMutationGuard(
  load: (id: string) => Promise<PreviewScope | undefined>,
): RequestHandler {
  return async (request, response, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const id = request.params.id;
      const record = typeof id === 'string' ? await load(id) : undefined;
      if (record?.previewOnly) {
        response
          .status(409)
          .json({
            ok: false,
            error: 'preview_read_only',
            message:
              'Este pedido es una demostración de solo lectura. No fabrica ni envía mensajes.',
          });
        return;
      }
    }
    next();
  };
}
