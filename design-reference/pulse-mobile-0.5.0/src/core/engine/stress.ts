// Stress, 0–100, on 6-minute slots. Reference study, recovery-stress-energy.md § Stress. Each slot's heart rate is placed
// on the person's 30-day awake heart-rate distribution (a percentile mapped through a curve onto 0–100); where an HRV
// reading from the last 36 minutes exists (at night: Fitbit writes one every 5 minutes), 40 % of the score comes from
// that HRV against the 30-day HRV baseline. Slots are on the LOCAL midnight grid (fix 15; the source used UTC midnight).
import type { Agg } from "./baselines";
import type { Span, Timeline } from "./context";
import { mean } from "./math";

export const SLOT_S = 360;
/** How far back an HRV reading still counts for a slot. */
export const HRV_LOOKBACK_S = 36 * 60;

export type SlotContext = "otherSleep" | "remAndDeepSleep" | "workout" | "exercise" | "awake";

/** Slot starts from local midnight `dayStart` up to `dayEnd` (exclusive): 240 on a normal day, 230 or 250 on DST days. */
export function slotsOf(dayStart: number, dayEnd: number): number[] {
  const out: number[] = [];
  for (let t = dayStart; t < dayEnd; t += SLOT_S) out.push(t);
  return out;
}

/** Any span overlapping [s, e] (inclusive, as the source). Timelines here hold one day's spans, so a scan is enough. */
const overlaps = (xs: readonly Span[], s: number, e: number) => xs.some((x) => x.endTs >= s && x.startTs <= e);

/** A slot's context by overlap: workout, then exercise, then sleep (REM/deep over other), then awake. */
export function slotContext(tl: Timeline, s: number, e: number): SlotContext {
  if (overlaps(tl.workouts, s, e)) return "workout";
  if (overlaps(tl.exercise, s, e)) return "exercise";
  const stages = tl.stages.filter((g) => g.endTs >= s && g.startTs <= e && g.stage !== "awake");
  if (stages.some((g) => g.stage === "rem" || g.stage === "deep")) return "remAndDeepSleep";
  if (stages.length || overlaps(tl.unspecified, s, e)) return "otherSleep";
  return "awake";
}

export const isActive = (c: SlotContext) => c === "workout" || c === "exercise";
export const isSleepSlot = (c: SlotContext) => c === "otherSleep" || c === "remAndDeepSleep";

/** A slot's heart rate: the median under 8 readings, else the 15 % trimmed mean; null with none. */
export function slotHr(xs: readonly number[]): number | null {
  const n = xs.length;
  if (!n) return null;
  const a = [...xs].sort((p, q) => p - q);
  if (n < 8) return n % 2 ? a[n >> 1] : (a[n / 2 - 1] + a[n / 2]) / 2;
  const k = Math.min(Math.trunc(n * 0.15), (n - 1) >> 1);
  return mean(a.slice(k, n - k));
}

/** Fills a missing slot heart rate with the mean of its nearest neighbours (±1, else ±2) on both sides. */
export function gapFill(hr: readonly (number | null)[]): (number | null)[] {
  return hr.map((v, i) => {
    if (v != null) return v;
    const l = hr[i - 1] ?? hr[i - 2] ?? null;
    const r = hr[i + 1] ?? hr[i + 2] ?? null;
    return l != null && r != null ? (l + r) / 2 : null;
  });
}

/** The cumulative distribution of whole-bpm bins: [bpm, P(≤ bpm)], ascending. */
export function cdfOf(hist: readonly [number, number][]): [number, number][] {
  const total = hist.reduce((a, [, c]) => a + c, 0);
  let acc = 0;
  return hist.map(([k, c]) => {
    acc += c;
    return [k, acc / total];
  });
}

const CURVE: [number, number][] = [
  [0, 0],
  [0.1, 3],
  [0.4, 18],
  [0.5, 30],
  [0.75, 45],
  [0.9, 60],
  [0.97, 85],
  [1, 100],
];

function curve(p: number): number {
  for (let i = 1; i < CURVE.length; i++) {
    const [x0, y0] = CURVE[i - 1];
    const [x1, y1] = CURVE[i];
    if (p <= x1) return x1 === x0 ? (y0 + y1) / 2 : y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  }
  return 100;
}

/** The heart-rate score: hr's percentile on the CDF (interpolated between bins) through the curve; 0 below the lowest bin. */
export function hrScore(hr: number, cdf: readonly [number, number][]): number {
  if (!cdf.length || hr < cdf[0][0]) return 0;
  let p = hr === cdf[0][0] ? cdf[0][1] : 1;
  if (hr !== cdf[0][0] && cdf.length > 1) {
    let i = 1;
    while (i < cdf.length && cdf[i][0] < hr) i++;
    if (i < cdf.length) {
      const [k0, v0] = cdf[i - 1];
      const [k1, v1] = cdf[i];
      p = k0 === k1 ? (v0 + v1) / 2 : v0 + (v1 - v0) * ((hr - k0) / (k1 - k0));
    }
  }
  return p <= 0 ? 0 : p > 1 ? 100 : curve(p);
}

/** The HRV score: 100 at z −4 or lower, 0 at z +3 or higher, linear between; 42.9 at z 0 (and with SD 0). */
export function hrvScore(hrv: number, base: Agg): number {
  let x = 4;
  if (base.sd !== 0) {
    const z = (hrv - base.avg) / base.sd;
    x = z < -4 ? 0 : Math.min(z, 3) + 4;
  }
  const y = (x / 7) * 100;
  return y < 0 ? 100 : 100 - Math.min(y, 100);
}

/**
 * A slot's raw stress (0–100, null without heart rate or a CDF): the heart-rate score, blended 0.6 / 0.4 with the HRV
 * score when an HRV reading counts (the latest within 36 minutes; in a workout, the slot's mean HRV).
 */
export function slotStress(a: {
  hr: number | null;
  cdf: readonly [number, number][] | null;
  hrv: number | null;
  hrvBase: Agg | null;
}): number | null {
  if (a.hr == null || !a.cdf) return null;
  const h = hrScore(a.hr, a.cdf);
  const s = a.hrv == null || !a.hrvBase ? h : 0.4 * hrvScore(a.hrv, a.hrvBase) + 0.6 * h;
  return s >= 0 ? s : 0;
}

/** Stress levels: high from 60, medium from 30. */
export const stressLevel = (v: number): "low" | "medium" | "high" => (v >= 60 ? "high" : v >= 30 ? "medium" : "low");

/** The shown value: none in a workout or exercise slot, else at most 100. */
export const displayStress = (raw: number | null, c: SlotContext) => (raw == null || isActive(c) ? null : Math.min(100, raw));
