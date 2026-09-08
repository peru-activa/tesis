import { useEffect, useRef, useState } from 'react';

interface PreparedGarment {
  width: number;
  height: number;
  alpha: Uint8ClampedArray;
  luminance: Uint8ClampedArray;
  averageLuminance: number;
}

const preparedGarments = new Map<string, Promise<PreparedGarment>>();
const DEFAULT_COLOR = '#17243A';

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function parseHexColor(value: string): [number, number, number] {
  const normalized = /^#[0-9a-f]{6}$/i.test(value.trim()) ? value.trim() : DEFAULT_COLOR;
  return [
    Number.parseInt(normalized.slice(1, 3), 16),
    Number.parseInt(normalized.slice(3, 5), 16),
    Number.parseInt(normalized.slice(5, 7), 16),
  ];
}

function rgbToHsl(red: number, green: number, blue: number): [number, number, number] {
  const r = red / 255;
  const g = green / 255;
  const b = blue / 255;
  const maximum = Math.max(r, g, b);
  const minimum = Math.min(r, g, b);
  const lightness = (maximum + minimum) / 2;
  if (maximum === minimum) return [0, 0, lightness];

  const delta = maximum - minimum;
  const saturation =
    lightness > 0.5 ? delta / (2 - maximum - minimum) : delta / (maximum + minimum);
  const hue =
    maximum === r
      ? (g - b) / delta + (g < b ? 6 : 0)
      : maximum === g
        ? (b - r) / delta + 2
        : (r - g) / delta + 4;
  return [hue / 6, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  if (saturation === 0) {
    const gray = Math.round(lightness * 255);
    return [gray, gray, gray];
  }
  const hueToRgb = (p: number, q: number, offset: number) => {
    let channel = offset;
    if (channel < 0) channel += 1;
    if (channel > 1) channel -= 1;
    if (channel < 1 / 6) return p + (q - p) * 6 * channel;
    if (channel < 1 / 2) return q;
    if (channel < 2 / 3) return p + (q - p) * (2 / 3 - channel) * 6;
    return p;
  };
  const q =
    lightness < 0.5
      ? lightness * (1 + saturation)
      : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  return [
    Math.round(hueToRgb(p, q, hue + 1 / 3) * 255),
    Math.round(hueToRgb(p, q, hue) * 255),
    Math.round(hueToRgb(p, q, hue - 1 / 3) * 255),
  ];
}

function prepareGarment(source: string): Promise<PreparedGarment> {
  const cached = preparedGarments.get(source);
  if (cached) return cached;

  const prepared = new Promise<PreparedGarment>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) {
        reject(new Error('Canvas no disponible'));
        return;
      }
      context.drawImage(image, 0, 0);
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      const pixelCount = canvas.width * canvas.height;
      const garment = new Uint8Array(pixelCount);
      const queue = new Int32Array(pixelCount);
      let head = 0;
      let tail = 0;
      const seed = Math.floor(canvas.height / 2) * canvas.width + Math.floor(canvas.width / 2);
      queue[tail++] = seed;
      garment[seed] = 1;

      while (head < tail) {
        const index = queue[head++];
        const x = index % canvas.width;
        const neighbors = [
          x > 0 ? index - 1 : -1,
          x < canvas.width - 1 ? index + 1 : -1,
          index >= canvas.width ? index - canvas.width : -1,
          index < pixelCount - canvas.width ? index + canvas.width : -1,
        ];
        for (const neighbor of neighbors) {
          if (neighbor < 0 || garment[neighbor]) continue;
          const offset = neighbor * 4;
          const distanceFromWhite = Math.max(
            255 - pixels[offset],
            255 - pixels[offset + 1],
            255 - pixels[offset + 2],
          );
          if (pixels[offset + 3] > 0 && distanceFromWhite > 7) {
            garment[neighbor] = 1;
            queue[tail++] = neighbor;
          }
        }
      }

      const alpha = new Uint8ClampedArray(pixelCount);
      const luminance = new Uint8ClampedArray(pixelCount);
      let luminanceTotal = 0;
      let garmentPixels = 0;
      for (let index = 0; index < pixelCount; index += 1) {
        if (!garment[index]) continue;
        const offset = index * 4;
        const distanceFromWhite = Math.max(
          255 - pixels[offset],
          255 - pixels[offset + 1],
          255 - pixels[offset + 2],
        );
        const value = Math.round(
          pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722,
        );
        luminance[index] = value;
        alpha[index] = Math.round(pixels[offset + 3] * clamp((distanceFromWhite - 4) / 18));
        if (alpha[index] > 128) {
          luminanceTotal += value;
          garmentPixels += 1;
        }
      }
      resolve({
        width: canvas.width,
        height: canvas.height,
        alpha,
        luminance,
        averageLuminance: luminanceTotal / Math.max(1, garmentPixels),
      });
    };
    image.onerror = () => reject(new Error('No se pudo cargar la imagen de la prenda'));
    image.src = source;
  });
  preparedGarments.set(source, prepared);
  return prepared;
}

function paintGarment(canvas: HTMLCanvasElement, garment: PreparedGarment, color: string) {
  canvas.width = garment.width;
  canvas.height = garment.height;
  const context = canvas.getContext('2d');
  if (!context) return;
  const result = context.createImageData(garment.width, garment.height);
  const [hue, saturation, targetLightness] = rgbToHsl(...parseHexColor(color));

  for (let index = 0; index < garment.alpha.length; index += 1) {
    if (!garment.alpha[index]) continue;
    const lightness = clamp(
      targetLightness + ((garment.luminance[index] - garment.averageLuminance) / 255) * 1.35,
      0.035,
      0.965,
    );
    const [red, green, blue] = hslToRgb(hue, saturation, lightness);
    const offset = index * 4;
    result.data[offset] = red;
    result.data[offset + 1] = green;
    result.data[offset + 2] = blue;
    result.data[offset + 3] = garment.alpha[index];
  }
  context.putImageData(result, 0, 0);
}

export function RecolorableGarmentImage({
  src,
  color,
  alt,
  className,
}: {
  src: string;
  color: string;
  alt: string;
  className?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    prepareGarment(src)
      .then((garment) => {
        if (!cancelled && canvas.current) paintGarment(canvas.current, garment, color);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [color, src]);

  if (failed) return <img className={className} src={src} alt={alt} />;
  return <canvas ref={canvas} className={className} role="img" aria-label={alt} />;
}
