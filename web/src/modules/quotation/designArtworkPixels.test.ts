import { describe, expect, it } from 'vitest';
import {
  removeArtworkBackground,
  prepareArtworkPixels,
  renderArtworkEmbroidery,
  type ArtworkPixels,
} from './designArtworkPixels';

function fixture(background = [255, 255, 255], foreground = [18, 35, 80]): ArtworkPixels {
  const width = 17,
    height = 17,
    data = new Uint8ClampedArray(width * height * 4);
  for (let p = 0; p < width * height; p++) data.set([...background, 255], p * 4);
  for (let y = 4; y < 13; y++)
    for (let x = 4; x < 13; x++) data.set([...foreground, 255], (y * width + x) * 4);
  return { data, width, height };
}

describe('procesamiento común del logo', () => {
  it.each([
    [255, 255, 255],
    [0, 0, 0],
    [30, 160, 70],
  ])('detecta y quita un fondo uniforme %s sin cambiar el color central', (...background) => {
    const image = fixture(background),
      original = new Uint8ClampedArray(image.data);
    const result = removeArtworkBackground(image, { backgroundMode: 'auto' });
    expect(result.background).toBe('removed');
    expect(result.data[3]).toBe(0);
    const center = (8 * image.width + 8) * 4;
    expect([...result.data.slice(center, center + 4)]).toEqual([18, 35, 80, 255]);
    expect(image.data).toEqual(original);
  });

  it('quita por defecto el fondo entre letras, incluso con un ajuste antiguo desactivado', () => {
    const input = fixture(),
      center = (8 * input.width + 8) * 4;
    input.data.set([255, 255, 255, 255], center);
    expect(removeArtworkBackground(input, { backgroundMode: 'auto' }).data[center + 3]).toBe(0);
    expect(
      removeArtworkBackground(input, { backgroundMode: 'auto', removeEnclosed: false }).data[
        center + 3
      ],
    ).toBe(0);
  });

  it.each([
    [255, 255, 255],
    [0, 0, 0],
    [30, 160, 70],
  ])('reconoce fondos de un logo recortado que toca varios bordes %s', (...background) => {
    const input = fixture(background),
      color = [150, 30, 190, 255];
    for (let x = 2; x < 15; x++) input.data.set(color, x * 4);
    for (let y = 2; y < 15; y++) {
      input.data.set(color, y * 17 * 4);
      input.data.set(color, (y * 17 + 16) * 4);
    }
    const result = removeArtworkBackground(input, { backgroundMode: 'auto' });
    expect(result.background).toBe('removed');
    expect(result.data[3]).toBe(0);
    expect([...result.data.slice(5 * 17 * 4, 5 * 17 * 4 + 4)]).toEqual(color);
    expect([...result.data.slice((8 * 17 + 8) * 4, (8 * 17 + 8) * 4 + 4)]).toEqual([
      18, 35, 80, 255,
    ]);
  });

  it('conserva los colores interiores distintos al fondo retirado', () => {
    const input = fixture();
    const center = (8 * 17 + 8) * 4;
    input.data.set([220, 120, 40, 255], center);
    const result = removeArtworkBackground(input, { backgroundMode: 'auto' });
    expect([...result.data.slice(center, center + 4)]).toEqual([220, 120, 40, 255]);
  });

  it.each(['#ffffff', '#000000', '#23ab67'])(
    'aplica color uniforme %s conservando alfa y bytes originales',
    (inkColor) => {
      const input = fixture();
      input.data[3] = 0;
      input.data[(8 * 17 + 8) * 4 + 3] = 127;
      const original = new Uint8ClampedArray(input.data);
      const colored = prepareArtworkPixels(input, { backgroundMode: 'auto', inkColor });
      const expected = [1, 3, 5].map((n) => Number.parseInt(inkColor.slice(n, n + 2), 16));
      for (let p = 0; p < input.width * input.height; p++) {
        expect(colored.data[p * 4 + 3]).toBe(original[p * 4 + 3]);
        if (original[p * 4 + 3])
          expect([...colored.data.slice(p * 4, p * 4 + 3)]).toEqual(expected);
      }
      expect(input.data).toEqual(original);
      expect(prepareArtworkPixels(input, { backgroundMode: 'auto' }).data).toEqual(original);
    },
  );

  it('recorta los huecos antes de poner en blanco y permite recuperar los colores del original', () => {
    const input = fixture();
    const center = (8 * 17 + 8) * 4;
    input.data.set([255, 255, 255, 255], center);
    const colored = prepareArtworkPixels(input, { backgroundMode: 'auto', inkColor: '#ffffff' });
    expect(colored.data[3]).toBe(0);
    expect(colored.data[center + 3]).toBe(0);
    expect([...colored.data.slice((7 * 17 + 7) * 4, (7 * 17 + 7) * 4 + 4)]).toEqual([
      255, 255, 255, 255,
    ]);
    const original = prepareArtworkPixels(input, { backgroundMode: 'auto' });
    expect([...original.data.slice((7 * 17 + 7) * 4, (7 * 17 + 7) * 4 + 4)]).toEqual([
      18, 35, 80, 255,
    ]);
    expect(original.data[center + 3]).toBe(0);
  });

  it('no interpreta la transparencia existente ni un fondo complejo como un fondo sólido', () => {
    const transparent = fixture();
    transparent.data[3] = 0;
    transparent.data[(8 * 17 + 8) * 4 + 3] = 100;
    expect(removeArtworkBackground(transparent, { backgroundMode: 'auto' }).data).toEqual(
      transparent.data,
    );
    const complex = fixture();
    for (let y = 0; y < 17; y++)
      for (let x = 0; x < 17; x++)
        if (x < 8) complex.data.set([40, 70, 160, 255], (y * 17 + x) * 4);
    expect(removeArtworkBackground(complex, { backgroundMode: 'auto' }).background).toBe(
      'unrecognized',
    );
    expect(removeArtworkBackground(complex, { backgroundMode: 'auto' }).data).toEqual(complex.data);
  });

  it('vuelve al original y admite elegir otro color de fondo', () => {
    const image = fixture([230, 170, 30]);
    expect(removeArtworkBackground(image, { backgroundMode: 'keep' }).data).toEqual(image.data);
    expect(
      removeArtworkBackground(image, { backgroundMode: 'remove', backgroundColor: '#e6aa1e' })
        .data[3],
    ).toBe(0);
  });

  it('descontamina un borde gris suavizado sin dejar un halo blanco', () => {
    const image = fixture([255, 255, 255], [80, 80, 80]);
    const edge = (4 * 17 + 3) * 4;
    image.data.set([200, 200, 200, 255], edge);
    const result = removeArtworkBackground(image, { backgroundMode: 'auto' });
    expect(result.data[edge]).toBeLessThan(110);
    expect(result.data[edge + 3]).toBeGreaterThan(50);
    expect(result.data[edge + 3]).toBeLessThan(150);
  });

  it('genera relieve reproducible en varios colores conservando exactamente la transparencia', () => {
    const image = removeArtworkBackground(fixture(), { backgroundMode: 'auto' });
    image.data.set([220, 30, 50, 170], (7 * 17 + 7) * 4);
    image.data.set([255, 255, 255, 255], (8 * 17 + 8) * 4);
    const original = new Uint8ClampedArray(image.data);
    const result = renderArtworkEmbroidery(image);
    expect(result.data).toEqual(renderArtworkEmbroidery(image).data);
    expect(result.data).not.toEqual(original);
    for (let p = 0; p < 17 * 17; p++) expect(result.data[p * 4 + 3]).toBe(original[p * 4 + 3]);
    expect(image.data).toEqual(original);
    expect(result.data[(8 * 17 + 8) * 4]).toBeGreaterThan(150);
  });
});
