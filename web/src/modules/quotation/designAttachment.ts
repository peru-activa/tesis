import type { QuotationRequestDraft } from '../../../../src/domain/quotation-requests';

export type DesignAttachment = NonNullable<QuotationRequestDraft['garment']['designAttachment']>;

export const MAX_DESIGN_ATTACHMENT_BYTES = 2_000_000;

const acceptedMediaTypes = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);

export async function readDesignAttachment(file: File): Promise<DesignAttachment> {
  if (!acceptedMediaTypes.has(file.type)) {
    throw new Error('Usa una imagen JPG, PNG, WEBP o un archivo PDF.');
  }
  if (file.size === 0) {
    throw new Error('El archivo está vacío.');
  }
  if (file.size > MAX_DESIGN_ATTACHMENT_BYTES) {
    throw new Error('El archivo debe pesar como máximo 2 MB.');
  }

  return {
    name: file.name,
    mediaType: file.type as DesignAttachment['mediaType'],
    sizeBytes: file.size,
    dataUrl: await fileAsDataUrl(file),
  };
}

function fileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('No se pudo leer el archivo.'));
    reader.readAsDataURL(file);
  });
}
