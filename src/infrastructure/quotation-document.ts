import { readFile } from 'node:fs/promises';
import { quotationLineAmount, quotationPricing } from '../domain/quotation-pricing.js';
import {
  garmentSizeOrderLabel,
  isDeliveryDateConfirmed,
  type QuotationRequest,
} from '../domain/quotation-requests.js';
import {
  renderEditorialQuotePdf,
  type QuotePdfInput,
  type QuotePdfItem,
} from './quote-document/pas-editorial.js';

const logoUrl = new URL('../../assets/pas-quotation/peru-activa-logo-alterno.png', import.meta.url);
const issuer = {
  templateId: 'peru_activa_editorial',
  brand: 'Peru Activa',
  legal: 'CORPORACION PERU ACTIVA S.A.C.  |  RUC 20551684076',
  address: 'Jr. Gamarra N. 764 Int. A302, La Victoria, Lima  |  peruactiva.com',
  documentTitle: 'Cotización',
  footer: 'Peru Activa | Uniformes corporativos, escolares y deportivos | Gamarra, Lima',
  primaryColor: '#18385f',
  usesPackagedLogo: true,
};
const customizationNames: Record<string, string> = {
  embroidery: 'Bordado',
  printing: 'Estampado',
  sublimation: 'Sublimación',
  vinyl: 'Vinil',
};
const plain = (value: string) => value.replaceAll('**', '').replaceAll('__', '');
const date = (value: string) => value.split('-').reverse().join('/');

export async function quotationDocumentInput(request: QuotationRequest): Promise<QuotePdfInput> {
  const quote = request.quotation;
  if (!quote) throw new Error('quotation_required');
  const amounts = quotationPricing(quote.priceAmountPEN ?? quote.totalPricePEN, quote.taxMode, quote.taxRate);
  const deliveryLabel = isDeliveryDateConfirmed(quote, request.request.delivery.requiredBy)
    ? 'Entrega confirmada'
    : 'Entrega solicitada';
  const garments = [request.request.garment, ...request.request.additionalGarments];
  const descriptions = garments.map((garment, index) => {
    const fabric =
      quote.lineItems?.find((item) => item.garmentIndex === index)?.selectedFabric ||
      quote.selectedFabric;
    const methods = [
      ...new Set([garment.customization, ...(garment.additionalCustomizations ?? [])]),
    ]
      .filter((method) => method !== 'none')
      .map((method) => customizationNames[method] || method);
    return [
      `**Prenda:** ${plain(garment.model)}. ${garment.quantity} unidades.`,
      `**Tela:** ${plain(fabric)}. **Color:** ${plain(garment.color)}.`,
      `**Tallas:** ${garment.sizes
        .filter((size) => size.quantity > 0)
        .map((size) => `${garmentSizeOrderLabel(size)}: ${size.quantity}`)
        .join(', ')}.`,
      ...(methods.length
        ? [`**Personalización:** ${methods.join(', ')}. ${plain(garment.customizationDetails)}`]
        : []),
    ].join('\n');
  });
  let priceItems: QuotePdfItem[];
  if (
    quote.lineItems &&
    garments.every((_garment, index) =>
      quote.lineItems!.some((item) => item.garmentIndex === index),
    )
  ) {
    priceItems = garments.map((garment, index) => ({
      item: plain(garment.model),
      description: descriptions[index]!,
      quantity: garment.quantity,
      unitPrice: quote.lineItems!.find((item) => item.garmentIndex === index)!.unitPricePEN,
    }));
    const sum = quotationLineAmount(garments.map((g) => g.quantity), quote.lineItems!);
    if (quotationPricing(sum, quote.taxMode, quote.taxRate).totalPricePEN !== quote.totalPricePEN)
      throw new Error('quotation_amount_mismatch');
  } else {
    // A global quotation is rendered as one bundle using its registered total.
    priceItems = [
      {
        item: 'Pedido completo',
        description: descriptions.join('\n\n'),
        quantity: 1,
        unitPrice: amounts.enteredPricePEN,
      },
    ];
  }
  return {
    issuer,
    logoDataUrl: `data:image/png;base64,${(await readFile(logoUrl)).toString('base64')}`,
    opportunity: {
      organization: plain(
        request.request.customer.businessName || request.request.customer.contactName,
      ),
      primary_contact_name: plain(request.request.customer.contactName),
      primary_contact_email: request.owner?.email || '',
      issue_date: quote.quotedAt,
    },
    subject: `Cotización ${request.id}`,
    priceItems,
    scope: `Propuesta para la solicitud ${request.id}. Fecha solicitada: ${date(request.request.delivery.requiredBy)}. Lugar de entrega: ${plain(request.request.delivery.location)}.${quote.taxMode ? ` Precios ${quote.taxMode === 'included' ? 'con' : 'sin'} IGV.` : ''}`,
    notes: plain(quote.conditions),
    validity: date(quote.validUntil),
    productionTime: quote.deliveryTerms
      ? `${quote.deliveryTerms.calendarDays} días calendario desde la aceptación`
      : date(request.request.delivery.requiredBy),
    productionLabel: quote.deliveryTerms ? 'PLAZO DE ENTREGA' : 'ENTREGA',
    productionTermLabel: quote.deliveryTerms ? 'Plazo de entrega' : deliveryLabel,
    total: quote.totalPricePEN,
    taxMode: quote.taxMode ?? 'unspecified',
    ...(quote.taxMode ? { subtotal: amounts.subtotalPEN, tax: amounts.taxPEN } : {}),
  };
}

export async function renderQuotationDocument(request: QuotationRequest): Promise<Buffer> {
  return renderEditorialQuotePdf(await quotationDocumentInput(request));
}
