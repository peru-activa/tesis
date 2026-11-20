import { z } from 'zod';
import { quotationRequestDraftSchema } from './quotation-requests.js';

const garment = quotationRequestDraftSchema.shape.garment.shape;
export const productionGarmentSchema = z.object({
  product: garment.product,
  poloType: garment.poloType,
  model: garment.model,
  quantity: garment.quantity,
  fabric: garment.fabric,
  patternMode: garment.patternMode,
  customization: garment.customization,
  additionalCustomizations: garment.additionalCustomizations,
  applicationCount: garment.applicationCount,
  designApplications: z
    .array(
      z.object({
        placement: z.string().default(''),
        method: z.enum(['embroidery', 'printing', 'sublimation', 'vinyl']).optional(),
      }),
    )
    .max(20)
    .optional(),
});
export const deliveryPlanningInputSchema = z.object({
  garment: productionGarmentSchema,
  additionalGarments: z.array(productionGarmentSchema).max(4),
});
export type DeliveryPlanningInput = z.infer<typeof deliveryPlanningInputSchema>;

export const deliveryPolicySchema = z.object({
  version: z.string().min(1).default('delivery-v1'),
  approvalDays: z.number().int().nonnegative().max(30).default(2),
  deliveryDays: z.number().int().nonnegative().max(30).default(1),
  handoffDays: z.number().int().nonnegative().max(30).default(1),
  horizonDays: z.number().int().positive().max(365).default(180),
  maximumPlanEvaluations: z.number().int().positive().max(100_000).default(10_000),
});
export type DeliveryPolicy = z.infer<typeof deliveryPolicySchema>;
export interface DeliveryEstimate {
  status: 'available' | 'unavailable';
  reason?: 'search_limit';
  evaluatedAt: string;
  approvalBy: string;
  earliestDate: string | null;
  horizonDate: string;
  policy: DeliveryPolicy;
  materialPending: boolean;
}

export function planningInputFromDraft(input: DeliveryPlanningInput): DeliveryPlanningInput {
  // Omit artwork, customer data and unrelated fields from network requests and cache keys.
  return deliveryPlanningInputSchema.parse(input);
}

export function limaDate(timestamp: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp));
}
export function addDateDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}

export function calendarDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

export function quotationExpired(validUntil: string, timestamp = new Date().toISOString()): boolean {
  return validUntil < limaDate(timestamp);
}
