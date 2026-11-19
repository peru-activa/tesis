/** Editorial PDF layout adapted from Peru Activa's PAS quote renderer.
 * Layout, colors and typography are preserved. Issuer/logo are injected; unspecified
 * tax treatment preserves the registered final total without assuming IGV inclusion.
 */
import { readFile } from 'node:fs/promises';
import { generate } from '@pdfme/generator';
import { getDynamicTemplate, type Template } from '@pdfme/common';
import { barcodes, image, line, rectangle, text } from '@pdfme/schemas';
import { getDynamicLayoutForSchema } from '@pdfme/schemas/dynamicLayout';

const colors = {
  paper: '#fbfaf6',
  soft: '#f1efe7',
  ink: '#1f2328',
  muted: '#6b7280',
  rule: '#d8d2c5',
  navy: '#18385f',
};

const MAX_QUOTE_VISUAL_REFERENCES = 20;
const VISUAL_REFERENCES_PER_PAGE = 4;

type PdfSchema = Record<string, unknown>;

export interface EditorialIssuer {
  templateId: string;
  brand: string;
  legal: string;
  address: string;
  documentTitle: string;
  footer: string;
  primaryColor: string;
  usesPackagedLogo: boolean;
  wordmark?: string;
  contact?: string;
}
export interface QuotePdfInput {
  opportunity: Record<string, unknown>;
  priceItems: QuotePdfItem[];
  total: number;
  subtotal?: number;
  tax?: number;
  notes?: string;
  taxMode?: 'not_included' | 'included' | 'unspecified';
  subject?: string;
  scope?: string;
  productionTime?: string;
  paymentTerms?: string;
  validity?: string;
  pendingItems?: string[];
  productionLabel?: string;
  productionTermLabel?: string;
  visualReferencePaths?: string[];
  issuer: EditorialIssuer;
  logoDataUrl: string;
}

export interface QuotePdfItem {
  item?: string;
  description: string;
  quantity: number;
  unitPrice?: number | null;
  material?: string;
  technicalDescription?: string;
  specificationSource?: 'customer' | 'database' | 'estimated';
  specificationReference?: string;
  notes?: string;
}

function schema(
  name: string,
  type: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: PdfSchema = {},
): PdfSchema {
  return {
    name,
    type,
    position: { x, y },
    width,
    height,
    readOnly: true,
    ...extra,
  };
}

function textSchema(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: PdfSchema = {},
): PdfSchema {
  return schema(name, 'text', x, y, width, height, {
    fontSize: 10,
    fontColor: colors.ink,
    lineHeight: 1.15,
    verticalAlignment: 'top',
    alignment: 'left',
    characterSpacing: 0,
    ...extra,
  });
}

function rectSchema(
  name: string,
  x: number,
  y: number,
  width: number,
  height: number,
  extra: PdfSchema = {},
): PdfSchema {
  return schema(name, 'rectangle', x, y, width, height, {
    color: colors.paper,
    borderColor: colors.rule,
    borderWidth: 0.2,
    ...extra,
  });
}

function lineSchema(
  name: string,
  x: number,
  y: number,
  width: number,
  extra: PdfSchema = {},
): PdfSchema {
  return schema(name, 'line', x, y, width, 0.25, {
    color: colors.rule,
    ...extra,
  });
}

function money(value: number): string {
  return `S/\u00a0${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function priceValue(value?: number | null): string {
  return Number.isFinite(value) && value !== null && value !== undefined
    ? money(value)
    : 'POR VALIDAR';
}

function lineTotalValue(item: QuotePdfItem): string {
  return Number.isFinite(item.unitPrice) && item.unitPrice !== null && item.unitPrice !== undefined
    ? money(item.quantity * item.unitPrice)
    : 'POR VALIDAR';
}

function textValue(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  const normalized = String(value).trim();
  return normalized || fallback;
}

function formatDate(date = new Date()): string {
  return new Intl.DateTimeFormat('es-PE', {
    timeZone: 'America/Lima',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date);
}

function wrap(value: string, maxChars: number): string {
  const words = value.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines.join('\n');
}

function wrapMultiline(value: string, maxChars: number): string {
  return value
    .split('\n')
    .flatMap((line) => wrap(line, maxChars).split('\n'))
    .join('\n');
}

export async function visualReferenceImageDataUrl(path: string): Promise<string> {
  const bytes = await readFile(path);
  const isPng =
    bytes.length >= 8 &&
    bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const isJpeg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (!isPng && !isJpeg) {
    throw new Error('Visual reference must contain PNG or JPEG bytes');
  }
  const mime = isJpeg ? 'image/jpeg' : 'image/png';
  return `data:${mime};base64,${bytes.toString('base64')}`;
}

function defaultTerms(
  input: Pick<
    QuotePdfInput,
    'notes' | 'productionTime' | 'paymentTerms' | 'pendingItems' | 'taxMode' | 'productionTermLabel'
  >,
): string {
  const pendingSummary = input.pendingItems
    ?.map((item) =>
      item
        .trim()
        .replace(/[.]+$/g, '')
        .replace(/\s+pendientes?\s+de\s+confirmacion.*$/i, ''),
    )
    .filter(Boolean)
    .join(', ');
  const terms = [
    input.productionTime
      ? `- ${input.productionTermLabel || 'Tiempo de producción'}: ${input.productionTime}.`
      : '',
    input.paymentTerms ? `- Pago: ${input.paymentTerms}.` : '',
    input.taxMode === 'unspecified' ? '' : '- IGV 18% calculado segun ley.',
    ...(pendingSummary ? [`- Pendiente para producción: ${pendingSummary}.`] : []),
  ].filter(Boolean);

  if (input.notes?.trim()) {
    const trimmed = input.notes.trim();
    const hasIgv = /\bigv\b/i.test(trimmed);
    return [
      ...trimmed.split(/\n+/).filter(Boolean),
      ...(hasIgv ? terms.filter((term) => !/\bigv\b/i.test(term)) : terms),
    ].join('\n');
  }
  return terms.join('\n');
}

function defaultScope(input: QuotePdfInput, organization: string): string {
  if (input.scope?.trim()) return input.scope.trim();
  const title = textValue(input.opportunity.title, 'cotizacion solicitada');
  return `Presentamos la propuesta economica para ${organization}, segun informacion y referencias recibidas para ${title}.`;
}

function itemTitle(item: QuotePdfItem): string {
  return textValue(item.item, 'Item');
}

function commercialDescription(item: QuotePdfItem): string {
  return wrapMultiline(
    [item.description, item.notes?.trim() ? `**Observaciones:** ${item.notes.trim()}` : '']
      .filter(Boolean)
      .join('\n'),
    92,
  );
}

function shortProduction(value?: string): string {
  if (!value?.trim()) return 'Por confirmar';
  if (/^por confirmar\b/i.test(value.trim())) return 'Por confirmar';
  const first = value.split(/,|;|\s+desde\s+/i)[0]!.trim();
  const compact = first || value.trim();
  return compact.length <= 18 ? compact : `${compact.slice(0, 15).trim()}...`;
}

function visualReferenceBoxes(
  count: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  if (count === 1) return [{ x: 17, y: 56, w: 176, h: 202 }];
  if (count === 2) {
    return [
      { x: 17, y: 56, w: 176, h: 97 },
      { x: 17, y: 161, w: 176, h: 97 },
    ];
  }
  if (count === 3) {
    return [
      { x: 17, y: 56, w: 176, h: 96 },
      { x: 17, y: 160, w: 84, h: 98 },
      { x: 109, y: 160, w: 84, h: 98 },
    ];
  }
  return [
    { x: 17, y: 56, w: 84, h: 97 },
    { x: 109, y: 56, w: 84, h: 97 },
    { x: 17, y: 161, w: 84, h: 97 },
    { x: 109, y: 161, w: 84, h: 97 },
  ].slice(0, count);
}

function visualSchemas(count: number, startIndex: number, primaryColor = colors.navy): PdfSchema[] {
  if (!count) return [];
  const boxes = visualReferenceBoxes(count);

  return [
    textSchema('refTitle', 17, 20, 120, 10, { fontSize: 20, fontColor: primaryColor }),
    textSchema('refSubtitle', 17, 34, 168, 8, { fontSize: 9, fontColor: colors.muted }),
    lineSchema('ref_top_rule', 17, 48, 176),
    ...boxes.flatMap((box, index) => [
      rectSchema(`refBox_${startIndex + index}`, box.x, box.y, box.w, box.h, {
        color: '#ffffff',
        borderColor: colors.rule,
        borderWidth: 0.25,
      }),
      schema(`refImage_${startIndex + index}`, 'image', box.x + 2, box.y + 2, box.w - 4, box.h - 4),
    ]),
  ];
}

function baseTemplateSchemas(
  rowCount: number,
  startIndex = 0,
  primaryColor = colors.navy,
  usesPackagedLogo = true,
  referencedIdentity = false,
): PdfSchema[] {
  const rowHeight = 20;
  const itemFontSize = 12;
  const descriptionFontSize = 9.2;
  return [
    ...(referencedIdentity
      ? [
          textSchema('brand', 17, 16.5, 119, 12, {
            fontSize: 24,
            fontColor: primaryColor,
            dynamicFontSize: { min: 10, max: 24, fit: 'horizontal' },
            overflow: 'expand',
          }),
          textSchema('legal', 17, 29, 126, 4, {
            fontSize: 7.4,
            fontColor: colors.muted,
            overflow: 'expand',
            dynamicFontSize: { min: 6.5, max: 7.4, fit: 'horizontal' },
          }),
          textSchema('address', 17, 33.5, 126, 4, {
            fontSize: 7.1,
            fontColor: colors.muted,
            overflow: 'expand',
            dynamicFontSize: { min: 6.5, max: 7.1, fit: 'horizontal' },
          }),
          textSchema('issuerContact', 17, 38, 176, 4, {
            fontSize: 7.1,
            fontColor: colors.muted,
            overflow: 'expand',
            dynamicFontSize: { min: 6.5, max: 7.1, fit: 'horizontal' },
          }),
        ]
      : [
          ...(usesPackagedLogo
            ? [schema('logo', 'image', 16.5, 16, 29, 18)]
            : [
                textSchema('wordmark', 16.5, 17, 30, 12, { fontSize: 22, fontColor: primaryColor }),
              ]),
          textSchema('brand', 50, 16.5, 72, 12, { fontSize: 24, fontColor: primaryColor }),
          textSchema('legal', 50.5, 29, 93, 5, { fontSize: 7.4, fontColor: colors.muted }),
          textSchema('address', 50.5, 34.5, 108, 5, { fontSize: 7.1, fontColor: colors.muted }),
        ]),
    textSchema('docTitle', 140, 17, 53, 11, {
      fontSize: 22,
      fontColor: primaryColor,
      alignment: 'right',
    }),
    textSchema('docDate', 152, 32, 41, 5, {
      fontSize: 8,
      fontColor: colors.muted,
      alignment: 'right',
    }),
    lineSchema('top_rule', 17, 42.5, 176),

    textSchema('toLabel', 17, 52, 30, 4, { fontSize: 7.5, fontColor: colors.muted }),
    textSchema('client', 17, 58, 78, 8, {
      fontSize: 15,
      fontColor: colors.ink,
      overflow: 'expand',
    }),
    textSchema('clientContact', 17, 67, 80, 5, {
      fontSize: 8.5,
      fontColor: colors.muted,
      overflow: 'expand',
    }),
    textSchema('clientEmail', 17, 73, 80, 5, {
      fontSize: 8,
      fontColor: colors.muted,
      overflow: 'expand',
    }),
    textSchema('validityLabel', 140, 52, 22, 4, { fontSize: 6.7, fontColor: colors.muted }),
    textSchema('validityValue', 174, 52, 19, 4, {
      fontSize: 8.8,
      alignment: 'right',
      overflow: 'expand',
    }),
    lineSchema('validity_rule', 140, 57, 53),
    textSchema('productionLabel', 140, 60, 25, 4, { fontSize: 6.7, fontColor: colors.muted }),
    textSchema('productionValue', 166, 60, 27, 4, {
      fontSize: 8.8,
      alignment: 'right',
      overflow: 'expand',
    }),
    lineSchema('production_rule', 140, 65, 53),
    textSchema('currencyLabel', 140, 68, 25, 4, { fontSize: 6.7, fontColor: colors.muted }),
    textSchema('currencyValue', 166, 68, 27, 4, {
      fontSize: 8.8,
      alignment: 'right',
      overflow: 'expand',
    }),
    lineSchema('currency_rule', 140, 73, 53),

    textSchema('subject', 17, 82, 176, 7, {
      fontSize: 10.5,
      fontColor: primaryColor,
      overflow: 'expand',
    }),
    textSchema('scope', 17, 91, 176, 14, { fontSize: 8.4, lineHeight: 1.2, overflow: 'expand' }),

    textSchema('sectionDetail', 17, 112, 75, 8, { fontSize: 16, fontColor: primaryColor }),
    lineSchema('detail_rule', 17, 121, 176),
    textSchema('hDesc', 17, 124, 95, 4, { fontSize: 6.7, fontColor: colors.muted }),
    textSchema('hQty', 116, 124, 14, 4, { fontSize: 6.7, fontColor: colors.muted }),
    textSchema('hUnit', 134, 124, 24, 4, { fontSize: 6.7, fontColor: colors.muted }),
    textSchema('hTotal', 164, 124, 29, 4, {
      fontSize: 6.7,
      fontColor: colors.muted,
      alignment: 'right',
    }),
    lineSchema('header_rule', 17, 129, 176, { color: primaryColor }),

    ...Array.from({ length: rowCount }, (_, index) => {
      const y = 134 + index * rowHeight;
      return [
        textSchema(`item_${startIndex + index}`, 17, y, 95, 6.5, {
          fontSize: itemFontSize,
          fontColor: primaryColor,
          lineHeight: 1.02,
          textFormat: 'inline-markdown',
          fontVariantFallback: 'synthetic',
          overflow: 'expand',
        }),
        textSchema(`desc_${startIndex + index}`, 17, y + 8, 176, rowHeight - 12, {
          fontSize: descriptionFontSize,
          lineHeight: 1.15,
          textFormat: 'inline-markdown',
          fontVariantFallback: 'synthetic',
          overflow: 'expand',
        }),
        textSchema(`qty_${startIndex + index}`, 116, y, 14, 6, {
          fontSize: itemFontSize - 1,
          dynamicFontSize: { min: 6, max: itemFontSize - 1, fit: 'horizontal' },
        }),
        textSchema(`unit_${startIndex + index}`, 134, y, 24, 6, {
          fontSize: itemFontSize - 1,
          dynamicFontSize: { min: 6, max: itemFontSize - 1, fit: 'horizontal' },
        }),
        textSchema(`lineTotal_${startIndex + index}`, 164, y, 29, 6, {
          fontSize: itemFontSize - 1,
          alignment: 'right',
          dynamicFontSize: { min: 6, max: itemFontSize - 1, fit: 'horizontal' },
        }),
        lineSchema(`row_rule_${startIndex + index}`, 17, y + rowHeight - 1.2, 176),
      ];
    }).flat(),
  ];
}

function totalSchemas(startY: number, primaryColor = colors.navy): PdfSchema[] {
  return [
    textSchema('subtotalLabel', 130, startY, 30, 5, { fontSize: 9, fontColor: colors.muted }),
    textSchema('subtotalValue', 166, startY, 27, 5, {
      fontSize: 9,
      alignment: 'right',
      dynamicFontSize: { min: 6, max: 9, fit: 'horizontal' },
    }),
    textSchema('igvLabel', 130, startY + 8, 30, 5, { fontSize: 9, fontColor: colors.muted }),
    textSchema('igvValue', 166, startY + 8, 27, 5, {
      fontSize: 9,
      alignment: 'right',
      dynamicFontSize: { min: 6, max: 9, fit: 'horizontal' },
    }),
    lineSchema('total_rule', 130, startY + 16, 63),
    textSchema('totalLabel', 130, startY + 21, 22, 8, { fontSize: 16, fontColor: primaryColor }),
    textSchema('totalValue', 152, startY + 21, 41, 8, {
      fontSize: 16,
      fontColor: primaryColor,
      alignment: 'right',
      dynamicFontSize: { min: 7, max: 16, fit: 'horizontal' },
    }),
  ];
}

function footerSchemas(prefix = 'footer'): PdfSchema[] {
  return [
    lineSchema(`${prefix}_rule`, 17, 266, 176),
    textSchema(`${prefix}Company`, 17, 269, 130, 4, { fontSize: 6.8, fontColor: colors.muted }),
    textSchema(`${prefix}Page`, 166, 269, 27, 4, {
      fontSize: 6.8,
      fontColor: colors.muted,
      alignment: 'right',
    }),
  ];
}

async function keepCommercialSummaryTogether(
  template: Template,
  data: Record<string, string>,
  lastCommercialPage: number,
): Promise<void> {
  const names = new Set([
    'sectionTerms',
    'terms_rule',
    'terms',
    'subtotalLabel',
    'subtotalValue',
    'igvLabel',
    'igvValue',
    'total_rule',
    'totalLabel',
    'totalValue',
  ]);
  const layout = await getDynamicTemplate({
    template,
    input: data,
    options: {},
    _cache: new Map(),
    getDynamicHeights: getDynamicLayoutForSchema,
  });
  const pages = layout.schemas.filter((page) => page.some((entry) => names.has(entry.name)));
  if (pages.length <= 1) return;
  const original = template.schemas[lastCommercialPage]!;
  const group = original.filter((entry) => names.has(entry.name));
  const startY = Math.min(...group.map((entry) => entry.position.y));
  const terms = group.find((entry) => entry.name === 'terms')!;
  const termsHeight = pages
    .flat()
    .filter((entry) => entry.name === 'terms')
    .reduce((sum, entry) => sum + entry.height, 0);
  const groupHeight = Math.max(
    terms.position.y - startY + termsHeight,
    ...group
      .filter((entry) => entry.name !== 'terms')
      .map((entry) => entry.position.y + entry.height - startY),
  );
  // Oversized conditions still use the normal line-level continuation contract.
  if (groupHeight > 205) return;
  const headerNames = new Set([
    'logo',
    'wordmark',
    'brand',
    'legal',
    'address',
    'issuerContact',
    'docTitle',
    'docDate',
    'top_rule',
  ]);
  const header = original.filter((entry) => headerNames.has(entry.name));
  template.schemas[lastCommercialPage] = original.filter((entry) => !names.has(entry.name));
  template.schemas.splice(lastCommercialPage + 1, 0, [
    ...header,
    ...group.map((entry) => ({
      ...entry,
      position: { ...entry.position, y: entry.position.y - startY + 52 },
    })),
  ]);
}

export async function buildEditorialQuoteTemplate(
  input: QuotePdfInput,
): Promise<{ template: Template; data: Record<string, string> }> {
  if (!input.priceItems.length) throw new Error('priceItems is required');
  const issuer = input.issuer;
  const organization = textValue(
    input.opportunity.organization || input.opportunity.customer_name || input.opportunity.domain,
    'Cliente',
  );
  const taxMode = input.taxMode || 'not_included';
  const subtotal =
    input.subtotal ?? (taxMode === 'included' ? roundMoney(input.total / 1.18) : input.total);
  const tax =
    input.tax ??
    (taxMode === 'included' ? roundMoney(input.total - subtotal) : roundMoney(subtotal * 0.18));
  const total = taxMode === 'not_included' ? roundMoney(subtotal + tax) : input.total;
  const contactName = textValue(input.opportunity.primary_contact_name, '');
  const contactEmail = textValue(input.opportunity.primary_contact_email, '');
  const visualReferences = input.visualReferencePaths || [];
  if (visualReferences.length > MAX_QUOTE_VISUAL_REFERENCES) {
    throw new Error(`visualReferencePaths accepts at most ${MAX_QUOTE_VISUAL_REFERENCES} files`);
  }
  const visualReferencePages = Array.from(
    { length: Math.ceil(visualReferences.length / VISUAL_REFERENCES_PER_PAGE) },
    (_, pageIndex) => ({
      startIndex: pageIndex * VISUAL_REFERENCES_PER_PAGE,
      paths: visualReferences.slice(
        pageIndex * VISUAL_REFERENCES_PER_PAGE,
        pageIndex * VISUAL_REFERENCES_PER_PAGE + VISUAL_REFERENCES_PER_PAGE,
      ),
    }),
  );
  const commercialPages = Array.from(
    { length: Math.ceil(input.priceItems.length / 2) },
    (_, pageIndex) => ({
      startIndex: pageIndex * 2,
      items: input.priceItems.slice(pageIndex * 2, pageIndex * 2 + 2),
    }),
  );
  const schemas = [
    ...commercialPages.map(({ startIndex, items }, pageIndex) => {
      const termsY = 134 + items.length * 20 + 6;
      const totalY = termsY + 6;
      const isFinalCommercialPage = pageIndex === commercialPages.length - 1;
      return [
        ...baseTemplateSchemas(
          items.length,
          startIndex,
          issuer.primaryColor,
          issuer.usesPackagedLogo,
          issuer.templateId === 'referenced_editorial',
        ),
        ...(isFinalCommercialPage
          ? [
              ...totalSchemas(totalY, issuer.primaryColor),
              textSchema('sectionTerms', 17, termsY, 79, 6, {
                fontSize: 12.5,
                fontColor: issuer.primaryColor,
              }),
              lineSchema('terms_rule', 17, termsY + 7, 74),
              textSchema('terms', 17, termsY + 11, 105, 36, {
                fontSize: 8.4,
                lineHeight: 1.15,
                overflow: 'expand',
              }),
            ]
          : []),
      ];
    }),
    ...visualReferencePages.map(({ startIndex, paths }) =>
      visualSchemas(paths.length, startIndex, issuer.primaryColor),
    ),
  ];

  const data: Record<string, string> = {
    ...(issuer.usesPackagedLogo
      ? { logo: input.logoDataUrl }
      : { wordmark: issuer.wordmark || '' }),
    brand: issuer.brand,
    legal: issuer.legal,
    address: issuer.address,
    issuerContact: issuer.contact || '',
    docTitle: issuer.documentTitle,
    docDate: formatDate(
      input.opportunity.issue_date ? new Date(String(input.opportunity.issue_date)) : new Date(),
    ),
    toLabel: 'Para',
    client: organization,
    clientContact: contactName ? `Atencion: ${contactName}` : '',
    clientEmail: contactEmail,
    subject: input.subject?.trim() ? `Asunto: ${input.subject.trim()}` : '',
    scope: wrap(defaultScope(input, organization), 110),
    validityLabel: 'VIGENCIA',
    validityValue: input.validity || 'No indicada',
    productionLabel: input.productionLabel || 'PRODUCCION',
    productionValue: shortProduction(input.productionTime),
    currencyLabel: 'MONEDA',
    currencyValue: 'Soles (PEN)',
    sectionDetail: 'Detalle económico',
    hDesc: 'ITEM / DESCRIPCIÓN',
    hQty: 'CANT.',
    hUnit: 'UNITARIO',
    hTotal: 'IMPORTE',
    subtotalLabel: taxMode === 'unspecified' ? 'Importe cotizado' : 'Subtotal',
    subtotalValue: money(subtotal),
    igvLabel: taxMode === 'unspecified' ? 'IGV' : 'IGV 18%',
    igvValue: taxMode === 'unspecified' ? 'Ver condiciones' : money(tax),
    totalLabel: input.priceItems.every((item) => Number.isFinite(item.unitPrice))
      ? 'Total'
      : 'Parcial',
    totalValue: money(total),
    sectionTerms: 'Condiciones comerciales',
    terms: wrapMultiline(defaultTerms(input), 62),
    footerCompany: issuer.footer,
    refTitle:
      visualReferences.length === 1
        ? 'Referencia visual recibida'
        : 'Referencias visuales recibidas',
    refSubtitle:
      'Imágenes/documentos enviados por el cliente como guía de diseño. Producción sujeta a aprobación de artes finales.',
  };

  input.priceItems.forEach((item, index) => {
    data[`item_${index}`] = `**${wrap(itemTitle(item), 55)}**`;
    data[`desc_${index}`] = commercialDescription(item);
    data[`qty_${index}`] = String(item.quantity);
    data[`unit_${index}`] = priceValue(item.unitPrice);
    data[`lineTotal_${index}`] = lineTotalValue(item);
  });

  for (const [index, path] of visualReferences.entries()) {
    data[`refImage_${index}`] = await visualReferenceImageDataUrl(path);
  }

  for (const item of schemas.flat()) {
    const name = String(item.name || '');
    if (data[name] !== undefined) item.content = data[name];
  }

  const template = {
    // A blank object enables measured reflow and line-level page breaks.
    // Background and footer stay outside the flow on every generated page.
    basePdf: {
      width: 210,
      height: 297,
      padding: [16, 17, 32, 17],
      staticSchema: [
        rectSchema('page_bg', 0, 0, 210, 297, { color: colors.paper, borderWidth: 0 }),
        rectSchema('outer_rule', 9, 9, 192, 279, {
          color: colors.paper,
          borderColor: colors.rule,
          borderWidth: 0.35,
        }),
        ...footerSchemas().map((entry) => ({
          ...entry,
          ...(issuer.templateId === 'referenced_editorial' && entry.name === 'footerCompany'
            ? { dynamicFontSize: { min: 6, max: 6.8, fit: 'horizontal' } }
            : {}),
          content:
            entry.name === 'footerCompany'
              ? issuer.footer
              : entry.name === 'footerPage'
                ? 'Página {currentPage} de {totalPages}'
                : '',
        })),
      ],
    },
    schemas,
  } as Template;
  await keepCommercialSummaryTogether(template, data, commercialPages.length - 1);
  return { template, data };
}

export async function renderEditorialQuotePdf(input: QuotePdfInput): Promise<Buffer> {
  const { template, data } = await buildEditorialQuoteTemplate(input);
  return Buffer.from(
    await generate({
      template,
      inputs: [data],
      plugins: { text, rectangle, line, image, qrcode: barcodes.qrcode },
    }),
  );
}
