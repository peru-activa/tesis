import { Pool } from 'pg';
import { ensurePostgresSchema } from '../data/postgres-schema.js';
import type { CustomerProfile } from '../domain/customer-registration.js';

export interface CustomerProfileStore {
  get(subject: string, email: string): Promise<CustomerProfile | undefined>;
  register(subject: string, email: string, profile: CustomerProfile): Promise<boolean>;
}

class MemoryCustomerProfileStore implements CustomerProfileStore {
  private readonly profiles = new Map<string, CustomerProfile>();

  async get(subject: string, email: string) {
    return this.profiles.get(JSON.stringify([subject, email]));
  }

  async register(subject: string, email: string, profile: CustomerProfile) {
    const key = JSON.stringify([subject, email]);
    const previous = this.profiles.get(key);
    if (previous?.thesisConsent?.notice.version === profile.thesisConsent?.notice.version)
      return false;
    this.profiles.set(key, {
      ...profile,
      consentHistory: [
        ...(previous?.consentHistory ?? []),
        ...(previous?.thesisConsent
          ? [{ fullName: previous.fullName, consent: previous.thesisConsent }]
          : []),
      ],
    });
    return true;
  }
}

class PostgresCustomerProfileStore implements CustomerProfileStore {
  constructor(private readonly pool: Pool) {}

  async get(subject: string, email: string) {
    await ensurePostgresSchema(this.pool);
    const result = await this.pool.query<{ profile: CustomerProfile }>(
      'SELECT profile FROM customer_profiles WHERE subject = $1 AND email = $2',
      [subject, email],
    );
    return result.rows[0]?.profile;
  }

  async register(subject: string, email: string, profile: CustomerProfile) {
    await ensurePostgresSchema(this.pool);
    const result = await this.pool.query(
      `INSERT INTO customer_profiles (subject, email, profile)
       VALUES ($1, $2, $3)
       ON CONFLICT (subject, email) DO UPDATE SET profile =
         EXCLUDED.profile || jsonb_build_object(
           'consentHistory', coalesce(customer_profiles.profile->'consentHistory', '[]'::jsonb)
             || CASE WHEN jsonb_typeof(customer_profiles.profile->'thesisConsent') = 'object'
                 THEN jsonb_build_array(jsonb_build_object(
                   'fullName', customer_profiles.profile->'fullName',
                   'consent', customer_profiles.profile->'thesisConsent'))
                 ELSE '[]'::jsonb END)
       WHERE customer_profiles.profile->'thesisConsent'->'notice'->>'version'
         IS DISTINCT FROM EXCLUDED.profile->'thesisConsent'->'notice'->>'version'`,
      [subject, email, profile],
    );
    return result.rowCount === 1;
  }
}

export function createCustomerProfileStore(): CustomerProfileStore {
  const connectionString = process.env.DATABASE_URL;
  return connectionString
    ? new PostgresCustomerProfileStore(new Pool({ connectionString }))
    : new MemoryCustomerProfileStore();
}
