import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseEmailList, roleForVerifiedEmail } from '../src/infrastructure/access-identity.js';

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
