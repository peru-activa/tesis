import { artworkThumbnail } from './artworkThumbnail';
import { visibleArtworkBounds, type ArtworkGeometry } from './artworkBounds';
import type { DesignAttachment } from './designAttachment';
import type { ArtworkSettings, ArtworkPixels, CleanArtwork } from './designArtworkPixels';
import type { ArtworkWorkerRequest } from './designArtwork.worker';

export interface PreparedDesignArtwork {
  source: string;
  thumbnailSource?: string;
  thumbnailBackground?: string;
  background: CleanArtwork['background'];
  aspectRatio?: number;
  geometry?: ArtworkGeometry;
}

interface PreparedBase extends PreparedDesignArtwork {
  pixels: ArtworkPixels;
}

export const defaultArtworkSettings: ArtworkSettings = { backgroundMode: 'auto' };
const baseCache = new Map<string, Promise<PreparedBase>>();
const embroideryCache = new Map<string, Promise<PreparedDesignArtwork>>();
const CACHE_LIMIT = 6;
let queue = Promise.resolve();

export function artworkSettings(attachment: DesignAttachment): ArtworkSettings {
  return attachment.preview ?? defaultArtworkSettings;
}

export function artworkKey(attachment: DesignAttachment): string {
  return `${attachment.dataUrl}|${JSON.stringify(artworkSettings(attachment))}`;
}

function cached<T>(
  cache: Map<string, Promise<T>>,
  key: string,
  work: () => Promise<T>,
): Promise<T> {
  const existing = cache.get(key);
  if (existing) {
    cache.delete(key);
    cache.set(key, existing);
    return existing;
  }
  const task = work().catch((error: unknown) => {
    if (cache.get(key) === task) cache.delete(key);
    throw error;
  });
  cache.set(key, task);
  if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!);
  return task;
}

function schedule<T>(work: () => Promise<T>): Promise<T> {
  const task = queue.then(work);
  queue = task.then(
    () => undefined,
    () => undefined,
  );
  return task;
}

async function processPixels(
  request: ArtworkWorkerRequest,
): Promise<ArtworkPixels & { background?: CleanArtwork['background'] }> {
  if (typeof Worker !== 'undefined') {
    try {
      return await new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./designArtwork.worker.ts', import.meta.url), {
          type: 'module',
        });
        const timeout = setTimeout(() => {
          worker.terminate();
          reject(new Error('El procesamiento tardó demasiado.'));
        }, 15_000);
        const stop = () => {
          clearTimeout(timeout);
          worker.terminate();
        };
        worker.onmessage = ({
          data,
        }: MessageEvent<{
          result?: ArtworkPixels & { background?: CleanArtwork['background'] };
          error?: string;
        }>) => {
          stop();
          if (data.result) resolve(data.result);
          else reject(new Error(data.error ?? 'No se pudo preparar el logo.'));
        };
        worker.onerror = (event) => {
          event.preventDefault();
          stop();
          reject(new Error('No se pudo preparar el logo.'));
        };
        try {
          worker.postMessage(request);
        } catch (error) {
          stop();
          reject(error);
        }
      });
    } catch {
      // Browsers which block module workers still support the same pixel algorithm.
    }
  }
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
  const engine = await import('./designArtworkPixels');
  return request.mode === 'clean'
    ? engine.prepareArtworkPixels(request.pixels, request.settings)
    : engine.renderArtworkEmbroidery(request.pixels);
}

function createCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function pixelCanvas(pixels: ArtworkPixels): HTMLCanvasElement {
  const canvas = createCanvas(pixels.width, pixels.height);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Este navegador no permite preparar la vista del logo.');
  const output = context.createImageData(pixels.width, pixels.height);
  output.data.set(pixels.data);
  context.putImageData(output, 0, 0);
  return canvas;
}

function readPixels(source: string): Promise<ArtworkPixels> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      try {
        if (image.naturalWidth * image.naturalHeight > 25_000_000)
          throw new Error('La imagen es demasiado grande para preparar esta vista.');
        const limit = typeof Worker === 'undefined' ? 512 : 768;
        const ratio = Math.min(1, limit / Math.max(image.naturalWidth, image.naturalHeight));
        const width = Math.max(1, Math.round(image.naturalWidth * ratio));
        const height = Math.max(1, Math.round(image.naturalHeight * ratio));
        const canvas = createCanvas(width, height);
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) throw new Error('Este navegador no permite preparar la vista del logo.');
        context.drawImage(image, 0, 0, width, height);
        const pixels = context.getImageData(0, 0, width, height);
        resolve({ data: pixels.data, width, height });
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => reject(new Error('No se pudo leer la imagen del logo.'));
    image.src = source;
  });
}

export async function prepareDesignArtwork(
  attachment: DesignAttachment,
  embroidery = false,
): Promise<PreparedDesignArtwork> {
  if (!attachment.mediaType.startsWith('image/'))
    return { source: attachment.dataUrl, background: 'kept' };
  const key = artworkKey(attachment);
  const base = await cached(baseCache, key, () =>
    schedule(async () => {
      const pixels = await readPixels(attachment.dataUrl);
      const cleaned = await processPixels({
        mode: 'clean',
        pixels,
        settings: artworkSettings(attachment),
      });
      const background = cleaned.background ?? 'kept';
      const content = visibleArtworkBounds(cleaned);
      const source =
        background === 'removed' || artworkSettings(attachment).inkColor
          ? pixelCanvas(cleaned).toDataURL('image/png')
          : attachment.dataUrl;
      const thumbnail = artworkThumbnail(cleaned);
      return {
        source,
        background,
        pixels: cleaned,
        aspectRatio: cleaned.width / cleaned.height,
        geometry: { width: cleaned.width, height: cleaned.height, content },
        thumbnailSource: pixelCanvas(thumbnail.pixels).toDataURL('image/png'),
        thumbnailBackground: thumbnail.background,
      };
    }),
  );
  if (!embroidery) return base;
  return cached(embroideryCache, key, () =>
    schedule(async () => {
      // A bounded working texture keeps thread detail stable while resizing the logo.
      const ratio = Math.min(512 / Math.max(base.pixels.width, base.pixels.height), 8);
      const width = Math.max(1, Math.round(base.pixels.width * ratio));
      const height = Math.max(1, Math.round(base.pixels.height * ratio));
      const canvas = createCanvas(width, height);
      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('No se pudo preparar la textura de bordado.');
      context.imageSmoothingQuality = 'high';
      context.drawImage(pixelCanvas(base.pixels), 0, 0, width, height);
      const pixels = context.getImageData(0, 0, width, height);
      const result = await processPixels({
        mode: 'embroidery',
        pixels: { data: pixels.data, width, height },
        settings: artworkSettings(attachment),
      });
      return {
        source: pixelCanvas(result).toDataURL('image/png'),
        background: base.background,
        aspectRatio: base.aspectRatio,
        geometry: base.geometry,
      };
    }),
  );
}
