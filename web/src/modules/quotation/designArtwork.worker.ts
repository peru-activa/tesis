import {
  prepareArtworkPixels,
  renderArtworkEmbroidery,
  type ArtworkSettings,
  type ArtworkPixels,
} from './designArtworkPixels';

export interface ArtworkWorkerRequest {
  mode: 'clean' | 'embroidery';
  pixels: ArtworkPixels;
  settings: ArtworkSettings;
}

self.onmessage = ({ data: request }: MessageEvent<ArtworkWorkerRequest>) => {
  try {
    const result =
      request.mode === 'clean'
        ? prepareArtworkPixels(request.pixels, request.settings)
        : renderArtworkEmbroidery(request.pixels);
    self.postMessage({ result }, { transfer: [result.data.buffer] });
  } catch {
    self.postMessage({ error: 'No se pudo preparar la vista del logo.' });
  }
};
