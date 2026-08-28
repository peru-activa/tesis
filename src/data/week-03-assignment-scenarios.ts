import { recommendationRequestSchema, type Workshop } from '../domain/contracts.js';
import { orderDraftSchema, type OrderDraft } from '../domain/orders.js';

export const WEEK_03_DATASET_VERSION = 'r5-synthetic-v1';
export const WEEK_03_SEED = 20_260_827;
export const WEEK_03_EVALUATED_AT = '2026-08-27T09:00:00-05:00';

export const week03SimulatedWorkshops: Workshop[] = [
  {
    id: 'sim-workshop-a',
    displayName: 'Taller simulado A',
    contactPhone: '900000001',
    products: ['polo'],
    materials: ['algodón', 'poliéster'],
    processes: [
      'fabric_sourcing',
      'design',
      'patternmaking',
      'cutting',
      'sewing',
      'printing',
      'vinyl',
      'embroidery',
      'notions',
      'ironing',
      'finishing',
      'quality_control',
    ],
    minimumUnits: 20,
    maximumUnits: 180,
    availableCapacity: 150,
    availableFrom: '2026-08-27T09:00:00-05:00',
    estimatedLeadTimeDays: 10,
    estimatedTotalCost: 2100,
    onTimeRate: 0.82,
    defectRate: 0.06,
    evidenceLevel: 'declared',
  },
  {
    id: 'sim-workshop-b',
    displayName: 'Taller simulado B',
    contactPhone: '900000002',
    products: ['polo', 'buzo'],
    materials: ['algodón', 'dry-fit', 'poliéster'],
    processes: [
      'fabric_sourcing',
      'design',
      'patternmaking',
      'cutting',
      'sewing',
      'printing',
      'vinyl',
      'embroidery',
      'sublimation',
      'notions',
      'ironing',
      'finishing',
      'quality_control',
      'delivery',
    ],
    minimumUnits: 20,
    maximumUnits: 300,
    availableCapacity: 240,
    availableFrom: '2026-08-27T09:00:00-05:00',
    estimatedLeadTimeDays: 8,
    estimatedTotalCost: 2400,
    onTimeRate: 0.95,
    defectRate: 0.02,
    evidenceLevel: 'declared',
  },
  {
    id: 'sim-workshop-c',
    displayName: 'Taller simulado C',
    contactPhone: '900000003',
    products: ['polo', 'buzo'],
    materials: ['dry-fit', 'poliéster'],
    processes: [
      'design',
      'patternmaking',
      'cutting',
      'sewing',
      'sublimation',
      'ironing',
      'finishing',
      'quality_control',
    ],
    minimumUnits: 30,
    maximumUnits: 500,
    availableCapacity: 400,
    availableFrom: '2026-08-27T09:00:00-05:00',
    estimatedLeadTimeDays: 5,
    estimatedTotalCost: 1800,
    onTimeRate: 0.9,
    defectRate: 0.03,
    evidenceLevel: 'declared',
  },
  {
    id: 'sim-workshop-d',
    displayName: 'Taller simulado D',
    contactPhone: '900000004',
    products: ['polo'],
    materials: ['algodón'],
    processes: [
      'fabric_sourcing',
      'design',
      'cutting',
      'sewing',
      'embroidery',
      'notions',
      'ironing',
      'finishing',
      'quality_control',
    ],
    minimumUnits: 20,
    maximumUnits: 120,
    availableCapacity: 120,
    availableFrom: '2026-08-27T09:00:00-05:00',
    estimatedLeadTimeDays: 6,
    estimatedTotalCost: 2200,
    onTimeRate: 0.9,
    defectRate: 0.04,
    evidenceLevel: 'declared',
  },
  {
    id: 'sim-workshop-e',
    displayName: 'Taller simulado E',
    contactPhone: '900000005',
    products: ['polo', 'buzo'],
    materials: ['algodón', 'poliéster'],
    processes: [
      'fabric_sourcing',
      'design',
      'patternmaking',
      'cutting',
      'sewing',
      'printing',
      'vinyl',
      'notions',
      'ironing',
      'finishing',
      'quality_control',
      'delivery',
    ],
    minimumUnits: 50,
    maximumUnits: 600,
    availableCapacity: 360,
    availableFrom: '2026-09-01T09:00:00-05:00',
    estimatedLeadTimeDays: 9,
    estimatedTotalCost: 2300,
    onTimeRate: 0.88,
    defectRate: 0.05,
    evidenceLevel: 'declared',
  },
];

export interface Week03AssignmentScenario {
  id: string;
  title: string;
  focus: string;
  draft: OrderDraft;
  requiredProcesses: Array<Workshop['processes'][number]>;
}

function draft(overrides: Partial<OrderDraft> = {}): OrderDraft {
  return orderDraftSchema.parse({
    product: 'polo',
    quantity: 100,
    material: 'algodón',
    color: 'Azul marino',
    sizes: { S: 20, M: 35, L: 30, XL: 15 },
    customization: 'printing',
    designReference: 'Logo institucional al pecho',
    requiredBy: '2026-09-12',
    deliveryDistrict: 'La Victoria',
    notes: '',
    ...overrides,
  });
}

export const week03AssignmentScenarios: Week03AssignmentScenario[] = [
  {
    id: 'balanced-polo',
    title: 'Polo equilibrado',
    focus: 'Varias alternativas factibles con factores visibles.',
    draft: draft(),
    requiredProcesses: ['design', 'cutting', 'sewing', 'printing', 'finishing'],
  },
  {
    id: 'sports-sublimation',
    title: 'Sublimación deportiva',
    focus: 'Especialización en sublimación y material dry-fit.',
    draft: draft({
      quantity: 160,
      material: 'dry-fit',
      color: 'Rojo',
      sizes: { S: 30, M: 50, L: 50, XL: 30 },
      customization: 'sublimation',
      designReference: 'Gráfica deportiva integral sublimada',
    }),
    requiredProcesses: ['design', 'cutting', 'sewing', 'sublimation', 'finishing'],
  },
  {
    id: 'embroidery-specialist',
    title: 'Bordado especializado',
    focus: 'Coincidencia con el proceso obligatorio de bordado.',
    draft: draft({
      quantity: 80,
      color: 'Negro',
      sizes: { S: 10, M: 25, L: 30, XL: 15 },
      customization: 'embroidery',
      designReference: 'Escudo bordado de alta densidad',
    }),
    requiredProcesses: ['design', 'cutting', 'sewing', 'embroidery', 'finishing'],
  },
  {
    id: 'integrated-tracksuit',
    title: 'Buzo integrado',
    focus: 'Cobertura de producto, material y procesos para un buzo.',
    draft: draft({
      product: 'buzo',
      quantity: 120,
      material: 'poliéster',
      color: 'Gris',
      sizes: { S: 20, M: 40, L: 40, XL: 20 },
      requiredBy: '2026-09-18',
      designReference: 'Logotipo estampado en casaca',
    }),
    requiredProcesses: ['design', 'cutting', 'sewing', 'printing', 'finishing'],
  },
  {
    id: 'exact-capacity',
    title: 'Capacidad exacta',
    focus: 'La cantidad coincide con la capacidad disponible del especialista.',
    draft: draft({
      quantity: 120,
      color: 'Verde',
      sizes: { S: 20, M: 40, L: 40, XL: 20 },
      customization: 'embroidery',
      designReference: 'Insignia bordada al pecho',
    }),
    requiredProcesses: ['design', 'cutting', 'sewing', 'embroidery', 'finishing'],
  },
  {
    id: 'insufficient-capacity',
    title: 'Capacidad insuficiente',
    focus: 'Ningún taller compatible dispone del volumen requerido.',
    draft: draft({
      quantity: 450,
      color: 'Blanco',
      sizes: { S: 75, M: 150, L: 150, XL: 75 },
      requiredBy: '2026-09-25',
      designReference: 'Estampado frontal institucional',
    }),
    requiredProcesses: ['design', 'cutting', 'sewing', 'printing', 'finishing'],
  },
  {
    id: 'tight-deadline',
    title: 'Plazo incompatible',
    focus: 'La disponibilidad y el tiempo de producción exceden la fecha requerida.',
    draft: draft({ requiredBy: '2026-08-30', color: 'Celeste' }),
    requiredProcesses: ['design', 'cutting', 'sewing', 'printing', 'finishing'],
  },
  {
    id: 'unsupported-material',
    title: 'Material sin cobertura',
    focus: 'Todos los talleres se descartan por material no atendido.',
    draft: draft({
      material: 'algodón',
      color: 'Crudo',
      designReference: 'Acabado sobre lona',
      notes: 'Escenario técnico: el motor recibe material lona.',
    }),
    requiredProcesses: ['design', 'cutting', 'sewing', 'printing', 'finishing'],
  },
];

export function recommendationForScenario(scenario: Week03AssignmentScenario) {
  const material = scenario.id === 'unsupported-material' ? 'lona' : scenario.draft.material;
  return recommendationRequestSchema.parse({
    evaluatedAt: WEEK_03_EVALUATED_AT,
    order: {
      id: `SIM-${scenario.id.toUpperCase()}`,
      product: scenario.draft.product,
      material,
      quantity: scenario.draft.quantity,
      requiredProcesses: scenario.requiredProcesses,
      requiredBy: `${scenario.draft.requiredBy}T18:00:00-05:00`,
    },
    workshops: week03SimulatedWorkshops,
  });
}

export function findWeek03Scenario(id: string): Week03AssignmentScenario | undefined {
  return week03AssignmentScenarios.find((scenario) => scenario.id === id);
}
