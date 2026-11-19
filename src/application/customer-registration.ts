import {
  thesisConsentNotice,
  type CustomerProfile,
  type CustomerRegistrationDraft,
} from '../domain/customer-registration.js';
import { jsonSha256 } from '../infrastructure/json-integrity.js';
import { researchConsentDocument } from '../domain/research-consent.js';
import type { AuthenticatedIdentity } from '../domain/identity.js';
import type { CustomerProfileStore } from '../infrastructure/customer-profile-store.js';
import type { QuotationStore } from '../infrastructure/quotation-store.js';

export class CustomerRegistration {
  constructor(
    private readonly profiles: CustomerProfileStore,
    private readonly quotations: QuotationStore,
    private readonly localPreview: boolean,
  ) {}

  isEnabled(
    identity: AuthenticatedIdentity,
  ): identity is AuthenticatedIdentity & { email: string } {
    return Boolean(
      identity.role === 'client' &&
      identity.email &&
      (identity.authentication === 'cloudflare_access' || this.localPreview),
    );
  }

  async status(identity: AuthenticatedIdentity) {
    if (!this.isEnabled(identity)) return { required: false };
    const { subject, email } = identity;
    const profile = await this.profiles.get(subject, email);
    if (profile) {
      if (profile.thesisConsent?.notice.version !== thesisConsentNotice.version)
        return { required: true, notice: thesisConsentNotice };
      return {
        required: false,
        customer: { contactName: profile.fullName, businessName: profile.businessName },
        consentCopyUrl: '/v1/customer-registration/consent',
      };
    }
    const existing = await this.quotations.hasOwnedByEmail(subject, email);
    return existing ? { required: false } : { required: true, notice: thesisConsentNotice };
  }

  async register(
    identity: AuthenticatedIdentity & { email: string },
    draft: CustomerRegistrationDraft,
  ) {
    const { thesisConsentVersion: _version, ...details } = draft;
    const profile: CustomerProfile = {
      ...details,
      thesisConsent: {
        acceptedAt: new Date().toISOString(),
        notice: thesisConsentNotice,
        document: researchConsentDocument,
        documentSha256: jsonSha256(researchConsentDocument),
        acceptedBy: {
          subject: identity.subject,
          email: identity.email,
          fullName: details.fullName,
        },
        method: 'verified_email_checkbox',
      },
    };
    return this.profiles.register(identity.subject, identity.email, profile);
  }

  async consent(identity: AuthenticatedIdentity) {
    if (!this.isEnabled(identity)) return undefined;
    return this.profiles.get(identity.subject, identity.email);
  }
}
