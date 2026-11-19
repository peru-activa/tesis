import { processLabels } from './processLabels';
import './assigned-work.css';

interface AssignedOrder {
  id: string;
  status: string;
  previewOnly?: boolean;
  assignment?: {
    displayName: string;
    allocations?: Array<{
      workshopId: string;
      displayName: string;
      quantity: number;
      assignedProcesses?: string[];
      status: 'assigned' | 'in_production' | 'completed';
    }>;
  };
}
const states = { assigned: 'Asignado', in_production: 'En producción', completed: 'Terminado' };

export function AssignedWorkSummary({ order }: { order: AssignedOrder }) {
  return (
    <section className="mc-published assigned-work" aria-label="Distribución del pedido">
      {order.previewOnly && (
        <p className="assigned-work-preview">DEMOSTRACIÓN · NO FABRICAR · SIN ENVÍOS</p>
      )}
      <p className="mc-kicker">
        {order.status === 'completed'
          ? 'PEDIDO TERMINADO'
          : order.status === 'in_production'
            ? 'PEDIDO EN PRODUCCIÓN'
            : 'ASIGNACIÓN CONFIRMADA'}
      </p>
      <h3>Quién está a cargo</h3>
      {order.previewOnly && (
        <p>
          Los nombres corresponden a talleres registrados. El trabajo y sus avances son simulados.
        </p>
      )}
      <div className="assigned-work-grid">
        {order.assignment?.allocations?.length ? (
          order.assignment.allocations.map((allocation) => (
            <article key={allocation.workshopId} className="assigned-work-card">
              <h4>{allocation.displayName}</h4>
              <p className="assigned-work-state">{states[allocation.status]}</p>
              <dl>
                <div>
                  <dt>Trabajo asignado</dt>
                  <dd>
                    {allocation.assignedProcesses?.length
                      ? allocation.assignedProcesses
                          .map((process) => processLabels[process] || process)
                          .join(' · ')
                      : 'Procesos no registrados'}
                  </dd>
                </div>
                <div>
                  <dt>Prendas a atender</dt>
                  <dd>{allocation.quantity} unidades</dd>
                </div>
              </dl>
            </article>
          ))
        ) : (
          <p>{order.assignment?.displayName}</p>
        )}
      </div>
      {(order.assignment?.allocations?.length ?? 0) > 1 && (
        <p className="assigned-work-note">
          Una misma prenda puede pasar por varios talleres, cada uno a cargo de sus procesos.
        </p>
      )}
    </section>
  );
}
