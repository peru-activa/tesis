import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertCloudflareAccessConfiguration,
  parseEmailList,
  roleForVerifiedEmail,
} from '../src/infrastructure/access-identity.js';

describe('clasificación de correos verificados', () => {
  it('normaliza y combina los correos internos configurados', () => {
    assert.deepEqual(
      parseEmailList('a20203167@pucp.edu.pe, navarro.kevin@pucp.edu.pe', 'PERUACTIVA13@GMAIL.COM'),
      ['a20203167@pucp.edu.pe', 'navarro.kevin@pucp.edu.pe', 'peruactiva13@gmail.com'],
    );
  });

  it('reserva los correos internos y admite cualquier otro como cliente', () => {
    const staff = parseEmailList(
      'a20203167@pucp.edu.pe,navarro.kevin@pucp.edu.pe,peruactiva13@gmail.com',
    );

    assert.equal(roleForVerifiedEmail('navarro.kevin@pucp.edu.pe', staff), 'peru_activa');
    assert.equal(roleForVerifiedEmail('CLIENTE.NUEVO@EJEMPLO.COM', staff), 'client');
    assert.equal(roleForVerifiedEmail('otra.persona@gmail.com', staff), 'client');
  });
});

describe('configuracion de Cloudflare Access', () => {
  it('no exige variables de Access durante el desarrollo local', () => {
    assert.doesNotThrow(() => assertCloudflareAccessConfiguration({ NODE_ENV: 'development' }));
  });

  it('impide iniciar el entorno demo cuando falta una variable obligatoria', () => {
    assert.throws(
      () =>
        assertCloudflareAccessConfiguration({
          NODE_ENV: 'demo',
          CF_ACCESS_TEAM_DOMAIN: 'opentextil.cloudflareaccess.com',
          PERU_ACTIVA_EMAILS: 'operaciones@example.test',
        }),
      /Falta configurar CF_ACCESS_AUD/,
    );
  });

  it('acepta la configuracion completa del entorno demo', () => {
    assert.doesNotThrow(() =>
      assertCloudflareAccessConfiguration({
        NODE_ENV: 'demo',
        CF_ACCESS_TEAM_DOMAIN: 'opentextil.cloudflareaccess.com',
        CF_ACCESS_AUD: 'audience-value-for-tests',
        PERU_ACTIVA_EMAILS: 'operaciones@example.test',
      }),
    );
  });
});
