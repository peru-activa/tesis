import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkshopAvailabilityPanel } from './WorkshopAvailabilityPanel';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('solo envía al pulsar el botón y muestra las respuestas sin reenviar', async () => {
  let sent = false;
  let replied = false;
  const request = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') sent = true;
    return { ok: true, json: async () => ({ availability: [{ workshopId: 'test-workshop', displayName: 'Taller de prueba', phone: '911111111', state: replied ? 'capacity_yes' : sent ? 'capacity_pending' : 'not_contacted', lastError: null }] }) } as Response;
  });
  vi.stubGlobal('fetch', request);
  const user = userEvent.setup();
  render(<WorkshopAvailabilityPanel orderId="PED-TEST" testOnly />);
  await screen.findByText('Sin consultar');
  expect(request.mock.calls.some((call) => call[1]?.method === 'POST')).toBe(false);
  await user.click(screen.getByRole('button', { name: 'Consultar al taller' }));
  await screen.findByText('Pendiente');
  expect(request.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
  expect(screen.queryByRole('button', { name: 'Consultar al taller' })).toBeNull();
  replied = true;
  await user.click(screen.getByRole('button', { name: 'Actualizar' }));
  await screen.findByText('Disponible');
  expect(request.mock.calls.filter((call) => call[1]?.method === 'POST')).toHaveLength(1);
});
