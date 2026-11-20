import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalRoleGate, RoleLandingPage } from './RoleLandingPage';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function session(role: string, status = 200) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(Response.json({ identity: { role } }, { status })),
  );
}

function mockNavigation() {
  const replace = vi.fn();
  vi.stubGlobal('location', { hostname: 'localhost', replace });
  return replace;
}

describe('navegación según el rol verificado', () => {
  it.each([
    ['client', '/mis-pedidos'],
    ['peru_activa', '/peru-activa'],
    ['workshop', '/taller'],
  ])('la entrada envía %s a %s', async (role, destination) => {
    session(role);
    const replace = mockNavigation();
    render(<RoleLandingPage />);
    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
  });

  it.each([
    ['peru_activa', '/peru-activa'],
    ['workshop', '/taller'],
  ])('evita montar la vista de cliente para %s', async (role, destination) => {
    session(role);
    const replace = mockNavigation();
    const customerPage = vi.fn(() => <p>Pedidos personales</p>);
    const CustomerPage = customerPage;
    render(
      <PortalRoleGate allowedRole="client">
        <CustomerPage />
      </PortalRoleGate>,
    );
    await waitFor(() => expect(replace).toHaveBeenCalledWith(destination));
    expect(customerPage).not.toHaveBeenCalled();
  });

  it('abre la vista de cliente solo después de verificar su rol', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const replace = mockNavigation();
    render(
      <PortalRoleGate allowedRole="client">
        <p>Pedidos personales</p>
      </PortalRoleGate>,
    );
    expect(screen.queryByText('Pedidos personales')).toBeNull();
    await act(async () => resolve(Response.json({ identity: { role: 'client' } })));
    expect(screen.getByText('Pedidos personales')).toBeTruthy();
    expect(replace).not.toHaveBeenCalled();
  });

  it.each([
    ['desconocido', 200],
    ['client', 401],
  ])('no abre contenido ni redirige con una sesión inválida (%s, %s)', async (role, status) => {
    session(role, status);
    const replace = mockNavigation();
    render(
      <PortalRoleGate allowedRole="client">
        <p>Pedidos personales</p>
      </PortalRoleGate>,
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('Pedidos personales')).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });

  it('no redirige si la comprobación termina después de desmontar', async () => {
    let resolve!: (response: Response) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise<Response>((done) => {
            resolve = done;
          }),
      ),
    );
    const replace = mockNavigation();
    const view = render(
      <PortalRoleGate allowedRole="client">
        <p>Pedidos personales</p>
      </PortalRoleGate>,
    );
    view.unmount();
    await act(async () => resolve(Response.json({ identity: { role: 'peru_activa' } })));
    expect(replace).not.toHaveBeenCalled();
  });
});
