import { useEffect, useState, type ReactNode } from 'react';
import type { UserRole } from '../../../../src/domain/identity';
import { portalHomeByRole } from '../../../../src/domain/portal-navigation';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { DelayedLoading } from '../../components/DelayedLoading';

export function RoleLandingPage() {
  return <PortalRoleGate />;
}

export function PortalRoleGate({
  allowedRole,
  children,
}: {
  allowedRole?: UserRole;
  children?: ReactNode;
}) {
  const [error, setError] = useState('');
  const [role, setRole] = useState<UserRole>();

  useEffect(() => {
    let active = true;
    void fetch('/v1/session')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'No se pudo reconocer tu cuenta.');
        const role: unknown = payload.identity?.role;
        if (role !== 'client' && role !== 'peru_activa' && role !== 'workshop') {
          throw new Error('No se pudo reconocer el rol de tu cuenta.');
        }
        return role;
      })
      .then((role) => {
        if (!active) return;
        if (role === allowedRole) setRole(role);
        else window.location.replace(portalHomeByRole[role]);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo ingresar.');
      });
    return () => {
      active = false;
    };
  }, [allowedRole]);

  if (allowedRole && role === allowedRole) return children;

  return (
    <div className="quote-demo role-landing-shell">
      <PeruActivaHeader />
      {error ? (
        <main className="role-landing-card" aria-live="polite">
          <h1>No pudimos ingresar</h1>
          <p role="alert">{error}</p>
        </main>
      ) : (
        <DelayedLoading label="Cargando tu cuenta…" />
      )}
    </div>
  );
}
