import { recommendationRequestSchema, type Workshop } from '../domain/contracts.js';
import type { OrderDraft } from '../domain/orders.js';

export function recommendationFromOrderDraft({
  id,
  draft,
  evaluatedAt,
  workshops,
}: {
  id: string;
  draft: OrderDraft;
  evaluatedAt: string;
  workshops: Workshop[];
}) {
  return recommendationRequestSchema.parse({
    evaluatedAt,
    order: {
      id,
      product: draft.product,
      poloType: draft.poloType,
      material: draft.material,
      quantity: draft.quantity,
      fabricBuyer: 'peru_activa',
      requiresNewPattern: draft.requiresNewPattern ?? false,
      embroideryApplicationsPerGarment: draft.embroideryApplicationsPerGarment ?? 1,
      requiredProcesses: [
        'design',
        ...(draft.requiresNewPattern ? (['patternmaking'] as const) : []),
        'cutting',
        'sewing',
        ...(draft.customization === 'none' ? [] : [draft.customization]),
        ...(draft.additionalCustomizations ?? []),
        'finishing',
      ],
      requiredBy: `${draft.requiredBy}T18:00:00-05:00`,
    },
    workshops,
  });
}
