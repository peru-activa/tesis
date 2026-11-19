import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmptyGarment } from '../quotation/quotationFormModel';
import { OrderItemPreview } from './OrderItemPreview';

vi.mock('../quotation/RecolorableGarmentImage', () => ({
  prepareGarment: vi.fn().mockRejectedValue(new Error('Plantilla sintética sin escala')),
  RecolorableGarmentImage: ({ src, alt, color }: { src: string; alt: string; color: string }) => (
    <img src={src} alt={alt} data-color={color} />
  ),
}));
vi.mock('../quotation/designArtwork', () => ({
  artworkSettings: () => ({ backgroundMode: 'auto' }),
  prepareDesignArtwork: vi.fn().mockResolvedValue({
    source: 'data:image/png;base64,prepared',
    background: 'transparent',
    geometry: { width: 100, height: 100, content: { left: 20, top: 30, width: 20, height: 10 } },
  }),
}));
afterEach(cleanup);
const attachment = {
  name: 'logo.png',
  mediaType: 'image/png' as const,
  sizeBytes: 120,
  dataUrl: 'data:image/png;base64,AA==',
};
function garment() {
  return {
    ...createEmptyGarment('polo'),
    model: 'Cuello camisero',
    color: '#FFFFFF',
    cut: 'princesa_dama' as const,
    sleeve: 'manga_larga' as const,
    sizes: [
      { size: 'M', quantity: 12 },
      { size: '8', quantity: 8 },
    ],
    fabric: { mode: 'specified' as const, name: 'algodón' },
    customization: 'embroidery' as const,
    designApplications: [
      {
        attachment,
        method: 'embroidery' as const,
        placement: 'Espalda · posición 60%, 45% · tamaño 24%',
        widthCm: 10.6199,
        heightCm: 9.83591,
      },
    ],
  };
}

describe('OrderItemPreview', () => {
  it('incluye las mangas usadas y permite inspeccionar su diseño vertical en el pedido', async () => {
    const item = garment();
    item.designApplications[0]!.placement =
      'Manga derecha · posición 50%, 45% · tamaño 24% · giro 90°';
    const before = structuredClone(item);
    const user = userEvent.setup();
    render(<OrderItemPreview garment={item} index={0} />);
    const design = await screen.findByRole('button', { name: 'Ver Logo 1: Manga derecha' });
    expect(design.parentElement?.style.transform).toContain('rotate(90deg)');
    await user.click(design);
    expect(
      screen.getByRole('button', { name: 'Detalles de Logo 1' }).getAttribute('aria-expanded'),
    ).toBe('true');
    expect(item).toEqual(before);
  });

  it('muestra ambos lados y relaciona el logo con su detalle mediante cursor, teclado y toque sin editar', async () => {
    const item = garment(),
      before = structuredClone(item),
      user = userEvent.setup();
    render(<OrderItemPreview garment={item} index={0} />);
    expect(screen.getByText('Color: #FFFFFF')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Tallas y cantidades' }).textContent).toContain(
      'Niño 8',
    );
    expect(screen.queryByRole('button', { name: 'Espalda' })).toBeNull();
    const logo = await screen.findByRole('button', { name: 'Ver Logo 1: Espalda' });
    const row = screen.getByRole('button', { name: 'Detalles de Logo 1' });
    expect(row.getAttribute('aria-expanded')).toBe('false');
    await user.hover(logo);
    expect(
      await within(screen.getByRole('tooltip')).findByText(
        'Referencia sin calibrar · Ancho 2.0 cm · Alto 1.0 cm',
      ),
    ).toBeTruthy();
    expect(within(screen.getByRole('tooltip')).getByText('Archivo: logo.png')).toBeTruthy();
    await user.unhover(logo);
    expect(screen.queryByRole('tooltip')).toBeNull();
    logo.focus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).toBeNull();
    await user.click(logo);
    expect(row.getAttribute('aria-expanded')).toBe('true');
    const detail = document.getElementById(row.getAttribute('aria-controls')!)!;
    expect(detail.hidden).toBe(false);
    expect(
      within(detail).getByText('Referencia sin calibrar · Ancho 2.0 cm · Alto 1.0 cm'),
    ).toBeTruthy();
    expect(detail.textContent).not.toContain('posición');
    expect(item).toEqual(before);
    expect(screen.queryByRole('spinbutton')).toBeNull();
    await user.click(row);
    expect(detail.hidden).toBe(true);
  });

  it('mantiene independientes los modelos, colores y selecciones de varias prendas', async () => {
    const first = garment(),
      second = { ...garment(), color: 'Rojo', model: 'Cuello redondo' };
    render(
      <>
        <OrderItemPreview garment={first} index={0} />
        <OrderItemPreview garment={second} index={1} />
      </>,
    );
    const items = screen.getAllByRole('article');
    await userEvent
      .setup()
      .click(within(items[0]).getByRole('button', { name: 'Detalles de Logo 1' }));
    expect(
      within(items[1])
        .getByRole('button', { name: 'Detalles de Logo 1' })
        .getAttribute('aria-expanded'),
    ).toBe('false');
    expect(within(items[1]).getByText('Color: Rojo')).toBeTruthy();
    expect(
      within(items[1])
        .getAllByRole('img', { name: /Polo/ })
        .every((image) => image.getAttribute('data-color') === '#C5212E'),
    ).toBe(true);
  });

  it('recupera PDF históricos, ubicación libre y colores sin equivalencia', async () => {
    const item = {
      ...garment(),
      color: 'Pantone por confirmar',
      designApplications: [],
      designAttachment: {
        ...attachment,
        mediaType: 'application/pdf' as const,
        name: 'diseno.pdf',
      },
      customizationDetails: 'Pecho izquierdo',
    };
    const { container } = render(<OrderItemPreview garment={item} index={0} />);
    expect(screen.getByText('Color: Pantone por confirmar')).toBeTruthy();
    expect(container.querySelector<HTMLElement>('.pa-color-swatch')?.style.backgroundColor).toBe(
      '',
    );
    expect(screen.getByText(/Los archivos PDF se incluyen/)).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Detalles de Logo 1' }));
    expect(screen.getByText('Pecho izquierdo')).toBeTruthy();
    expect(screen.getByText('Medidas del logo por definir')).toBeTruthy();
    expect(screen.getByText('Archivo: diseno.pdf')).toBeTruthy();
    expect(screen.queryByRole('img', { name: /Diseño adjunto/ })).toBeNull();
  });

  it('conserva la numeración global entre lados y todos los datos del texto', async () => {
    const item = garment();
    item.designApplications.push({
      ...item.designApplications[0],
      placement: 'Frente',
      attachment: { ...attachment, name: 'frente.png' },
    });
    const text = {
      ...attachment,
      name: 'texto.png',
      text: { value: 'Nos cuidamos todos', fontFamily: 'Montserrat', color: '#FFFFFF' },
    };
    item.designApplications.push({ ...item.designApplications[0], attachment: text });
    render(<OrderItemPreview garment={item} index={0} />);
    expect(await screen.findByRole('button', { name: 'Ver Logo 2: Frente' })).toBeTruthy();
    expect(await screen.findByRole('button', { name: 'Ver Texto 3: Espalda' })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Detalles de Texto 3' }));
    expect(screen.getByText('«Nos cuidamos todos» · Montserrat')).toBeTruthy();
    expect(screen.getByText('Archivo: texto.png')).toBeTruthy();
  });
});
