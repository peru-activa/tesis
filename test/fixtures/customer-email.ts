import {
  quotationRequestDraftSchema,
  sellerQuotationDraftSchema,
} from '../../src/domain/quotation-requests.js';

export function emailDraft() {
  return quotationRequestDraftSchema.parse({
    customer: {
      contactName: 'Cliente de prueba',
      businessName: 'Empresa simulada',
      contact: 'otro@example.test',
    },
    garment: {
      product: 'polo',
      model: 'Polo institucional',
      audience: 'unisex',
      sleeve: 'manga_corta',
      cut: 'estandar',
      quantity: 20,
      sizes: [
        { size: 'M', quantity: 10 },
        { size: 'L', quantity: 10 },
      ],
      color: 'Azul marino',
      fabric: { mode: 'proposal' },
      customization: 'none',
      applicationCount: 0,
      customizationDetails: '',
      designReference: '',
    },
    additionalGarments: [],
    delivery: {
      requiredBy: new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10),
      location: 'Lima, datos simulados',
    },
    notes: 'Solicitud sintética, sin cliente real',
  });
}
export function emailQuote() {
  return sellerQuotationDraftSchema.parse({
    totalPricePEN: 700,
    lineItems: [{ garmentIndex: 0, unitPricePEN: 35 }],
    selectedFabric: 'Algodón',
    fabricBuyer: 'peru_activa',
    validUntil: new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10),
    conditions: 'Cotización de prueba. Condiciones de pago y tributos por confirmar.',
    deliveryConfirmation: { requiredBy: emailDraft().delivery.requiredBy, confirmed: true },
  });
}
export const emailOwner = { subject: 'verified-customer', email: 'cliente@example.test' };
