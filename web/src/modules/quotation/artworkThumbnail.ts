import type { ArtworkPixels } from './designArtworkPixels';
import { trimArtworkPixels } from './artworkBounds';

/** Only thumbnails are tightly framed; placement keeps its original canvas. */
export function artworkThumbnail(input: ArtworkPixels): {
  pixels: ArtworkPixels;
  background: string;
} {
  const pixels = trimArtworkPixels(input);
  const { width, height, data } = pixels;
  let luminance = 0,
    opacity = 0;
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4,
        alpha = data[i + 3] / 255;
      if (alpha <= 0.03) continue;
      luminance += (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]) * alpha;
      opacity += alpha;
    }
  const background = opacity && luminance / opacity > 155 ? '#334155' : '#f1f5f9';
  return { pixels, background };
}
