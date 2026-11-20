import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { IncomingQueue, type Order } from './MultichannelDemo';
afterEach(cleanup);
const draft = { product: 'polo', quantity: 20, material: 'algodón', color: 'azul', sizes: { M: 20 }, requiredBy: '2026-12-01', deliveryDistrict: 'Lima' };
const technicalOrder: Order = { id: 'PED-TECHNICAL', createdAt: '2026-11-11T15:00:00Z', testOnly: true, status: 'recommended', draft, recommendation: { candidates: [], rejected: [] } };
it('muestra una orden técnica y una solicitud en las mismas filas y abre el mismo detalle', async () => {
  const open = vi.fn();
  const quote = { id: 'COT-NORMAL', createdAt: '2026-11-10T15:00:00Z', status: 'pending_quote' as const, request: { garment: { product: 'polo', quantity: 30 }, additionalGarments: [], delivery: { requiredBy: '2026-12-02', location: 'Lima' } } };
  const { container } = render(<IncomingQueue quotations={[quote]} orders={[technicalOrder]} />);
  const rows = container.querySelectorAll('.mc-incoming-list > article');
  expect(rows).toHaveLength(2);
  expect(within(rows[0] as HTMLElement).getByText('PED-TECHNICAL')).toBeTruthy();
  expect(within(rows[0] as HTMLElement).getByText('Prueba')).toBeTruthy();
  expect(screen.queryByRole('heading', { name: 'Pedidos de prueba' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Abrir pedido' }).getAttribute('href')).toBe('/peru-activa/pedidos/PED-TECHNICAL');
  expect(screen.getByRole('link', { name: 'Abrir pedido' }).getAttribute('target')).toBe('_self');
  expect(screen.getByRole('link', { name: 'Abrir y cotizar' }).getAttribute('href')).toBe('/peru-activa/pedidos/COT-NORMAL');
});
it('agrupa las órdenes de una cotización sin duplicarlas como filas independientes', () => {
  const linked = { ...technicalOrder, testOnly: false, source: { type: 'quotation' as const, quotationId: 'COT-LINKED', garmentIndex: 0 } };
  const quote = { id: 'COT-LINKED', createdAt: '2026-11-10T15:00:00Z', status: 'accepted' as const, request: { garment: { product: 'polo', quantity: 20 }, additionalGarments: [], delivery: { requiredBy: '2026-12-01', location: 'Lima' } } };
  const { container } = render(<IncomingQueue quotations={[quote]} orders={[linked]} />);
  expect(container.querySelectorAll('.mc-incoming-list > article')).toHaveLength(1);
  expect(screen.getAllByRole('link', { name: 'Abrir pedido' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Abrir pedido' }).getAttribute('href')).toBe('/peru-activa/pedidos/COT-LINKED');
});
it('una solicitud técnica nueva tiene la misma acción Abrir y cotizar sin orden adelantada', () => {
  const quote = { id: 'COT-FA123456', testOnly: true, createdAt: '2026-11-11T15:00:00Z', status: 'pending_quote' as const, request: { garment: { product: 'polo', quantity: 20 }, additionalGarments: [], delivery: { requiredBy: '2026-12-02', location: 'Prueba sin entrega' } } };
  render(<IncomingQueue quotations={[quote]} orders={[]} />);
  expect(screen.getByRole('link', { name: 'Abrir y cotizar' }).getAttribute('href')).toBe('/peru-activa/pedidos/COT-FA123456');
  expect(screen.getByText('Nueva')).toBeTruthy();
  expect(screen.getByText('Prueba')).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Abrir PED/ })).toBeNull();
});

it('muestra todos los pedidos y separa los que superan siete días, sin cortar en seis filas', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
  try {
    const orders = Array.from({ length: 9 }, (_, index) => ({ ...technicalOrder,
      id: `PED-HISTORY-${index}`, createdAt: new Date(Date.now() - index * 24 * 60 * 60 * 1000).toISOString() }));
    const { container } = render(<IncomingQueue quotations={[]} orders={orders} />);
    expect(container.querySelectorAll('.mc-incoming-list > article')).toHaveLength(9);
    expect(screen.getByRole('heading', { name: 'Últimos 7 días 8' })).toBeTruthy();
    const divider = screen.getByRole('heading', { name: 'Más de una semana 1' });
    expect(divider.nextElementSibling?.textContent).toContain('PED-HISTORY-8');
    expect(screen.getByText('PED-HISTORY-7')).toBeTruthy();
  } finally { vi.useRealTimers(); }
});

it('muestra fecha y hora de ingreso en Perú y conserva registros sin fecha', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
  try {
    const dated = { ...technicalOrder, id: 'PED-DATED', createdAt: '2026-11-12T02:19:00Z' };
    const undated = { ...technicalOrder, id: 'PED-UNDATED', createdAt: undefined };
    const invalid = { ...technicalOrder, id: 'PED-INVALID', createdAt: 'invalid' };
    const { container } = render(<IncomingQueue quotations={[]} orders={[invalid, undated, dated]} />);
    const time = container.querySelector('time')!;
    expect(time.getAttribute('datetime')).toBe(dated.createdAt);
    expect(time.textContent).toMatch(/Recibido 11 nov\. 2026/);
    expect(time.textContent).toMatch(/9:19/);
    expect(screen.getByRole('heading', { name: 'Sin fecha de registro 2' })).toBeTruthy();
    expect(screen.getAllByText('Fecha de ingreso no registrada')).toHaveLength(2);
  } finally { vi.useRealTimers(); }
});

it('separa por instante de ingreso y ordena fechas con distintas zonas horarias', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-12T15:00:00Z'));
  try {
    const quote = { id: 'COT-OLD', createdAt: '2026-11-05T14:59:59.999Z', status: 'pending_quote' as const,
      request: { garment: { product: 'polo', quantity: 30 }, additionalGarments: [], delivery: { requiredBy: '2026-12-02', location: 'Lima' } } };
    const orders = [
      { ...technicalOrder, id: 'PED-EARLIER', createdAt: '2026-11-12T13:30:00Z' },
      { ...technicalOrder, id: 'PED-LATER', createdAt: '2026-11-12T09:00:00-05:00' },
    ];
    const { container } = render(<IncomingQueue quotations={[quote]} orders={orders} />);
    const rows = container.querySelectorAll('.mc-incoming-list > article');
    expect(rows[0]!.textContent).toContain('PED-LATER');
    expect(rows[1]!.textContent).toContain('PED-EARLIER');
    expect(screen.getByRole('heading', { name: 'Más de una semana 1' }).nextElementSibling?.textContent).toContain('COT-OLD');
    expect(screen.getByText('1 pendiente')).toBeTruthy();
  } finally { vi.useRealTimers(); }
});
