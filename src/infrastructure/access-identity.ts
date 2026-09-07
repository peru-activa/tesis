import type { Request } from 'express';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { week03DeclaredWorkshops } from '../data/week-03-assignment-scenarios.js';
import {
  AccessAuthorizationError,
  type AuthenticatedIdentity,
  type UserRole,
} from '../domain/identity.js';

let cachedTeamDomain = '';
let cachedJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

function requiredSetting(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new AccessAuthorizationError(
      'configuration_error',
      `Falta configurar ${name} para validar Cloudflare Access.`,
    );
  }
  return value;
}

function normalizedEmail(value: unknown): string {
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

export function parseEmailList(...values: Array<string | undefined>): string[] {
  return [
    ...new Set(
      values
        .flatMap((value) => value?.split(/[;,\s]+/) ?? [])
        .map(normalizedEmail)
        .filter(Boolean),
    ),
  ];
}

export function roleForVerifiedEmail(email: string, peruActivaEmails: string[]): UserRole {
  return peruActivaEmails.includes(normalizedEmail(email)) ? 'peru_activa' : 'client';
}

function configuredPeruActivaEmails(): string[] {
  const emails = parseEmailList(process.env.PERU_ACTIVA_EMAILS, process.env.PERU_ACTIVA_EMAIL);
  if (emails.length === 0) {
    throw new AccessAuthorizationError(
      'configuration_error',
      'Falta configurar PERU_ACTIVA_EMAILS o PERU_ACTIVA_EMAIL.',
    );
  }
  return emails;
}

function normalizedTeamDomain(): string {
  return requiredSetting('CF_ACCESS_TEAM_DOMAIN')
    .replace(/^https?:\/\//, '')
    .replace(/\/$/, '');
}

function jwksFor(teamDomain: string) {
  if (!cachedJwks || cachedTeamDomain !== teamDomain) {
    cachedTeamDomain = teamDomain;
    cachedJwks = createRemoteJWKSet(new URL(`https://${teamDomain}/cdn-cgi/access/certs`));
  }
  return cachedJwks;
}

function localIdentity(request: Request): AuthenticatedIdentity {
  const workshopPhone = request.get('x-demo-workshop-phone')?.trim();
  if (workshopPhone) {
    const workshop = week03DeclaredWorkshops.find(
      (candidate) => candidate.contactPhone === workshopPhone,
    );
    if (!workshop) {
      throw new AccessAuthorizationError(
        'unauthenticated',
        'El número no corresponde a un taller declarado.',
      );
    }
    return {
      subject: `local-workshop:${workshop.id}`,
      role: 'workshop',
      authentication: 'local_demo',
      phone: workshopPhone,
      workshopId: workshop.id,
    };
  }

  if (request.get('x-demo-actor') === 'peru_activa') {
    const email = normalizedEmail(
      process.env.LOCAL_PERU_ACTIVA_EMAIL ||
        process.env.PERU_ACTIVA_EMAIL ||
        'operaciones@example.test',
    );
    if (!email) {
      throw new AccessAuthorizationError(
        'configuration_error',
        'Falta configurar LOCAL_PERU_ACTIVA_EMAIL.',
      );
    }
    return {
      subject: `local-email:${email}`,
      role: 'peru_activa',
      authentication: 'local_demo',
      email,
    };
  }

  const email = normalizedEmail(
    request.get('x-demo-client-email') || process.env.LOCAL_CLIENT_EMAIL || 'cliente@example.test',
  );
  if (!email) {
    throw new AccessAuthorizationError(
      'configuration_error',
      'Falta configurar LOCAL_CLIENT_EMAIL.',
    );
  }
  return {
    subject: `local-email:${email}`,
    role: 'client',
    authentication: 'local_demo',
    email,
  };
}

async function cloudflareIdentity(request: Request): Promise<AuthenticatedIdentity> {
  const audience = requiredSetting('CF_ACCESS_AUD');
  const teamDomain = normalizedTeamDomain();
  const assertion = request.get('cf-access-jwt-assertion')?.trim();
  if (!assertion) {
    throw new AccessAuthorizationError(
      'unauthenticated',
      'Falta la identidad de Cloudflare Access.',
    );
  }

  try {
    const { payload } = await jwtVerify(assertion, jwksFor(teamDomain), {
      issuer: `https://${teamDomain}`,
      audience,
    });
    const email = normalizedEmail(payload.email);
    if (!email || typeof payload.sub !== 'string' || !payload.sub) {
      throw new AccessAuthorizationError(
        'unauthenticated',
        'Cloudflare Access no entregó una identidad de correo válida.',
      );
    }
    return {
      subject: `cloudflare:${payload.sub}`,
      role: roleForVerifiedEmail(email, configuredPeruActivaEmails()),
      authentication: 'cloudflare_access',
      email,
    };
  } catch (error) {
    if (error instanceof AccessAuthorizationError) throw error;
    throw new AccessAuthorizationError(
      'unauthenticated',
      'La sesión de Cloudflare Access no es válida.',
    );
  }
}

export async function resolveIdentity(request: Request): Promise<AuthenticatedIdentity> {
  if (process.env.NODE_ENV === 'production' || request.get('cf-access-jwt-assertion')?.trim()) {
    return cloudflareIdentity(request);
  }
  return localIdentity(request);
}
