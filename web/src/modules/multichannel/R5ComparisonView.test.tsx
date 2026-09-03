import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { R5ComparisonView } from './R5ComparisonView';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const scenario = {
  id: 'balanced-polo',
  title: 'Polo equilibrado',
  focus: 'Varias alternativas factibles.',
  draft: { product: 'polo', quantity: 100, material: 'pima 20/1', requiredBy: '2026-09-12' },
  fabricBuyer: 'workshop' as const,
};

const candidate = {
  candidateId: 'sim-workshop-b',
  displayName: 'Taller simulado B',
  score: 0.91,
  allocations: [
    {
      workshopId: 'sim-workshop-b',
      displayName: 'Taller simulado B',
      quantity: 100,
      availableCapacity: 240,
      effectiveLeadTimeDays: 8,
      estimatedCost: 2400,
    },
  ],
  reasons: ['un taller cubre el pedido completo'],
  dimensions: { delivery: 0.8, cost: 0.9, reliability: 0.95, quality: 0.98, evidence: 0.4 },
};

const payload = {
  datasetVersion: 'r5-synthetic-v13',
  seed: 20_260_827,
  scenario,
  request: {
    order: {
      id: 'SIM-BALANCED-POLO',
      product: 'polo',
      material: 'pima 20/1',
      quantity: 100,
      fabricBuyer: 'workshop' as const,
      requiredProcesses: ['design', 'cutting', 'sewing'],
      requiredBy: '2026-09-12T18:00:00-05:00',
    },
    weights: { delivery: 0.3, cost: 0, reliability: 0.3, quality: 0.3, evidence: 0.1 },
    workshopCount: 5,
  },
  comparison: {
    baseline: {
      algorithm: 'deterministic-baseline',
      averageMilliseconds: 0.04,
      repetitions: 100,
      value: { candidates: [candidate], rejected: [] },
    },
    genetic: {
      algorithm: 'genetic',
      averageMilliseconds: 12.5,
      repetitions: 5,
      value: {
        algorithmVersion: 'ga-0.6.0',
        seed: 20_260_827,
        evaluations: 1476,
        parameters: {
          populationSize: 36,
          generations: 40,
          mutationRate: 0.12,
          eliteCount: 2,
          maximumWorkshops: 3,
        },
        convergence: [
          { generation: 0, bestScore: 0.91, averageScore: 0.5, feasibleIndividuals: 20 },
          { generation: 40, bestScore: 0.91, averageScore: 0.88, feasibleIndividuals: 36 },
        ],
        result: { candidates: [candidate], rejected: [] },
      },
    },
    summary: {
      baselineFeasible: true,
      geneticFeasible: true,
      scoreDifference: 0,
      sameAllocation: true,
    },
  },
};

describe('R5ComparisonView', () => {
  it('ejecuta y explica la comparación entre ambos métodos', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => payload }));
    const user = userEvent.setup();
    render(
      <R5ComparisonView
        scenarios={[scenario]}
        selectedScenario={scenario.id}
        selected={scenario}
        onScenarioChange={vi.fn()}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Ejecutar comparación' }));

    expect(await screen.findByText('Ambos métodos encontraron la misma asignación')).toBeTruthy();
    expect(screen.getByText('Algoritmo genético')).toBeTruthy();
    expect(screen.getAllByText('Taller simulado B').length).toBeGreaterThan(0);
    expect(screen.getByRole('img', { name: /mejor aptitud/i })).toBeTruthy();
    expect(screen.getAllByText('Taller productor').length).toBeGreaterThan(0);
  });

  it('envía la decisión de Perú Activa sobre la compra de tela', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => payload });
    vi.stubGlobal('fetch', fetchMock);
    const user = userEvent.setup();
    render(
      <R5ComparisonView
        scenarios={[scenario]}
        selectedScenario={scenario.id}
        selected={scenario}
        onScenarioChange={vi.fn()}
      />,
    );

    await user.selectOptions(screen.getByLabelText('¿Quién compra la tela?'), 'peru_activa');
    await user.click(screen.getByRole('button', { name: 'Ejecutar comparación' }));

    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ body: JSON.stringify({ fabricBuyer: 'peru_activa' }) }),
    );
  });
});
