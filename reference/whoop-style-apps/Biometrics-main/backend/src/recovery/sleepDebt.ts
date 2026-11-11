// Sleep-debt tile helpers (spec §3.6, decision 2). Pure.
import { flooredSpread } from '../scoring/baseline';
import { getLiveConfig, SCORE_CONFIGS } from '../scoring/configs';

/**
 * `deficits` are the 14 nights D-13..D, oldest first: max(0, goal - asleep), a missing night 0
 * (as scoring/features.ts). Future nights at goal add 0, so after k nights the window holds
 * deficits[k..]. Returns the smallest k in 0..14 whose remaining sum is <= usualHigh.
 */
export function nightsToClear(deficits: number[], usualHigh: number): number {
  for (let k = 0; k < deficits.length; k++) {
    const rest = deficits.slice(k).reduce((s, v) => s + v, 0);
    if (rest <= usualHigh) return k;
  }
  return deficits.length;
}

/** ewma ± the floored spread the score's z used; null while cold-starting. */
export function usualDebtRange(snap: {
  ewma: number | null;
  spread: number | null;
  mad: number | null;
  daysOfHistory: number;
  algorithmVersion: string;
}): { low: number; high: number } | null {
  if (snap.ewma === null || snap.spread === null) return null;
  const cfg = SCORE_CONFIGS[snap.algorithmVersion] ?? getLiveConfig();
  const s = flooredSpread(
    { coldStart: false, daysOfHistory: snap.daysOfHistory, ewma: snap.ewma, spread: snap.spread, mad: snap.mad ?? 0 },
    cfg,
    'SLEEP_DEBT',
  );
  return { low: Math.max(0, snap.ewma - s), high: snap.ewma + s };
}
