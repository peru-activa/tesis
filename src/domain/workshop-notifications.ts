import type { Process } from './contracts.js';
import type { OrderAssignment, OrderDraft } from './orders.js';

export interface WorkshopNotificationContent {
  orderId: string;
  workshopId: string;
  workshopName: string;
  product: OrderDraft['product'];
  quantity: number;
  material: OrderDraft['material'];
  color: string;
  sizes: OrderDraft['sizes'];
  requiredProcesses: Process[];
  customization: OrderDraft['customization'];
  designReference: string;
  requiredBy: string;
  deliveryDistrict: string;
  notes: string;
}

export interface WorkshopNotification {
  id: string;
  version: 1;
  simulated: true;
  publishedAt: string;
  content: WorkshopNotificationContent;
  channels: {
    web: { status: 'published'; publishedAt: string };
    whatsapp: { status: 'preview_only'; generatedAt: string; messageText: string };
  };
}

const processLabels: Record<Process, string> = {
  fabric_sourcing: 'compra de tela',
  design: 'diseño',
  patternmaking: 'patronaje',
  cutting: 'corte',
  sewing: 'costura',
  sublimation: 'sublimación',
  printing: 'estampado',
  vinyl: 'vinil',
  embroidery: 'bordado',
  notions: 'colocación de avíos',
  ironing: 'planchado',
  finishing: 'acabado',
  quality_control: 'control de calidad',
  delivery: 'entrega',
};

const productLabels: Record<OrderDraft['product'], string> = {
  polo: 'polos',
  buzo: 'buzos',
};

export function createWorkshopNotification(input: {
  orderId: string;
  draft: OrderDraft;
  assignment: OrderAssignment;
  workshopId: string;
  requiredProcesses: Process[];
  publishedAt: string;
}): WorkshopNotification {
  const allocation = input.assignment.allocations.find(
    (item) => item.workshopId === input.workshopId,
  );
  if (!allocation) throw new Error('El taller no pertenece al plan confirmado.');
  const sizes = allocateSizes(input.draft.sizes, input.draft.quantity, allocation.quantity);
  const content: WorkshopNotificationContent = {
    orderId: input.orderId,
    workshopId: allocation.workshopId,
    workshopName: allocation.displayName,
    product: input.draft.product,
    quantity: allocation.quantity,
    material: input.draft.material,
    color: input.draft.color,
    sizes,
    requiredProcesses: input.requiredProcesses,
    customization: input.draft.customization,
    designReference: input.draft.designReference,
    requiredBy: input.draft.requiredBy,
    deliveryDistrict: input.draft.deliveryDistrict,
    notes: input.draft.notes,
  };
  const sizeSummary = Object.entries(content.sizes)
    .filter(([, units]) => units > 0)
    .map(([size, units]) => `${size}: ${units}`)
    .join(', ');
  const processes = content.requiredProcesses.map((process) => processLabels[process]).join(', ');
  const messageText = [
    `Nuevo pedido ${content.orderId}`,
    `${content.quantity} ${productLabels[content.product]} · ${content.material} · ${content.color}`,
    `Tallas: ${sizeSummary}`,
    `Procesos: ${processes}`,
    `Diseño: ${content.designReference}`,
    `Fecha requerida: ${content.requiredBy}`,
    `Entrega: ${content.deliveryDistrict}`,
  ].join('\n');

  return {
    id: `NOT-${input.orderId}-${allocation.workshopId}`,
    version: 1,
    simulated: true,
    publishedAt: input.publishedAt,
    content,
    channels: {
      web: { status: 'published', publishedAt: input.publishedAt },
      whatsapp: { status: 'preview_only', generatedAt: input.publishedAt, messageText },
    },
  };
}

function allocateSizes(
  sizes: OrderDraft['sizes'],
  totalQuantity: number,
  assignedQuantity: number,
): OrderDraft['sizes'] {
  const entries = Object.entries(sizes);
  const provisional = entries.map(([size, units]) => {
    const exact = (units / totalQuantity) * assignedQuantity;
    return { size, units: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });
  let remaining = assignedQuantity - provisional.reduce((sum, item) => sum + item.units, 0);
  provisional
    .sort((left, right) => right.fraction - left.fraction || left.size.localeCompare(right.size))
    .forEach((item) => {
      if (remaining > 0) {
        item.units += 1;
        remaining -= 1;
      }
    });
  return Object.fromEntries(
    provisional
      .sort(
        (left, right) =>
          entries.findIndex(([size]) => size === left.size) -
          entries.findIndex(([size]) => size === right.size),
      )
      .map(({ size, units }) => [size, units]),
  );
}
