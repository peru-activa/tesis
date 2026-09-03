import {
  recommendationRequestSchema,
  type FabricBuyer,
  type Process,
  type Workshop,
} from '../domain/contracts.js';
import { orderDraftSchema, type OrderDraft } from '../domain/orders.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';
import { canonicalSublimationMaterial } from '../data/sublimation-materials.js';
import type { QuotationRequestDraft } from '../domain/quotation-requests.js';

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

  const customizations = garmentCustomizations(garment);
  const requiredProcesses: Process[] = ['design'];
  if (garment.patternMode === 'new') requiredProcesses.push('patternmaking');
  requiredProcesses.push('cutting', 'sewing', ...customizations);
  requiredProcesses.push('finishing');

  const draft = orderDraftSchema.parse({
    product: garment.product,
    poloType:
      garment.poloType ??
      inferPoloType(garment, fabricCategory(quotation.quotation.selectedFabric)),
    quantity: garment.quantity,
    material: fabricCategory(quotation.quotation.selectedFabric),
    color: garment.color,
    sizes: Object.fromEntries(garment.sizes.map((item) => [item.size, item.quantity])),
    customization: garment.customization,
    additionalCustomizations: garment.additionalCustomizations,
    requiresNewPattern: garment.patternMode === 'new',
    embroideryApplicationsPerGarment: customizations.includes('embroidery')
      ? garment.applicationCount
      : 1,
    designReference:
      garment.designReference || garment.designAttachment?.name || 'Sin referencia de diseño',
    requiredBy: quotation.request.delivery.requiredBy,
    deliveryDistrict: quotation.request.delivery.location,
    notes: [`Modelo: ${garment.model}`, garment.customizationDetails, quotation.request.notes]
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
}) {
  const adapted = adaptAcceptedQuotation(input.quotation, input.garmentIndex);
  return {
    ...adapted,
    request: recommendationRequestSchema.parse({
      evaluatedAt: input.evaluatedAt,
      order: {
        id: input.orderId,
        product: adapted.draft.product,
        poloType: adapted.draft.poloType,
        material: adapted.draft.material,
        quantity: adapted.draft.quantity,
        fabricBuyer: adapted.fabricBuyer,
        requiresNewPattern: adapted.draft.requiresNewPattern ?? false,
        embroideryApplicationsPerGarment: adapted.draft.embroideryApplicationsPerGarment ?? 1,
        requiredProcesses: adapted.requiredProcesses,
        requiredBy: `${adapted.draft.requiredBy}T18:00:00-05:00`,
      },
      workshops: input.workshops,
    }),
  };
}

type Garment = QuotationRequestDraft['garment'];

export function garmentCustomizations(garment: Garment): Process[] {
  return Array.from(
    new Set<Process>([
      ...(garment.customization === 'none' ? [] : [garment.customization]),
      ...(garment.additionalCustomizations ?? []),
    ]),
  );
}

function inferPoloType(garment: Garment, selectedMaterial: string) {
  if (garment.product !== 'polo') return undefined;
  const fabric =
    garment.fabric.mode === 'specified' ? fabricCategory(garment.fabric.name) : selectedMaterial;
  if (fabric === 'licra') return 'stretch' as const;
  if (['dry fit', 'win', 'zanetti'].includes(fabric)) return 'sports' as const;
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
