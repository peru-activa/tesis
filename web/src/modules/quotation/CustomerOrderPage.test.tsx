import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerOrderPage } from './CustomerOrderPage';
import type { CustomerTrackingItem } from './customerTracking';

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn(), disconnect: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const item: CustomerTrackingItem = {
  quotation: {
    id: 'COT-R2-001',
    createdAt: '2026-09-05T10:00:00-05:00',
    updatedAt: '2026-09-05T10:05:00-05:00',
    status: 'accepted',
    request: {
      customer: {
        contactName: 'Cliente simulado',
        businessName: 'Organización simulada',
        contact: 'cliente@example.test',
      },
      garment: {
        product: 'polo',
        model: 'Cuello redondo',
        audience: 'unisex',
        sleeve: 'manga_corta',
        cut: 'estandar',
        quantity: 20,
        sizes: [{ size: 'M', quantity: 20 }],
        color: 'Azul marino',
        fabric: { mode: 'specified', name: 'Algodón pima 20/1' },
        customization: 'embroidery',
        applicationCount: 1,
        customizationDetails: 'Logo al pecho',
        designReference: 'Diseño simulado',
      },
      additionalGarments: [],
      delivery: { requiredBy: '2026-09-30', location: 'Lima' },
      notes: '',
    },
    quotation: {
      totalPricePEN: 1_200,
      lineItems: [{ garmentIndex: 0, unitPricePEN: 60 }],
      selectedFabric: 'Algodón pima 20/1',
      fabricBuyer: 'workshop',
      validUntil: '2026-09-10',
      conditions: 'Incluye confección y bordado.',
      quotedAt: '2026-09-05T10:03:00-05:00',
    },
    buyerDecision: {
      decision: 'accepted',
      respondedAt: '2026-09-05T10:05:00-05:00',
    },
    production: {
      status: 'recommended',
      orderIds: ['PED-R2-001'],
      message: 'Pedido creado.',
    },
  },
  productionOrders: [
    {
      id: 'PED-R2-001',
      status: 'assigned',
      updatedAt: '2026-09-05T10:06:00-05:00',
      assignment: {
        workshopId: 'TAL-001',
        displayName: 'Taller simulado',
        confirmedAt: '2026-09-05T10:06:00-05:00',
      },
      history: [
        { status: 'recommended', occurredAt: '2026-09-05T10:05:00-05:00' },
        { status: 'assigned', occurredAt: '2026-09-05T10:06:00-05:00' },
      ],
    },
  ],
  lastUpdatedAt: '2026-09-05T10:06:00-05:00',
  timeline: [
    {
      key: 'request-created',
      label: 'Solicitud registrada',
      occurredAt: '2026-09-05T10:00:00-05:00',
      status: 'complete',
    },
    {
      key: 'assigned',
      label: 'Taller asignado',
      occurredAt: '2026-09-05T10:06:00-05:00',
      status: 'current',
    },
  ],
};

describe('CustomerOrderPage', () => {
  it('conserva la cotización y explica el estado del pedido confirmado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item }) }),
    );

    const { container } = render(<CustomerOrderPage quotationId={item.quotation.id} />);

    expect(await screen.findByText('COTIZACIÓN ACEPTADA')).toBeTruthy();
    expect(screen.getAllByText('S/ 1,200.00')).toHaveLength(2);
    expect(screen.getByText('No necesitas hacer nada por ahora')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Progreso de producción' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Cambios registrados' })).toBeTruthy();
    expect(screen.getAllByText('Taller asignado').length).toBeGreaterThan(0);
    expect(
      screen.getByText(
        'Cuando firmes el contrato, te enviaremos gratuitamente una muestra física para confirmar el color final.',
      ),
    ).toBeTruthy();
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain(
      'Taller asignado',
    );
    expect(container.querySelector('main')?.getAttribute('data-r2-updated-at')).toBe(
      item.lastUpdatedAt,
    );
    expect(screen.queryByRole('button', { name: 'Aceptar cotización' })).toBeNull();
    expect(screen.queryByText('El precio se enviará después.')).toBeNull();
  });

  it('no promete la muestra física antes de aceptar la cotización', async () => {
    const quotedItem: CustomerTrackingItem = {
      ...item,
      quotation: {
        ...item.quotation,
        status: 'quoted',
        buyerDecision: undefined,
        production: undefined,
      },
      productionOrders: [],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: quotedItem }) }),
    );

    render(<CustomerOrderPage quotationId={quotedItem.quotation.id} />);

    expect(await screen.findByText('COTIZACIÓN PARA REVISAR')).toBeTruthy();
    expect(screen.queryByText(/te enviaremos gratuitamente una muestra física/i)).toBeNull();
  });
});
