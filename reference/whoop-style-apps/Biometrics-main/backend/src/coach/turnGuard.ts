/**
 * Per-user guards for POST /me/coach/message.
 *
 * A coach turn is the most expensive thing this backend does: it can hold a
 * synthesis-tier model loop open for SYNTHESIS_TIER_BUDGET_MS (60s), and once a
 * real provider is wired every turn costs money. The endpoint had nothing in
 * front of it, so a double-tap on a slow network started two turns for the same
 * conversation -- two replies, two bills -- and nothing stopped a client from
 * holding several 60s loops open at once.
 *
 * Deliberately in-process. listen.ts already makes a second backend on the same
 * port exit rather than run alongside this one, so per-process state is
 * per-deployment state here. If that ever changes, this is the piece to move to
 * Redis, and the interface is shaped so that swap is local to this file.
 */
export class TurnInProgressError extends Error {
  constructor() {
    super('A coach turn is already running for this user');
    this.name = 'TurnInProgressError';
  }
}

export class TurnRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super('Too many coach messages');
    this.name = 'TurnRateLimitedError';
  }
}

/** Generous for a person typing, immediately obvious for a loop. */
export const RATE_LIMIT_MAX_TURNS = 15;
export const RATE_LIMIT_WINDOW_MS = 5 * 60_000;

const inFlight = new Set<string>();
const recentTurns = new Map<string, number[]>();

/** Drops timestamps that have fallen out of the window, and the key when empty. */
function prune(userId: string, now: number): number[] {
  const kept = (recentTurns.get(userId) ?? []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (kept.length === 0) recentTurns.delete(userId);
  else recentTurns.set(userId, kept);
  return kept;
}

/**
 * Runs `fn` as this user's only in-flight turn, counting it against their rate
 * limit. Throws TurnRateLimitedError or TurnInProgressError instead of running.
 *
 * The lock is released in a finally, so a turn that throws does not wedge the
 * user out of the coach until restart.
 */
export async function withTurnGuard<T>(userId: string, fn: () => Promise<T>, now: number = Date.now()): Promise<T> {
  const recent = prune(userId, now);
  if (recent.length >= RATE_LIMIT_MAX_TURNS) {
    const oldest = recent[0]!;
    const retryAfterSeconds = Math.max(1, Math.ceil((RATE_LIMIT_WINDOW_MS - (now - oldest)) / 1000));
    throw new TurnRateLimitedError(retryAfterSeconds);
  }
  if (inFlight.has(userId)) throw new TurnInProgressError();

  inFlight.add(userId);
  // Counted on admission, not on completion: a turn that is still running has
  // already consumed the budget it is being limited for.
  recentTurns.set(userId, [...recent, now]);
  try {
    return await fn();
  } finally {
    inFlight.delete(userId);
  }
}

/** Test seam: forget all guard state. */
export function resetTurnGuards(): void {
  inFlight.clear();
  recentTurns.clear();
}
