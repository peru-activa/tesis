const labels: Record<string, string> = {
  assigned: 'Asignado',
  not_contacted: 'Sin consultar',
  capacity_pending: 'Pendiente',
  capacity_yes: 'Disponible',
  capacity_no: 'No disponible',
  capacity_expired: 'Sin respuesta',
  missing_phone: 'Falta teléfono',
  send_failed: 'Revisar envío',
  order_pending: 'Pendiente de aceptar',
  accepted: 'Aceptado',
  declined: 'Rechazado',
  progress_pending: 'Esperando avance',
  in_progress: 'En proceso',
  finished: 'Terminado',
  blocked: 'Con un bloqueo',
};

export function WorkshopStatus({ state }: { state: string }) {
  return <span className={`mc-workshop-status ${state}`}>{labels[state] || 'Verificar estado'}</span>;
}
