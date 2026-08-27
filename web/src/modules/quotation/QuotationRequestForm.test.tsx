import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuotationRequestForm } from './QuotationRequestForm';

afterEach(cleanup);

describe('QuotationRequestForm', () => {
  it('explica los errores cuando el primer paso está incompleto', async () => {
    const user = userEvent.setup();
    render(<QuotationRequestForm busy={false} error="" onSubmit={vi.fn()} />);

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar prenda' }), 'polo');
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

    await user.selectOptions(screen.getByRole('combobox', { name: 'Agregar talla' }), '16');
    const sizeQuantity = screen.getByRole('spinbutton', { name: 'Cantidad para talla 16' });
    await user.clear(sizeQuantity);

    expect(document.body.textContent).not.toContain('NaN');
    await user.click(screen.getByRole('button', { name: /continuar/i }));
    expect((await screen.findByRole('alert')).textContent).toContain(
      'Indica una cantidad válida para la talla',
    );

    await user.type(sizeQuantity, '20');
    expect(screen.getByText('20 de 20')).toBeTruthy();
  });
});
