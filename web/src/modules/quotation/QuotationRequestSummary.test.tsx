import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuotationRequestSummary } from './QuotationRequestSummary';
import { createEmptyDraft } from './quotationFormModel';

vi.mock('./RecolorableGarmentImage', () => ({
  prepareGarment: vi.fn().mockRejectedValue(new Error('Plantilla sintética sin escala')),
  RecolorableGarmentImage: ({ src, alt, color }: { src: string; alt: string; color: string }) => (
    <img src={src} alt={alt} data-color={color} />
  ),
}));
afterEach(cleanup);

const logo = {
  name: 'frente.png',
  mediaType: 'image/png' as const,
  sizeBytes: 120,
  dataUrl: 'data:image/png;base64,AA==',
};
function configuredDraft() {
  const draft = createEmptyDraft('2099-12-15');
  Object.assign(draft.garment, {
    model: 'Cuello camisero',
    cut: 'princesa_dama',
    sleeve: 'manga_larga',
    color: '#FFFFFF',
    customization: 'embroidery',
    applicationCount: 2,
    designApplications: [
      {
        attachment: { ...logo, preview: { backgroundMode: 'auto', inkColor: '#ffffff' } },
        placement: 'Frente · posición 30%, 35% · tamaño 16%',
        widthCm: 8,
        heightCm: 4,
      },
      {
        attachment: { ...logo, name: 'espalda.png' },
        placement: 'Espalda · posición 60%, 45% · tamaño 24%',
        widthCm: 12,
        heightCm: 10,
      },
    ],
  });
  return draft;
}

describe('QuotationRequestSummary', () => {
  it('reabre cada manga con su giro, lado y tamaño independientes', async () => {
    const user = userEvent.setup();
    const draft = configuredDraft();
    draft.garment.designApplications![0].placement =
      'Manga izquierda · posición 50%, 40% · tamaño 16% · giro 90°';
    draft.garment.designApplications![1].placement =
      'Manga derecha · posición 60%, 45% · tamaño 24% · giro 270°';
    const before = structuredClone(draft);
    render(<QuotationRequestSummary draft={JSON.parse(JSON.stringify(draft))} />);
    await user.click(screen.getByRole('button', { name: 'Manga izquierda' }));
    const left = screen.getByRole('img', { name: 'Diseño adjunto: frente.png' });
    expect(left.parentElement?.style.transform).toBe('translate(-50%, -50%) rotate(90deg)');
    expect(screen.queryByRole('img', { name: 'Diseño adjunto: espalda.png' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Manga derecha' }));
    const right = screen.getByRole('img', { name: 'Diseño adjunto: espalda.png' });
    expect(right.parentElement?.style.transform).toBe('translate(-50%, -50%) rotate(270deg)');
    expect(right.parentElement?.style.width).toBe('24%');
    expect(draft).toEqual(before);
  });

  it('reconstruye el color, modelo, posición y medidas en la revisión y al reabrir la solicitud', async () => {
    const user = userEvent.setup();
    const draft = configuredDraft();
    const { unmount } = render(<QuotationRequestSummary draft={draft} />);
    expect(screen.getByRole('img', { name: /de corte princesa/ }).getAttribute('data-color')).toBe(
      '#ffffff',
    );
    expect(screen.getByText('Color del Logo 1: #FFFFFF')).toBeTruthy();
    const front = screen.getByRole('img', { name: 'Diseño adjunto: frente.png' });
    expect(front.parentElement?.style.cssText).toBe('left: 30%; top: 35%; width: 16%; height: 8%;');
    expect(screen.queryByRole('img', { name: 'Diseño adjunto: espalda.png' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Espalda' }));
    const backPhoto = screen.getByRole('img', { name: /Espalda de polo/ });
    expect(backPhoto.getAttribute('src')).toContain(
      'camisero-princesa-dama-manga-larga-referencial-espalda.webp',
    );
    expect(backPhoto.getAttribute('data-color')).toBe('#ffffff');
    expect(screen.queryByText('Silueta referencial de la prenda')).toBeNull();
    const back = screen.getByRole('img', { name: 'Diseño adjunto: espalda.png' });
    expect(back.parentElement?.style.cssText).toBe('left: 60%; top: 45%; width: 24%; height: 20%;');
    expect(screen.queryByRole('img', { name: 'Diseño adjunto: frente.png' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Cambiar tamaño|Eliminar|Agregar/ })).toBeNull();
    expect(screen.queryByRole('group', { name: /Logo movible/ })).toBeNull();
    unmount();
    render(<QuotationRequestSummary draft={JSON.parse(JSON.stringify(draft))} />);
    expect(
      screen.getByRole('img', { name: 'Diseño adjunto: frente.png' }).getAttribute('src'),
    ).not.toBe(logo.dataUrl);
    expect(draft.garment.designApplications?.[0].attachment?.dataUrl).toBe(logo.dataUrl);
  });

  it('mantiene independientes las prendas, los colores y los logos simultáneos', async () => {
    const user = userEvent.setup();
    const draft = configuredDraft();
    draft.garment.designApplications![1].placement = 'Frente · posición 70%, 40% · tamaño 24%';
    draft.additionalGarments = [{ ...draft.garment, color: 'Rojo', designApplications: [] }];
    render(<QuotationRequestSummary draft={draft} />);
    const previews = screen.getAllByRole('region', { name: /Vista previa:/ });
    expect(within(previews[0]).getAllByRole('img', { name: /Diseño adjunto/ })).toHaveLength(2);
    expect(within(previews[1]).queryByRole('img', { name: /Diseño adjunto/ })).toBeNull();
    expect(
      within(previews[1])
        .getByRole('img', { name: /de corte princesa/ })
        .getAttribute('data-color'),
    ).toBe('#C5212E');
    await user.click(within(previews[0]).getByRole('button', { name: 'Espalda' }));
    expect(
      within(previews[1]).getByRole('button', { name: 'Frente' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('recupera un adjunto anterior y distingue los PDF de las imágenes', () => {
    const draft = configuredDraft();
    draft.garment.designApplications = [];
    draft.garment.designAttachment = logo;
    draft.garment.customizationDetails = 'Frente · posición 45%, 55% · tamaño 20%';
    const { rerender } = render(<QuotationRequestSummary draft={draft} />);
    expect(
      screen.getByRole('img', { name: 'Diseño adjunto: frente.png' }).parentElement?.style.left,
    ).toBe('45%');
    draft.garment.designAttachment = { ...logo, name: 'logo.pdf', mediaType: 'application/pdf' };
    rerender(<QuotationRequestSummary draft={draft} />);
    expect(screen.queryByRole('img', { name: /Diseño adjunto/ })).toBeNull();
    expect(screen.getByText(/Los archivos PDF se incluyen/)).toBeTruthy();
    expect(screen.getByText('Adjunto: logo.pdf')).toBeTruthy();
  });
});
