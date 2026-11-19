import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { thesisConsentNotice } from '../../../../src/domain/customer-registration';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { PeruActivaHeader } from '../../components/PeruActivaHeader';
import { DelayedLoading } from '../../components/DelayedLoading';
import { InputField } from '../quotation/QuoteUi';

type CustomerDetails = Pick<QuotationRequestDraft['customer'], 'contactName' | 'businessName'>;
type RegistrationStatus = { email: string } & (
  | { required: true; notice: typeof thesisConsentNotice }
  | { required: false; customer?: CustomerDetails; consentCopyUrl?: string }
);

async function loadRegistration(signal?: AbortSignal): Promise<RegistrationStatus> {
  const response = await fetch('/v1/customer-registration', signal ? { signal } : {});
  if (!response.ok) throw new Error('No pudimos comprobar el registro de tu cuenta.');
  return response.json();
}

export function CustomerRegistrationGate({
  children,
}: {
  children: (session: Extract<RegistrationStatus, { required: false }>) => ReactNode;
}) {
  const [status, setStatus] = useState<RegistrationStatus>();
  const [loadError, setLoadError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [consentAccepted, setConsentAccepted] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void loadRegistration(controller.signal)
      .then(setStatus)
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setLoadError(cause instanceof Error ? cause.message : 'No pudimos cargar tu cuenta.');
      });
    return () => controller.abort();
  }, []);

  async function register(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!status?.required || saving) return;
    const form = new FormData(event.currentTarget);
    if (!form.has('thesisConsent')) {
      setFormError('Acepta el uso de tus datos en la tesis para continuar.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      const response = await fetch('/v1/customer-registration', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fullName: form.get('fullName'),
          ruc: form.get('ruc'),
          businessName: form.get('businessName'),
          position: form.get('position'),
          thesisConsentVersion: status.notice.version,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload.message || 'No pudimos guardar el registro.');
      }
      setStatus(await loadRegistration());
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : 'No pudimos guardar el registro.');
    } finally {
      setSaving(false);
    }
  }

  if (status && !status.required) return children(status);

  if (!status && !loadError) {
    return (
      <div className="quote-demo role-landing-shell">
        <PeruActivaHeader />
        <DelayedLoading label="Cargando tu cuenta…" />
      </div>
    );
  }

  return (
    <div className="quote-demo role-landing-shell pb-8">
      <PeruActivaHeader />
      <main className="role-landing-card">
        <h1>{status?.required ? 'Registra tu cuenta' : 'No pudimos ingresar'}</h1>
        {loadError && <p role="alert">{loadError}</p>}
        {status?.required && (
          <>
            <p className="break-all text-sm">{status.email}</p>
            <form onSubmit={register}>
              <p className="mt-4 text-sm">
                Usaremos estos datos para identificar tu cuenta y gestionar tus pedidos.
              </p>
              <fieldset disabled={saving}>
                <InputField label="Nombre completo">
                  <input
                    name="fullName"
                    autoComplete="name"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </InputField>
                <InputField label="RUC">
                  <input
                    name="ruc"
                    inputMode="numeric"
                    required
                    pattern="[0-9]{11}"
                    maxLength={11}
                    title="11 dígitos"
                  />
                </InputField>
                <InputField label="Razón social">
                  <input
                    name="businessName"
                    autoComplete="organization"
                    required
                    minLength={2}
                    maxLength={140}
                  />
                </InputField>
                <InputField label="Cargo">
                  <input
                    name="position"
                    autoComplete="organization-title"
                    required
                    minLength={2}
                    maxLength={100}
                  />
                </InputField>
                <section className="mt-6 space-y-2 rounded-md bg-slate-50 p-4 text-sm leading-relaxed">
                  <h2 className="font-bold">Participación en la tesis</h2>
                  <div id="thesis-consent-notice" className="space-y-2">
                    <p>{status.notice.purpose}</p>
                    <p>{status.notice.choice}</p>
                    <a
                      className="font-semibold underline"
                      href={status.notice.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Leer el consentimiento completo y obtener una copia
                    </a>
                  </div>
                  <label className="flex items-start gap-3 font-semibold">
                    <input
                      className="mt-1 size-4 shrink-0"
                      type="checkbox"
                      name="thesisConsent"
                      required
                      checked={consentAccepted}
                      onChange={(event) => setConsentAccepted(event.target.checked)}
                      aria-describedby="thesis-consent-notice"
                    />
                    <span>{status.notice.acceptance}</span>
                  </label>
                </section>
                {formError && (
                  <p className="customer-orders-error mt-4" role="alert">
                    {formError}
                  </p>
                )}
                <button
                  className="quote-primary mt-6"
                  type="submit"
                  disabled={saving || !consentAccepted}
                >
                  {saving ? 'Guardando…' : 'Guardar y continuar'}
                </button>
              </fieldset>
            </form>
          </>
        )}
      </main>
    </div>
  );
}
