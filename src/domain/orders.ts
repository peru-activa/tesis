import { z } from 'zod';
import type { Process, RecommendationResult } from './contracts.js';
import type { WorkshopNotification } from './workshop-notifications.js';

const sizesSchema = z.record(
  z.string().trim().min(1).max(20),
  z.number().int().nonnegative().max(5_000),
).refine((sizes) => Object.keys(sizes).length > 0, 'Agrega al menos una talla.');

export const orderDraftSchema = z.object({
  product: z.enum(['polo', 'buzo']),
  quantity: z.number().int().min(1).max(5_000),
  material: z.string().trim().min(2).max(80),
  color: z.string().trim().min(2).max(40),
  sizes: sizesSchema,
  customization: z.enum(['none', 'printing', 'embroidery', 'sublimation']),
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
export const workshopOrderStatusSchema = z.enum(['in_production', 'completed']);

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
  requiredProcesses: Process[];
  recommendation: RecommendationResult;
  assignment?: OrderAssignment;
  notification?: WorkshopNotification;
  simulation?: {
    datasetVersion: string;
    scenarioId: string;
    seed: number;
  };
  source?: {
    type: 'quotation';
    quotationId: string;
    garmentIndex: number;
  };
}
