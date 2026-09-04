import { z } from 'zod';

export const processSchema = z.enum([
  'fabric_sourcing',
  'design',
  'transfer_printing',
  'patternmaking',
  'cutting',
  'sewing',
  'sublimation',
  'printing',
  'vinyl',
  'embroidery',
  'notions',
  'ironing',
  'finishing',
  'quality_control',
  'delivery',
]);

export const evidenceLevelSchema = z.enum(['declared', 'verified', 'historical']);
export const workingDaySchema = z.enum([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);
export const fabricBuyerSchema = z.enum(['peru_activa', 'workshop']);
export const fabricSupplySchema = z
  .object({
    category: z.enum(['base', 'imported']),
    minimumLeadTimeDays: z.number().int().nonnegative(),
    maximumLeadTimeDays: z.number().int().nonnegative(),
    remainingLeadTimeDays: z.number().int().nonnegative(),
  })
  .refine((supply) => supply.minimumLeadTimeDays <= supply.maximumLeadTimeDays, {
    message: 'El plazo mínimo de abastecimiento no puede superar el máximo.',
  })
  .refine(
    (supply) =>
      supply.category === 'base'
        ? supply.minimumLeadTimeDays === 0 &&
          supply.maximumLeadTimeDays === 0 &&
          supply.remainingLeadTimeDays === 0
        : supply.minimumLeadTimeDays >= 7 &&
          supply.maximumLeadTimeDays <= 14 &&
          supply.remainingLeadTimeDays <= supply.maximumLeadTimeDays,
    {
      message:
        'Una tela base no agrega espera y una tela fuera del catálogo de polos debe registrar entre siete y catorce días.',
    },
  );
export const poloTypeSchema = z.enum([
  'cotton_basic',
  'cotton_advertising',
  'collared',
  'sports',
  'stretch',
]);
export const materialFamilySchema = z.enum(['cotton_knit', 'sports_knit', 'stretch_knit', 'woven']);
export const providerTypeSchema = z.enum(['garment_producer', 'process_provider']);
export const technicalCapabilitySchema = z.enum([
  'cotton_garments',
  'sports_garments',
  'stretch_garments',
  'manual_patternmaking',
  'digital_patternmaking',
  'manual_cutting',
  'digital_cutting',
  'garment_sewing',
  'sublimation_printing',
  'flat_press_sublimation',
  'calender_sublimation',
  'machine_embroidery',
  'vinyl_application',
  'finishing',
]);
export const materialStateSchema = z.enum([
  'fabric_roll',
  'cut_panels',
  'digital_layout',
  'printed_transfer',
  'sublimated_fabric',
  'sublimated_cut_panels',
  'assembled_garment',
  'finished_garment',
]);

export const orderSchema = z.object({
  id: z.string().min(1),
  product: z.string().min(1),
  material: z.string().min(1),
  poloType: poloTypeSchema.optional(),
  quantity: z.number().int().positive(),
  fabricBuyer: fabricBuyerSchema,
  fabricSupply: fabricSupplySchema.default({
    category: 'base',
    minimumLeadTimeDays: 0,
    maximumLeadTimeDays: 0,
    remainingLeadTimeDays: 0,
  }),
  requiresNewPattern: z.boolean().default(false),
  embroideryApplicationsPerGarment: z.number().int().positive().max(20).default(1),
  requiredProcesses: z.array(processSchema).min(1),
  requiredBy: z.iso.datetime({ offset: true }),
});

export const workshopSchema = z.object({
  id: z.string().min(1),
  displayName: z.string().min(1),
  contactPhone: z
    .string()
    .regex(/^9\d{8}$/)
    .optional(),
  products: z.array(z.string().min(1)).min(1),
  poloTypes: z.array(poloTypeSchema).min(1).optional(),
  materials: z.array(z.string().min(1)).min(1),
  materialFamilies: z.array(materialFamilySchema).min(1),
  materialMatchingMode: z.enum(['family', 'declared_only']).default('family'),
  processes: z.array(processSchema).min(1),
  providerType: providerTypeSchema.default('garment_producer'),
  technicalCapabilities: z.array(technicalCapabilitySchema).default([]),
  capacityStatus: z.enum(['known', 'unknown']).default('known'),
  capacityPlanningMode: z.enum(['fixed', 'throughput']).optional(),
  capacityUnit: z.enum(['garments', 'sets', 'panels', 'logos', 'patterns']).default('garments'),
  productionRate: z
    .object({ quantity: z.number().positive(), days: z.number().positive() })
    .optional(),
  embroideryProfile: z
    .object({
      headCount: z.number().int().positive(),
      availableHeadCount: z.number().int().nonnegative(),
      includesCleanup: z.boolean(),
      includesBackingRemoval: z.boolean(),
    })
    .refine((profile) => profile.availableHeadCount <= profile.headCount, {
      message: 'Los cabezales disponibles no pueden superar el total.',
    })
    .optional(),
  vinylProfile: z
    .object({
      productionRate: z.object({
        quantity: z.number().positive(),
        days: z.number().positive(),
      }),
      includesPrinting: z.boolean(),
      includesWeeding: z.boolean(),
    })
    .optional(),
  sublimationProfile: z
    .object({
      method: z.enum(['flat_press', 'calender']),
      inputState: materialStateSchema,
      outputState: materialStateSchema,
      includesCutting: z.boolean(),
    })
    .optional(),
  minimumUnits: z.number().int().nonnegative(),
  maximumUnits: z.number().int().positive(),
  availableCapacity: z.number().int().nonnegative(),
  workingDays: z.array(workingDaySchema).min(1).optional(),
  availableFrom: z.iso.datetime({ offset: true }).optional(),
  estimatedLeadTimeDays: z.number().nonnegative(),
  minimumLeadTimeDaysByProcess: z
    .partialRecord(processSchema, z.number().nonnegative())
    .optional(),
  estimatedTotalCost: z.number().nonnegative(),
  onTimeRate: z.number().min(0).max(1),
  defectRate: z.number().min(0).max(1),
  evidenceLevel: evidenceLevelSchema,
});

export const weightsSchema = z
  .object({
    delivery: z.number().nonnegative(),
    cost: z.number().nonnegative(),
    reliability: z.number().nonnegative(),
    quality: z.number().nonnegative(),
    evidence: z.number().nonnegative(),
  })
  .refine((weights) => Object.values(weights).some((weight) => weight > 0), {
    message: 'At least one weight must be greater than zero',
  });

export const recommendationRequestSchema = z.object({
  evaluatedAt: z.iso.datetime({ offset: true }),
  algorithmVersion: z.literal('0.6.0').default('0.6.0'),
  order: orderSchema,
  workshops: z.array(workshopSchema).min(1),
  weights: weightsSchema.default({
    delivery: 0.3,
    cost: 0,
    reliability: 0.3,
    quality: 0.3,
    evidence: 0.1,
  }),
});

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;
export type Process = z.infer<typeof processSchema>;
export type FabricBuyer = z.infer<typeof fabricBuyerSchema>;
export type FabricSupply = z.infer<typeof fabricSupplySchema>;
export type PoloType = z.infer<typeof poloTypeSchema>;
export type MaterialFamily = z.infer<typeof materialFamilySchema>;
export type MaterialState = z.infer<typeof materialStateSchema>;
export type TechnicalCapability = z.infer<typeof technicalCapabilitySchema>;
export type Workshop = z.infer<typeof workshopSchema>;
export type Weights = z.infer<typeof weightsSchema>;

export type DimensionScores = Record<keyof Weights, number>;

export interface RankedCandidate {
  candidateId: string;
  workshopId: string;
  displayName: string;
  allocations: WorkshopAllocation[];
  rank: number;
  score: number;
  dimensions: DimensionScores;
  reasons: string[];
  workflowSteps?: WorkflowStep[];
}

export interface WorkflowStep {
  sequence: number;
  process: Process;
  workshopId: string;
  displayName: string;
  inputState?: MaterialState;
  outputState?: MaterialState;
}

export interface WorkshopAllocation {
  workshopId: string;
  displayName: string;
  quantity: number;
  availableCapacity: number;
  effectiveLeadTimeDays: number;
  estimatedCost: number;
  assignedProcesses?: Process[];
}

export interface RejectedCandidate {
  workshopId: string;
  displayName: string;
  reasons: string[];
}

export interface RecommendationResult {
  algorithmVersion: '0.6.0';
  orderId: string;
  evaluatedAt: string;
  candidates: RankedCandidate[];
  rejected: RejectedCandidate[];
  requiresHumanConfirmation: true;
}
