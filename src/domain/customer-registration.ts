import { z } from 'zod';
import { researchConsentDocument, type ResearchConsentDocument } from './research-consent.js';

export const thesisConsentNotice = {
  version: researchConsentDocument.version,
  documentUrl: '/v1/consent-documents/' + researchConsentDocument.version,
  purpose:
    'Te invitamos al piloto de tesis de Kevin Antonio Navarro Carrera, de la PUCP. La sesión dura hasta 30 minutos y evalúa el registro y la asignación de pedidos de polos.',
  publication:
    'En la tesis se usarán códigos para los participantes y se omitirán nombres, correos, RUC y otros datos que permitan identificarlos.',
  choice:
    'Participar es voluntario. Puedes hacer preguntas y retirarte sin sanciones ni perjuicio comercial. Consulta los detalles antes de decidir.',
  acceptance:
    'He leído y comprendido el consentimiento informado y acepto participar voluntariamente en el estudio.',
} as const;

export const customerRegistrationSchema = z.strictObject({
  fullName: z.string().trim().min(2, 'Ingresa tu nombre completo.').max(100),
  ruc: z
    .string()
    .trim()
    .regex(/^\d{11}$/, 'El RUC debe tener 11 dígitos.'),
  businessName: z.string().trim().min(2, 'Ingresa la razón social.').max(140),
  position: z.string().trim().min(2, 'Ingresa tu cargo.').max(100),
  thesisConsentVersion: z.literal(thesisConsentNotice.version, {
    error: 'Para continuar con el registro del piloto, acepta el uso de tus datos en la tesis.',
  }),
});

export type CustomerRegistrationDraft = z.infer<typeof customerRegistrationSchema>;

export interface RecordedThesisConsent {
  acceptedAt: string;
  notice: {
    version: string;
    purpose: string;
    publication: string;
    choice: string;
    acceptance: string;
    documentUrl?: string;
  };
  document?: ResearchConsentDocument;
  documentSha256?: string;
  acceptedBy?: { subject: string; email: string; fullName: string };
  method?: 'verified_email_checkbox';
}

export interface CustomerProfile {
  fullName: string;
  ruc: string;
  businessName: string;
  position: string;
  thesisConsent: RecordedThesisConsent | null;
  consentHistory?: Array<{ fullName: string; consent: RecordedThesisConsent }>;
}
