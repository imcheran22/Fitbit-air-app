// The fewest nights /me/sleep/regularity scores a window on (backend
// biometrics/regularity.ts MIN_NIGHTS).
const MIN_NIGHTS = { 7: 4, 30: 15 } as const;

/** Nights still needed before the window has a score; never below zero. */
export function nightsToGo(days: 7 | 30, nights: number): number {
  return Math.max(0, MIN_NIGHTS[days] - nights);
}
