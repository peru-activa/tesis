import { workshopsForScope } from '../domain/workshop-scope.js';
import type { PortalOrder, OrderAssignment } from '../domain/orders.js';
import type { Workshop } from '../domain/contracts.js';
import { createWorkshopNotification } from '../domain/workshop-notifications.js';
import { workshopAvailabilityReference, type ProductionWhatsApp } from '../infrastructure/production-whatsapp.js';

export function availabilityTargets(order: PortalOrder, workshops: Workshop[]) {
  const allocations = new Map<string, OrderAssignment['allocations'][number]>();
  for (const candidate of order.recommendation.candidates) {
    for (const allocation of candidate.allocations) {
      const workshop = workshopsForScope(workshops, order).find((item) => item.id === allocation.workshopId);
      if (!workshop || Boolean(workshop.testOnly) !== Boolean(order.testOnly)) continue;
      const previous = allocations.get(workshop.id);
      allocations.set(workshop.id, {
        workshopId: workshop.id, displayName: workshop.displayName,
        quantity: Math.max(previous?.quantity ?? 0, allocation.quantity), status: 'assigned',
        assignedProcesses: [...new Set([
          ...(previous?.assignedProcesses ?? []),
          ...(allocation.assignedProcesses ?? order.requiredProcesses),
        ])],
      });
    }
  }
  return [...allocations.values()].map((allocation) => {
    const workshop = workshops.find((item) => item.id === allocation.workshopId)!;
    return {
      workshop,
      notification: createWorkshopNotification({
        orderId: order.id, draft: order.draft, workshopId: workshop.id,
        requiredProcesses: allocation.assignedProcesses, publishedAt: order.updatedAt,
        assignment: {
          candidateId: 'availability', workshopId: workshop.id, displayName: workshop.displayName,
          confirmedAt: order.updatedAt, allocations: [allocation],
        },
      }),
    };
  });
}

export async function workshopAvailability(
  order: PortalOrder, workshops: Workshop[], channel: ProductionWhatsApp, send: boolean,
) {
  // Each recipient is isolated: a failure never hides successes at other workshops.
  return Promise.all(availabilityTargets(order, workshops).map(async ({ workshop, notification }) => {
    const identity = { workshopId: workshop.id, displayName: workshop.displayName, phone: workshop.contactPhone };
    if (!workshop.contactPhone) return { ...identity, state: 'missing_phone', effects: [], lastError: 'Falta registrar el teléfono.' };
    try {
      const status = send
        ? await channel.consult!(order, notification, `51${workshop.contactPhone}`)
        : await channel.status(workshopAvailabilityReference(order, workshop.id), workshop.id);
      return { ...identity, ...(status ?? { state: 'not_contacted', effects: [], lastError: null }) };
    } catch {
      return { ...identity, state: 'send_failed', effects: [], lastError: 'No se pudo confirmar el envío. Revisa el estado antes de volver a enviar.' };
    }
  }));
}
