import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WorkshopAccessPage } from './WorkshopAccessPage';

vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn() }) }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  sessionStorage.clear();
  window.history.replaceState({}, '', '/');
});
const response = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const local = { role: 'client', authentication: 'local_demo' };
const workshop = {
  role: 'workshop',
  authentication: 'local_demo',
  phone: '900000001',
  workshopId: 'TAL-001',
};
const catalog = {
  workshops: [{ id: 'TAL-001', displayName: 'Taller simulado', contactPhone: '900000001' }],
  scenarios: [],
  datasetVersion: 'test',
  seed: 1,
};
function stubLocalSession(
  login: () => Promise<Response> = async () => response({ identity: workshop }),
) {
  const request = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const path = String(input);
    if (path === '/v1/session')
      return new Headers(init?.headers).has('x-demo-workshop-phone')
        ? login()
        : response({ identity: local });
    if (path.includes('assignment-scenarios')) return response(catalog);
    if (path.includes('workshop-notifications')) return response({ notifications: [] });
    return response({ orders: [] });
  });
  vi.stubGlobal('fetch', request);
  return request;
}

describe('acceso del taller', () => {
  it.each(['client', 'peru_activa'])(
    'rechaza los números de demo en una sesión publicada de rol %s, incluso con un teléfono guardado',
    async (role) => {
      sessionStorage.setItem('pa-workshop-phone', '900000001');
      window.history.replaceState({}, '', '/taller?telefono=900000001');
      const request = vi.fn(async () =>
        response({ identity: { role, authentication: 'cloudflare_access' } }),
      );
      vi.stubGlobal('fetch', request);
      render(<WorkshopAccessPage />);
      expect(await screen.findByText(/Los números de prueba solo funcionan/)).toBeTruthy();
      expect(screen.queryByRole('textbox')).toBeNull();
      expect(screen.queryByText('Números simulados para probar')).toBeNull();
      expect(screen.queryByRole('heading', { name: 'Trabajos asignados' })).toBeNull();
      expect(sessionStorage.getItem('pa-workshop-phone')).toBeNull();
      expect(screen.getByRole('link', { name: 'Volver a mi bandeja' }).getAttribute('href')).toBe(
        role === 'client' ? '/mis-pedidos' : '/peru-activa',
      );
      expect(request).toHaveBeenCalledTimes(1);
    },
  );

  it('verifica el rol y el teléfono antes de abrir una bandeja local', async () => {
    const request = stubLocalSession();
    const user = userEvent.setup();
    render(<WorkshopAccessPage />);
    await user.click(await screen.findByText('Números simulados para probar'));
    await user.click(screen.getByRole('button', { name: /Taller simulado · 900000001/ }));
    await user.click(screen.getByRole('button', { name: /Ver mis pedidos/ }));
    expect(await screen.findByRole('heading', { name: 'Trabajos asignados' })).toBeTruthy();
    expect(await screen.findByText('La bandeja está vacía')).toBeTruthy();
    expect(sessionStorage.getItem('pa-workshop-phone')).toBe('900000001');
    const inbox = request.mock.calls.find(([url]) =>
      String(url).includes('workshop-notifications'),
    );
    expect(new Headers(inbox?.[1]?.headers).get('x-demo-workshop-phone')).toBe('900000001');
  });

  it('no acepta HTTP 200 si la sesión corresponde a otro actor', async () => {
    stubLocalSession(async () =>
      response({ identity: { role: 'peru_activa', authentication: 'cloudflare_access' } }),
    );
    const user = userEvent.setup();
    render(<WorkshopAccessPage />);
    await user.type(await screen.findByRole('textbox'), '900000001');
    await user.click(screen.getByRole('button', { name: /Ver mis pedidos/ }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Esta sesión no corresponde al taller',
    );
    expect(screen.queryByRole('heading', { name: 'Trabajos asignados' })).toBeNull();
    expect(sessionStorage.getItem('pa-workshop-phone')).toBeNull();
  });

  it('revalida y descarta un teléfono guardado que ya no tiene acceso', async () => {
    sessionStorage.setItem('pa-workshop-phone', '900000001');
    stubLocalSession(async () =>
      response({ message: 'El número no corresponde a un taller declarado.' }, 401),
    );
    render(<WorkshopAccessPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('El número no corresponde');
    expect(screen.queryByRole('heading', { name: 'Trabajos asignados' })).toBeNull();
    expect(sessionStorage.getItem('pa-workshop-phone')).toBeNull();
  });

  it('recupera la comprobación inicial cuando falla la conexión', async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValue(
        response({ identity: { role: 'client', authentication: 'cloudflare_access' } }),
      );
    vi.stubGlobal('fetch', request);
    const user = userEvent.setup();
    render(<WorkshopAccessPage />);
    expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    expect(await screen.findByText(/Los números de prueba solo funcionan/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('libera el botón de ingreso tras un fallo de red y permite reintentar', async () => {
    const login = vi
      .fn()
      .mockRejectedValueOnce(new Error('Sin conexión'))
      .mockResolvedValue(response({ identity: workshop }));
    stubLocalSession(login);
    const user = userEvent.setup();
    render(<WorkshopAccessPage />);
    await user.type(await screen.findByRole('textbox'), '900000001');
    await user.click(screen.getByRole('button', { name: /Ver mis pedidos/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Sin conexión');
    await user.click(screen.getByRole('button', { name: /Ver mis pedidos/ }));
    expect(await screen.findByRole('heading', { name: 'Trabajos asignados' })).toBeTruthy();
  });
});
