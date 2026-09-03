export interface SublimationMaterial {
  id: string;
  displayName: string;
  aliases: string[];
}

export const declaredSyntheticSublimationMaterials: SublimationMaterial[] = [
  { id: 'dry-fit', displayName: 'Dry Fit', aliases: ['dry', 'dry fit', 'dry-fit'] },
  { id: 'raso', displayName: 'Raso', aliases: ['raso', 'razo'] },
  { id: 'fayli', displayName: 'Fayli', aliases: ['fayli', 'faylli', 'faille'] },
  { id: 'pongee', displayName: 'Pongee', aliases: ['pongee', 'ponge'] },
  { id: 'taslan', displayName: 'Taslan', aliases: ['taslan'] },
  {
    id: 'polystretch',
    displayName: 'Polystretch',
    aliases: ['polystretch', 'polystrech', 'polistrech'],
  },
  {
    id: 'piel-de-angel',
    displayName: 'Piel de ángel',
    aliases: ['piel de angel'],
  },
  { id: 'gasa', displayName: 'Gasa', aliases: ['gasa'] },
  {
    id: 'french-terry',
    displayName: 'French Terry',
    aliases: ['french terry'],
  },
  { id: 'suplex', displayName: 'Suplex', aliases: ['suplex'] },
  { id: 'tafetan', displayName: 'Tafetán', aliases: ['tafetan', 'taffeta'] },
  { id: 'gamuza', displayName: 'Gamuza', aliases: ['gamuza'] },
  {
    id: 'malla-de-aire',
    displayName: 'Malla de aire',
    aliases: ['malla de aire'],
  },
  { id: 'microfibra', displayName: 'Microfibra', aliases: ['microfibra'] },
  { id: 'polar', displayName: 'Polar', aliases: ['polar'] },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('es-PE');
}

export function canonicalSublimationMaterial(value: string): string | undefined {
  const normalized = normalize(value);
  return declaredSyntheticSublimationMaterials.find((material) =>
    material.aliases.some((alias) => normalized.includes(alias)),
  )?.id;
}
