import type { FieldPath } from 'react-hook-form';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { fabricsByProduct, type Product } from './quotationCatalog';

export type Garment = QuotationRequestDraft['garment'];
export type GarmentPath = 'garment' | `additionalGarments.${number}`;

export function createEmptyGarment(product: Product): Garment {
  const defaultFabric = product === 'polo' ? '' : (fabricsByProduct[product][0]?.name ?? '');

  return {
    product,
    model: '',
    audience: 'unisex',
    sleeve: 'no_aplica',
    cut: 'no_aplica',
    quantity: 20,
    sizes: [],
    color: '',
    fabric: { mode: 'specified', name: defaultFabric },
    customization: 'embroidery',
    applicationCount: 1,
    customizationDetails: '',
    designReference: '',
    designAttachment: undefined,
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
