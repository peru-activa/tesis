import type { FabricSupply, MaterialFamily } from '../domain/contracts.js';

export interface PoloFabricCatalogEntry {
  id: string;
  displayName: string;
  aliases: string[];
  use: 'main' | 'complement';
  family: MaterialFamily;
}

export const POLO_FABRIC_CATALOG_VERSION = 'polo-fabrics-peru-activa-v1';

export const poloFabricCatalog: PoloFabricCatalogEntry[] = [
  {
    id: 'cotton',
    displayName: 'Algodón',
    aliases: ['algodón'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'pima-20-1',
    displayName: 'Pima 20/1',
    aliases: ['pima 20/1'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'pima-30-1',
    displayName: 'Pima 30/1',
    aliases: ['pima 30/1'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'cotton-pyme',
    displayName: 'Algodón pyme',
    aliases: ['algodón pyme'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'cotton-reactive-20-1',
    displayName: 'Algodón reactivo 20/1',
    aliases: ['algodón reactivo 20/1'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'jersey-20-1-polycotton',
    displayName: 'Jersey 20/1 peinado reactivo Polycotton',
    aliases: ['jersey 20/1 peinado reactivo polycotton', 'jersey 20/1 polycotton'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'jersey-24-1-polycotton',
    displayName: 'Jersey 24/1 peinado reactivo Polycotton',
    aliases: ['jersey 24/1 peinado reactivo polycotton', 'jersey 24/1 polycotton'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'jersey-30-1-polycotton',
    displayName: 'Jersey 30/1 peinado reactivo Polycotton',
    aliases: [
      'jersey 30/1 peinado reactivo polycotton',
      'jersey 30/1 polycotton',
      'algodón jersey 30/1',
      'algodón 30/1',
    ],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'pique-24-1',
    displayName: 'Piqué 24/1',
    aliases: ['piqué 24/1', 'algodón piqué 24/1'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'pique-30-1-lacoste',
    displayName: 'Piqué 30/1 Lacoste',
    aliases: ['piqué 30/1 lacoste'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'pique-lacoste',
    displayName: 'Piqué tipo Lacoste',
    aliases: ['piqué tipo lacoste', 'piqué lacoste'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'franela',
    displayName: 'Franela',
    aliases: ['franela', 'franela 20/1'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'interlock',
    displayName: 'Interlock',
    aliases: ['interlock'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'dry-fit',
    displayName: 'Dry Fit',
    aliases: ['dry fit', 'dry-fit', 'inter dryer'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'win',
    displayName: 'Win',
    aliases: ['win', 'winfresh'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'microfiber-sports',
    displayName: 'Microfibra deportiva',
    aliases: ['microfibra deportiva'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'poly-tricot',
    displayName: 'Poly Tricot deportivo',
    aliases: ['poly tricot deportivo', 'tricot deportivo'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'zanetti',
    displayName: 'Zanetti',
    aliases: ['zanetti'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'sports-polyester',
    displayName: 'Poliéster deportivo',
    aliases: ['poliéster', '100 % poliéster', '100% poliéster'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'full-lycra-30-1',
    displayName: 'Full Licra 30/1',
    aliases: ['full licra 30/1', 'full lycra 30/1'],
    use: 'main',
    family: 'stretch_knit',
  },
  {
    id: 'jersey-spun-20-1',
    displayName: 'Jersey 20/1 Spun 100 % poliéster',
    aliases: ['jersey 20/1 spun 100 % poliéster', 'jersey 20/1 spun 100% poliéster'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'jersey-spun-30-1',
    displayName: 'Jersey 30/1 Spun 100 % poliéster',
    aliases: ['jersey 30/1 spun 100 % poliéster', 'jersey 30/1 spun 100% poliéster'],
    use: 'main',
    family: 'sports_knit',
  },
  {
    id: 'waffle-20-1',
    displayName: 'Waffle 20/1 peinado reactivo',
    aliases: ['waffle 20/1 peinado reactivo'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'jersey-two-ply-heavy',
    displayName: 'Jersey dos cabos ultra pesado',
    aliases: ['jersey 2 cabos ultra pesado', 'jersey dos cabos ultra pesado'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'suede-50-1',
    displayName: 'Gamuza 50/1',
    aliases: ['gamuza 50/1'],
    use: 'main',
    family: 'cotton_knit',
  },
  {
    id: 'rib-1x1-20-1-polycotton',
    displayName: 'Rib 1×1 20/1 Polycotton',
    aliases: ['rib 1x1 20/1 polycotton', 'rib 1x1 20/1 peinado reactivo polycotton'],
    use: 'complement',
    family: 'cotton_knit',
  },
  {
    id: 'rib-1x1-24-1-polycotton',
    displayName: 'Rib 1×1 24/1 Polycotton',
    aliases: ['rib 1x1 24/1 polycotton', 'rib 1x1 24/1 peinado reactivo polycotton'],
    use: 'complement',
    family: 'cotton_knit',
  },
  {
    id: 'rib-1x1-30-1-polycotton',
    displayName: 'Rib 1×1 30/1 Polycotton',
    aliases: ['rib 1x1 30/1 polycotton', 'rib 1x1 30/1 peinado reactivo polycotton'],
    use: 'complement',
    family: 'cotton_knit',
  },
  {
    id: 'rib-1x1-20-1-spun',
    displayName: 'Rib 1×1 20/1 Spun 100 % poliéster',
    aliases: ['rib 1x1 20/1 spun 100 % poliéster', 'rib 1x1 20/1 spun 100% poliéster'],
    use: 'complement',
    family: 'sports_knit',
  },
  {
    id: 'rib-1x1-30-1-spun',
    displayName: 'Rib 1×1 30/1 Spun 100 % poliéster',
    aliases: ['rib 1x1 30/1 spun 100 % poliéster', 'rib 1x1 30/1 spun 100% poliéster'],
    use: 'complement',
    family: 'sports_knit',
  },
  {
    id: 'rib-polycotton',
    displayName: 'Rib polialgodón',
    aliases: ['rib polialgodón'],
    use: 'complement',
    family: 'cotton_knit',
  },
  {
    id: 'rib-2x1-heavy-lycra',
    displayName: 'Rib 2×1 grueso licrado',
    aliases: ['rib 2x1 grueso licrado'],
    use: 'complement',
    family: 'stretch_knit',
  },
];

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[×]/g, 'x')
    .replace(/[–—-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es-PE');
}

const exactAliases = new Set([
  'algodon',
  'franela',
  'poliester',
  '100 % poliester',
  '100% poliester',
]);

export function poloFabricFor(value: string): PoloFabricCatalogEntry | undefined {
  const normalized = normalize(value);
  return poloFabricCatalog.find((fabric) =>
    fabric.aliases.some((alias) => {
      const normalizedAlias = normalize(alias);
      return exactAliases.has(normalizedAlias)
        ? normalized === normalizedAlias
        : normalized.includes(normalizedAlias);
    }),
  );
}

export function fabricSupplyForPoloMaterial(value: string): FabricSupply {
  if (poloFabricFor(value)) {
    return {
      category: 'base',
      minimumLeadTimeDays: 0,
      maximumLeadTimeDays: 0,
      remainingLeadTimeDays: 0,
    };
  }
  return {
    category: 'imported',
    minimumLeadTimeDays: 7,
    maximumLeadTimeDays: 14,
    remainingLeadTimeDays: 14,
  };
}
