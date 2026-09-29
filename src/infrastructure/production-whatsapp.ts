import { createHmac } from 'node:crypto';
import type { WorkshopNotification } from '../domain/workshop-notifications.js';
import type { PortalOrder } from '../domain/orders.js';
import type { QuotationRequest } from '../domain/quotation-requests.js';

export interface ProductionStatus {
  orderId: string;
  workshopId: string;
  state: string;
  effects: Array<{ phase: string; ordinal: number; state: string; provider_receipt_id: string | null; error: string | null }>;
  lastError: string | null;
}

export interface ProductionWhatsApp {
  assign(order: PortalOrder, notification: WorkshopNotification, quotation?: QuotationRequest): Promise<ProductionStatus>;
  status(orderId: string, workshopId: string): Promise<ProductionStatus | null>;
  progress(orderId: string, workshopId: string): Promise<ProductionStatus>;
}

const processLabels: Record<string, string> = {
  fabric_sourcing: 'compra de tela', design: 'diseño', transfer_printing: 'impresión para sublimación',
  patternmaking: 'patronaje', cutting: 'corte', sewing: 'confección', sublimation: 'sublimación',
  printing: 'estampado', vinyl: 'vinil', embroidery: 'bordado', notions: 'avíos',
  ironing: 'planchado', finishing: 'acabado', quality_control: 'control de calidad', delivery: 'entrega',
};

export class ProductionWhatsAppClient implements ProductionWhatsApp {
  constructor(private readonly baseUrl: string, private readonly secret: string, private readonly fetchImpl = fetch) {
    if (Buffer.byteLength(secret) < 32) throw new Error('PRODUCTION_COORDINATION_SECRET is too short');
  }

  private async request(path: string, method: 'GET' | 'POST', input?: unknown): Promise<ProductionStatus | null> {
    const body = method === 'POST' ? JSON.stringify(input ?? {}) : '';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac('sha256', this.secret).update(`${timestamp}\n${body}`).digest('hex');
    const response = await this.fetchImpl(new URL(path, this.baseUrl), {
      method,
      headers: {
        'content-type': 'application/json',
        'x-r6-timestamp': timestamp,
        'x-r6-signature': `sha256=${signature}`,
      },
      ...(method === 'POST' ? { body } : {}),
      signal: AbortSignal.timeout(20_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`production_whatsapp_${response.status}`);
    return response.json() as Promise<ProductionStatus>;
  }

  async assign(order: PortalOrder, notification: WorkshopNotification, quotation?: QuotationRequest): Promise<ProductionStatus> {
    const content = notification.content;
    const garment = quotation?.request.garment;
    const needsArtwork = content.requiredProcesses.some((process) =>
      ['design', 'transfer_printing', 'sublimation', 'printing', 'embroidery', 'vinyl'].includes(process));
    const files = needsArtwork
      ? [garment?.designAttachment, ...(garment?.designApplications ?? []).map((item) => item.attachment)]
          .filter((item): item is NonNullable<typeof item> => Boolean(item))
          .map((item) => ({ filename: item.name, mediaType: item.mediaType, dataUrl: item.dataUrl }))
      : [];
    const fabricBuyer = order.fabricBuyer || quotation?.quotation?.fabricBuyer;
    if (!fabricBuyer) throw new Error('missing_fabric_buyer');
    const result = await this.request('/production/assignments', 'POST', {
      orderId: order.id,
      workshopId: content.workshopId,
      workshopName: content.workshopName,
      stage: processLabels[
        content.requiredProcesses.find((process) => ['sewing', 'sublimation', 'printing', 'embroidery', 'cutting'].includes(process))
          || content.requiredProcesses[0] || 'finishing'
      ] || 'producción',
      quantity: content.quantity,
      product: content.product,
      material: content.material,
      color: content.color,
      sizes: content.sizes,
      processes: content.requiredProcesses,
      fabricBuyer: fabricBuyer === 'peru_activa' ? 'Perú Activa' : 'taller',
      requiredBy: content.requiredBy,
      deliveryDistrict: content.deliveryDistrict,
      notes: content.notes,
      designReference: needsArtwork ? content.designReference : 'No aplica para esta etapa',
      designInstructions: needsArtwork ? garment?.designApplications?.map((application) => [
        application.method,
        application.placement,
        application.widthCm && application.heightCm ? `${application.widthCm} × ${application.heightCm} cm` : '',
      ].filter(Boolean).join(', ')).join('; ') || garment?.customizationDetails || '' : '',
      attachments: files,
    });
    if (!result) throw new Error('production_assignment_missing');
    return result;
  }

  status(orderId: string, workshopId: string): Promise<ProductionStatus | null> {
    return this.request(`/production/assignments/${encodeURIComponent(orderId)}/${encodeURIComponent(workshopId)}`, 'GET');
  }

  async progress(orderId: string, workshopId: string): Promise<ProductionStatus> {
    const result = await this.request(`/production/assignments/${encodeURIComponent(orderId)}/${encodeURIComponent(workshopId)}/progress`, 'POST');
    if (!result) throw new Error('production_assignment_missing');
    return result;
  }
}

export function productionWhatsAppFromEnvironment(): ProductionWhatsApp | undefined {
  const baseUrl = process.env.PRODUCTION_COORDINATION_URL;
  const secret = process.env.PRODUCTION_COORDINATION_SECRET;
  if (!baseUrl && !secret) return undefined;
  if (!baseUrl || !secret) throw new Error('Production WhatsApp coordination configuration incomplete');
  return new ProductionWhatsAppClient(baseUrl, secret);
}
