export const PET_PLANNER_TOTAL_TIMEOUT_MS = 270_000;
export const PET_PLANNING_TIMEOUT_MS = 180_000;
export const PET_COMPILATION_TIMEOUT_MS = 60_000;

export type PetPlanningPhase = 'planning' | 'repair' | 'compilation';
export interface PetProviderDiagnostics {
  phase: PetPlanningPhase;
  kind: 'timeout' | 'connection';
  elapsedMs: number;
  timeoutMs: number;
  totalElapsedMs: number;
}

/** A shared deadline reserves time for compilation without retrying paid requests. */
export function createPetPlanningBudget(clock: () => number = Date.now) {
  const startedAt = clock();
  const elapsed = () => Math.max(0, clock() - startedAt);
  return {
    forPhase(phase: PetPlanningPhase) {
      const remaining = PET_PLANNER_TOTAL_TIMEOUT_MS - elapsed();
      const reserved = phase === 'compilation' ? 0 : PET_COMPILATION_TIMEOUT_MS;
      const limit = phase === 'compilation' ? PET_COMPILATION_TIMEOUT_MS : PET_PLANNING_TIMEOUT_MS;
      return Math.max(0, Math.floor(Math.min(limit, remaining - reserved)));
    },
    failure(phase: PetPlanningPhase, error: unknown, signal: AbortSignal | null, callStartedAt: number, timeoutMs: number): PetProviderDiagnostics {
      const name = error && typeof error === 'object' && 'name' in error ? error.name : '';
      return {
        phase,
        kind: !signal || signal.aborted || name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'connection',
        elapsedMs: Math.max(0, clock() - callStartedAt),
        timeoutMs,
        totalElapsedMs: elapsed(),
      };
    },
  };
}
