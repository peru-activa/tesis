import type { Workshop } from './contracts.js';

/** Trusted execution metadata. Client form input never sets this scope. */
export interface WorkshopScope {
  testOnly?: boolean;
  allowedWorkshopIds?: string[];
}

export function workshopsForScope(workshops: Workshop[], scope: WorkshopScope): Workshop[] {
  if (scope.testOnly && !scope.allowedWorkshopIds?.length) return [];
  return workshops.filter((workshop) => Boolean(workshop.testOnly) === Boolean(scope.testOnly)
    && (!scope.allowedWorkshopIds || scope.allowedWorkshopIds.includes(workshop.id)));
}
