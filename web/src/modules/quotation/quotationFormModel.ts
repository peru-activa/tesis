import type { FieldPath } from 'react-hook-form';
import {
  quotationRequestDraftSchema,
  type QuotationRequestDraft,
} from '../../../../src/domain/quotation-requests';
import { poloCollars, poloCuts, poloSleeves, type Product } from './quotationCatalog';

export type Garment = QuotationRequestDraft['garment'];
export type GarmentPath = 'garment' | `additionalGarments.${number}`;

export function createEmptyGarment(product: Product): Garment {
  return {
    product,
    model: '',
    audience: 'unisex',
    sleeve: 'no_aplica',
    cut: 'no_aplica',
    quantity: 20,
    sizes: [],
    color: '',
    fabric: { mode: 'specified', name: '' },
    customization: 'none',
    additionalCustomizations: [],
    patternMode: 'standard',
    applicationCount: 0,
    customizationDetails: '',
    designReference: '',
    designAttachment: undefined,
    designApplications: [],
  };
}

export function createEmptyDraft(requiredBy: string): QuotationRequestDraft {
  return {
    customer: { contactName: '', businessName: '', contact: '' },
    garment: createEmptyGarment('polo'),
    additionalGarments: [],
    delivery: { requiredBy, location: '' },
    notes: '',
  };
}

export function garmentField(path: GarmentPath, field: string): FieldPath<QuotationRequestDraft> {
  return `${path}.${field}` as FieldPath<QuotationRequestDraft>;
}

export function hasCompleteGarmentOptions(garment: Garment): boolean {
  return (
    (garment.product === 'buzo' ||
      (poloCollars.some((option) => option.value === garment.model) &&
        poloCuts.some((option) => option.value === garment.cut) &&
        poloSleeves.some((option) => option.value === garment.sleeve))) &&
    (garment.fabric.mode === 'proposal' || garment.fabric.name.trim().length >= 2)
  );
}

export function hasValidGarmentQuantity(garment: Garment): boolean {
  return quotationRequestDraftSchema.shape.garment.shape.quantity.safeParse(garment.quantity)
    .success;
}
