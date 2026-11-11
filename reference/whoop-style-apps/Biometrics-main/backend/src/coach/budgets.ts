// Answer budgets (spec 2026-09-30, section 2.5), in their own module so the
// hosted provider (model/anthropic.ts) can cap its time to first text against
// the hosted budget without importing config.ts, which imports it.

export const LOCAL_ANSWER_BUDGET_MS = 45_000;
export const HOSTED_ANSWER_BUDGET_MS = 30_000;
/** A budget below this times out before any model can answer; above it, a hung model holds the request for too long. */
export const MIN_ANSWER_BUDGET_MS = 5_000;
/** Ten minutes, well inside setTimeout's 2^31-1 ms limit. */
export const MAX_ANSWER_BUDGET_MS = 600_000;

const clampLogged = new Set<string>();

/** Logs once per variable that a configured value was out of range and clamped (name and value only). */
export function logClampOnce(name: string, value: number): void {
  if (clampLogged.has(name)) return;
  clampLogged.add(name);
  console.log(JSON.stringify({ event: 'coach.config_clamped', name, value }));
}

/**
 * End-to-end budget for one streamed answer: COACH_LOCAL_BUDGET_MS (default
 * 45 s) or COACH_HOSTED_BUDGET_MS (default 30 s), in whole milliseconds,
 * clamped to 5 s - 10 min. Unset, junk or not positive means the default.
 * The mobile client's timeout must be longer than the budget.
 */
export function getAnswerBudgetMs(engine: 'local' | 'hosted'): number {
  const name = engine === 'hosted' ? 'COACH_HOSTED_BUDGET_MS' : 'COACH_LOCAL_BUDGET_MS';
  const fallback = engine === 'hosted' ? HOSTED_ANSWER_BUDGET_MS : LOCAL_ANSWER_BUDGET_MS;
  const n = Number(process.env[name]?.trim());
  if (!Number.isFinite(n) || n <= 0) return fallback;
  const ms = Math.floor(n);
  const clamped = Math.min(MAX_ANSWER_BUDGET_MS, Math.max(MIN_ANSWER_BUDGET_MS, ms));
  if (clamped !== ms) logClampOnce(name, clamped);
  return clamped;
}
