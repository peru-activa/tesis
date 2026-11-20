import { materialFamilyFor } from '../domain/material-families.js';
import { addDateDays } from '../domain/delivery-estimate.js';
import {
  recommendationRequestSchema,
  orderSchema,
  type FabricBuyer,
  type Process,
  type Workshop,
} from '../domain/contracts.js';
import { orderDraftSchema, type OrderDraft } from '../domain/orders.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';
import { fabricSupplyForPoloMaterial } from '../data/polo-fabrics.js';
import { canonicalSublimationMaterial } from '../data/sublimation-materials.js';
import { garmentSizeOrderLabel, type QuotationRequestDraft } from '../domain/quotation-requests.js';

export interface AdaptedQuotationOrder {
  draft: OrderDraft;
  fabricBuyer: FabricBuyer;
  requiredProcesses: Process[];
}

export function adaptAcceptedQuotation(
  quotation: QuotationRequest,
  garmentIndex: number,
): AdaptedQuotationOrder {
  if (quotation.status !== 'accepted' || !quotation.quotation) {
    throw new Error('La cotización debe estar aceptada antes de crear la orden.');
  }
  const garments = [quotation.request.garment, ...quotation.request.additionalGarments];
  const garment = garments[garmentIndex];
  if (!garment) throw new Error('La prenda solicitada no existe.');
  const selectedFabric =
    quotation.quotation.lineItems?.find((item) => item.garmentIndex === garmentIndex)
      ?.selectedFabric ?? quotation.quotation.selectedFabric;

  const customizations = garmentCustomizations(garment);
  const requiredProcesses: Process[] = ['design'];
  if (garment.patternMode === 'new') requiredProcesses.push('patternmaking');
  requiredProcesses.push('cutting', 'sewing', ...customizations);
  requiredProcesses.push('finishing');

  const draft = orderDraftSchema.parse({
    product: garment.product,
    poloType: garment.poloType ?? inferPoloType(garment, fabricCategory(selectedFabric)),
    quantity: garment.quantity,
    material: fabricCategory(selectedFabric),
    color: garment.color,
    sizes: Object.fromEntries(
      garment.sizes.map((item) => [garmentSizeOrderLabel(item), item.quantity]),
    ),
    customization: garment.customization,
    additionalCustomizations: garment.additionalCustomizations,
    requiresNewPattern: garment.patternMode === 'new',
    embroideryApplicationsPerGarment: customizations.includes('embroidery')
      ? applicationCountFor(garment, 'embroidery')
      : 1,
    designReference:
      garment.designReference ||
      garment.designApplications
        ?.map((application) => application.attachment?.name)
        .filter(Boolean)
        .join(', ') ||
      garment.designAttachment?.name ||
      'Sin referencia de diseño',
    requiredBy: quotation.request.delivery.requiredBy,
    deliveryDistrict: quotation.request.delivery.location,
    notes: [
      `Modelo: ${garment.model}`,
      garment.designApplications
        ?.map((application, index) =>
          [
            application.placement,
            application.attachment?.preview?.inkColor
              ? `Color del Logo ${index + 1}: ${application.attachment.preview.inkColor.toUpperCase()}`
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
        )
        .join(' | ') ||
        [
          garment.customizationDetails,
          garment.designAttachment?.preview?.inkColor
            ? `Color del Logo 1: ${garment.designAttachment.preview.inkColor.toUpperCase()}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
      quotation.request.notes,
    ]
      .filter(Boolean)
      .join(' · '),
  });
  return { draft, fabricBuyer: quotation.quotation.fabricBuyer, requiredProcesses };
}

export function recommendationFromQuotation(input: {
  orderId: string;
  quotation: QuotationRequest;
  garmentIndex: number;
  evaluatedAt: string;
  workshops: Workshop[];
  deliveryDays?: number;
  handoffDays?: number;
}) {
  const adapted = adaptAcceptedQuotation(input.quotation, input.garmentIndex);
  return {
    ...adapted,
    request: recommendationRequestSchema.parse({
      evaluatedAt: input.evaluatedAt,
      routeTiming: 'sequential_phases',
      handoffDays: input.handoffDays ?? 0,
      order: productionOrderForGarment({
        id: input.orderId,
        garment: [input.quotation.request.garment, ...input.quotation.request.additionalGarments][input.garmentIndex]!,
        selectedFabric: adapted.draft.material,
        fabricBuyer: adapted.fabricBuyer,
        requiredBy: `${addDateDays(adapted.draft.requiredBy, -(input.deliveryDays ?? 0))}T18:00:00-05:00`,
      }),
      workshops: input.workshops,
    }),
  };
}

type Garment = QuotationRequestDraft['garment'];

function applicationCountFor(garment: Pick<Garment, 'applicationCount' | 'designApplications'>, method: Process): number {
  const otherApplications = (garment.designApplications ?? []).filter(
    (application) => application.method && application.method !== method,
  ).length;
  // Unclassified legacy applications retain the conservative count.
  return Math.max(1, garment.applicationCount - otherApplications);
}

export function garmentCustomizations(garment: Pick<Garment, 'customization' | 'additionalCustomizations'>): Process[] {
  return Array.from(
    new Set<Process>([
      ...(garment.customization === 'none' ? [] : [garment.customization]),
      ...(garment.additionalCustomizations ?? []),
    ]),
  );
}

function inferPoloType(garment: Pick<Garment, 'product' | 'fabric' | 'model'>, selectedMaterial: string) {
  if (garment.product !== 'polo') return undefined;
  const fabric =
    garment.fabric.mode === 'specified' ? fabricCategory(garment.fabric.name) : selectedMaterial;
  const family = materialFamilyFor(fabric);
  if (family === 'stretch_knit') return 'stretch' as const;
  if (family === 'sports_knit') return 'sports' as const;
  if (garment.model.toLocaleLowerCase('es-PE').includes('camis')) return 'collared' as const;
  return 'cotton_basic' as const;
}

export function fabricCategory(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-PE');
  if (normalized.includes('pima 20/1')) return 'pima 20/1';
  if (normalized.includes('pima 30/1')) return 'pima 30/1';
  if (normalized.includes('pique') || normalized.includes('lacoste')) return 'piqué lacoste';
  if (normalized.includes('dry')) return 'dry fit';
  if (normalized.includes('win')) return 'win';
  if (normalized.includes('zanetti')) return 'zanetti';
  const sublimationMaterial = canonicalSublimationMaterial(normalized);
  if (sublimationMaterial) return sublimationMaterial;
  return value.trim().toLocaleLowerCase('es-PE');
}

export type ProductionGarment = Pick<Garment, 'product' | 'poloType' | 'fabric' | 'model' |
  'quantity' | 'patternMode' | 'customization' | 'additionalCustomizations' |
  'applicationCount' | 'designApplications'>;

/** Shared conversion for preflight estimates and accepted production orders. */
export function productionOrderForGarment(input: {
  id: string; garment: ProductionGarment; selectedFabric: string;
  fabricBuyer: FabricBuyer; requiredBy: string; productionNotBefore?: string;
}) {
  const { garment } = input;
  const customizations = garmentCustomizations(garment);
  const material = fabricCategory(input.selectedFabric);
  return orderSchema.parse({
    id: input.id, product: garment.product, quantity: garment.quantity,
    poloType: garment.poloType ?? inferPoloType(garment, material),
    material, fabricBuyer: input.fabricBuyer, fabricSupply: fabricSupplyForPoloMaterial(material),
    requiresNewPattern: garment.patternMode === 'new',
    embroideryApplicationsPerGarment: customizations.includes('embroidery') ? applicationCountFor(garment, 'embroidery') : 1,
    requiredProcesses: ['design', ...(garment.patternMode === 'new' ? ['patternmaking'] : []),
      'cutting', 'sewing', ...customizations, 'finishing'],
    requiredBy: input.requiredBy,
    ...(input.productionNotBefore ? { productionNotBefore: input.productionNotBefore } : {}),
  });
}
