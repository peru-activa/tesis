import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { jsonSha256 } from '../src/infrastructure/json-integrity.js';
import { after, before, test } from 'node:test';
import { createServer, type Server } from 'node:http';
import { once } from 'node:events';
import { createApp } from '../src/app.js';
import { CustomerRegistration } from '../src/application/customer-registration.js';
import {
  customerRegistrationSchema,
  thesisConsentNotice,
} from '../src/domain/customer-registration.js';
import { researchConsentDocument } from '../src/domain/research-consent.js';
import { createCustomerProfileStore } from '../src/infrastructure/customer-profile-store.js';
import { MemoryQuotationStore } from '../src/infrastructure/quotation-store.js';
import { MemoryOrderStore } from '../src/data/order-store.js';
import { MemoryWorkshopStore } from '../src/data/workshop-store.js';

const oldEnvironment = {
  NODE_ENV: process.env.NODE_ENV,
  DATABASE_URL: process.env.DATABASE_URL,
  LOCAL_CUSTOMER_REGISTRATION: process.env.LOCAL_CUSTOMER_REGISTRATION,
};
let server: Server;
let origin: string;
const draft = {
  fullName: 'Participante <prueba>',
  ruc: '20000000001',
  businessName: 'Empresa de prueba',
  position: 'Compras',
  thesisConsentVersion: thesisConsentNotice.version,
};

before(async () => {
  process.env.NODE_ENV = 'development';
  delete process.env.DATABASE_URL;
  process.env.LOCAL_CUSTOMER_REGISTRATION = 'true';
  server = createServer(
    createApp({
      orderStore: new MemoryOrderStore(),
      quotationStore: new MemoryQuotationStore(),
      workshopStore: new MemoryWorkshopStore([]),
    }),
  );
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  origin = 'http://127.0.0.1:' + address.port;
});

after(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  for (const [key, value] of Object.entries(oldEnvironment)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test('requiere aceptación expresa y entrega una copia íntegra solo a su cuenta', async () => {
  const headers = {
    'content-type': 'application/json',
    'x-demo-client-email': 'participante@example.test',
  };
  for (const version of [null, false, undefined, 'version-anterior']) {
    const response = await fetch(origin + '/v1/customer-registration', {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...draft, thesisConsentVersion: version }),
    });
    assert.equal(response.status, 400);
  }
  const document = await fetch(origin + '/v1/consent-documents/' + thesisConsentNotice.version);
  assert.equal(document.status, 200);
  assert.match(document.headers.get('cache-control') ?? '', /no-transform/);
  const documentText = await document.text();
  assert.ok(documentText.includes('navarro.kevin@pucp.edu.pe'));
  assert.ok(documentText.includes('etica.investigacion@pucp.edu.pe'));
  assert.ok(!documentText.includes('[email protected]'));
  assert.equal(
    (await fetch(origin + '/v1/customer-registration/consent', { headers })).status,
    404,
  );
  const accepted = await fetch(origin + '/v1/customer-registration', {
    method: 'POST',
    headers,
    body: JSON.stringify(draft),
  });
  assert.equal(accepted.status, 201);
  const copy = await fetch(origin + '/v1/customer-registration/consent?download=1', { headers });
  assert.equal(copy.status, 200);
  assert.match(copy.headers.get('content-disposition') ?? '', /attachment/);
  assert.match(copy.headers.get('cache-control') ?? '', /no-store/);
  assert.match(copy.headers.get('cache-control') ?? '', /no-transform/);
  const html = await copy.text();
  assert.ok(html.includes('Participante &lt;prueba&gt;'));
  assert.ok(html.includes('participante@example.test'));
  assert.ok(html.includes(jsonSha256(researchConsentDocument)));
  for (const page of researchConsentDocument.pages)
    for (const section of page.sections) assert.ok(html.includes(section.title));
  assert.equal(
    (
      await fetch(origin + '/v1/customer-registration/consent', {
        headers: { 'x-demo-client-email': 'otra-cuenta@example.test' },
      })
    ).status,
    404,
  );
});

test('la huella JSON conserva el significado cuando PostgreSQL reordena las claves', () => {
  const expected = createHash('sha256').update('{"a":1,"b":{"x":2,"y":3}}').digest('hex');
  assert.equal(jsonSha256({ b: { y: 3, x: 2 }, a: 1 }), expected);
  assert.notEqual(jsonSha256([1, 2]), jsonSha256([2, 1]));
});

test('solicita la versión ampliada y conserva intacta la aceptación anterior', async () => {
  const profiles = createCustomerProfileStore();
  const identity = {
    subject: 'cuenta-de-prueba',
    email: 'historial@example.test',
    authentication: 'cloudflare_access' as const,
    role: 'client' as const,
  };
  const notice = { ...thesisConsentNotice, version: '2', purpose: 'Texto anterior conservado.' };
  const previous = {
    ...draft,
    thesisConsent: { acceptedAt: '2026-11-10T15:00:00.000Z', notice },
  };
  await profiles.register(identity.subject, identity.email, previous);
  const service = new CustomerRegistration(profiles, new MemoryQuotationStore(), false);
  assert.equal((await service.status(identity)).required, true);
  assert.equal(await service.register(identity, customerRegistrationSchema.parse(draft)), true);
  assert.equal((await service.status(identity)).required, false);
  const stored = await profiles.get(identity.subject, identity.email);
  assert.deepEqual(stored?.consentHistory?.[0], {
    fullName: draft.fullName,
    consent: previous.thesisConsent,
  });
  assert.equal(stored?.thesisConsent?.acceptedBy?.email, identity.email);
  assert.equal(stored?.thesisConsent?.method, 'verified_email_checkbox');
  const timestamp = stored?.thesisConsent?.acceptedAt;
  assert.equal(await service.register(identity, customerRegistrationSchema.parse(draft)), false);
  assert.equal(
    (await profiles.get(identity.subject, identity.email))?.thesisConsent?.acceptedAt,
    timestamp,
  );
});
