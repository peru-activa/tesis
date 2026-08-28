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
