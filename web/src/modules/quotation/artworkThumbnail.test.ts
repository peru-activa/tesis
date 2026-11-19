import { describe, expect, it } from 'vitest';
import { artworkThumbnail } from './artworkThumbnail';

describe('miniaturas con contraste', () => {
  it.each([
    [255, '#334155'],
    [0, '#f1f5f9'],
  ] as const)(
    'encuadra el contenido %s y elige fondo legible sin alterar el bitmap original',
    (color, background) => {
      const data = new Uint8ClampedArray(100 * 100 * 4);
      for (let y = 70; y < 80; y++)
        for (let x = 40; x < 60; x++) data.set([color, color, color, 255], (y * 100 + x) * 4);
      const before = new Uint8ClampedArray(data);
      const result = artworkThumbnail({ data, width: 100, height: 100 });
      expect(result.pixels.width).toBe(20);
      expect(result.pixels.height).toBe(10);
      expect(result.background).toBe(background);
      expect(data).toEqual(before);
    },
  );
  it('conserva una imagen vacía sin inventar contenido', () => {
    const input = { data: new Uint8ClampedArray(16), width: 2, height: 2 };
    expect(artworkThumbnail(input).pixels).toBe(input);
  });
});
