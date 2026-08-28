export type UserRole = 'client' | 'peru_activa' | 'workshop';

export interface AuthenticatedIdentity {
  subject: string;
  role: UserRole;
  authentication: 'cloudflare_access' | 'local_demo';
  email?: string;
  phone?: string;
  workshopId?: string;
}

export interface QuotationOwner {
  subject: string;
  email: string;
}

export class AccessAuthorizationError extends Error {
  constructor(
    readonly code: 'unauthenticated' | 'forbidden' | 'configuration_error',
    message: string,
  ) {
    super(message);
  }
}

export function requireRole(identity: AuthenticatedIdentity, ...allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(identity.role)) {
    throw new AccessAuthorizationError('forbidden', 'Esta cuenta no tiene acceso a esta acción.');
  }
}
