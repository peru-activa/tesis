import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuotationRequestForm } from './QuotationRequestForm';
import { createEmptyDraft } from './quotationFormModel';

vi.mock('./designArtwork', () => ({
  artworkSettings: () => ({ backgroundMode: 'auto' }),
  prepareDesignArtwork: vi.fn().mockResolvedValue({
    source: 'data:image/png;base64,cropped',
    background: 'removed',
    aspectRatio: 2,
    geometry: { width: 100, height: 100, content: { left: 0, top: 0, width: 100, height: 100 } },
  }),
}));

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        estimate: {
          status: 'available',
          earliestDate: '2099-01-01',
          approvalBy: '2098-12-25',
          evaluatedAt: '2098-12-23T15:00:00Z',
          horizonDate: '2099-05-01',
          materialPending: false,
          policy: {
            version: 'test',
            approvalDays: 2,
            deliveryDays: 1,
            handoffDays: 1,
            horizonDays: 180,
            maximumPlanEvaluations: 10_000,
          },
        },
      }),
    }),
  );
});

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  vi.unstubAllGlobals();
});

describe('QuotationRequestForm', () => {
  it('usa la misma ayuda cuando el archivo del logo es inválido', async () => {
    const user = userEvent.setup();
    const { container } = render(
      <QuotationRequestForm
        busy={false}
        error=""
        onSubmit={vi.fn()}
        initialDraft={configuredDraft()}
      />,
    );
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    const input = container.querySelector<HTMLInputElement>(
      '.quote-design-hidden-inputs input[type="file"]',
    )!;
    fireEvent.change(input, {
      target: { files: [new File(['prueba'], 'archivo.txt', { type: 'text/plain' })] },
    });
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Usa una imagen JPG, PNG, WEBP o un archivo PDF.',
    );
    expect(
      container
        .querySelector('.quote-design-summary')
        ?.classList.contains('quote-field-error-target'),
    ).toBe(true);
    fireEvent.change(input, {
      target: { files: [new File(['logo'], 'logo.png', { type: 'image/png' })] },
    });
    await screen.findByRole('button', { name: 'Bordado' });
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('regresa desde la revisión al paso del campo inválido antes de enviar', async () => {
    const user = userEvent.setup();
    const draft = configuredDraft();
    draft.customer = {
      contactName: 'Cliente prueba',
      businessName: 'Empresa prueba',
      contact: 'cliente@example.test',
    };
    draft.delivery.requiredBy = '2099-12-15';
    sessionStorage.setItem(
      'peru-activa:quotation-draft:v1',
      JSON.stringify({ draft, step: 5, hasGarments: true }),
    );
    const submit = vi.fn();
    render(
      <QuotationRequestForm
        busy={false}
        error=""
        onSubmit={submit}
        authenticatedEmail="cliente@example.test"
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: /Solicitar cotización/ }).hasAttribute('disabled'),
      ).toBe(false),
    );
    await user.click(screen.getByRole('button', { name: /Solicitar cotización/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('Indica el lugar de entrega');
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Lugar de entrega' }));
    expect(submit).not.toHaveBeenCalled();
  });

  it('señala el color pendiente, repite la ayuda y la retira al corregirlo', async () => {
    const user = userEvent.setup();
    const draft = configuredDraft();
    draft.garment.color = '';
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} initialDraft={draft} />);
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    const bubble = await screen.findByRole('alert');
    expect(bubble.textContent).toBe('Indica el color de la prenda.');
    const button = screen.getByRole('button', { name: /elegir color/i });
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-invalid')).toBe('true');
    expect(button.getAttribute('aria-describedby')).toBe(bubble.id);
    expect(button.closest('fieldset')?.classList.contains('quote-field-error-glow')).toBe(true);
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    expect(screen.getByRole('alert')).not.toBe(bubble);
    expect(button.getAttribute('aria-describedby')).toBe(screen.getByRole('alert').id);
    await user.click(button);
    await user.click(screen.getByRole('button', { name: 'Usar este color' }));
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(button.getAttribute('aria-invalid')).toBeNull();
    expect(button.getAttribute('aria-describedby')).toBeNull();
    expect(button.closest('fieldset')?.classList.contains('quote-field-error-target')).toBe(false);
  });

  it('abre la prenda contraída que tiene el error y señala su selector', async () => {
    const user = userEvent.setup();
    const draft = configuredDraft();
    draft.additionalGarments = [{ ...draft.garment, model: '' }];
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} initialDraft={draft} />);
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    expect((await screen.findByRole('alert')).textContent).toContain('Elige o describe el modelo');
    const radio = screen.getByRole('radio', { name: 'Redondo' });
    await waitFor(() => expect(document.activeElement).toBe(radio));
    expect(radio.closest('fieldset')?.dataset.validationFields).toBe('additionalGarments.0.model');
  });

  it('señala el dato de entrega sin adelantar el foco mientras el cliente lo escribe', async () => {
    const user = userEvent.setup();
    const draft = configuredDraft();
    draft.delivery.requiredBy = '2099-12-15';
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} initialDraft={draft} />);
    for (let index = 0; index < 4; index++) {
      await user.click(screen.getByRole('button', { name: /continuar/i }));
    }
    const location = screen.getByRole('textbox', { name: 'Lugar de entrega' });
    await screen.findByRole('alert');
    expect(document.activeElement).toBe(location);
    await user.type(location, 'Lima');
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(document.activeElement).toBe(location);
  });

  it('carga una copia editable conservando las prendas y pidiendo una nueva fecha', async () => {
    const draft = createEmptyDraft('');
    draft.customer = {
      contactName: 'Cliente de prueba',
      businessName: 'Empresa de prueba',
      contact: 'anterior@example.test',
    };
    draft.garment = {
      ...draft.garment,
      model: 'Cuello redondo',
      sleeve: 'manga_corta',
      cut: 'estandar',
      color: 'Azul',
      fabric: { mode: 'specified', name: 'Zanetti' },
      sizes: [{ size: 'M', quantity: 20 }],
      customization: 'none',
      applicationCount: 0,
    };
    render(
      <QuotationRequestForm
        busy={false}
        error=""
        onSubmit={vi.fn()}
        initialDraft={draft}
        authenticatedEmail="cliente@example.test"
      />,
    );
    expect(
      screen.getByText('Polo · Cuello redondo · Estándar · Manga corta · Zanetti'),
    ).toBeTruthy();
    expect(screen.getByRole('spinbutton', { name: 'Cantidad' })).toHaveProperty('value', '20');
    expect(screen.getByRole('combobox', { name: 'Agregar otra prenda' })).toBeTruthy();
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    expect(await screen.findByRole('button', { name: /continuar/i })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    expect(
      await screen.findByRole('spinbutton', { name: 'Cantidad para talla adulta M' }),
    ).toHaveProperty('value', '20');
    expect(draft.delivery.requiredBy).toBe('');
    expect(draft.customer.contact).toBe('anterior@example.test');
  });
  it('explica los errores cuando el primer paso está incompleto', async () => {
    const user = userEvent.setup();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    expect(screen.queryByRole('combobox', { name: 'Tipo de polo' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    const summary = await screen.findByRole('alert');
    expect(summary.className).toContain('quote-field-error-bubble');
    expect(screen.queryByText('Revisa lo siguiente:')).toBeNull();
    expect(summary.textContent).toContain('Elige o describe el modelo de la prenda');
    expect(summary.textContent).not.toContain('Elige una tela o solicita una recomendación');
  });

  it('configura cuello, corte, manga y tela antes de agregar otra prenda', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Princesa dama' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Cuello V' }));
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Manga larga' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Princesa dama' }));
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Manga larga' }));
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: /Piqué Lacoste/i }));

    expect(
      screen.getByText('Polo · Cuello V · Princesa dama · Manga larga · Piqué Lacoste'),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: 'Polo azul marino referencial de corte princesa para dama de manga larga con cuello V',
      }),
    ).toHaveProperty(
      'src',
      expect.stringContaining('/catalog/polo-cuello-v-princesa-dama-manga-larga-referencial.webp'),
    );
    expect(screen.getByRole('combobox', { name: 'Agregar otra prenda' })).toBeTruthy();
  });

  it('oculta agregar mientras se edita y permite confirmar otra vez las mismas opciones', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('button', { name: 'Cambiar' }));
    expect(screen.queryByRole('radio', { name: 'Estándar' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: /Zanetti/i }));
    expect(screen.getByRole('combobox', { name: 'Agregar otra prenda' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: 'Cambiar opciones' }));
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: /Zanetti/i }));
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar otra prenda' }), 'polo');
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Editar/ }));
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /Completar/ }));
    await user.click(screen.getByRole('button', { name: 'Quitar polo' }));
    expect(screen.getByRole('combobox', { name: 'Agregar otra prenda' })).toBeTruthy();
  });

  it('admite telas por recomendar y personalizadas, y espera una cantidad válida', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: 'No sé cuál elegir' }));
    const quantity = screen.getByRole('spinbutton', { name: 'Cantidad' });
    await user.clear(quantity);
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    await user.type(quantity, '20');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar otra prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: 'Otra tela' }));
    const custom = screen.getByRole('textbox', { name: '¿Qué tela necesitas?' });
    await user.type(custom, 'a');
    await user.tab();
    expect(screen.queryByRole('combobox', { name: 'Agregar otra prenda' })).toBeNull();
    await user.clear(custom);
    await user.type(custom, 'Tela especial');
    await user.tab();
    expect(screen.getByRole('combobox', { name: 'Agregar otra prenda' })).toBeTruthy();
  });

  it('reconfirma con espacio una opción marcada sin dejar al teclado detenido en el paso', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);
    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: /Zanetti/i }));
    await user.click(screen.getByRole('button', { name: 'Cambiar opciones' }));
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    const standard = screen.getByRole('radio', { name: 'Estándar' });
    standard.focus();
    await user.keyboard(' ');
    expect(screen.getByRole('radio', { name: 'Manga corta' })).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Estándar' })).toBeNull();
  });

  it('previsualiza corte y manga al pasar el mouse antes de seleccionar', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));

    const princessLabel = screen.getByRole('radio', { name: 'Princesa dama' }).closest('label');
    expect(princessLabel).not.toBeNull();
    fireEvent.mouseEnter(princessLabel!);
    expect(screen.getByText('Cuello redondo · Princesa dama')).toBeTruthy();
    const preview = screen.getByRole('img', {
      name: 'Polo azul marino referencial de corte princesa para dama con cuello redondo',
    });
    expect(preview).toHaveProperty(
      'src',
      expect.stringContaining('/catalog/polo-cuello-redondo-princesa-dama-referencial.webp'),
    );
    fireEvent.mouseLeave(princessLabel!.parentElement!);
    expect(screen.queryByRole('img', { name: /de corte princesa para dama/ })).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    const longSleeveLabel = screen.getByRole('radio', { name: 'Manga larga' }).closest('label');
    expect(longSleeveLabel).not.toBeNull();
    fireEvent.mouseEnter(longSleeveLabel!);

    expect(
      screen.getByRole('img', {
        name: 'Polo azul marino referencial de manga larga con cuello redondo',
      }),
    ).toHaveProperty(
      'src',
      expect.stringContaining('/catalog/polo-cuello-redondo-manga-larga-referencial.webp'),
    );
    expect(screen.getByText('Cuello redondo · Estándar · Manga larga')).toBeTruthy();

    fireEvent.mouseLeave(longSleeveLabel!.parentElement!);
    expect(
      screen.getByRole('img', { name: 'Polo azul marino referencial con cuello redondo' }),
    ).toHaveProperty(
      'src',
      expect.stringContaining('/catalog/polo-cuello-redondo-referencial.webp'),
    );
  });

  it('agrega espacios de logo sin pedir una cantidad por adelantado', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    const { container } = render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: /Zanetti/i }));
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.queryByText('¿Cuántos logos o diseños?')).toBeNull();
    const addInput = container.querySelector<HTMLInputElement>(
      '.quote-design-hidden-inputs input[type="file"]',
    );
    expect(addInput).not.toBeNull();
    for (let index = 1; index <= 4; index += 1) {
      await user.click(screen.getByRole('button', { name: /agregar otro logo/i }));
      fireEvent.change(addInput!, {
        target: {
          files: [new File(['logo'], `logo-${index}.png`, { type: 'image/png' })],
        },
      });
      await user.click(
        await screen.findByRole('button', {
          name: 'Bordado',
        }),
      );
      await waitFor(() =>
        expect(screen.getByRole('button', { name: `Editar Logo ${index}` })).toBeTruthy(),
      );
    }
    expect(screen.getByRole('button', { name: 'Eliminar Logo 4' })).toBeTruthy();
    expect(screen.queryByText(/Describe el diseño/i)).toBeNull();
    expect(screen.getAllByRole('spinbutton', { name: /Ancho del Logo/i })).toHaveLength(4);
    expect(screen.getAllByRole('spinbutton', { name: /Alto del Logo/i })).toHaveLength(4);
  });

  it('permite agregar la talla 16 y nunca muestra NaN al vaciar su cantidad', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: /Zanetti/i }));
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByText('Polo 1 · personalización')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: /elegir color/i }));
    fireEvent.change(screen.getByLabelText('Seleccionar color'), {
      target: { value: '#c5212e' },
    });
    await user.click(screen.getByRole('button', { name: 'Usar este color' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /#C5212E/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    expect(screen.getByRole('combobox', { name: 'Agregar talla para adultos' })).toBeTruthy();
    expect(screen.queryByRole('combobox', { name: 'Agregar talla infantil' })).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Agregar tallas para niños' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Agregar talla infantil' }),
      '16',
    );
    const sizeQuantity = screen.getByRole('spinbutton', {
      name: 'Cantidad para talla infantil 16',
    });
    await user.clear(sizeQuantity);

    expect(document.body.textContent).not.toContain('NaN');
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    const summary = await screen.findByRole('alert');
    expect(summary.textContent).toContain('Indica una cantidad válida para la talla');
    await waitFor(() => expect(document.activeElement).toBe(sizeQuantity));

    fireEvent.change(screen.getByRole('spinbutton', { name: 'Cantidad para talla infantil 16' }), {
      target: { value: '20' },
    });
    expect(await screen.findByText('20 de 20')).toBeTruthy();
  });

  it('separa las tallas adultas de las infantiles y suma ambas categorías', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Redondo' }));
    await user.click(screen.getByRole('radio', { name: 'Estándar' }));
    await user.click(screen.getByRole('radio', { name: 'Manga corta' }));
    await user.click(screen.getByRole('radio', { name: /Zanetti/i }));
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    await user.click(screen.getByRole('button', { name: /elegir color/i }));
    fireEvent.change(screen.getByLabelText('Seleccionar color'), {
      target: { value: '#c5212e' },
    });
    await user.click(screen.getByRole('button', { name: 'Usar este color' }));
    await waitFor(() => expect(screen.getByRole('button', { name: /#C5212E/i })).toBeTruthy());
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Agregar talla para adultos' }),
      'M',
    );
    await user.type(screen.getByRole('spinbutton', { name: 'Cantidad para talla adulta M' }), '12');
    await user.click(screen.getByRole('button', { name: 'Agregar tallas para niños' }));
    await user.selectOptions(
      screen.getByRole('combobox', { name: 'Agregar talla infantil' }),
      '10',
    );
    await user.type(
      screen.getByRole('spinbutton', { name: 'Cantidad para talla infantil 10' }),
      '8',
    );

    expect(await screen.findByText('20 de 20')).toBeTruthy();
  });
});

function configuredDraft() {
  const draft = createEmptyDraft('');
  draft.garment = {
    ...draft.garment,
    model: 'Cuello redondo',
    cut: 'estandar',
    sleeve: 'manga_corta',
    color: '#17243A',
    fabric: { mode: 'specified', name: 'Zanetti 100 % poliéster' },
    sizes: [{ size: 'M', quantity: 20, category: 'adult' }],
  };
  return draft;
}
