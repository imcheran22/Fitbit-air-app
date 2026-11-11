// The observed-day rule. "Didn't do it" and "didn't log it" look identical in
// raw data, so a day only counts for a habit type when the user said something
// about it; an unobserved day is MISSING, never a non-exposure. Without this,
// every unlogged day would silently become the control group.

export interface HabitLogLike {
  habitType: string;
  value: number;
  /** YYYY-MM-DD, as stored at write time. */
  habitDay: string;
}

export interface ObservedDay {
  day: string;
  exposed: boolean;
}

export interface ExposureRule {
  type: string;
  exposureThreshold: number;
  /**
   * The first day this type could be observed at all (YYYY-MM-DD). Check-in
   * days before it are not "the user did not do this", they are days the type
   * did not exist, and counting them as unexposed hands the control group ~90
   * invented days the moment a custom type is created.
   */
  observedFrom?: string;
}

/**
 * Per habit type, the observed habit days (ascending) with their exposure.
 *
 * A day is observed for type T when a T log exists for it (a value of 0 counts:
 * it is a real "none") or a check-in exists for it. Exposure applies the type's
 * threshold to the day's TOTAL for that type, so two 1-drink logs make a 2-drink
 * day. A check-in with no log of T is an observed day with total 0.
 */
export function buildObservedDays(
  logs: HabitLogLike[],
  checkInDays: string[],
  types: ExposureRule[],
): Map<string, ObservedDay[]> {
  const checkedIn = new Set(checkInDays);
  const result = new Map<string, ObservedDay[]>();

  for (const { type, exposureThreshold, observedFrom } of types) {
    const totals = new Map<string, number>();
    for (const log of logs) {
      if (log.habitType === type) totals.set(log.habitDay, (totals.get(log.habitDay) ?? 0) + log.value);
    }
    // A real log still counts even if it somehow predates the type; only the
    // implied zeroes are withheld.
    for (const day of checkedIn) {
      if (observedFrom !== undefined && day < observedFrom) continue;
      if (!totals.has(day)) totals.set(day, 0);
    }

    const days = [...totals.entries()]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([day, total]) => ({ day, exposed: total >= exposureThreshold }));
    result.set(type, days);
  }
  return result;
}
