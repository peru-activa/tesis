import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPoloPreview, poloCollars, poloCuts, poloSleeves } from './quotationCatalog';
import { createEmptyDraft } from './quotationFormModel';
import { QuotationRequestSummary } from './QuotationRequestSummary';

vi.mock('./RecolorableGarmentImage', () => ({
  prepareGarment: vi.fn().mockRejectedValue(new Error('Plantilla sintética sin escala')),
  RecolorableGarmentImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));
afterEach(cleanup);

describe('catalog garment previews', () => {
  it('provides a distinct existing image for every collar, cut and sleeve combination', () => {
    const sources = new Set<string>();
    for (const collar of poloCollars) {
      for (const cut of poloCuts) {
        for (const sleeve of poloSleeves) {
          const preview = findPoloPreview({
            model: collar.value,
            cut: cut.value,
            sleeve: sleeve.value,
          });
          expect(preview?.alt).toContain(collar.value.replace('Cuello', 'cuello'));
          const source = preview!.image;
          expect(sources.has(source)).toBe(false);
          sources.add(source);
          expect(existsSync(resolve('web/public', source.slice(1)))).toBe(true);
          expect(preview!.backAlt).toContain('Espalda');
          expect(existsSync(resolve('web/public', preview!.backImage.slice(1)))).toBe(true);
        }
      }
    }
    expect(sources.size).toBe(12);
  });

  it('uses the princess variant in the saved request summary and restores the standard cut', () => {
    const draft = createEmptyDraft('cliente@example.test');
    draft.garment.model = 'Cuello camisero';
    draft.garment.cut = 'princesa_dama';
    draft.garment.sleeve = 'manga_larga';
    const { rerender } = render(<QuotationRequestSummary draft={draft} />);
    expect(screen.getByRole('img', { name: /de corte princesa para dama/ })).toHaveProperty(
      'src',
      expect.stringContaining('polo-cuello-camisero-princesa-dama-manga-larga-referencial.webp'),
    );
    draft.garment.cut = 'estandar';
    rerender(<QuotationRequestSummary draft={draft} />);
    expect(screen.queryByRole('img', { name: /de corte princesa para dama/ })).toBeNull();
    expect(screen.getByRole('img', { name: /de manga larga con cuello camisero/ })).toHaveProperty(
      'src',
      expect.stringContaining('polo-cuello-camisero-manga-larga-referencial.webp'),
    );
    expect(findPoloPreview({ model: 'Modelo a medida', cut: 'princesa_dama' })).toBeUndefined();
  });
});
