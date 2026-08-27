import { describe, expect, it } from 'vitest';
import { readDesignAttachment } from './designAttachment';

describe('readDesignAttachment', () => {
  it('rechaza formatos que no son imágenes ni PDF', async () => {
    const file = new File(['contenido'], 'referencia.txt', { type: 'text/plain' });
    await expect(readDesignAttachment(file)).rejects.toThrow('JPG, PNG, WEBP o un archivo PDF');
  });

  it('convierte una imagen válida en un adjunto transportable', async () => {
    const file = new File(['imagen'], 'logo.png', { type: 'image/png' });
    const attachment = await readDesignAttachment(file);

    expect(attachment.name).toBe('logo.png');
    expect(attachment.mediaType).toBe('image/png');
    expect(attachment.dataUrl).toMatch(/^data:image\/png;base64,/);
  });
});
