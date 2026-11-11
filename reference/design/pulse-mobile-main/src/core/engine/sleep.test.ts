import { describe, expect, it } from "vitest";
import { autoSleepGoal, continuityFactor, defaultSleepGoal, hrDip, sleepBank, sleepConsistency, sleepNeeded, sleepScore, sleepTargets, stageSums, tonightNeeded, type SleepSeg } from "./sleep";

const H = 3600;
/** Consecutive segments from [stage, hours] pairs, from t = 0. */
function night(...parts: [SleepSeg["stage"], number][]): SleepSeg[] {
  let t = 0;
  return parts.map(([stage, h]) => {
    const g = { startTs: t, endTs: t + h * H, stage };
    t += h * H;
    return g;
  });
}

describe("stage sums", () => {
  it("drops awake edges, counts each interior awake as an interruption", () => {
    const s = stageSums(night(["awake", 0.25], ["light", 2], ["awake", 0.1], ["deep", 1], ["rem", 1], ["awake", 0.5]));
    expect(s.total).toBeCloseTo(4.1 * H);
    expect(s.asleep).toBe(4 * H);
    expect(s.interruptions).toBe(1);
    expect(stageSums(night(["awake", 1]))).toMatchObject({ total: 0, asleep: 0 });
  });
  it("continuity", () => {
    expect([5, 6, 12, 13, 30].map(continuityFactor)).toEqual([1, 0.98, 0.65, 0.6, 0.4]);
  });
  it("targets by age and sex, defaults without either", () => {
    expect(sleepTargets(25, "male")).toEqual({ deep: 0.15, rem: 0.2, hrDip: 0.3 });
    expect(sleepTargets(35, "female").deep).toBeCloseTo(0.14);
    expect(sleepTargets(72, "male").hrDip).toBeCloseTo(0.24);
    expect(sleepTargets(null, "male")).toEqual({ deep: 0.125, rem: 0.2, hrDip: 0.255 });
  });
});

describe("Sleep Score", () => {
  it("a night at every target scores 100", () => {
    const sums = stageSums(night(["light", 5.2], ["deep", 1.2], ["rem", 1.6]));
    expect(sleepScore({ sums, staged: true, needS: 8 * H, hrDip: 0.3, age: 25, sex: "male" }).score).toBe(100);
  });
  it("golden: 6 h against an 8 h need, six short wakes, no heart-rate dip (dropped and renormalized)", () => {
    const parts: [SleepSeg["stage"], number][] = [["light", 3.9 - 0.5]];
    for (let i = 0; i < 6; i++) parts.push(["awake", 0.5 / 6], ["light", 0.5 / 6]);
    parts.push(["deep", 0.9], ["rem", 1.2]);
    const sums = stageSums(night(...parts));
    expect(sums.asleep / H).toBeCloseTo(6);
    expect(sums.interruptions).toBe(6);
    const r = sleepScore({ sums, staged: true, needS: 8 * H, hrDip: null, age: 25, sex: "male" });
    expect(r.score).toBeCloseTo(52.1762, 3); // continuity 0.98^10
    expect(r.components.hrDip).toBeNull();
    expect(r.components.efficiency?.value).toBeCloseTo(0.47533, 4);
  });
  it("no stages drops deep and REM; no sleep gives no score", () => {
    const sums = stageSums(night(["unspecified", 8]));
    const r = sleepScore({ sums, staged: false, needS: 8 * H, hrDip: null, age: 25, sex: "male" });
    expect(r.components.deep).toBeNull();
    expect(r.score).toBe(100);
    expect(sleepScore({ sums: stageSums([]), staged: false, needS: 8 * H, hrDip: null, age: 25, sex: "male" }).score).toBeNull();
  });
  it("more sleep never lowers the score", () => {
    const at = (h: number) => sleepScore({ sums: stageSums(night(["light", h])), staged: false, needS: 8 * H, hrDip: 0.2, age: 40, sex: "female" }).score!;
    for (let h = 4; h < 10; h += 0.5) expect(at(h + 0.5)).toBeGreaterThanOrEqual(at(h));
  });
  it("heart-rate dip", () => {
    expect(hrDip(52, 65)).toBeCloseTo(0.2);
    expect(hrDip(70, 65)).toBe(0);
    expect(hrDip(null, 65)).toBeNull();
  });
});

describe("Sleep Bank", () => {
  it("weights from the newest night, so last night always weighs 1 (fix 14)", () => {
    // Source: weights aligned from the oldest, so with 3 nights the newest weighed e^-1.2 and this gave -46.6.
    expect(sleepBank([7 * H, 8 * H, 6 * H], 7.5)).toBeCloseTo(-84.2398, 3);
    expect(sleepBank([6 * H], 7.5)).toBeCloseTo(-90);
  });
  it("a night without sleep keeps its slot and adds nothing", () => {
    expect(sleepBank([7 * H, 0, 6 * H], 7.5)).toBeCloseTo(-30 * Math.exp(-0.6) - 90);
  });
});

describe("Sleep Needed", () => {
  it("goal, plus 2 % per SD of yesterday's strain above the mean, plus a quarter of the debt", () => {
    const n = sleepNeeded(7.5, 60, [40, 50, 60], -120);
    const z = (60 - 50) / Math.sqrt(200 / 3);
    expect(n.strainS).toBeCloseTo(27000 * 0.02 * z);
    expect(n.debtS).toBe(1800);
    expect(n.needS).toBeCloseTo(27000 + n.strainS + 1800);
    expect(sleepNeeded(7.5, 30, [40, 50, 60], 60)).toEqual({ goalS: 27000, strainS: 0, debtS: 0, needS: 27000 });
  });
  it("tonight adds the usual efficiency loss and time to fall asleep, each at most an hour", () => {
    const t = tonightNeeded(sleepNeeded(7.5, null, [], 0), [90], [15]);
    expect(t.effS).toBeCloseTo(3000);
    expect(t.latS).toBe(900);
    expect(tonightNeeded(sleepNeeded(7.5, null, [], 0), [50], [120])).toMatchObject({ effS: 3600, latS: 3600 });
  });
});

describe("Sleep Consistency", () => {
  it("identical days agree fully; half-overlapping ones less", () => {
    expect(sleepConsistency([[[0, 480]], [[0, 480]], [[0, 480]]])).toBe(100);
    expect(sleepConsistency([[[0, 480]], [[480, 960]]])).toBeCloseTo(33.333, 2);
    expect(sleepConsistency([[[0, 480]]])).toBeNull();
  });
});

describe("sleep goal", () => {
  it("defaults by age as onboarding does", () => {
    expect([19, 25, 35, 45, 65, 75].map(defaultSleepGoal)).toEqual([8, 8, 7.75, 7.5, 7.25, 7]);
  });

  it("averages the top 15 % of the last 90 nights by Recovery, plus 30 s, in whole minutes", () => {
    // 100 nights: Recovery 1..100, asleep 6 h; the 13 best of the last 90 (88..100) slept 8 h.
    const nights = Array.from({ length: 100 }, (_, i) => ({ recovery: i + 1, asleepS: i + 1 >= 88 ? 8 * 3600 : 6 * 3600 }));
    expect(autoSleepGoal(nights)).toEqual({ status: "sufficient", hours: 8, nights: 90, high: 34 });
  });

  it("is an early estimate below 90 nights, and none without a night at 67", () => {
    const few = Array.from({ length: 20 }, (_, i) => ({ recovery: 50 + i, asleepS: 7 * 3600 + 15 * 60 }));
    expect(autoSleepGoal(few)).toEqual({ status: "insufficient", hours: 7.25, nights: 20, high: 3 });
    expect(autoSleepGoal(few.map((n) => ({ ...n, recovery: 50 })))).toBeNull();
    expect(autoSleepGoal(few.slice(0, 6))).toBeNull();
  });
});
