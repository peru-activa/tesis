export function fetchAsPeruActiva(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetchWithHeaders(input, init, { 'x-demo-actor': 'peru_activa' });
}

export function fetchAsWorkshop(phone: string, input: RequestInfo | URL, init: RequestInit = {}) {
  return fetchWithHeaders(input, init, { 'x-demo-workshop-phone': phone });
}

function fetchWithHeaders(
  input: RequestInfo | URL,
  init: RequestInit,
  actorHeaders: Record<string, string>,
) {
  const headers = new Headers(init.headers);
  Object.entries(actorHeaders).forEach(([name, value]) => headers.set(name, value));
  return fetch(input, { ...init, headers });
}

export async function readApiResponse<T>(response: Response): Promise<T> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('No pudimos leer la respuesta del servidor. Inténtalo de nuevo.');
  }
  if (!payload || typeof payload !== 'object') {
    throw new Error('La respuesta del servidor no es válida. Inténtalo de nuevo.');
  }
  if (!response.ok) {
    const message =
      'message' in payload && typeof payload.message === 'string' ? payload.message : '';
    throw new Error(message || 'No pudimos completar la consulta. Inténtalo de nuevo.');
  }
  return payload as T;
}
