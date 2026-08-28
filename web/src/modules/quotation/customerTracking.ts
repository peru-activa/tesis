import type { QuotationRequest } from './types';

export type ProductionOrderStatus =
  'registered' | 'recommended' | 'assigned' | 'in_production' | 'completed';

export interface CustomerTrackingItem {
  quotation: QuotationRequest;
  productionOrders: Array<{
    id: string;
    status: ProductionOrderStatus;
    updatedAt: string;
    assignment?: { workshopId: string; displayName: string; confirmedAt: string };
  }>;
}

export function trackingLabel(item: CustomerTrackingItem): string {
  const statuses = item.productionOrders.map((order) => order.status);
  if (statuses.length > 0 && statuses.every((status) => status === 'completed')) {
    return 'Pedido terminado';
  }
  if (statuses.includes('in_production')) return 'En producción';
  if (statuses.includes('assigned')) return 'Taller asignado';
  if (statuses.includes('recommended')) return 'Buscando taller';
  return {
    pending_quote: 'Esperando cotización',
    quoted: 'Cotización recibida',
    accepted: 'Pedido confirmado',
    rejected: 'Cotización rechazada',
  }[item.quotation.status];
}
