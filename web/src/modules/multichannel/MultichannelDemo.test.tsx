import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MultichannelDemo, type Order } from './MultichannelDemo';

const socketHandlers = vi.hoisted(() => new Map<string, () => void>());

vi.mock('socket.io-client', () => ({
  io: () => ({ on: vi.fn((event, handler) => socketHandlers.set(event, handler)), disconnect: vi.fn() }),
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
  socketHandlers.clear();
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

describe('navegación de pedidos de Perú Activa', () => {
  it('abre siempre el detalle del pedido en la misma pestaña sin montar la asignación en la bandeja', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes('assignment-scenarios') ? { scenarios: [], workshops: [], datasetVersion: 'test', seed: 1 }
        : url.includes('workshop-notifications') ? { notifications: [] }
        : url.includes('quotation-requests') ? { requests: [quotation] } : { orders: [order] };
      return { ok: true, json: async () => payload } as Response;
    }));
    render(<MultichannelDemo view="peru-activa" />);
    const link = await screen.findByRole('link', { name: 'Abrir pedido' });
    expect(link.getAttribute('href')).toBe(`/peru-activa/pedidos/${quotation.id}`);
    expect(link.getAttribute('target')).toBe('_self');
    expect(screen.queryByRole('heading', { name: 'Revisión de asignación' })).toBeNull();
    expect(Element.prototype.scrollIntoView).not.toHaveBeenCalled();
  });
});

describe('errores al cargar las bandejas', () => {
  it.each(['peru-activa', 'taller', 'evidencia'] as const)('maneja un HTTP 403 en %s sin montar datos inválidos y permite reintentar', async (view) => {
    let denied = true;
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const payload = url.includes('assignment-scenarios') ? {scenarios:[],workshops:[],datasetVersion:'test',seed:1}
        : url.includes('quotation-requests') ? {requests:[]}
        : url.includes('workshop-notifications') ? (denied ? {message:'Esta cuenta no tiene acceso a esta acción.'} : {notifications:[]})
        : {orders:[]};
      return {ok: !(url.includes('workshop-notifications') && denied), json:async()=>payload} as Response;
    }));
    const user=userEvent.setup(); render(<MultichannelDemo view={view} workshopPhone="900000001" />);
    expect((await screen.findByRole('alert')).textContent).toContain('Esta cuenta no tiene acceso');
    denied=false; await user.click(screen.getByRole('button',{name:'Reintentar'}));
    await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
  });

  it('captura respuestas inválidas en las actualizaciones y se recupera en el siguiente evento', async () => {
    let malformed=false;
    vi.stubGlobal('fetch',vi.fn(async(input:RequestInfo|URL)=>{
      const url=String(input);const payload=url.includes('assignment-scenarios') ? {scenarios:[],workshops:[],datasetVersion:'test',seed:1}
        : url.includes('workshop-notifications') ? (malformed ? {} : {notifications:[]}) : {orders:[]};
      return {ok:true,json:async()=>payload} as Response;
    }));
    render(<MultichannelDemo view="taller" workshopPhone="900000001" />);
    await screen.findByText('La bandeja está vacía');
    malformed=true; await act(async()=>socketHandlers.get('orders.changed')?.());
    expect((await screen.findByRole('alert')).textContent).toContain('No pudimos cargar la bandeja');
    malformed=false; await act(async()=>socketHandlers.get('orders.changed')?.());
    await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());
    expect(screen.getByText('La bandeja está vacía')).toBeTruthy();
  });
});
