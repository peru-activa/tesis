export interface ArtworkPixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

export interface ArtworkSettings {
  backgroundMode: 'auto' | 'keep' | 'remove';
  backgroundColor?: string;
  inkColor?: string;
  tolerance?: number;
  removeEnclosed?: boolean;
}

export interface CleanArtwork extends ArtworkPixels {
  background: 'removed' | 'transparent' | 'kept' | 'unrecognized';
}

const clamp = (value: number, min = 0, max = 1) => Math.max(min, Math.min(max, value));

function colorDistance(data: Uint8ClampedArray, offset: number, color: number[]): number {
  return Math.max(
    Math.abs(data[offset] - color[0]),
    Math.abs(data[offset + 1] - color[1]),
    Math.abs(data[offset + 2] - color[2]),
  );
}

function borderColor(
  { data, width, height }: ArtworkPixels,
  tolerance: number,
): number[] | undefined {
  const border: number[] = [];
  const step = Math.max(1, Math.floor(Math.max(width, height) / 80));
  for (let x = 0; x < width; x += step) border.push(x * 4, ((height - 1) * width + x) * 4);
  for (let y = 0; y < height; y += step) border.push(y * width * 4, (y * width + width - 1) * 4);
  // Existing alpha is deliberate artwork; automatic mode does not remove more colors.
  if (border.some((offset) => data[offset + 3] < 250)) return undefined;
  const median = [0, 1, 2].map((channel) => {
    const values = border.map((offset) => data[offset + channel]).sort((a, b) => a - b);
    return values[Math.floor(values.length / 2)];
  });
  const matching = border.filter((offset) => colorDistance(data, offset, median) <= tolerance);
  if (matching.length / border.length >= 0.9) return median;
  // A tightly cropped mark can reach the image border. Consistent corners
  // plus a substantial part of the perimeter still identify its uniform exterior.
  // Mixed corners (for example a photograph or a split background) do not.
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, (width * height - 1) * 4];
  const candidate = [0, 1, 2].map((channel) =>
    Math.round(corners.reduce((sum, offset) => sum + data[offset + channel], 0) / corners.length),
  );
  if (!corners.every((offset) => colorDistance(data, offset, candidate) <= tolerance))
    return undefined;
  const exterior = border.filter((offset) => colorDistance(data, offset, candidate) <= tolerance);
  return exterior.length / border.length >= 0.25 ? candidate : undefined;
}

export function removeArtworkBackground(
  input: ArtworkPixels,
  settings: ArtworkSettings,
): CleanArtwork {
  const { data, width, height } = input;
  const output = new Uint8ClampedArray(data);
  if (settings.backgroundMode === 'keep') return { ...input, data: output, background: 'kept' };
  const tolerance = clamp(settings.tolerance ?? 18, 2, 80);
  if (settings.backgroundMode === 'auto') {
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] < 250) return { ...input, data: output, background: 'transparent' };
    }
  }
  const background =
    settings.backgroundMode === 'remove'
      ? [1, 3, 5].map((n) =>
          Number.parseInt((settings.backgroundColor ?? '#ffffff').slice(n, n + 2), 16),
        )
      : borderColor(input, tolerance);
  if (!background) return { ...input, data: output, background: 'unrecognized' };
  const count = width * height;
  const distance = new Float32Array(count);
  const removed = new Uint8Array(count);
  let removedCount = 0;
  for (let p = 0; p < count; p++) {
    distance[p] = colorDistance(data, p * 4, background);
    if (distance[p] <= tolerance || data[p * 4 + 3] === 0) {
      removed[p] = 1;
      removedCount++;
    }
  }
  // Conservative edge unmatting. Only compare colors with the same direction
  // from the background, so neighboring colors cannot recolor the artwork.
  for (let p = 0; p < count; p++) {
    const i = p * 4;
    if (removed[p]) {
      output[i + 3] = 0;
      continue;
    }
    if (data[i + 3] < 250 || distance[p] <= tolerance || distance[p] > 205) continue;
    const x = p % width,
      y = Math.floor(p / width);
    let touchesRemovedBackground = false;
    for (let dy = -1; dy <= 1 && !touchesRemovedBackground; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && removed[ny * width + nx]) {
          touchesRemovedBackground = true;
          break;
        }
      }
    }
    // Only unmatte an actual cut edge. Interior antialiasing on deliberate
    // white artwork must retain both its original color and opacity.
    if (!touchesRemovedBackground) continue;
    const vr = data[i] - background[0],
      vg = data[i + 1] - background[1],
      vb = data[i + 2] - background[2];
    const magnitude = Math.hypot(vr, vg, vb);
    let best = -1,
      contrast = distance[p] + 12,
      bestDistance = Infinity;
    for (let dy = -4; dy <= 4; dy++)
      for (let dx = -4; dx <= 4; dx++) {
        const nx = x + dx,
          ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const q = ny * width + nx,
          j = q * 4,
          d = dx * dx + dy * dy;
        if (data[j + 3] < 250 || distance[q] < contrast) continue;
        const r = data[j] - background[0],
          g = data[j + 1] - background[1],
          b = data[j + 2] - background[2];
        if ((r * vr + g * vg + b * vb) / Math.max(1, Math.hypot(r, g, b) * magnitude) < 0.992)
          continue;
        if (distance[q] > contrast || d < bestDistance) {
          best = q;
          contrast = distance[q];
          bestDistance = d;
        }
      }
    if (best < 0) continue;
    let numerator = 0,
      denominator = 0;
    for (let c = 0; c < 3; c++) {
      const direction = data[best * 4 + c] - background[c];
      numerator += (data[i + c] - background[c]) * direction;
      denominator += direction * direction;
    }
    const alpha = clamp(numerator / Math.max(1, denominator));
    for (let c = 0; c < 3; c++)
      output[i + c] =
        alpha > 0.02 ? clamp((data[i + c] - background[c] * (1 - alpha)) / alpha, 0, 255) : 0;
    output[i + 3] = Math.round(data[i + 3] * alpha);
  }
  return { data: output, width, height, background: removedCount ? 'removed' : 'unrecognized' };
}

/** One appearance pipeline for workers and browsers without module workers. */
export function prepareArtworkPixels(
  input: ArtworkPixels,
  settings: ArtworkSettings,
): CleanArtwork {
  const cleaned = removeArtworkBackground(input, settings);
  if (!settings.inkColor || !/^#[0-9a-f]{6}$/i.test(settings.inkColor)) return cleaned;
  const color = [1, 3, 5].map((offset) =>
    Number.parseInt(settings.inkColor!.slice(offset, offset + 2), 16),
  );
  for (let offset = 0; offset < cleaned.data.length; offset += 4) {
    if (!cleaned.data[offset + 3]) continue;
    cleaned.data.set(color, offset);
  }
  return cleaned;
}

function boxBlur(input: Float32Array, width: number, height: number, radius: number): Float32Array {
  const horizontal = new Float32Array(input.length),
    output = new Float32Array(input.length);
  const size = radius * 2 + 1;
  for (let y = 0; y < height; y++) {
    let sum = 0;
    for (let x = -radius; x <= radius; x++) sum += input[y * width + clamp(x, 0, width - 1)];
    for (let x = 0; x < width; x++) {
      horizontal[y * width + x] = sum / size;
      sum +=
        input[y * width + clamp(x + radius + 1, 0, width - 1)] -
        input[y * width + clamp(x - radius, 0, width - 1)];
    }
  }
  for (let x = 0; x < width; x++) {
    let sum = 0;
    for (let y = -radius; y <= radius; y++) sum += horizontal[clamp(y, 0, height - 1) * width + x];
    for (let y = 0; y < height; y++) {
      output[y * width + x] = sum / size;
      sum +=
        horizontal[clamp(y + radius + 1, 0, height - 1) * width + x] -
        horizontal[clamp(y - radius, 0, height - 1) * width + x];
    }
  }
  return output;
}

export function renderArtworkEmbroidery({ data, width, height }: ArtworkPixels): ArtworkPixels {
  const count = width * height;
  const distance = new Float32Array(count);
  const xx = new Float32Array(count),
    yy = new Float32Array(count),
    xy = new Float32Array(count);
  const alpha = (x: number, y: number) =>
    x < 0 || x >= width || y < 0 || y >= height ? 0 : data[(y * width + x) * 4 + 3] / 255;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      distance[p] = data[p * 4 + 3] > 64 ? Math.min(x + 1, y + 1, width - x, height - y) : 0;
      const gx = alpha(x + 2, y) - alpha(x - 2, y),
        gy = alpha(x, y + 2) - alpha(x, y - 2);
      xx[p] = gx * gx;
      yy[p] = gy * gy;
      xy[p] = gx * gy;
    }
  // Chamfer distance provides a rounded edge profile without a GPU.
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      if (x) distance[p] = Math.min(distance[p], distance[p - 1] + 1);
      if (y) {
        distance[p] = Math.min(distance[p], distance[p - width] + 1);
        if (x) distance[p] = Math.min(distance[p], distance[p - width - 1] + Math.SQRT2);
        if (x + 1 < width)
          distance[p] = Math.min(distance[p], distance[p - width + 1] + Math.SQRT2);
      }
    }
  for (let y = height - 1; y >= 0; y--)
    for (let x = width - 1; x >= 0; x--) {
      const p = y * width + x;
      if (x + 1 < width) distance[p] = Math.min(distance[p], distance[p + 1] + 1);
      if (y + 1 < height) {
        distance[p] = Math.min(distance[p], distance[p + width] + 1);
        if (x) distance[p] = Math.min(distance[p], distance[p + width - 1] + Math.SQRT2);
        if (x + 1 < width)
          distance[p] = Math.min(distance[p], distance[p + width + 1] + Math.SQRT2);
      }
    }
  const radius = Math.max(5, Math.round(width / 32));
  const sx = boxBlur(xx, width, height, radius),
    sy = boxBlur(yy, width, height, radius),
    sxy = boxBlur(xy, width, height, radius);
  const output = new Uint8ClampedArray(data);
  const spacing = 3.6;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const p = y * width + x,
        i = p * 4;
      if (!data[i + 3]) continue;
      // The local boundary tensor estimates the cross-stroke direction. Quantized
      // directions form stable satin-stitch sections instead of a global overlay.
      const angle =
        (Math.round(Math.atan2(2 * sxy[p], sx[p] - sy[p]) / 2 / (Math.PI / 8)) * Math.PI) / 8;
      const cs = Math.cos(angle),
        sn = Math.sin(angle);
      const along = x * cs + y * sn,
        across = -x * sn + y * cs;
      const stagger = Math.sin(Math.floor(across / spacing) * 1.7) * 0.2;
      const phase = ((((across + stagger) / spacing) % 1) + 1) % 1;
      const cylinder = Math.sqrt(Math.max(0, 1 - (phase * 2 - 1) ** 2));
      const groove = Math.pow(1 - cylinder, 1.4);
      const fiber = Math.sin(across * 11 + Math.sin(along * 0.18) * 0.4) * 0.035;
      const seam =
        Math.pow(Math.max(0, Math.cos(along * 0.18 + Math.floor(across / spacing) * 1.8)), 18) *
        0.08;
      const d = distance[p];
      const dx =
        distance[y * width + Math.min(width - 1, x + 1)] - distance[y * width + Math.max(0, x - 1)];
      const dy =
        distance[Math.min(height - 1, y + 1) * width + x] -
        distance[Math.max(0, y - 1) * width + x];
      const edgeLight = (-dx * 0.6 - dy * 0.8) * Math.exp(-d / 3.2) * 0.24;
      const body = 0.82 + cylinder * 0.28 - groove * 0.24 - seam;
      const sheen = Math.pow(cylinder, 9) * (0.085 + 0.055 * Math.abs(cs * 0.6 + sn * 0.8));
      for (let c = 0; c < 3; c++) {
        const base = data[i + c];
        output[i + c] =
          base * body +
          (255 - base) * Math.max(0, sheen + edgeLight + fiber) -
          base * Math.max(0, -edgeLight);
      }
    }
  return { data: output, width, height };
}
