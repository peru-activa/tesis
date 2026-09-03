import type { MaterialFamily } from './contracts.js';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('es-PE');
}

export function materialFamilyFor(material: string): MaterialFamily | undefined {
  const normalized = normalize(material);

  if (
    [
      'zanetti',
      'win',
      'winfresh',
      'dry fit',
      'dry-fit',
      'dri-fit',
      'microtech',
      'microfibra deportiva',
      'hidrotech',
      'hydrotech',
      'lafayette',
      'atlantic',
      'micronike',
      'umbrela',
      'tricot deportivo',
      'poly tricot',
      'policuadros',
      'poli hexagonos',
      'polystrech',
      'polystretch',
      'poliester deportivo',
    ].some((name) => normalized.includes(name))
  ) {
    return 'sports_knit';
  }
  if (normalized.includes('licra') || normalized.includes('lycra')) return 'stretch_knit';
  if (
    ['algodon', 'pima', 'pique', 'lacoste', 'franela', 'polycotton', 'polialgodon'].some((name) =>
      normalized.includes(name),
    )
  ) {
    return 'cotton_knit';
  }
  if (
    ['lona', 'camisa de vestir', 'mameluco', 'tela plana'].some((name) => normalized.includes(name))
  ) {
    return 'woven';
  }

  return undefined;
}
