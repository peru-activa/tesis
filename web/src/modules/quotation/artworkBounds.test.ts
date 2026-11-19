import { describe, expect, it } from 'vitest';
import {
  resizeArtworkFrame,
  trimArtworkPixels,
  visibleArtworkBounds,
  visibleArtworkSize,
} from './artworkBounds';
import { prepareArtworkPixels } from './designArtworkPixels';

function fixture(opaqueBackground = false) {
  const data = new Uint8ClampedArray(100 * 80 * 4);
  if (opaqueBackground) data.fill(255);
  for (let y = 30; y < 40; y++)
    for (let x = 40; x < 60; x++) data.set([12, 34, 56, 255], (y * 100 + x) * 4);
  return { data, width: 100, height: 80 };
}

describe('límites visibles del diseño', () => {
  it.each([false, true])('recorta transparencia existente o fondo eliminado: %s', (opaque) => {
    const original = fixture(opaque);
    const before = new Uint8ClampedArray(original.data);
    const clean = prepareArtworkPixels(original, { backgroundMode: 'auto' });
    const cropped = trimArtworkPixels(clean);
    expect([cropped.width, cropped.height]).toEqual([20, 10]);
    expect(cropped.data).toHaveLength(20 * 10 * 4);
    expect([...cropped.data.slice(0, 4)]).toEqual([12, 34, 56, 255]);
    expect(original.data).toEqual(before);
    expect(trimArtworkPixels(cropped)).toBe(cropped);
  });

  it('conserva los huecos interiores, elementos separados y bordes semitransparentes', () => {
    const input = fixture();
    input.data[(10 * 100 + 5) * 4 + 3] = 1;
    const cropped = trimArtworkPixels(input);
    expect([cropped.width, cropped.height]).toEqual([55, 30]);
    expect(cropped.data[3]).toBe(1);
    expect(cropped.data[(5 * cropped.width + 5) * 4 + 3]).toBe(0);
  });

  it('conservar el fondo opaco cuenta el rectángulo completo y no destruye el original', () => {
    const clean = prepareArtworkPixels(fixture(true), { backgroundMode: 'keep' });
    expect(trimArtworkPixels(clean)).toBe(clean);
    expect([clean.width, clean.height]).toEqual([100, 80]);
  });

  it('permite volver a conservar el fondo después de quitarlo sin perder los bytes', () => {
    const input = fixture(true);
    expect(trimArtworkPixels(prepareArtworkPixels(input, { backgroundMode: 'remove' })).width).toBe(
      20,
    );
    expect(trimArtworkPixels(prepareArtworkPixels(input, { backgroundMode: 'keep' })).width).toBe(
      100,
    );
  });

  it('no inventa contenido en una imagen totalmente transparente', () => {
    const empty = { data: new Uint8ClampedArray(24), width: 3, height: 2 };
    expect(trimArtworkPixels(empty)).toBe(empty);
    expect(visibleArtworkBounds(empty)).toBeUndefined();
  });

  it('mide solo contenido visible y respeta el ajuste contain de cajas cuadradas, altas y anchas', () => {
    const geometry = {
      width: 100,
      height: 80,
      content: { left: 40, top: 30, width: 20, height: 10 },
    };
    expect(visibleArtworkSize(geometry, 45, 43.1)).toEqual({ width: 9, height: 4.5 });
    expect(visibleArtworkSize(geometry, 45, 8)).toEqual({ width: 2, height: 1 });
    expect(visibleArtworkSize(geometry, 8, 45)).toEqual({ width: 1.6, height: 0.8 });
    expect(geometry.content.left).toBe(40);
    expect(geometry.content.top).toBe(30);
  });

  it('editar una medida escala ambos ejes y conserva el marco y la proporción visible', () => {
    const geometry = {
      width: 100,
      height: 80,
      content: { left: 40, top: 30, width: 20, height: 10 },
    };
    const next = resizeArtworkFrame(geometry, 20, 20, 'width', 8)!;
    expect(next).toEqual({ widthCm: 40, heightCm: 40 });
    expect(visibleArtworkSize(geometry, next.widthCm, next.heightCm)).toEqual({
      width: 8,
      height: 4,
    });
    expect(resizeArtworkFrame(geometry, 20, 20, 'height', 4)).toEqual(next);
    expect(resizeArtworkFrame(geometry, 20, 20, 'width', 999)).toEqual({
      widthCm: 100,
      heightCm: 100,
    });
    expect(resizeArtworkFrame({ width: 10, height: 10 }, 20, 20, 'width', 8)).toBeUndefined();
  });
});
