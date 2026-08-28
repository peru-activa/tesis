import { useEffect, useState } from 'react';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';

type SessionRole = 'client' | 'peru_activa' | 'workshop';

const destinationByRole: Record<SessionRole, string> = {
  client: '/mis-pedidos',
  peru_activa: '/peru-activa',
  workshop: '/taller',
};

export function RoleLandingPage() {
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    void fetch('/v1/session')
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message || 'No se pudo reconocer tu cuenta.');
        return payload.identity.role as SessionRole;
      })
      .then((role) => {
        if (active) window.location.replace(destinationByRole[role]);
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'No se pudo ingresar.');
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="quote-demo role-landing-shell">
      <PeruActivaHeader />
      <main className="role-landing-card" aria-live="polite">
        <p className="quote-kicker">PERÚ ACTIVA</p>
        <h1>Ingresando a tu cuenta</h1>
        <p>{error || 'Estamos preparando la vista que corresponde a tu usuario…'}</p>
      </main>
    </div>
  );
}
