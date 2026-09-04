import type { RecommendationRequest } from './contracts.js';

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .trim()
    .toLocaleLowerCase('es-PE');
}

export function materialAlternativesFor(request: RecommendationRequest): string[] {
  const material = normalize(request.order.material);
  const isGenericSportsPolyester =
    request.order.product === 'polo' &&
    request.order.poloType === 'sports' &&
    ['poliester', '100% poliester', '100 % poliester'].includes(material);

  return isGenericSportsPolyester ? ['Dry Fit', 'Win'] : [request.order.material];
}

export function recommendationRequestsForMaterialAlternatives(
  request: RecommendationRequest,
): RecommendationRequest[] {
  return materialAlternativesFor(request).map((material) => ({
    ...request,
    order: { ...request.order, material },
  }));
}
