// The Strain day view's running Day Strain on the Pulse engine: its last point is the day's stored Strain (stage 1's
// engineDay math, to 2 dp), it never falls, sleep adds nothing, and a workout counts its heart rate in full.
import { describe, expect, it } from "vitest";
import { contextAt, minuteHr, timeline, within } from "@/core/engine/context";
import { dayStrain, PASSIVE_GAP_S, segmentsOf, units, zonesOf } from "@/core/engine/strain";
import type { HrSample } from "@/core/scoring/types";
import { strainCurve, type StrainInputs } from "./dayStrain";

const MAX = 190;
const START = 1_790_000_000 - (1_790_000_000 % 60); // a whole minute, unix seconds
const END = START + 86_400;
const at = (min: number) => START + min * 60;

function readings(fromMin: number, toMin: number, bpm: (m: number) => number, stepS = 15): HrSample[] {
  const out: HrSample[] = [];
  for (let t = at(fromMin); t < at(toMin); t += stepS) out.push({ ts: t, bpm: bpm((t - START) / 60) });
  return out;
}

/** Asleep to 07:00, a run 07:00–07:45, a quiet day with a band-off gap, steps through the afternoon. */
const HR: HrSample[] = [
  ...readings(0, 420, () => 55),
  ...readings(420, 465, (m) => (m < 430 ? 130 : m < 455 ? 158 : 171)),
  ...readings(465, 720, (m) => 96 + (m % 4)),
  ...readings(840, 1440, (m) => 64 + (m % 5)),
];
const STEPS = [
  ...Array.from({ length: 30 }, (_, k) => ({ ts: at(100 + k), v: 50 })), // asleep: left out
  ...Array.from({ length: 120 }, (_, k) => ({ ts: at(900 + k), v: 80 })),
];
const RUN = { startTs: at(420), endTs: at(465) };
const TL = timeline({ sessions: [{ id: "n", startTs: at(-60), endTs: at(420) }], segments: [], workouts: [RUN] });

/** The day's stored Strain, as stage 1's engineDay computes it. */
function stored(hr: HrSample[], workouts = [RUN]): number {
  const z = zonesOf(MAX);
  const awake = within(minuteHr(hr), START, END).filter((m) => contextAt(TL, m.ts) === "awake");
  const passive = units(segmentsOf(awake, PASSIVE_GAP_S), z, true);
  const wu = workouts.reduce((a, w) => a + units(segmentsOf(hr.filter((s) => s.ts >= w.startTs && s.ts < w.endTs)), z), 0);
  const steps = STEPS.reduce((n, s) => n + (contextAt(TL, s.ts, false) === "awake" ? s.v : 0), 0);
  return Math.round(dayStrain(steps, passive + wu) * 100) / 100;
}
const inputs = (hr: HrSample[], workouts = [RUN]): StrainInputs => ({ value: stored(hr, workouts), maxHr: MAX, lastHrTs: hr.at(-1)?.ts ?? null });

describe("strainCurve", () => {
  it("ends exactly on the day's Strain and runs a past day to midnight", () => {
    const s1 = inputs(HR);
    const curve = strainCurve(HR, STEPS, TL, s1, START, END, false, [RUN]);
    expect(curve.ys.at(-1)).toBe(s1.value);
    expect(s1.value!).toBeGreaterThan(0);
    expect(curve.xs.at(-1)).toBe(1440);
  });

  it("starts at zero, adds nothing while asleep, and never falls", () => {
    const curve = strainCurve(HR, STEPS, TL, inputs(HR), START, END, false, [RUN]);
    expect(curve.xs[0]).toBe(0);
    expect(curve.ys[curve.xs.indexOf(420)]).toBe(0);
    for (let i = 1; i < curve.ys.length; i++) expect(curve.ys[i]).toBeGreaterThanOrEqual(curve.ys[i - 1]);
    // The run climbs fastest.
    const gain = (a: number, b: number) => curve.ys[curve.xs.indexOf(b)] - curve.ys[curve.xs.indexOf(a)];
    expect(gain(420, 465)).toBeGreaterThan(gain(465, 510));
  });

  it("runs today to the minute after the last reading stage 1 scored", () => {
    const morning = HR.filter((s) => s.ts < at(500));
    const s1 = inputs(morning);
    const synced = [...morning, ...readings(500, 520, () => 175)];
    const curve = strainCurve(synced, [], TL, s1, START, END, true, [RUN]);
    expect(curve.xs.at(-1)).toBe(500);
  });

  it("has no curve for a day without a Strain", () => {
    expect(strainCurve(HR, STEPS, TL, null, START, END)).toEqual({ xs: [], ys: [] });
    expect(strainCurve(HR, STEPS, TL, { value: null, maxHr: MAX, lastHrTs: null }, START, END)).toEqual({ xs: [], ys: [] });
    expect(strainCurve([], [], TL, { value: 10, maxHr: MAX, lastHrTs: null }, START, END)).toEqual({ xs: [], ys: [] });
  });
});
