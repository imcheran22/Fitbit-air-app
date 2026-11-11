import { describe, expect, it } from "vitest";
import { timeline } from "./context";
import { awakeSeconds, energyStep } from "./energyBank";
import { cdfOf, displayStress, gapFill, hrScore, hrvScore, slotContext, slotHr, slotsOf, slotStress, stressLevel } from "./stress";

describe("slots", () => {
  it("6-minute slots from local midnight: 240 a day, 230 on a 23-hour day (fix 15)", () => {
    expect(slotsOf(0, 86_400)).toHaveLength(240);
    expect(slotsOf(1000, 1000 + 23 * 3600)).toHaveLength(230);
    expect(slotsOf(1000, 2000)[0]).toBe(1000);
  });
  it("context by overlap: workout, exercise, sleep, awake", () => {
    const tl = timeline({
      sessions: [{ id: "n", startTs: 0, endTs: 3600 }],
      segments: [
        { sessionId: "n", startTs: 0, endTs: 1800, stage: "light" },
        { sessionId: "n", startTs: 1800, endTs: 3600, stage: "deep" },
      ],
      workouts: [{ startTs: 5000, endTs: 6000 }],
      exercise: [{ startTs: 7000, endTs: 8000 }],
    });
    expect(slotContext(tl, 0, 360)).toBe("otherSleep");
    expect(slotContext(tl, 1440, 1800)).toBe("remAndDeepSleep");
    expect(slotContext(tl, 4800, 5160)).toBe("workout");
    expect(slotContext(tl, 7200, 7560)).toBe("exercise");
    expect(slotContext(tl, 4000, 4360)).toBe("awake");
  });
  it("heart rate: median under 8 readings, else 15 % trimmed mean; gaps filled from both sides", () => {
    expect(slotHr([60, 70, 65])).toBe(65);
    expect(slotHr([60, 70])).toBe(65);
    expect(slotHr([1, 50, 50, 50, 50, 50, 50, 50, 50, 200])).toBe(50);
    expect(slotHr([])).toBeNull();
    expect(gapFill([60, null, 70, null, null, null, 80])).toEqual([60, 65, 70, null, 75, null, 80]);
    expect(gapFill([60, null, null, 70])).toEqual([60, 65, 65, 70]);
  });
});

describe("kernel", () => {
  const cdf = cdfOf([
    [60, 50],
    [70, 40],
    [80, 10],
  ]);
  it("heart rate through the percentile curve", () => {
    expect(cdf).toEqual([
      [60, 0.5],
      [70, 0.9],
      [80, 1],
    ]);
    expect(hrScore(55, cdf)).toBe(0);
    expect(hrScore(60, cdf)).toBe(30);
    expect(hrScore(70, cdf)).toBeCloseTo(60);
    expect(hrScore(65, cdf)).toBeCloseTo(42); // p 0.7: 30 + 0.8 · 15
    expect(hrScore(90, cdf)).toBe(100);
  });
  it("HRV: z −4 gives 100, z 0 gives 42.9, z 3 gives 0, SD 0 gives 42.9", () => {
    const b = { avg: 50, sd: 10, count: 30 };
    expect(hrvScore(10, b)).toBe(100);
    expect(hrvScore(50, b)).toBeCloseTo(42.857, 3);
    expect(hrvScore(80, b)).toBe(0);
    expect(hrvScore(70, { ...b, sd: 0 })).toBeCloseTo(42.857, 3);
  });
  it("0.6 heart rate + 0.4 HRV when an HRV reading counts; heart rate alone otherwise", () => {
    const b = { avg: 50, sd: 10, count: 30 };
    expect(slotStress({ hr: 60, cdf, hrv: null, hrvBase: b })).toBe(30);
    expect(slotStress({ hr: 60, cdf, hrv: 50, hrvBase: b })).toBeCloseTo(0.6 * 30 + 0.4 * 42.857, 2);
    expect(slotStress({ hr: null, cdf, hrv: 50, hrvBase: b })).toBeNull();
  });
  it("levels and the display filter", () => {
    expect([10, 30, 59.9, 60].map(stressLevel)).toEqual(["low", "medium", "medium", "high"]);
    expect(displayStress(150, "awake")).toBe(100);
    expect(displayStress(50, "workout")).toBeNull();
  });
});

describe("Energy Bank", () => {
  const at = (e: number, context: "awake" | "otherSleep" | "workout", rawStress: number | null) => energyStep(e, { context, rawStress, sleepGoalS: 27_000, awakeS: 57_600 });
  it("sleep charges, slower near the top", () => {
    expect(at(50, "otherSleep", 10)).toBeGreaterThan(50);
    expect(at(95, "otherSleep", 10) - 95).toBeLessThan(at(50, "otherSleep", 10) - 50);
  });
  it("awake: calm charges, stress drains, more stress drains more", () => {
    expect(at(50, "awake", 10)).toBeGreaterThan(50);
    expect(at(50, "awake", 40)).toBeLessThan(50);
    expect(at(50, "awake", 90)).toBeLessThan(at(50, "awake", 40));
  });
  it("stays within 1–100", () => {
    expect(at(1, "awake", 100)).toBe(1);
    let e = 0;
    for (let i = 0; i < 2000; i++) e = at(e, "otherSleep", 0);
    expect(e).toBeLessThanOrEqual(100);
  });
  it("golden: a sleep slot at stress 5 from 60 charges 80/27000 · 1.1 · 360 → capped at 1, so +1.0667", () => {
    expect(at(60, "otherSleep", 5)).toBeCloseTo(60 + (80 / 27_000) * 360, 6);
  });
  it("awake seconds: 7-day mean of 86400 − sleep, default 16 h with under 2 days", () => {
    expect(awakeSeconds([28_800])).toBe(57_600);
    expect(awakeSeconds([28_800, 21_600])).toBe(86_400 - 25_200);
  });
});
