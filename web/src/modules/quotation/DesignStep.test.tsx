import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FormProvider, useForm, useWatch } from 'react-hook-form';
import { beforeAll, afterEach, describe, expect, it, vi } from 'vitest';
import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';
import { DesignStep } from './QuotationDetailSteps';
import { createEmptyDraft } from './quotationFormModel';

vi.mock('./RecolorableGarmentImage', () => ({
  prepareGarment: vi.fn().mockRejectedValue(new Error('Plantilla sintética sin escala')),
  RecolorableGarmentImage: ({ src, alt }: { src: string; alt: string }) => (
    <img src={src} alt={alt} />
  ),
}));
vi.mock('./designArtwork', () => ({
  artworkSettings: () => ({ backgroundMode: 'auto' }),
  prepareDesignArtwork: vi.fn().mockResolvedValue({
    source: 'data:image/png;base64,cropped',
    background: 'removed',
    aspectRatio: 1.25,
    geometry: { width: 100, height: 80, content: { left: 40, top: 30, width: 20, height: 10 } },
  }),
}));
vi.mock('./designText', async (importOriginal) => {
  const original = await importOriginal<typeof import('./designText')>();
  return {
    ...original,
    loadDesignFont: vi.fn().mockResolvedValue(undefined),
    createTextAttachment: vi.fn(
      async (text: Parameters<typeof original.createTextAttachment>[0]) => ({
        aspectRatio: 3,
        attachment: {
          name: 'texto-personalizado.png',
          mediaType: 'image/png',
          sizeBytes: 20,
          dataUrl: 'data:image/png;base64,AAAA',
          text,
          preview: { backgroundMode: 'keep' },
        },
      }),
    ),
  };
});
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
});
afterEach(cleanup);

function Harness({ draft = createEmptyDraft('2099-12-15') }: { draft?: QuotationRequestDraft }) {
  const form = useForm<QuotationRequestDraft>({ defaultValues: draft });
  const current = useWatch({ control: form.control });
  return (
    <FormProvider {...form}>
      <DesignStep path="garment" />
      <button type="button" onClick={() => form.setValue('garment.color', '#234567')}>
        Cambiar color de prueba
      </button>
      <output data-testid="draft">{JSON.stringify(current)}</output>
    </FormProvider>
  );
}
function applications() {
  return (JSON.parse(screen.getByTestId('draft').textContent!) as QuotationRequestDraft).garment
    .designApplications!;
}
function upload(container: HTMLElement, name: string) {
  fireEvent.change(container.querySelector('.quote-design-hidden-inputs input[type="file"]')!, {
    target: { files: [new File(['logo'], name, { type: 'image/png' })] },
  });
}

describe('DesignStep surfaces', () => {
  it.each([
    ['Manga izquierda', 'sleeve-left', 'manga_corta'],
    ['Manga derecha', 'sleeve-right', 'manga_larga'],
  ] as const)('carga, gira, mueve y recupera un logo en %s', async (label, view, sleeve) => {
    const user = userEvent.setup();
    const draft = createEmptyDraft('2099-12-15');
    draft.garment.sleeve = sleeve;
    const { container, unmount } = render(<Harness draft={draft} />);
    await user.click(screen.getByRole('button', { name: label }));
    upload(container, 'manga.png');
    await user.click(await screen.findByRole('button', { name: 'Estampado' }));
    await waitFor(() => expect(applications()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Girar diseño 90°' }));
    expect(applications()[0].placement).toContain('giro 90°');
    const logo = screen.getByRole('group', { name: /Logo movible/ });
    expect(logo.style.transform).toContain('rotate(90deg)');
    fireEvent.keyDown(logo, { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Cambiar tamaño del logo' }), {
      key: '+',
    });
    const saved = structuredClone(applications()[0]);
    expect(saved.placement).toMatch(new RegExp(`^${label}`));
    expect(saved.widthCm).toBeGreaterThan(8);
    await user.click(screen.getByRole('button', { name: 'Frente' }));
    expect(applications()[0]).toEqual(saved);
    expect(screen.queryByRole('img', { name: 'Diseño adjunto: manga.png' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Editar Logo 1' }));
    expect(screen.getByTestId('design-canvas').getAttribute('data-view')).toBe(view);
    const restored = JSON.parse(screen.getByTestId('draft').textContent!) as QuotationRequestDraft;
    unmount();
    render(<Harness draft={restored} />);
    expect(applications()[0]).toEqual(saved);
    expect(screen.getByTestId('design-canvas').getAttribute('data-view')).toBe(view);
    expect(screen.getByRole('group', { name: /Logo movible/ }).style.transform).toContain(
      'rotate(90deg)',
    );
  });

  it('crea un texto vertical en una manga y lo traslada a la otra explícitamente', async () => {
    const user = userEvent.setup();
    const draft = createEmptyDraft('2099-12-15');
    draft.garment.sleeve = 'manga_corta';
    render(<Harness draft={draft} />);
    await user.click(screen.getByRole('button', { name: 'Manga derecha' }));
    await user.click(screen.getByRole('button', { name: 'Agregar texto' }));
    await user.type(await screen.findByRole('textbox', { name: 'Tu texto' }), 'EQUIPO');
    await user.click(screen.getByRole('button', { name: 'Agregar a la prenda' }));
    await waitFor(() => expect(applications()).toHaveLength(1));
    await user.click(screen.getByRole('button', { name: 'Girar diseño 90°' }));
    const saved = structuredClone(applications()[0]);
    await user.click(screen.getByRole('button', { name: 'Manga izquierda' }));
    expect(applications()[0]).toEqual(saved);
    await user.click(screen.getByRole('button', { name: 'Mover Texto 1 a la manga izquierda' }));
    expect(applications()[0].placement).toMatch(/^Manga izquierda/);
    expect(applications()[0].placement).toContain('giro 90°');
    expect(applications()[0].attachment?.text?.value).toBe('EQUIPO');
  });

  it('crea y reedita texto en la espalda sin perder posición ni agregar aplicaciones duplicadas', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Espalda' }));
    await user.click(screen.getByRole('button', { name: 'Agregar texto' }));
    await user.type(await screen.findByRole('textbox', { name: 'Tu texto' }), 'Equipo Águilas');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fuente' }), 'Lora');
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Acabado del texto' }),
      'embroidery',
    );
    await user.click(await screen.findByRole('button', { name: 'Agregar a la prenda' }));
    await waitFor(() => expect(applications()).toHaveLength(1));
    expect(applications()[0].attachment?.text).toMatchObject({
      value: 'Equipo Águilas',
      fontFamily: 'Lora',
    });
    expect(applications()[0].placement).toMatch(/^Espalda/);
    expect(applications()[0].method).toBe('embroidery');
    const placement = applications()[0].placement;
    await user.click(screen.getByRole('button', { name: 'Editar texto y fuente' }));
    await user.clear(await screen.findByRole('textbox', { name: 'Tu texto' }));
    await user.type(await screen.findByRole('textbox', { name: 'Tu texto' }), 'Capitán');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Fuente' }), 'Oswald');
    await user.click(await screen.findByRole('button', { name: 'Guardar texto' }));
    await waitFor(() => expect(applications()[0].attachment?.text?.value).toBe('Capitán'));
    expect(applications()).toHaveLength(1);
    expect(applications()[0].placement).toBe(placement);
    expect(applications()[0].attachment?.text?.fontFamily).toBe('Oswald');
    await user.click(screen.getByRole('button', { name: 'Eliminar Texto 1' }));
    expect(applications()).toEqual([]);
  });

  it('cancela un texto sin cambiar los diseños y explica el texto vacío', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Agregar texto' }));
    await user.click(await screen.findByRole('button', { name: 'Agregar a la prenda' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Escribe el texto');
    await user.click(screen.getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(applications()).toEqual([]);
  });

  it('elige espalda antes del archivo, conserva la cara al cambiar color y agrega logos independientes', async () => {
    const user = userEvent.setup();
    const { container } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Espalda' }));
    await user.click(screen.getByRole('button', { name: 'Cambiar color de prueba' }));
    expect(screen.getByTestId('design-canvas').getAttribute('data-view')).toBe('back');
    expect(applications()).toEqual([]);
    upload(container, 'posterior.png');
    await user.click(await screen.findByRole('button', { name: 'Sublimado' }));
    await waitFor(() => expect(applications()[0].placement).toMatch(/^Espalda/));
    expect(applications()[0].method).toBe('sublimation');
    expect(applications()[0].widthCm).toBe(8);
    expect(applications()[0].heightCm).toBe(6.4);
    expect(screen.queryByRole('checkbox', { name: /fondo entre las letras/ })).toBeNull();
    await user.selectOptions(screen.getByRole('combobox', { name: 'Color del logo' }), 'white');
    expect(applications()[0].attachment?.preview?.inkColor).toBe('#ffffff');
    const previous = applications()[0];
    await user.click(screen.getByRole('button', { name: 'Frente' }));
    expect(applications()[0]).toEqual(previous);
    expect(screen.queryByRole('img', { name: 'Diseño adjunto: posterior.png' })).toBeNull();
    upload(container, 'frontal.png');
    await user.click(await screen.findByRole('button', { name: 'Bordado' }));
    await waitFor(() => expect(applications()).toHaveLength(2));
    expect(applications()[0]).toEqual(previous);
    expect(applications()[1].placement).toMatch(/^Frente/);
    expect(applications()[1].attachment?.preview?.inkColor).toBeUndefined();
    await user.click(screen.getByRole('button', { name: 'Editar Logo 1' }));
    expect(screen.getByTestId('design-canvas').getAttribute('data-view')).toBe('back');
    expect(screen.getByRole('img', { name: 'Diseño adjunto: posterior.png' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Frente' }));
    await user.click(screen.getByRole('button', { name: 'Mover Logo 1 al frente' }));
    expect(applications()[0].placement).toMatch(/^Frente/);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Color del logo' }), 'original');
    expect(applications()[0].attachment?.preview?.inkColor).toBeUndefined();
    expect(screen.getAllByRole('img', { name: /Diseño adjunto/ })).toHaveLength(2);
  });

  it('cancelar la carga no pierde la cara elegida y recupera una espalda guardada', async () => {
    const user = userEvent.setup();
    const { container, unmount } = render(<Harness />);
    await user.click(screen.getByRole('button', { name: 'Espalda' }));
    upload(container, 'cancelado.png');
    await user.click(await screen.findByRole('button', { name: 'Cancelar carga del logo' }));
    expect(applications()).toEqual([]);
    expect(screen.getByTestId('design-canvas').getAttribute('data-view')).toBe('back');
    upload(container, 'espalda.png');
    await user.click(await screen.findByRole('button', { name: 'Estampado' }));
    await waitFor(() => expect(applications()).toHaveLength(1));
    const draft = JSON.parse(screen.getByTestId('draft').textContent!) as QuotationRequestDraft;
    unmount();
    render(<Harness draft={draft} />);
    expect(screen.getByTestId('design-canvas').getAttribute('data-view')).toBe('back');
    expect(applications()[0].placement).toMatch(/^Espalda/);
  });
});
