import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssignedWorkSummary } from './AssignedWorkSummary';
afterEach(cleanup);
const assignment = {
  displayName: 'Plan de dos talleres',
  allocations: [
    {
      workshopId: 'producer',
      displayName: 'Productor registrado',
      quantity: 100,
      assignedProcesses: ['cutting', 'sewing'],
      status: 'in_production' as const,
    },
    {
      workshopId: 'specialist',
      displayName: 'Especialista registrado',
      quantity: 100,
      assignedProcesses: ['embroidery'],
      status: 'assigned' as const,
    },
  ],
};
it('muestra cada responsable, su etapa, cantidad y estado sin sumar prendas que pasan por varias etapas', () => {
  render(
    <AssignedWorkSummary
      order={{ id: 'PED-1', status: 'in_production', assignment, previewOnly: true }}
    />,
  );
  expect(screen.getByText('Productor registrado')).toBeTruthy();
  expect(screen.getByText('Especialista registrado')).toBeTruthy();
  expect(screen.getByText('Corte · Costura')).toBeTruthy();
  expect(screen.getByText('Bordado')).toBeTruthy();
  expect(screen.getAllByText('100 unidades')).toHaveLength(2);
  expect(screen.getByText('En producción')).toBeTruthy();
  expect(screen.getByText('Asignado')).toBeTruthy();
  expect(screen.getByText(/DEMOSTRACIÓN · NO FABRICAR · SIN ENVÍOS/)).toBeTruthy();
  expect(screen.queryByRole('button')).toBeNull();
});
it('presenta asignaciones terminadas y conserva una asignación antigua sin inventar procesos', () => {
  const { rerender } = render(
    <AssignedWorkSummary
      order={{
        id: 'PED-2',
        status: 'completed',
        assignment: {
          ...assignment,
          allocations: assignment.allocations.map((item) => ({ ...item, status: 'completed' })),
        },
      }}
    />,
  );
  expect(screen.getByText('PEDIDO TERMINADO')).toBeTruthy();
  expect(screen.getAllByText('Terminado')).toHaveLength(2);
  expect(screen.queryByText(/DEMOSTRACIÓN/)).toBeNull();
  rerender(
    <AssignedWorkSummary
      order={{
        id: 'PED-3',
        status: 'assigned',
        assignment: { displayName: 'Asignación conservada' },
      }}
    />,
  );
  expect(screen.getByText('Asignación conservada')).toBeTruthy();
});
