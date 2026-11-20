import { describe, expect, it } from 'vitest';
import {
  calibrateGarmentPair,
  garmentReference,
  normalizedGarmentLength,
} from './garmentCalibration';

function silhouette(width: number, height: number, top: number, bottom: number) {
  const alpha = new Uint8Array(width * height);
  for (let y = top; y < bottom; y++)
    for (let x = Math.floor(width * 0.3); x < width * 0.7; x++) alpha[y * width + x] = 255;
  return { width, height, alpha };
}
const reference = { size: 'M', lengthCm: 72, status: 'estimated' as const };
describe('calibración común de prendas', () => {
  it('excluye márgenes y mantiene la misma escala entre resoluciones y lienzos no cuadrados', () => {
    expect(normalizedGarmentLength(silhouette(100, 100, 5, 95))).toBe(0.9);
    expect(normalizedGarmentLength(silhouette(200, 200, 10, 190))).toBe(0.9);
    expect(normalizedGarmentLength(silhouette(100, 200, 10, 190))).toBe(0.9);
    expect(calibrateGarmentPair(reference, [0.9, 0.9])).toEqual({
      status: 'estimated',
      reference,
      factor: 1.6,
    });
  });
  it('comparte un único factor para frente y espalda, sin separar ancho y alto', () => {
    const a = calibrateGarmentPair(reference, [0.9, 0.92]),
      b = calibrateGarmentPair(reference, [0.92, 0.9]);
    expect(a).toEqual(b);
    expect(a.factor).toBeCloseTo(72 / (0.91 * 50));
  });
  it('rechaza imágenes vacías, inválidas, parejas incompatibles o incompletas', () => {
    expect(normalizedGarmentLength({ width: 2, height: 2, alpha: [0, 0, 0, 0] })).toBeUndefined();
    expect(normalizedGarmentLength({ width: 2, height: 2, alpha: [255] })).toBeUndefined();
    for (const lengths of [[], [0.9], [0, 0.9], [NaN, 0.9], [1.1, 0.9], [0.8, 0.95]])
      expect(calibrateGarmentPair(reference, lengths).status).toBe('uncalibrated');
  });
  it('responde a otra referencia declarada sin depender de nombres de logos, tallas del pedido ni sus cantidades', () => {
    expect(calibrateGarmentPair({ ...reference, lengthCm: 90 }, [0.9, 0.9]).factor).toBe(2);
    expect(garmentReference('polo', 'estandar')).toEqual(reference);
    expect(garmentReference('polo', 'princesa_dama')).toBeUndefined();
    expect(garmentReference('buzo', 'no_aplica')).toBeUndefined();
  });
});
