import type { Workshop } from './contracts.js';

export function materialProductionKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('es-PE');
}

/** A rate belongs to its declared material scope; unknown overrides never borrow a base rate. */
export function productionForMaterial(workshop: Workshop, material: string): Workshop {
  const key = materialProductionKey(material);
  const profile = workshop.productionByMaterial?.find((item) =>
    item.materials.some((name) => materialProductionKey(name) === key),
  );
  if (profile)
    return {
      ...workshop,
      capacityStatus: profile.capacityStatus,
      productionRate: profile.capacityStatus === 'known' ? profile.productionRate : undefined,
      estimatedLeadTimeDays: profile.estimatedLeadTimeDays ?? workshop.estimatedLeadTimeDays,
    };
  if (
    workshop.baseProductionMaterials &&
    !workshop.baseProductionMaterials.some((name) => materialProductionKey(name) === key)
  ) {
    return { ...workshop, capacityStatus: 'unknown', productionRate: undefined };
  }
  return workshop;
}
