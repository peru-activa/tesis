import { z } from 'zod';
import type { QuotationOwner } from './identity.js';
import { fabricBuyerSchema, poloTypeSchema } from './contracts.js';

export const productSchema = z.enum(['polo', 'buzo']);
export const audienceSchema = z.enum(['caballero', 'dama', 'unisex']);
export const sleeveSchema = z.enum(['manga_corta', 'manga_larga', 'no_aplica']);
export const cutSchema = z.enum(['estandar', 'princesa_dama', 'no_aplica']);
export const customizationSchema = z.enum([
  'none',
  'embroidery',
  'printing',
  'sublimation',
  'vinyl',
]);
const activeCustomizationSchema = z.enum(['embroidery', 'printing', 'sublimation', 'vinyl']);

const sizesSchema = z
  .array(
    z.object({
      size: z.string().trim().min(1, 'Indica la talla.').max(20),
      quantity: z
        .number('Indica una cantidad válida para la talla.')
        .int('La cantidad por talla debe ser un número entero.')
        .nonnegative('La cantidad por talla no puede ser negativa.')
        .max(5_000),
    }),
  )
  .min(1, 'Agrega al menos una talla.')
  .max(20)
  .superRefine((sizes, context) => {
    const seen = new Set<string>();
    sizes.forEach((item, index) => {
      const normalized = item.size.toLocaleUpperCase('es-PE');
      if (seen.has(normalized)) {
        context.addIssue({
          code: 'custom',
          path: [index, 'size'],
          message: `La talla ${item.size} está repetida.`,
        });
      }
      seen.add(normalized);
    });
  });

const acceptedDesignMediaTypes = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
] as const;

const designAttachmentSchema = z.object({
  name: z.string().trim().min(1).max(120),
  mediaType: z.enum(acceptedDesignMediaTypes),
  sizeBytes: z.number().int().positive().max(2_000_000),
  dataUrl: z
    .string()
    .max(2_700_000)
    .refine(
      (value) =>
        acceptedDesignMediaTypes.some((mediaType) => value.startsWith(`data:${mediaType};base64,`)),
      'El archivo adjunto no tiene un formato permitido.',
    ),
});

const fabricSchema = z.discriminatedUnion('mode', [
  z.object({
    mode: z.literal('specified'),
    name: z.string().trim().min(2, 'Elige una tela o solicita una recomendación.').max(80),
  }),
  z.object({ mode: z.literal('proposal') }),
]);

const garmentSchema = z
  .object({
    product: productSchema,
    poloType: poloTypeSchema.optional(),
    model: z.string().trim().min(2, 'Elige o describe el modelo de la prenda.').max(100),
    audience: audienceSchema,
    sleeve: sleeveSchema,
    cut: cutSchema,
    quantity: z
      .number('Indica una cantidad válida.')
      .int('La cantidad debe ser un número entero.')
      .min(1, 'La cantidad debe ser mayor que cero.')
      .max(5_000),
    sizes: sizesSchema,
    color: z.string().trim().min(2, 'Indica el color de la prenda.').max(80),
    fabric: fabricSchema,
    customization: customizationSchema,
    additionalCustomizations: z.array(activeCustomizationSchema).max(3).optional(),
    patternMode: z.enum(['standard', 'new']).optional(),
    applicationCount: z
      .number('Indica cuántos logos o diseños se aplicarán.')
      .int('La cantidad de logos o diseños debe ser un número entero.')
      .min(0)
      .max(20),
    customizationDetails: z.string().trim().max(300),
    designReference: z.string().trim().max(300),
    designAttachment: designAttachmentSchema.optional(),
  })
  .superRefine((garment, context) => {
    const sizeTotal = garment.sizes.reduce((sum, item) => sum + item.quantity, 0);
    if (sizeTotal !== garment.quantity) {
      context.addIssue({
        code: 'custom',
        path: ['sizes'],
        message: `La suma de tallas debe ser ${garment.quantity}.`,
      });
    }
    if (garment.product === 'polo' && garment.sleeve === 'no_aplica') {
      context.addIssue({
        code: 'custom',
        path: ['sleeve'],
        message: 'Indica el tipo de manga del polo.',
      });
    }
    if (garment.product === 'buzo' && garment.sleeve !== 'no_aplica') {
      context.addIssue({
        code: 'custom',
        path: ['sleeve'],
        message: 'La manga no corresponde al buzo.',
      });
    }
    if (garment.product === 'polo' && garment.cut === 'no_aplica') {
      context.addIssue({
        code: 'custom',
        path: ['cut'],
        message: 'Indica el corte del polo.',
      });
    }
    if (garment.product === 'buzo' && garment.cut !== 'no_aplica') {
      context.addIssue({
        code: 'custom',
        path: ['cut'],
        message: 'El corte de polo no corresponde al buzo.',
      });
    }
    if (garment.cut === 'princesa_dama' && garment.audience !== 'dama') {
      context.addIssue({
        code: 'custom',
        path: ['audience'],
        message: 'El corte princesa corresponde a dama.',
      });
    }
    const selectedCustomizations = [
      ...(garment.customization === 'none' ? [] : [garment.customization]),
      ...(garment.additionalCustomizations ?? []),
    ];
    const hasCustomization = selectedCustomizations.length > 0;
    if (new Set(selectedCustomizations).size !== selectedCustomizations.length) {
      context.addIssue({
        code: 'custom',
        path: ['additionalCustomizations'],
        message: 'Una personalización no puede seleccionarse dos veces.',
      });
    }
    if (hasCustomization && garment.applicationCount < 1) {
      context.addIssue({
        code: 'custom',
        path: ['applicationCount'],
        message: 'Indica cuántas aplicaciones se requieren.',
      });
    }
    if (!hasCustomization && garment.applicationCount !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['applicationCount'],
        message: 'Una prenda sin personalización debe tener cero aplicaciones.',
      });
    }
    if (hasCustomization && garment.customizationDetails.length < 3) {
      context.addIssue({
        code: 'custom',
        path: ['customizationDetails'],
        message: 'Indica dónde se aplicará el logo o diseño.',
      });
    }
    if (hasCustomization && garment.designReference.length < 3 && !garment.designAttachment) {
      context.addIssue({
        code: 'custom',
        path: ['designReference'],
        message: 'Describe el diseño o adjunta una imagen o PDF de referencia.',
      });
    }
  });

export const quotationRequestDraftSchema = z.object({
  customer: z.object({
    contactName: z.string().trim().min(2, 'Indica el nombre de contacto.').max(100),
    businessName: z.string().trim().min(2, 'Indica la empresa o razón social.').max(140),
    contact: z.string().trim().min(5, 'Indica un correo o teléfono de contacto.').max(140),
  }),
  garment: garmentSchema,
  additionalGarments: z.array(garmentSchema).max(4),
  delivery: z.object({
    requiredBy: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica una fecha válida.')
      .refine(isActualIsoDate, 'Indica una fecha válida.')
      .refine(isFutureDeliveryDate, 'La entrega debe ser a partir de mañana.'),
    location: z.string().trim().min(4, 'Indica el lugar de entrega.').max(180),
  }),
  notes: z.string().trim().max(500),
});

export const sellerQuotationDraftSchema = z.object({
  totalPricePEN: z.number().positive().max(10_000_000),
  lineItems: z
    .array(
      z.object({
        garmentIndex: z.number().int().nonnegative().max(4),
        unitPricePEN: z.number().positive().max(1_000_000),
      }),
    )
    .min(1)
    .max(5)
    .optional(),
  selectedFabric: z.string().trim().min(2).max(80),
  fabricBuyer: fabricBuyerSchema,
  validUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  conditions: z.string().trim().min(3).max(500),
});

export const buyerDecisionSchema = z.object({
  decision: z.enum(['accepted', 'rejected']),
});

export type QuotationRequestDraft = z.infer<typeof quotationRequestDraftSchema>;
export type SellerQuotationDraft = z.infer<typeof sellerQuotationDraftSchema>;
export type BuyerDecisionDraft = z.infer<typeof buyerDecisionSchema>;
export type QuotationStatus = 'pending_quote' | 'quoted' | 'accepted' | 'rejected';

export interface SellerQuotation extends SellerQuotationDraft {
  quotedAt: string;
}

export interface BuyerDecision {
  decision: 'accepted' | 'rejected';
  respondedAt: string;
}

export interface QuotationRequest {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: QuotationStatus;
  owner?: QuotationOwner;
  request: QuotationRequestDraft;
  quotation?: SellerQuotation;
  buyerDecision?: BuyerDecision;
  production?: {
    status: 'recommended' | 'no_eligible_workshop' | 'requires_scope_decision';
    orderIds: string[];
    message: string;
  };
}

function isActualIsoDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function isFutureDeliveryDate(value: string): boolean {
  return value >= limaDateAfter(1);
}

function limaDateAfter(days: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(
    Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day)),
  );
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
