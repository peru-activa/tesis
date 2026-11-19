import type { PreviewScope } from './preview-scope.js';
import type { AssignmentAutomation } from './assignment-plans.js';
import { z } from 'zod';
import type { WorkshopScope } from './workshop-scope.js';
import type {
  FabricBuyer,
  Process,
  RecommendationResult,
  RecommendationRequest,
} from './contracts.js';
import type { WorkshopNotification } from './workshop-notifications.js';

const sizesSchema = z
  .record(z.string().trim().min(1).max(20), z.number().int().nonnegative().max(5_000))
  .refine((sizes) => Object.keys(sizes).length > 0, 'Agrega al menos una talla.');

export const orderDraftSchema = z
  .object({
    product: z.enum(['polo', 'buzo']),
    poloType: z
      .enum(['cotton_basic', 'cotton_advertising', 'collared', 'sports', 'stretch'])
      .optional(),
    quantity: z.number().int().min(1).max(5_000),
    material: z.string().trim().min(2).max(80),
    color: z.string().trim().min(2).max(40),
    sizes: sizesSchema,
    customization: z.enum(['none', 'printing', 'embroidery', 'sublimation', 'vinyl']),
    additionalCustomizations: z
      .array(z.enum(['printing', 'embroidery', 'sublimation', 'vinyl']))
      .max(3)
      .optional(),
    requiresNewPattern: z.boolean().optional(),
    embroideryApplicationsPerGarment: z.number().int().positive().optional(),
    designReference: z.string().trim().min(3).max(160),
    requiredBy: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    deliveryDistrict: z.string().trim().min(2).max(80),
    notes: z.string().trim().max(500),
  })
  .superRefine((draft, context) => {
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
  candidateId: string;
  workshopId: string;
  displayName: string;
  confirmedAt: string;
  allocations: Array<{
    workshopId: string;
    displayName: string;
    quantity: number;
    assignedProcesses: Process[];
    status: 'assigned' | 'in_production' | 'completed';
  }>;
}

export interface PortalOrder extends WorkshopScope, PreviewScope {
  routeTiming?: RecommendationRequest['routeTiming'];
  handoffDays?: number;
  id: string;
  /** Explicit technical fixture, excluded from operational workshop selection. */
  testOnly?: boolean;
  createdAt: string;
  updatedAt: string;
  status: OrderStatus;
  draft: OrderDraft;
  requiredProcesses: Process[];
  fabricBuyer?: FabricBuyer;
  recommendation: RecommendationResult;
  /** Original constraints retained to revalidate capacity at confirmation. */
  recommendationOrder?: RecommendationRequest['order'];
  /** Fixed planning clock for reproducible replay; live orders use confirmation time. */
  planningAt?: string;
  assignment?: OrderAssignment;
  automation?: AssignmentAutomation;
  notification?: WorkshopNotification;
  notifications?: WorkshopNotification[];
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

export class OrderAssignmentConflictError extends Error {
  constructor() {
    super('order_already_assigned');
  }
}

export function applyWorkshopStatus(
  current: PortalOrder,
  workshopId: string,
  status: 'in_production' | 'completed',
  occurredAt: string,
): PortalOrder | undefined {
  if (!current.assignment) return undefined;
  const previous = current.assignment.allocations || [
    {
      workshopId: current.assignment.workshopId,
      displayName: current.assignment.displayName,
      quantity: current.draft.quantity,
      status:
        current.status === 'completed'
          ? ('completed' as const)
          : current.status === 'in_production'
            ? ('in_production' as const)
            : ('assigned' as const),
    },
  ];
  const allocations = previous.map((allocation) =>
    allocation.workshopId === workshopId ? { ...allocation, status } : allocation,
  );
  const nextStatus: OrderStatus = allocations.every(
    (allocation) => allocation.status === 'completed',
  )
    ? 'completed'
    : allocations.some((allocation) => allocation.status !== 'assigned')
      ? 'in_production'
      : 'assigned';
  return {
    ...current,
    status: nextStatus,
    updatedAt: occurredAt,
    assignment: { ...current.assignment, allocations },
  };
}
