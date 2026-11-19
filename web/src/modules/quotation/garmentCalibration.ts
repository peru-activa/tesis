/** Historical stored frames use a 50-unit square. They are never rewritten on read. */
export const LEGACY_CANVAS_UNITS = 50;

export interface GarmentReference {
  size: string;
  lengthCm: number;
  status: 'estimated';
}

// Profiles describe garment data, independently of any artwork or saved order.
const references: Partial<Record<string, Partial<Record<string, GarmentReference>>>> = {
  polo: { estandar: { size: 'M', lengthCm: 72, status: 'estimated' } },
};

export function garmentReference(product: string, cut: string): GarmentReference | undefined {
  return references[product]?.[cut];
}

export interface GarmentSilhouette {
  width: number;
  height: number;
  alpha: ArrayLike<number>;
}

export function normalizedGarmentLength(image: GarmentSilhouette): number | undefined {
  const { width, height, alpha } = image;
  if (width <= 0 || height <= 0 || alpha.length !== width * height) return undefined;
  let top = height,
    bottom = -1;
  for (let y = 0; y < height; y++) {
    let rowPixels = 0;
    for (let x = 0; x < width; x++) if (alpha[y * width + x] >= 128) rowPixels++;
    // Ignore isolated low-opacity edges without losing collars or hems.
    if (rowPixels >= Math.max(1, Math.ceil(width * 0.01))) {
      top = Math.min(top, y);
      bottom = y;
    }
  }
  return bottom < top ? undefined : (bottom - top + 1) / Math.max(width, height);
}

export type GarmentCalibration =
  | { status: 'loading' | 'uncalibrated'; factor?: undefined; reference?: GarmentReference }
  | { status: 'estimated'; factor: number; reference: GarmentReference };

export function calibrateGarmentPair(
  reference: GarmentReference,
  lengths: readonly number[],
): GarmentCalibration {
  if (
    lengths.length !== 2 ||
    lengths.some((value) => !Number.isFinite(value) || value <= 0 || value > 1)
  )
    return { status: 'uncalibrated', reference };
  if (Math.max(...lengths) / Math.min(...lengths) - 1 > 0.08)
    return { status: 'uncalibrated', reference };
  const meanLength = (lengths[0] + lengths[1]) / 2;
  return {
    status: 'estimated',
    reference,
    factor: reference.lengthCm / (meanLength * LEGACY_CANVAS_UNITS),
  };
}
