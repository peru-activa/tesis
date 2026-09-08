import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';

const SESSION_KEY = 'peru-activa:quotation-draft:v1';

export interface QuotationSession {
  draft: QuotationRequestDraft;
  hasGarments: boolean;
  step: number;
}

export function loadQuotationSession(storage: Storage): QuotationSession | undefined {
  try {
    const value = JSON.parse(storage.getItem(SESSION_KEY) ?? 'null') as Partial<QuotationSession>;
    if (!value || typeof value !== 'object') return undefined;
    if (!value.draft || typeof value.hasGarments !== 'boolean' || !Number.isInteger(value.step)) {
      return undefined;
    }
    return {
      draft: value.draft,
      hasGarments: value.hasGarments,
      step: Math.max(1, Number(value.step)),
    };
  } catch {
    return undefined;
  }
}

export function saveQuotationSession(storage: Storage, session: QuotationSession): void {
  try {
    storage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Los navegadores pueden limitar sessionStorage. Conservamos el formulario
    // sin adjuntos pesados antes de renunciar a la recuperación de la sesión.
    try {
      storage.setItem(
        SESSION_KEY,
        JSON.stringify({
          ...session,
          draft: {
            ...session.draft,
            garment: {
              ...session.draft.garment,
              designAttachment: undefined,
              designApplications: session.draft.garment.designApplications?.map((application) => ({
                ...application,
                attachment: undefined,
              })),
            },
            additionalGarments: session.draft.additionalGarments.map((garment) => ({
              ...garment,
              designAttachment: undefined,
              designApplications: garment.designApplications?.map((application) => ({
                ...application,
                attachment: undefined,
              })),
            })),
          },
        }),
      );
    } catch {
      // El formulario sigue funcionando aunque el almacenamiento esté bloqueado.
    }
  }
}

export function clearQuotationSession(storage: Storage): void {
  storage.removeItem(SESSION_KEY);
}
