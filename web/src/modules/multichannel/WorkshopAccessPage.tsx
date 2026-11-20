import { useEffect, useState } from 'react';
import type { AuthenticatedIdentity } from '../../../../src/domain/identity';
import { portalHomeByRole } from '../../../../src/domain/portal-navigation';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { DelayedLoading } from '../../components/DelayedLoading';
import { fetchAsWorkshop, readApiResponse } from '../../lib/actor-api';
import { MultichannelDemo } from './MultichannelDemo';

interface Session {
  identity: AuthenticatedIdentity;
}
interface WorkshopContact {
  id: string;
  displayName: string;
  contactPhone?: string;
}
const LOCAL_ONLY_MESSAGE =
  'Los números de prueba solo funcionan en la demostración local. El acceso de talleres al portal publicado todavía no está habilitado.';

function validSession(payload: Session): AuthenticatedIdentity {
  const identity = payload.identity;
  if (
    !identity ||
    !['client', 'peru_activa', 'workshop'].includes(identity.role) ||
    !['local_demo', 'cloudflare_access'].includes(identity.authentication)
  ) {
    throw new Error('No pudimos comprobar el acceso de esta cuenta.');
  }
  return identity;
}

async function verifyLocalWorkshop(phone: string): Promise<void> {
  const identity = validSession(
    await readApiResponse<Session>(await fetchAsWorkshop(phone, '/v1/session')),
  );
  if (
    identity.authentication !== 'local_demo' ||
    identity.role !== 'workshop' ||
    identity.phone !== phone
  ) {
    throw new Error(
      'Esta sesión no corresponde al taller indicado. Los números de prueba solo funcionan en la demostración local.',
    );
  }
}

export function WorkshopAccessPage() {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<AuthenticatedIdentity>();
  const [phone, setPhone] = useState('');
  const [draft, setDraft] = useState('');
  const [workshops, setWorkshops] = useState<WorkshopContact[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    async function load() {
      setError('');
      setLoading(true);
      try {
        const identity = validSession(await readApiResponse<Session>(await fetch('/v1/session')));
        if (!active) return;
        setSession(identity);
        if (identity.authentication !== 'local_demo') {
          sessionStorage.removeItem('pa-workshop-phone');
          return;
        }
        const catalog = await readApiResponse<{ workshops: WorkshopContact[] }>(
          await fetch('/v1/demos/week-03/assignment-scenarios'),
        );
        if (!active) return;
        if (!Array.isArray(catalog.workshops))
          throw new Error('No pudimos cargar los talleres de prueba.');
        setWorkshops(catalog.workshops);
        const restored =
          new URLSearchParams(window.location.search).get('telefono') ||
          sessionStorage.getItem('pa-workshop-phone') ||
          '';
        if (restored) {
          if (!/^9\d{8}$/.test(restored)) {
            sessionStorage.removeItem('pa-workshop-phone');
            return;
          }
          try {
            await verifyLocalWorkshop(restored);
            if (active) setPhone(restored);
          } catch (cause) {
            sessionStorage.removeItem('pa-workshop-phone');
            throw cause;
          }
        }
      } catch (cause) {
        if (active)
          setError(cause instanceof Error ? cause.message : 'No pudimos comprobar el acceso.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [reload]);

  async function enter() {
    if (busy) return;
    if (!/^9\d{8}$/.test(draft)) {
      setError('Ingresa un número peruano de nueve dígitos que comience con 9.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await verifyLocalWorkshop(draft);
      sessionStorage.setItem('pa-workshop-phone', draft);
      setPhone(draft);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos comprobar el taller.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <DelayedLoading label="Comprobando el acceso del taller…" />;
  if (session?.role === 'workshop' || phone) {
    return <MultichannelDemo view="taller" workshopPhone={phone || session?.phone} />;
  }
  const localDemo = session?.authentication === 'local_demo';
  return (
    <div className="quote-demo workshop-access-shell">
      <PeruActivaHeader homeHref="/demo" />
      <main className="workshop-access-main">
        <section className="workshop-access-card">
          <p className="quote-kicker">ACCESO DEL TALLER</p>
          <h1>{localDemo ? 'Revisa tus trabajos' : 'Acceso de talleres'}</h1>
          {localDemo ? (
            <>
              <p>Ingresa el número registrado del taller.</p>
              <label htmlFor="workshop-phone">Número de celular</label>
              <div className="workshop-phone-field">
                <span>+51</span>
                <input
                  id="workshop-phone"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={9}
                  placeholder="900 000 001"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value.replace(/\D/g, '').slice(0, 9))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void enter();
                  }}
                />
              </div>
              <button className="quote-primary" disabled={busy} onClick={() => void enter()}>
                {busy ? 'Ingresando…' : 'Ver mis pedidos'} <span>→</span>
              </button>
              <details className="workshop-demo-credentials">
                <summary>Números simulados para probar</summary>
                <ul>
                  {workshops
                    .filter((workshop) => workshop.contactPhone)
                    .map((workshop) => (
                      <li key={workshop.id}>
                        <button type="button" onClick={() => setDraft(workshop.contactPhone || '')}>
                          {workshop.displayName} · {workshop.contactPhone}
                        </button>
                      </li>
                    ))}
                </ul>
              </details>
              <small>
                Demostración local: el número identifica al taller, pero todavía no se verifica por
                WhatsApp o SMS.
              </small>
            </>
          ) : session ? (
            <>
              <p>{LOCAL_ONLY_MESSAGE}</p>
              <a className="quote-primary" href={portalHomeByRole[session.role]}>
                Volver a mi bandeja
              </a>
            </>
          ) : null}
          {error && (
            <div className="workshop-access-error" role="alert">
              <p>{error}</p>
              <button type="button" onClick={() => setReload((value) => value + 1)}>
                Reintentar
              </button>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
