import { recommendationRequestSchema, type Process, type Workshop } from '../domain/contracts.js';
import { orderDraftSchema, type OrderDraft } from '../domain/orders.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';

export interface AdaptedQuotationOrder {
  draft: OrderDraft;
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

  const requiredProcesses: Process[] = ['design', 'cutting', 'sewing'];
  if (garment.customization !== 'none') requiredProcesses.push(garment.customization);
  requiredProcesses.push('finishing');

  const draft = orderDraftSchema.parse({
    product: garment.product,
    quantity: garment.quantity,
    material: fabricCategory(quotation.quotation.selectedFabric),
    color: garment.color,
    sizes: Object.fromEntries(garment.sizes.map((item) => [item.size, item.quantity])),
    customization: garment.customization,
    designReference:
      garment.designReference || garment.designAttachment?.name || 'Sin referencia de diseño',
    requiredBy: quotation.request.delivery.requiredBy,
    deliveryDistrict: quotation.request.delivery.location,
    notes: [
      `Modelo: ${garment.model}`,
      garment.customizationDetails,
      quotation.request.notes,
    ].filter(Boolean).join(' · '),
  });
  return { draft, requiredProcesses };
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
        material: adapted.draft.material,
        quantity: adapted.draft.quantity,
        requiredProcesses: adapted.requiredProcesses,
        requiredBy: `${adapted.draft.requiredBy}T18:00:00-05:00`,
      },
      workshops: input.workshops,
    }),
  };
}

export function fabricCategory(value: string): string {
  const normalized = value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es-PE');
  if (normalized.includes('dry') || normalized.includes('deportivo')) return 'dry-fit';
  if (['poliester', 'zanetti', 'microtec', 'win'].some((term) => normalized.includes(term))) {
    return 'poliéster';
  }
  if (['algodon', 'pima', 'pique', 'lacoste', 'jersey'].some((term) => normalized.includes(term))) {
    return 'algodón';
  }
  return value.trim().toLocaleLowerCase('es-PE');
}
