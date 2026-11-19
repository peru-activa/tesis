import { designTextSchema, type DesignText } from '../../../../src/domain/design-text';
import type { DesignAttachment } from './designAttachment';

export const designFonts: Record<DesignText['fontFamily'], { file: string; sample: string }> = {
  Montserrat: { file: 'montserrat.ttf', sample: 'Moderna y clara' },
  Oswald: { file: 'oswald.ttf', sample: 'Compacta y deportiva' },
  Lora: { file: 'lora.ttf', sample: 'Clásica con cuerpo' },
  'Dancing Script': { file: 'dancingscript.ttf', sample: 'Manuscrita' },
};
const loadedFonts = new Map<string, Promise<void>>();

export function loadDesignFont(family: DesignText['fontFamily']): Promise<void> {
  const cached = loadedFonts.get(family);
  if (cached) return cached;
  const task = (async () => {
    const font = new FontFace(
      `Design ${family}`,
      `url('/fonts/design/${designFonts[family].file}')`,
      { weight: '100 900' },
    );
    await font.load();
    document.fonts.add(font);
  })().catch((error: unknown) => {
    loadedFonts.delete(family);
    throw error;
  });
  loadedFonts.set(family, task);
  return task;
}

export async function createTextAttachment(
  input: DesignText,
): Promise<{ attachment: DesignAttachment; aspectRatio: number }> {
  const text = designTextSchema.parse({ ...input, value: input.value.replace(/\r\n?/g, '\n') });
  await loadDesignFont(text.fontFamily);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No se pudo preparar el texto.');
  const lines = text.value.split('\n');
  const fontSize = 100;
  const font = `${text.weight} ${fontSize}px "Design ${text.fontFamily}"`;
  context.font = font;
  const widths = lines.map((line) => context.measureText(line).width);
  const width = Math.max(1, ...widths) + 48;
  const height = lines.length * 145 + 40;
  const scale = Math.min(1, 1800 / Math.max(width, height));
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);
  context.scale(scale, scale);
  context.font = font;
  context.textBaseline = 'alphabetic';
  context.textAlign = 'center';
  context.fillStyle = text.color;
  lines.forEach((line, index) => context.fillText(line, width / 2, 125 + index * 145));
  const dataUrl = canvas.toDataURL('image/png');
  const sizeBytes = Math.floor(((dataUrl.split(',')[1]?.length ?? 0) * 3) / 4);
  return {
    aspectRatio: width / height,
    attachment: {
      name: 'texto-personalizado.png',
      mediaType: 'image/png',
      sizeBytes,
      dataUrl,
      text,
      preview: { backgroundMode: 'keep' },
    },
  };
}
