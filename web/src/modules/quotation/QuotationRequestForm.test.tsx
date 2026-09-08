import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuotationRequestForm } from './QuotationRequestForm';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
});

describe('QuotationRequestForm', () => {
  it('explica los errores cuando el primer paso está incompleto', async () => {
    const user = userEvent.setup();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    expect(screen.queryByRole('combobox', { name: 'Tipo de polo' })).toBeNull();
    await user.click(screen.getByRole('button', { name: /continuar/i }));

    const summary = await screen.findByRole('alert');
    expect(summary.textContent).toContain('Revisa lo siguiente');
    expect(summary.textContent).toContain('Elige o describe el modelo de la prenda');
    expect(summary.textContent).toContain('Elige una tela o solicita una recomendación');
  });

  it('configura cuello, corte, manga y tela antes de agregar otra prenda', async () => {
    const user = userEvent.setup();
    Element.prototype.scrollTo = vi.fn();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
    await user.click(screen.getByRole('radio', { name: 'Cuello V' }));
    await user.click(screen.getByRole('radio', { name: 'Princesa dama' }));
    await user.click(screen.getByRole('radio', { name: 'Manga larga' }));
    await user.click(screen.getByRole('radio', { name: /Piqué Lacoste/i }));

    expect(
      screen.getByText('Polo · Cuello V · Princesa dama · Manga larga · Piqué Lacoste'),
    ).toBeTruthy();
    expect(
      screen.getByRole('img', {
        name: 'Polo azul marino referencial de manga larga con cuello V',
      }),
    ).toHaveProperty(
      'src',
      expect.stringContaining('/catalog/polo-cuello-v-manga-larga-referencial.webp'),
    );
    expect(screen.getByRole('combobox', { name: 'Agregar otra prenda' })).toBeTruthy();
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
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Indica una cantidad válida para la talla',
    );

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
