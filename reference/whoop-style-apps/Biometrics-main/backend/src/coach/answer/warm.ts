// Keep the local model warm (spec 2026-09-30, section 2.6): a cold load costs
// ~14 s on the owner's Mac. GET /me/coach/status (hit when the app opens the
// Coach tab) calls this fire-and-forget; it never delays or fails the request.
// Throttled per provider so a busy status endpoint does not queue loads.

import type { CoachModelProvider } from '../model/provider';

export const WARM_INTERVAL_MS = 5 * 60_000;

const lastWarm = new Map<string, number>();

/** Starts a warm-up if the provider supports one and none started within the interval. Returns whether it started one. */
export function warmModel(provider: CoachModelProvider, now: number = Date.now()): boolean {
  if (!provider.warm) return false;
  const last = lastWarm.get(provider.id);
  if (last !== undefined && now - last < WARM_INTERVAL_MS) return false;
  lastWarm.set(provider.id, now);
  provider.warm().catch(() => {
    /* best effort */
  });
  return true;
}

/** Test seam. */
export function resetWarmState(): void {
  lastWarm.clear();
}
