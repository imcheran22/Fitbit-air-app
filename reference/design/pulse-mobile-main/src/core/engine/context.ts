// Sample labelling: which context (sleep stage, workout, awake) a timestamp falls in, and per-minute heart rate.
// Reference study, shared-machinery.md § R5 (how samples are labelled). A sample takes the sleep stage it falls in first:
// REM and deep give remAndDeepSleep, any other sleep (light, unstaged) otherSleep. Awake, or outside every segment, it
// falls through to a workout, then an exercise window (heart rate only), then awake. Every span is half-open
// [start, end): a sample exactly on a boundary belongs to the span that starts there.
import type { Stage } from "@/data/types";

export type SampleContext = "otherSleep" | "remAndDeepSleep" | "workout" | "exercise" | "awake";

export type Span = { startTs: number; endTs: number };
export type StageSpan = Span & { stage: Stage | "unspecified" };

/** The sorted spans contextAt searches. Build once per run (or per day) with `timeline`. */
export type Timeline = { stages: StageSpan[]; unspecified: Span[]; workouts: Span[]; exercise: Span[] };

/** Start, then end, then stage: a strict order (engine plan, fix 12; the source's comparator was not one). */
const byStartEndStage = (a: StageSpan, b: StageSpan) => a.startTs - b.startTs || a.endTs - b.endTs || (a.stage < b.stage ? -1 : a.stage > b.stage ? 1 : 0);
const byStart = (a: Span, b: Span) => a.startTs - b.startTs || a.endTs - b.endTs;

/**
 * Sleep sessions with their stage segments, workouts, and (optionally) exercise windows. A session without segments
 * counts as unstaged sleep over its whole span, as the study's asleepUnspecified stage; staged segments win over it.
 */
export function timeline(input: {
  sessions: (Span & { id: string })[];
  segments: (StageSpan & { sessionId: string })[];
  workouts: Span[];
  exercise?: Span[];
}): Timeline {
  const staged = new Set(input.segments.map((g) => g.sessionId));
  return {
    stages: input.segments.map((g) => ({ startTs: g.startTs, endTs: g.endTs, stage: g.stage })).sort(byStartEndStage),
    unspecified: input.sessions.filter((s) => !staged.has(s.id)).map((s) => ({ startTs: s.startTs, endTs: s.endTs })).sort(byStart),
    workouts: input.workouts.map((w) => ({ startTs: w.startTs, endTs: w.endTs })).sort(byStart),
    exercise: (input.exercise ?? []).map((w) => ({ startTs: w.startTs, endTs: w.endTs })).sort(byStart),
  };
}

/** The span holding t, by binary search over sorted, non-overlapping spans; null when none does. */
export function find<T extends Span>(xs: readonly T[], t: number): T | null {
  let lo = 0;
  let hi = xs.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const s = xs[mid];
    if (t >= s.startTs && t < s.endTs) return s;
    if (t < s.startTs) hi = mid - 1;
    else lo = mid + 1;
  }
  return null;
}

/** The context of a sample at t. `isHr`: exercise windows label heart rate only (the study's types 4 and 5). */
export function contextAt(tl: Timeline, t: number, isHr = true): SampleContext {
  const stage = find(tl.stages, t)?.stage ?? (find(tl.unspecified, t) ? "unspecified" : null);
  if (stage === "rem" || stage === "deep") return "remAndDeepSleep";
  if (stage != null && stage !== "awake") return "otherSleep";
  if (find(tl.workouts, t)) return "workout";
  if (isHr && find(tl.exercise, t)) return "exercise";
  return "awake";
}

export const isSleep = (c: SampleContext) => c === "otherSleep" || c === "remAndDeepSleep";

/** A minute of heart rate: the mean of the samples in [ts, ts + 60), ts on a whole minute. */
export type MinuteHr = { ts: number; bpm: number };

/** Per-minute mean heart rate from raw samples (ascending), the study's minute aggregates; minutes without a sample are absent. */
export function minuteHr(samples: readonly { ts: number; bpm: number }[]): MinuteHr[] {
  const out: MinuteHr[] = [];
  let cur = NaN;
  let sum = 0;
  let n = 0;
  for (const s of samples) {
    const m = s.ts - (((s.ts % 60) + 60) % 60);
    if (m !== cur) {
      if (n) out.push({ ts: cur, bpm: sum / n });
      cur = m;
      sum = 0;
      n = 0;
    }
    sum += s.bpm;
    n++;
  }
  if (n) out.push({ ts: cur, bpm: sum / n });
  return out;
}

/** The samples with lo <= ts < hi, from an ascending list (a workout's heart-rate segment for TRIMP). */
export function within<T extends { ts: number }>(xs: readonly T[], lo: number, hi: number): T[] {
  let a = 0;
  let b = xs.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (xs[m].ts < lo) a = m + 1;
    else b = m;
  }
  const out: T[] = [];
  for (let i = a; i < xs.length && xs[i].ts < hi; i++) out.push(xs[i]);
  return out;
}

/**
 * The primary session among candidates: the longest; on a tie, the one that ends first (engine plan, fix 13: the
 * source marked both of two sessions with the same start as primary).
 */
export function primaryOf<T extends Span>(xs: readonly T[]): T | null {
  let best: T | null = null;
  for (const s of xs) {
    if (!best) best = s;
    else {
      const d = s.endTs - s.startTs - (best.endTs - best.startTs);
      if (d > 0 || (d === 0 && s.endTs < best.endTs)) best = s;
    }
  }
  return best;
}
