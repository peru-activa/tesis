import type { UserRole } from './identity.js';

export const portalHomeByRole: Record<UserRole, string> = {
  client: '/mis-pedidos',
  peru_activa: '/peru-activa',
  workshop: '/taller',
};
