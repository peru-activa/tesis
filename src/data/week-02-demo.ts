import { recommendationRequestSchema } from '../domain/contracts.js';
import { simulatedWorkshops } from './workshops.js';

export const week02Demo = {
  delivery: {
    week: 2,
    title: 'Asignación explicable de un pedido textil',
    thesisResults: ['R5', 'R8'],
    resultStatus: 'partial',
    algorithmStage: 'heuristic-baseline',
  },
  request: recommendationRequestSchema.parse({
    evaluatedAt: '2026-08-26T16:00:00-05:00',
    order: {
      id: 'PED-DEMO-S02',
      product: 'polo',
      material: 'algodón',
      quantity: 100,
      requiredProcesses: ['design', 'cutting', 'sewing', 'printing', 'finishing'],
      requiredBy: '2026-09-12T18:00:00-05:00',
    },
    workshops: simulatedWorkshops,
  }),
} as const;
