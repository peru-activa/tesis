import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultichannelDemo, type Order } from './MultichannelDemo';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), disconnect: vi.fn() }),
}));

const originalScrollIntoView = Element.prototype.scrollIntoView;

const order: Order = {
  id: 'PED-1F1201E9',
  status: 'registered',
  draft: {
    product: 'polo',
    quantity: 999,
    material: 'win',
    requiredBy: '2026-09-21',
    color: 'Azul marino',
    sizes: { M: 999 },
  },
  recommendation: {
    candidates: [],
    rejected: [
      {
        workshopId: 'TAL-001',
        displayName: 'Taller simulado A',
        reasons: ['La capacidad disponible no cubre las 999 unidades.'],
      },
    ],
  },
  source: { type: 'quotation', quotationId: 'COT-98EF6EA8', garmentIndex: 0 },
};

const quotation = {
  id: 'COT-98EF6EA8',
  createdAt: '2026-09-07T14:14:00-05:00',
  status: 'accepted',
  request: {
    garment: { product: 'polo', quantity: 999 },
    additionalGarments: [],
    delivery: { requiredBy: '2026-09-21', location: 'Lima' },
  },
  production: {
    status: 'no_eligible_workshop',
    orderIds: [order.id],
    message: 'Ningún taller cumple las restricciones.',
  },
};

beforeEach(() => {
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    value: originalScrollIntoView,
  });
});

describe('mesa de asignación de Perú Activa', () => {
  it('abre, enfoca y explica un pedido sin talleres factibles', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        const payload = url.includes('assignment-scenarios')
          ? { scenarios: [], workshops: [], datasetVersion: 'test', seed: 1 }
          : url.includes('workshop-notifications')
            ? { notifications: [] }
            : url.includes('quotation-requests')
              ? { requests: [quotation] }
              : { orders: [order] };
        return { ok: true, json: async () => payload } as Response;
      }),
    );
    const focus = vi.spyOn(HTMLElement.prototype, 'focus');
    const user = userEvent.setup();

    render(<MultichannelDemo view="peru-activa" />);
    await user.click(await screen.findByRole('button', { name: `Abrir ${order.id}` }));

    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: 'smooth',
      block: 'start',
    });
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    expect(screen.getByRole('heading', { name: 'Revisión de asignación' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'No hay un plan factible' })).toBeTruthy();
    expect(screen.getByText(/capacidad, la fecha, la tela y los procesos/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /confirmar y asignar/i })).toBeNull();
  });
});
