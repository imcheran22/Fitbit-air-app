// The persistence rule: patterns must not flicker in and out between weekly
// runs, and a single lucky week must not become a finding.
//
//   first pass                                  -> CANDIDATE
//   two CONSECUTIVE passes                      -> CONFIRMED
//   CONFIRMED + two CONSECUTIVE misses          -> RETIRED (one miss changes nothing)
//   RETIRED + two CONSECUTIVE passes            -> CONFIRMED again
//
// "Consecutive" is tracked by resetting the opposite counter, so a
// pass/miss/pass sequence never confirms. A hypothesis that has never passed
// has no row at all (prev === null and a miss stays null).

export type HabitCorrelationStatus = 'CANDIDATE' | 'CONFIRMED' | 'RETIRED';

export const PASSES_TO_CONFIRM = 2;
export const MISSES_TO_RETIRE = 2;

export interface LifecycleState {
  status: HabitCorrelationStatus;
  consecutivePasses: number;
  consecutiveMisses: number;
}

/** State after one weekly run. `passed` = survived BH at q<0.10 and |r|>0.3 in that run. */
export function nextLifecycleState(prev: LifecycleState | null, passed: boolean): LifecycleState | null {
  if (prev === null) {
    return passed ? { status: 'CANDIDATE', consecutivePasses: 1, consecutiveMisses: 0 } : null;
  }

  if (passed) {
    const consecutivePasses = prev.consecutivePasses + 1;
    const confirms = prev.status !== 'CONFIRMED' && consecutivePasses >= PASSES_TO_CONFIRM;
    return {
      status: confirms ? 'CONFIRMED' : prev.status,
      consecutivePasses,
      consecutiveMisses: 0,
    };
  }

  const consecutiveMisses = prev.consecutiveMisses + 1;
  const retires = prev.status === 'CONFIRMED' && consecutiveMisses >= MISSES_TO_RETIRE;
  return {
    status: retires ? 'RETIRED' : prev.status,
    consecutivePasses: 0,
    consecutiveMisses,
  };
}
