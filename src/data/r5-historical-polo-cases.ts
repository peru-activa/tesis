import {
  recommendationRequestSchema,
  type FabricBuyer,
  type FabricSupply,
  type PoloType,
  type Process,
} from '../domain/contracts.js';
import { recommendationRequestsForMaterialAlternatives } from '../domain/material-alternatives.js';
import { fabricSupplyForPoloMaterial } from './polo-fabrics.js';
import { week03DeclaredWorkshops } from './week-03-assignment-scenarios.js';

export const R5_HISTORICAL_DATASET_VERSION = 'r5-historical-polos-gmail-v9-draft';
export const R5_HISTORICAL_SEED = 20_260_903;
export const R5_HISTORICAL_EVALUATED_AT = '2026-09-03T09:00:00-05:00';

export type HistoricalSourceChannel = 'gmail' | 'whatsapp';
export type HistoricalSourceStatus = 'quotation_request' | 'quoted' | 'order_received';
export type SpecificationSource = 'customer' | 'database' | 'estimated' | 'unspecified';
export type LeadTimeSource = 'historical_record' | 'default_pending_confirmation';
export type LeadTimeScope = 'evaluated_polos' | 'complete_order';
type HistoricalCustomization = 'none' | 'printing' | 'sublimation' | 'embroidery';

export interface R5HistoricalPoloCase {
  id: `H${string}`;
  product: 'polo';
  poloType: PoloType;
  material: string;
  quantity: number;
  customization: HistoricalCustomization;
  additionalCustomizations: Exclude<HistoricalCustomization, 'none'>[];
  embroideryApplicationsPerGarment: number;
  requiredProcesses: Process[];
  fabricBuyer: FabricBuyer;
  fabricSupply: FabricSupply;
  requiresNewPattern: false;
  requiredBy: string;
  sourceChannel: HistoricalSourceChannel;
  sourceStatus: HistoricalSourceStatus;
  specificationSource: SpecificationSource;
  originalLeadTime: string | null;
  leadTimeSource: LeadTimeSource;
  leadTimeScope: LeadTimeScope;
  normalizationAssumptions: string[];
  validationStatus: 'validated_peru_activa';
}

const baseProcesses: Process[] = ['design', 'cutting', 'sewing', 'finishing'];

function processesFor(
  customization: R5HistoricalPoloCase['customization'],
  embroideryApplicationsPerGarment = 1,
  additionalCustomizations: R5HistoricalPoloCase['additionalCustomizations'] = [],
): Pick<
  R5HistoricalPoloCase,
  | 'customization'
  | 'additionalCustomizations'
  | 'embroideryApplicationsPerGarment'
  | 'requiredProcesses'
> {
  const processByCustomization: Partial<Record<R5HistoricalPoloCase['customization'], Process>> = {
    printing: 'printing',
    sublimation: 'sublimation',
    embroidery: 'embroidery',
  };
  const customizationProcesses = Array.from(
    new Set<Process>([
      ...(processByCustomization[customization] ? [processByCustomization[customization]!] : []),
      ...additionalCustomizations,
    ]),
  );
  return {
    customization,
    additionalCustomizations,
    embroideryApplicationsPerGarment,
    requiredProcesses:
      customizationProcesses.length > 0
        ? ['design', 'cutting', ...customizationProcesses, 'sewing', 'finishing']
        : [...baseProcesses],
  };
}

const common = {
  product: 'polo' as const,
  requiresNewPattern: false as const,
  validationStatus: 'validated_peru_activa' as const,
  leadTimeScope: 'evaluated_polos' as const,
  fabricSupply: {
    category: 'base' as const,
    minimumLeadTimeDays: 0,
    maximumLeadTimeDays: 0,
    remainingLeadTimeDays: 0,
  },
};

const unobservedOperationalAssumptions = [
  'El registro histórico no identifica quién compró la tela; se aplicó la regla operativa provisional de Perú Activa.',
  'El registro histórico no indica si se necesitó un molde nuevo; se asumió un modelo estándar.',
];

const r5HistoricalPoloCaseInputs: R5HistoricalPoloCase[] = [
  {
    ...common,
    id: 'H01',
    poloType: 'cotton_advertising',
    material: 'Algodón jersey 30/1',
    quantity: 50,
    ...processesFor('printing'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-08T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quoted',
    specificationSource: 'customer',
    originalLeadTime: '5 días de producción',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [...unobservedOperationalAssumptions],
  },
  {
    ...common,
    id: 'H02',
    poloType: 'sports',
    material: 'Poliéster',
    quantity: 300,
    ...processesFor('printing'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-15T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '12 días calendario',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [...unobservedOperationalAssumptions],
  },
  {
    ...common,
    id: 'H03',
    poloType: 'cotton_advertising',
    material: 'Algodón pyme',
    quantity: 180,
    ...processesFor('printing'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-08T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quoted',
    specificationSource: 'customer',
    originalLeadTime: '5 días calendario, incluida la aprobación de muestra',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [...unobservedOperationalAssumptions],
  },
  {
    ...common,
    id: 'H04',
    poloType: 'sports',
    material: 'Hydrotech 100% poliéster',
    quantity: 4000,
    ...processesFor('sublimation'),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-13T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '10 días calendario desde la orden o contrato',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'Hydrotech no figura en el catálogo de telas para polos con disponibilidad inmediata; se aplicó una espera conservadora de catorce días dentro del rango de siete a catorce días.',
    ],
  },
  {
    ...common,
    id: 'H05',
    poloType: 'cotton_advertising',
    material: 'Algodón 30/1',
    quantity: 100,
    ...processesFor('printing'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-13T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quoted',
    specificationSource: 'customer',
    originalLeadTime: '10 días calendario desde la orden de compra',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'El nombre del archivo menciona 130 polos, pero la tabla contractual especifica 100; se usó la cantidad de la tabla.',
    ],
  },
  {
    ...common,
    id: 'H06',
    poloType: 'sports',
    material: 'Dry Fit',
    quantity: 188,
    ...processesFor('printing'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-18T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'estimated',
    originalLeadTime: '15 días calendario desde la aprobación de la muestra',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La fuente permite Dry Fit o algodón; se usó Dry Fit para la repetición y la elección queda pendiente de confirmación.',
    ],
  },
  {
    ...common,
    id: 'H07',
    poloType: 'collared',
    material: 'Franela 20/1 + 20/1, 60% poliéster y 40% algodón',
    quantity: 110,
    ...processesFor('embroidery', 4),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-23T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '20 días calendario desde la orden de compra',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'El título solicita algodón piqué, pero la ficha del material principal indica franela 20/1 de composición mixta; se conservó la ficha y se marcó la contradicción para revisión.',
    ],
  },
  {
    ...common,
    id: 'H08',
    poloType: 'cotton_basic',
    material: 'Algodón reactivo 20/1',
    quantity: 25,
    ...processesFor('embroidery'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-10T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '7 días calendario',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [...unobservedOperationalAssumptions],
  },
  {
    ...common,
    id: 'H09',
    poloType: 'sports',
    material: 'Inter Dryer 100% poliéster Dry Fit',
    quantity: 50,
    ...processesFor('sublimation'),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-28T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '25 días calendario desde el acta de aprobación de diseño',
    leadTimeSource: 'historical_record',
    leadTimeScope: 'complete_order',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'El uniforme incluye polo, short y medias; esta prueba usa únicamente el componente polo sin afirmar que asigna el conjunto completo.',
    ],
  },
  {
    ...common,
    id: 'H10',
    poloType: 'sports',
    material: 'Dry Fit Premium',
    quantity: 100,
    ...processesFor('none'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-13T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'order_received',
    specificationSource: 'estimated',
    originalLeadTime: null,
    leadTimeSource: 'default_pending_confirmation',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La orden adjudicada admite piqué deportivo, micropiqué o Dry Fit Premium; se eligió Dry Fit Premium solo para la repetición técnica.',
      'La técnica del logotipo y el plazo no constan en la fuente usada; no se agregó personalización y se usó una ventana de diez días solo para ejecutar la evaluación técnica.',
    ],
  },
  {
    ...common,
    id: 'H11',
    poloType: 'collared',
    material: 'Algodón',
    quantity: 167,
    ...processesFor('embroidery', 2),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-10T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '7 días calendario desde la orden de servicio',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La fuente permite estampado o bordado y recomienda bordado; para la repetición se aplicó la alternativa recomendada.',
    ],
  },
  {
    ...common,
    id: 'H12',
    poloType: 'collared',
    material: 'Algodón piqué 24/1',
    quantity: 1000,
    ...processesFor('none'),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-23T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '20 días calendario desde la orden de compra',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [...unobservedOperationalAssumptions],
  },
  {
    ...common,
    id: 'H13',
    poloType: 'collared',
    material: 'Algodón piqué 24/1',
    quantity: 100,
    ...processesFor('embroidery', 2),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-08T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '5 días calendario desde la orden de compra',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [...unobservedOperationalAssumptions],
  },
  {
    ...common,
    id: 'H14',
    poloType: 'collared',
    material: 'Zanetti 100% poliéster',
    quantity: 116,
    ...processesFor('embroidery'),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-10T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quoted',
    specificationSource: 'customer',
    originalLeadTime: '1 semana',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'Se consolidaron cuatro variantes del mismo polo: dama y varón, manga corta y manga larga.',
      'La fuente especifica tela Zanetti 100% poliéster y un bordado posterior con la palabra INSTRUCTOR.',
      'El logotipo frontal es visible en la referencia, pero su técnica no se especifica; no se agregó un segundo proceso de bordado.',
    ],
  },
  {
    ...common,
    id: 'H15',
    poloType: 'collared',
    material: 'Interlock, 59% algodón pima y 41% poliéster',
    quantity: 2731,
    ...processesFor('embroidery'),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-23T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: '20 días calendario desde el contrato u orden de compra',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [...unobservedOperationalAssumptions],
  },
  {
    ...common,
    id: 'H16',
    poloType: 'sports',
    material: 'Hydrotech',
    quantity: 50,
    ...processesFor('sublimation', 1, ['embroidery']),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-30T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'order_received',
    specificationSource: 'customer',
    originalLeadTime: null,
    leadTimeSource: 'default_pending_confirmation',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La orden incluye polo, short y medias; esta prueba usa únicamente el componente polo.',
      'La fuente no fija plazo; se usó una ventana técnica suficiente para incluir el abastecimiento y calcular la duración completa, sin atribuirla al cliente.',
    ],
  },
  {
    ...common,
    id: 'H17',
    poloType: 'sports',
    material: 'Dry Fit de poliéster',
    quantity: 60,
    ...processesFor('sublimation'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-13T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'customer',
    originalLeadTime: null,
    leadTimeSource: 'default_pending_confirmation',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La solicitud también contiene 60 polos de algodón; se conservó como caso el renglón deportivo sublimado.',
      'La fuente no fija plazo; se usaron diez días solo para la repetición técnica.',
    ],
  },
  {
    ...common,
    id: 'H18',
    poloType: 'sports',
    material: 'Microfibra deportiva sublimada',
    quantity: 30,
    ...processesFor('sublimation'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-17T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'order_received',
    specificationSource: 'customer',
    originalLeadTime: '10 días hábiles desde la aprobación de la muestra final',
    leadTimeSource: 'historical_record',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La orden corresponde a un conjunto de polo, short y medias; esta prueba usa únicamente el componente polo.',
    ],
  },
  {
    ...common,
    id: 'H19',
    poloType: 'collared',
    material: 'Piqué tipo Lacoste con reactivo RX',
    quantity: 178,
    ...processesFor('none'),
    fabricBuyer: 'workshop',
    requiredBy: '2026-09-13T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quoted',
    specificationSource: 'customer',
    originalLeadTime: null,
    leadTimeSource: 'default_pending_confirmation',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La fuente exige un logotipo, pero no registra su técnica; no se agregó un proceso especializado.',
      'La fuente no fija plazo; se usaron diez días solo para la repetición técnica.',
    ],
  },
  {
    ...common,
    id: 'H20',
    poloType: 'sports',
    material: 'Poly Tricot deportivo 100% poliéster',
    quantity: 410,
    ...processesFor('none'),
    fabricBuyer: 'peru_activa',
    requiredBy: '2026-09-13T18:00:00-05:00',
    sourceChannel: 'gmail',
    sourceStatus: 'quotation_request',
    specificationSource: 'estimated',
    originalLeadTime: null,
    leadTimeSource: 'default_pending_confirmation',
    normalizationAssumptions: [
      ...unobservedOperationalAssumptions,
      'La fuente permite Tricot deportivo, Poly Tricot o Lafayette; se usó Poly Tricot únicamente para la repetición técnica.',
      'La cantidad corresponde a los 10 integrantes del equipo académico-administrativo y 400 alumnos declarados para el uniforme.',
      'La técnica del logotipo y el plazo no constan; no se agregó personalización y se usó una ventana de diez días solo para ejecutar la evaluación técnica.',
    ],
  },
];

export const r5HistoricalPoloCases: R5HistoricalPoloCase[] = r5HistoricalPoloCaseInputs.map(
  (historicalCase) => ({
    ...historicalCase,
    fabricSupply: fabricSupplyForPoloMaterial(historicalCase.material),
  }),
);

export function recommendationForHistoricalCase(historicalCase: R5HistoricalPoloCase) {
  return recommendationRequestSchema.parse({
    evaluatedAt: R5_HISTORICAL_EVALUATED_AT,
    order: {
      id: historicalCase.id,
      product: historicalCase.product,
      poloType: historicalCase.poloType,
      material: historicalCase.material,
      quantity: historicalCase.quantity,
      fabricBuyer: historicalCase.fabricBuyer,
      fabricSupply: historicalCase.fabricSupply,
      requiresNewPattern: historicalCase.requiresNewPattern,
      embroideryApplicationsPerGarment: historicalCase.embroideryApplicationsPerGarment,
      requiredProcesses: historicalCase.requiredProcesses,
      requiredBy: historicalCase.requiredBy,
    },
    workshops: week03DeclaredWorkshops,
  });
}

export function recommendationAlternativesForHistoricalCase(historicalCase: R5HistoricalPoloCase) {
  return recommendationRequestsForMaterialAlternatives(
    recommendationForHistoricalCase(historicalCase),
  );
}
