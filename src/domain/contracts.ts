import { z } from 'zod';

export const processSchema = z.enum([
  'design',
  'cutting',
  'sewing',
  'sublimation',
  'printing',
  'embroidery',
  'finishing',
]);

export const evidenceLevelSchema = z.enum(['declared', 'verified', 'historical']);

export const orderSchema = z.object({
  id: z.string().min(1),
  product: z.string().min(1),
  material: z.string().min(1),
  quantity: z.number().int().positive(),
  requiredProcesses: z.array(processSchema).min(1),
  requiredBy: z.iso.datetime({ offset: true }),
});

export const workshopSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  products: z.array(z.string().min(1)).min(1),
  materials: z.array(z.string().min(1)).min(1),
  processes: z.array(processSchema).min(1),
  minimumUnits: z.number().int().nonnegative(),
  maximumUnits: z.number().int().positive(),
  availableCapacity: z.number().int().nonnegative(),
  estimatedLeadTimeDays: z.number().nonnegative(),
  estimatedTotalCost: z.number().nonnegative(),
  onTimeRate: z.number().min(0).max(1),
  defectRate: z.number().min(0).max(1),
  evidenceLevel: evidenceLevelSchema,
});

export const weightsSchema = z.object({
  delivery: z.number().nonnegative(),
  cost: z.number().nonnegative(),
  reliability: z.number().nonnegative(),
  quality: z.number().nonnegative(),
  evidence: z.number().nonnegative(),
}).refine((weights) => Object.values(weights).some((weight) => weight > 0), {
  message: 'At least one weight must be greater than zero',
});

export const recommendationRequestSchema = z.object({
  evaluatedAt: z.iso.datetime({ offset: true }),
  algorithmVersion: z.literal('0.1.0').default('0.1.0'),
  order: orderSchema,
  workshops: z.array(workshopSchema).min(1),
  weights: weightsSchema.default({
    delivery: 0.25,
    cost: 0.15,
    reliability: 0.25,
    quality: 0.25,
    evidence: 0.1,
  }),
});

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type Workshop = z.infer<typeof workshopSchema>;
export type Weights = z.infer<typeof weightsSchema>;

export type DimensionScores = Record<keyof Weights, number>;

export interface RankedCandidate {
  workshopId: string;
  displayName: string;
  rank: number;
  score: number;
  dimensions: DimensionScores;
  reasons: string[];
}

export interface RejectedCandidate {
  workshopId: string;
  displayName: string;
  reasons: string[];
}

export interface RecommendationResult {
  algorithmVersion: '0.1.0';
  orderId: string;
  evaluatedAt: string;
  candidates: RankedCandidate[];
  rejected: RejectedCandidate[];
  requiresHumanConfirmation: true;
}

