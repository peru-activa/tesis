import { beforeEach, describe, expect, it } from 'vitest';
import { createEmptyDraft } from './quotationFormModel';
import {
  clearQuotationSession,
  loadQuotationSession,
  saveQuotationSession,
} from './quotationSession';

beforeEach(() => sessionStorage.clear());

describe('sesión del formulario de cotización', () => {
  it('recupera el paso y el borrador después de un refresco', () => {
    const draft = createEmptyDraft('2026-09-30');
    draft.garment.color = '#C5212E';

    saveQuotationSession(sessionStorage, { draft, hasGarments: true, step: 2 });

    expect(loadQuotationSession(sessionStorage)).toEqual({ draft, hasGarments: true, step: 2 });
  });

  it('elimina la sesión cuando la solicitud termina', () => {
    saveQuotationSession(sessionStorage, {
      draft: createEmptyDraft('2026-09-30'),
      hasGarments: false,
      step: 1,
    });

    clearQuotationSession(sessionStorage);

    expect(loadQuotationSession(sessionStorage)).toBeUndefined();
  });

  it('ignora contenido corrupto', () => {
    sessionStorage.setItem('peru-activa:quotation-draft:v1', '{incompleto');

    expect(loadQuotationSession(sessionStorage)).toBeUndefined();
  });
});
