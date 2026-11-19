import { z } from 'zod';

export const designFontFamilies = ['Montserrat', 'Oswald', 'Lora', 'Dancing Script'] as const;

export const designTextSchema = z.object({
  value: z
    .string()
    .trim()
    .min(1, 'Escribe el texto.')
    .max(160, 'Usa hasta 160 caracteres.')
    .refine((value) => value.split(/\r\n?|\n/).length <= 4, 'Usa hasta cuatro líneas.'),
  fontFamily: z.enum(designFontFamilies),
  weight: z.union([z.literal(400), z.literal(700)]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
});

export type DesignText = z.infer<typeof designTextSchema>;
