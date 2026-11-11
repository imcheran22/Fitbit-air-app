// Recovery, 1–100. Reference study, recovery-stress-energy.md § Recovery: 0.4·HRV + 0.3·RHR + 0.3·Sleep Score, then the
// respiratory-rate and temperature adjustments, clamped to [1, 100]. HRV and resting HR are last night's means against
// their 60-day baselines; each maps z in [−1, 1] onto 0–100 (below −1 gives 0). SpO2 is left out: Fitbit does not write
// it to Health Connect. Doubles throughout (fix 18).
import type { Agg } from "./baselines";
import { clamp } from "./math";

/** Higher is better (HRV): z = (cur − mean) / sd; SD 0 gives 50. */
export function compUp(cur: number, b: Agg): number {
  const z = b.sd === 0 ? 0 : (cur - b.avg) / b.sd;
  return z < -1 ? 0 : (Math.min(z, 1) * 0.5 + 0.5) * 100;
}

/** Lower is better (resting HR, respiratory rate): z = −(cur − mean) / sd; SD 0 gives 50. */
export function compDown(cur: number, b: Agg): number {
  if (b.sd === 0) return 50;
  const z = -(cur - b.avg) / b.sd;
  return z < -1 ? 0 : (Math.min(z, 1) * 0.5 + 0.5) * 100;
}

/** Respiratory rate: (component − 50) · 0.2, so ±10 points at most. */
export const rrAdjust = (cur: number, b: Agg) => (compDown(cur, b) - 50) * 0.2;

/** Temperature above baseline only lowers the score: 30·atan(min(z, 0) / 10), at least −30, with z = −(cur − mean) / sd. */
export function tempAdjust(cur: number, b: Agg): number {
  const z = b.sd === 0 ? 0 : -(cur - b.avg) / b.sd;
  return Math.max(-30, Math.atan(Math.min(z, 0) / 10) * 30);
}

export type RecoveryInput = {
  hrv: number | null;
  hrvBase: Agg | null;
  rhr: number | null;
  rhrBase: Agg | null;
  sleepScore: number | null;
  resp?: number | null;
  respBase?: Agg | null;
  temp?: number | null;
  tempBase?: Agg | null;
};

export type RecoveryMissing = "hrv" | "hrvBaseline" | "rhr" | "rhrBaseline" | "sleepScore";

export type RecoveryResult =
  | { value: number; parts: { hrv: number; rhr: number; sleep: number; resp: number; temp: number } }
  | { value: null; missing: RecoveryMissing[] };

/** The score, or what it lacks (HRV, resting HR, their baselines, the Sleep Score; the adjustments never gate). */
export function recovery(a: RecoveryInput): RecoveryResult {
  const missing: RecoveryMissing[] = [];
  if (a.hrv == null) missing.push("hrv");
  if (a.hrvBase == null) missing.push("hrvBaseline");
  if (a.rhr == null) missing.push("rhr");
  if (a.rhrBase == null) missing.push("rhrBaseline");
  if (a.sleepScore == null) missing.push("sleepScore");
  if (missing.length) return { value: null, missing };
  const parts = {
    hrv: compUp(a.hrv!, a.hrvBase!),
    rhr: compDown(a.rhr!, a.rhrBase!),
    sleep: a.sleepScore!,
    resp: a.resp != null && a.respBase ? rrAdjust(a.resp, a.respBase) : 0,
    temp: a.temp != null && a.tempBase ? tempAdjust(a.temp, a.tempBase) : 0,
  };
  const sum = parts.hrv * 0.4 + parts.rhr * 0.3 + parts.sleep * 0.3 + parts.resp + parts.temp;
  return { value: clamp(sum, 1, 100), parts };
}

/** Recovery bands: high from 67, medium from 34 (reference study, shared-machinery.md § G09). */
export const recoveryBand = (v: number) => (v >= 67 ? "high" : v >= 34 ? "medium" : "low");
