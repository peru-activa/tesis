import { describe, expect, it } from 'vitest';
import { readApiResponse } from './actor-api';

describe('readApiResponse', () => {
  it('conserva el mensaje de una respuesta de acceso denegado', async () => {
    await expect(
      readApiResponse(
        new Response(JSON.stringify({ message: 'Acceso denegado' }), { status: 403 }),
      ),
    ).rejects.toThrow('Acceso denegado');
  });
  it.each(['<html>Service unavailable</html>', 'null', '42'])(
    'rechaza respuestas no JSON o inválidas: %s',
    async (body) => {
      await expect(readApiResponse(new Response(body, { status: 502 }))).rejects.toThrow(
        /respuesta del servidor/,
      );
    },
  );
});
