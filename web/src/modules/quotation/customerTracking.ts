import type { QuotationRequest } from './types';

export type ProductionOrderStatus =
  'registered' | 'recommended' | 'assigned' | 'in_production' | 'completed';

export interface CustomerTrackingItem {
  quotation: QuotationRequest;
  productionOrders: Array<{
    id: string;
    garmentIndex?: number;
    product?: string;
    quantity?: number;
    status: ProductionOrderStatus;
    updatedAt: string;
    assignment?: { workshopId: string; displayName: string; confirmedAt: string };
    history?: Array<{ status: ProductionOrderStatus; occurredAt: string }>;
  }>;
  lastUpdatedAt: string;
  timeline: Array<{
    key: string;
    label: string;
    occurredAt: string;
    status: 'complete' | 'current';
  }>;
}

export function trackingLabel(item: CustomerTrackingItem): string {
  if (item.quotation.status === 'accepted') {
    const stage = productionStage(item);
    if (stage === 3) return 'Pedido terminado';
    if (stage === 2) return 'En producción';
    if (stage === 1)
      return item.productionOrders.length > 1 ? 'Talleres asignados' : 'Taller asignado';
    return item.productionOrders.some((order) =>
      ['assigned', 'in_production', 'completed'].includes(order.status),
    )
      ? 'Asignación parcial'
      : 'Asignación pendiente';
  }
  return {
    pending_quote: 'Esperando cotización',
    quoted: 'Cotización recibida',
    accepted: 'Cotización aceptada',
    rejected: 'Cotización rechazada',
  }[item.quotation.status];
}

/** The least advanced garment determines the overall stage, including missing orders. */
export function productionStage(item: CustomerTrackingItem): number {
  const expected = 1 + item.quotation.request.additionalGarments.length;
  if (item.productionOrders.length < expected) return 0;
  const stages: Record<ProductionOrderStatus, number> = {
    registered: 0,
    recommended: 0,
    assigned: 1,
    in_production: 2,
    completed: 3,
  };
  return Math.min(...item.productionOrders.map((order) => stages[order.status]));
}
