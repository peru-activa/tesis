import type { RecommendationResult } from './contracts.js';

export const WORKSHOP_RESPONSE_WINDOW_MINUTES = 12 * 60;

type Candidate = RecommendationResult['candidates'][number];

/** Avoid splitting work when an already feasible subset covers the whole order. */
export function withoutRedundantSplits(candidates: Candidate[]): Candidate[] {
  return candidates.filter((candidate) => !candidates.some((alternative) =>
    alternative.allocations.length < candidate.allocations.length &&
    alternative.allocations.every((allocation) => candidate.allocations.some((other) =>
      allocation.workshopId === other.workshopId &&
      (allocation.assignedProcesses ?? []).every((process) =>
        (other.assignedProcesses ?? []).includes(process)),
    )),
  ));
}

export interface AssignmentAutomation {
  revision: number;
  phase: 'running' | 'paused' | 'assigned' | 'exhausted';
  authorizedAt: string;
  authorizedBy: string;
  candidateIds: string[];
  candidateId: string;
  attemptedWorkshopIds: string[];
  notifiedWorkshopIds: string[];
  declinedWorkshopIds: string[];
  expiredWorkshopIds?: string[];
  responseWindowMinutes?: number;
  availabilityReferences?: Record<string, string>;
  retryRequestId?: string;
  priorRuns?: AssignmentAutomation[];
  expirations?: Array<{ candidateId: string; workshopIds: string[]; at: string }>;
  rejections: Array<{ candidateId: string; workshopIds: string[]; at: string }>;
  message?: string;
  lease?: { owner: string; expiresAt: string };
}
