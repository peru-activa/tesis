import { z } from 'zod';
import type { RecommendationResult } from './contracts.js';

const sizesSchema = z.object({
  S: z.number().int().nonnegative(),
  M: z.number().int().nonnegative(),
  L: z.number().int().nonnegative(),
  XL: z.number().int().nonnegative(),
});

export const orderDraftSchema = z.object({
  product: z.literal('polo'),
  quantity: z.number().int().min(20).max(500),
  material: z.enum(['algodón', 'dry-fit', 'poliéster']),
  color: z.string().trim().min(2).max(40),
  sizes: sizesSchema,
  customization: z.enum(['printing', 'embroidery', 'sublimation']),
  designReference: z.string().trim().min(3).max(160),
  requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  deliveryDistrict: z.string().trim().min(2).max(80),
  notes: z.string().trim().max(500),
}).superRefine((draft, context) => {
  const total = Object.values(draft.sizes).reduce((sum, units) => sum + units, 0);
  if (total !== draft.quantity) {
    context.addIssue({
      code: 'custom',
      path: ['sizes'],
      message: `La suma de tallas debe ser ${draft.quantity}.`,
    });
  }
});

export type OrderDraft = z.infer<typeof orderDraftSchema>;
export type OrderStatus = 'registered' | 'recommended' | 'assigned' | 'in_production' | 'completed';

export interface OrderAssignment {
  workshopId: string;
  displayName: string;
  confirmedAt: string;
}

export interface PortalOrder {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  draft: OrderDraft;
  recommendation: RecommendationResult;
  assignment?: OrderAssignment;
}
