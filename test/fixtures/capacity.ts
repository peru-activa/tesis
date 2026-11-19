import { AssignmentDemoService } from '../../src/application/assignment-demo-service.js';
import type { OrderStore } from '../../src/data/order-store.js';
import {
  recommendationRequestSchema,
  workshopSchema,
  type Workshop,
} from '../../src/domain/contracts.js';
import type { PortalOrder } from '../../src/domain/orders.js';

const now = '2026-11-02T18:00:00-05:00';
const requiredBy = '2026-11-09';
export function capacityWorkshop(overrides: Partial<Workshop> = {}): Workshop {
  return workshopSchema.parse({
    id: 'resource',
    displayName: 'Taller de prueba',
    products: ['polo'],
    materials: ['algodón'],
    materialFamilies: ['cotton_knit'],
    processes: ['cutting', 'sewing', 'finishing'],
    minimumUnits: 1,
    maximumUnits: 100,
    availableCapacity: 100,
    capacityPlanningMode: 'throughput',
    productionRate: { quantity: 100, days: 5 },
    workingDays: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    estimatedLeadTimeDays: 0,
    estimatedTotalCost: 1,
    onTimeRate: 1,
    defectRate: 0,
    evidenceLevel: 'declared',
    ...overrides,
  });
}

export async function capacityOrder(
  service: AssignmentDemoService,
  orders: OrderStore,
  id: string,
  quantity: number,
  date = requiredBy,
) {
  const input = recommendationRequestSchema.parse({
    evaluatedAt: now,
    order: {
      id,
      product: 'polo',
      quantity,
      material: 'algodón',
      fabricBuyer: 'peru_activa',
      requiredProcesses: ['cutting', 'sewing', 'finishing'],
      requiredBy: `${date}T18:00:00-05:00`,
    },
    workshops: (await service.catalog()).workshops,
  });
  const recommendation = await service.recommend(input);
  const order: PortalOrder = {
    id,
    status: recommendation.candidates.length ? 'recommended' : 'registered',
    createdAt: now,
    updatedAt: now,
    recommendation,
    recommendationOrder: input.order,
    draft: {
      product: 'polo',
      quantity,
      material: 'algodón',
      color: 'Azul',
      sizes: { M: quantity },
      customization: 'none',
      designReference: 'Datos sintéticos',
      requiredBy: date,
      deliveryDistrict: 'Lima',
      notes: '',
    },
    requiredProcesses: input.order.requiredProcesses,
  };
  await orders.create(order);
  return order;
}
