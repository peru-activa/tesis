import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { OrderAssignmentPanel } from './OrderAssignmentPanel';
vi.mock('socket.io-client', () => ({ io: () => ({ on: vi.fn(), disconnect: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function order(status = 'recommended') {
  return { id: 'PED-AB123456', status, draft: { quantity: 20, product: 'polo' }, requiredProcesses: ['sewing'],
    recommendation: { candidates: status === 'registered' ? [] : [{ candidateId: 'plan-1', workshopId: 'w1', displayName: 'Nombre técnico', reasons: ['Capacidad suficiente'], allocations: [{ workshopId: 'w1', displayName: 'Nombre técnico', quantity: 20, assignedProcesses: ['sewing'] }] }], rejected: [{ reasons: ['El plazo requiere una revisión.'] }] },
  };
}
it('un solo botón inicia la asignación y completar el servidor actualiza el detalle sin otro clic', async () => {
  let current: Record<string, unknown> = order(); let automation: unknown = null;
  const mutations: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (init?.method === 'POST') {
      mutations.push(url); automation = { phase: 'running', attemptedWorkshopIds: ['w1'], rejections: [] };
    }
    const candidate = order().recommendation.candidates[0];
    let payload: unknown = { order: current, workshopNames: { w1: 'Eduardo' } };
    if (url.endsWith('assignment-automation')) payload = { order: current, automation, candidate, alternatives: [], availability: [{ workshopId: 'w1', displayName: 'Eduardo', phone: '911111111', state: automation ? 'capacity_pending' : 'not_contacted', lastError: null }] };
    if (url.endsWith('production-coordination')) payload = { coordination: [{ workshopId: 'w1', state: 'accepted', lastError: null }] };
    return { ok: true, json: async () => payload } as Response;
  }));
  const user = userEvent.setup(); const { unmount } = render(<OrderAssignmentPanel orderId="PED-AB123456" />);
  await screen.findByText('Plan principal'); expect(mutations).toHaveLength(0);
  expect(screen.getByText('911111111')).toBeTruthy();
  expect(screen.getAllByRole('button')).toHaveLength(1);
  await user.click(screen.getByRole('button', { name: 'Iniciar asignación' }));
  await screen.findByText('Pendiente');
  expect(screen.queryByRole('button', { name: 'Confirmar asignación' })).toBeNull();
  expect(mutations).toEqual(['/v1/orders/PED-AB123456/assignment-automation']);
  current = { ...current, status: 'assigned', assignment: { allocations: [{ workshopId: 'w1', displayName: 'Nombre técnico', quantity: 20, assignedProcesses: ['sewing'] }] } };
  unmount(); render(<OrderAssignmentPanel orderId="PED-AB123456" />);
  await screen.findByRole('heading', { name: 'Asignación confirmada' });
  await screen.findByText('Aceptado');
  expect(mutations).toHaveLength(1);
});
it('actualiza una propuesta sin taller desde el mismo detalle', async () => {
  let current = order('registered'); const mutations: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input); if (init?.method === 'POST') { mutations.push(url); current = order(); }
    const payload = url.endsWith('assignment-automation')
      ? { order: current, automation: null, candidate: current.recommendation.candidates[0], alternatives: [], availability: [] }
      : { order: current, workshopNames: {} };
    return { ok: true, json: async () => payload } as Response;
  }));
  const user = userEvent.setup(); render(<OrderAssignmentPanel orderId="PED-AB123456" />);
  await screen.findByText('No hay un plan compatible con los mínimos, capacidades y plazo.');
  await user.click(screen.getByRole('button', { name: 'Actualizar propuesta' }));
  await screen.findByText('Plan principal');
  expect(mutations).toEqual(['/v1/orders/PED-AB123456/recommendation']);
});
it('un detalle inexistente ofrece un error sin iniciar operaciones', async () => {
  const request = vi.fn(async () => ({ ok: false, json: async () => ({ message: 'No se encontró la orden.' }) } as Response));
  vi.stubGlobal('fetch', request); render(<OrderAssignmentPanel orderId="PED-NOTFOUND" />);
  expect((await screen.findByRole('alert')).textContent).toContain('No se encontró la orden.');
  expect(request).toHaveBeenCalledTimes(1);
});

it('la demostración de distribución es de solo lectura y no consulta WhatsApp', async () => {
  const current = { ...order(), previewOnly: true, status: 'assigned', assignment: { allocations: [{ workshopId: 'w1', displayName: 'Nombre técnico', quantity: 20, assignedProcesses: ['sewing'], status: 'in_production' }] } };
  const request = vi.fn(async () => ({ ok: true, json: async () => ({ order: current, workshopNames: { w1: 'Eduardo' } }) } as Response));
  vi.stubGlobal('fetch', request); render(<OrderAssignmentPanel orderId="PED-AB123456" />);
  await screen.findByRole('heading', { name: 'Distribución de ejemplo' });
  expect(screen.getByText(/avances son simulados/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
  expect(request).toHaveBeenCalledTimes(1);
});
