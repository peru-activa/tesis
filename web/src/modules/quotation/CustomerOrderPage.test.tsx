import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomerOrderPage } from './CustomerOrderPage';
import type { CustomerTrackingItem } from './customerTracking';
import { productionStage, trackingLabel } from './customerTracking';

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
  it('separa aceptar la cotización de asignar e iniciar el trabajo', async () => {
    const pending = structuredClone(item);
    pending.productionOrders[0]!.status = 'recommended';
    delete pending.productionOrders[0]!.assignment;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: pending }) }),
    );
    render(<CustomerOrderPage quotationId={item.quotation.id} />);
    expect(await screen.findByText(/aceptar no inicia la fabricación/)).toBeTruthy();
    expect(
      screen.getByRole('heading', { name: 'Perú Activa debe completar la asignación' }),
    ).toBeTruthy();
  });

  it('muestra la confirmación del plazo y bloquea aceptar una fecha no confirmada', async () => {
    const quoted = structuredClone(item);
    quoted.quotation.status = 'quoted';
    quoted.productionOrders = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: quoted }) }),
    );
    render(<CustomerOrderPage quotationId={item.quotation.id} />);
    expect(await screen.findByText('Fecha de entrega pendiente de confirmación')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aceptar cotización/ })).toHaveProperty(
      'disabled',
      true,
    );
    cleanup();
    quoted.quotation.quotation!.deliveryConfirmation = {
      requiredBy: quoted.quotation.request.delivery.requiredBy,
      confirmed: true,
    };
    render(<CustomerOrderPage quotationId={item.quotation.id} />);
    expect(await screen.findByText('Fecha de entrega confirmada por Perú Activa')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Aceptar cotización/ })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('evalúa todas las prendas y no muestra terminado cuando queda una por asignar', async () => {
    const multiple = structuredClone(item);
    multiple.quotation.request.additionalGarments = [
      {
        ...multiple.quotation.request.garment,
        product: 'buzo',
        model: 'Casaca y pantalón',
        sleeve: 'no_aplica',
        cut: 'no_aplica',
      },
    ];
    multiple.productionOrders[0]!.garmentIndex = 0;
    multiple.productionOrders[0]!.status = 'completed';
    multiple.productionOrders.push({
      ...multiple.productionOrders[0]!,
      id: 'PED-R2-002',
      garmentIndex: 1,
      status: 'recommended',
      assignment: undefined,
    });
    expect(productionStage(multiple)).toBe(0);
    expect(trackingLabel(multiple)).toBe('Asignación parcial');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, item: multiple }) }),
    );
    render(<CustomerOrderPage quotationId={item.quotation.id} />);
    expect(await screen.findByRole('region', { name: 'Asignación por prenda' })).toBeTruthy();
    expect(screen.getByText(/Buzos · 20 unidades/)).toBeTruthy();
    expect(screen.getByText(/Propuesta calculada; falta confirmación/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Pedido terminado' })).toBeNull();
    multiple.productionOrders[1]!.status = 'completed';
    expect(productionStage(multiple)).toBe(3);
    multiple.productionOrders.pop();
    expect(productionStage(multiple)).toBe(0);
  });
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
    expect(screen.getByText(/cuando se firme el contrato/i).textContent).toContain(
      'Siguiente paso: cuando se firme el contrato, enviaremos la muestra física sin costo para confirmar el color final.',
    );
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
