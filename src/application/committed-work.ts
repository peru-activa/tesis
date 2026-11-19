import type { CommittedWork } from '../domain/contracts.js';
import type { PortalOrder } from '../domain/orders.js';

/** Reservations come from persisted allocations, never from recommendations. */
export function committedWorkFromOrders(orders: PortalOrder[]): CommittedWork[] {
  return orders.flatMap((order) => {
    if (order.previewOnly || !order.assignment || order.status === 'completed') return [];
    const allocations = order.assignment.allocations ?? [
      {
        workshopId: order.assignment.workshopId,
        quantity: order.draft.quantity,
        assignedProcesses: order.requiredProcesses,
        status: order.status,
      },
    ];
    return allocations
      .filter((allocation) => allocation.status !== 'completed')
      .map((allocation) => ({
        orderId: order.id,
        workshopId: allocation.workshopId,
        quantity: allocation.quantity,
        material: order.recommendationOrder?.material ?? order.draft.material,
        assignedProcesses: allocation.assignedProcesses ?? order.requiredProcesses,
        embroideryApplicationsPerGarment: order.draft.embroideryApplicationsPerGarment ?? 1,
      }));
  });
}
