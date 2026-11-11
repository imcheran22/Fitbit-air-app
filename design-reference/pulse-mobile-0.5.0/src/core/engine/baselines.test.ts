import { describe, expect, it } from "vitest";
import { baseline, calibrated, chanMerge, combinedAgg, dailyAgg, dailyPool, histogram, mergeHist } from "./baselines";
import { popStats } from "./math";

describe("per-day aggregates", () => {
  it("daily keeps the mean as one entry; combined keeps mean, population SD and count", () => {
    expect(dailyAgg([40, 50, 60])).toEqual({ avg: 50, sd: 0, count: 1 });
    expect(combinedAgg([2, 4, 4, 4, 5, 5, 7, 9])).toEqual({ avg: 5, sd: 2, count: 8 });
    expect(dailyAgg([])).toBeNull();
    expect(dailyAgg([NaN])).toBeNull();
  });
  it("histograms truncate to whole bpm and skip non-finite values (the source trapped)", () => {
    expect(histogram([60.9, 60.1, 61, Infinity, NaN])).toEqual([
      [60, 2],
      [61, 1],
    ]);
    expect(combinedAgg([60.5, 62], true)?.hist).toEqual([
      [60, 1],
      [62, 1],
    ]);
    expect(mergeHist([[[60, 1]], [[59, 2], [60, 3]]])).toEqual([
      [59, 2],
      [60, 4],
    ]);
  });
});

describe("pooling", () => {
  it("Chan's merge: the pooled mean, and the source's (n − 1) weights on per-day population SDs", () => {
    const a = [50, 52, 54, 60];
    const b = [48, 58, 61];
    const m = chanMerge([combinedAgg(a)!, combinedAgg(b)!])!;
    expect(m.avg).toBeCloseTo(popStats([...a, ...b])!.mean, 10);
    expect(m.count).toBe(7);
    // Two single-value days: (0 + 0 + 10² · ½) / 1 = 50, the sample variance of [50, 60].
    expect(chanMerge([dailyAgg([50])!, dailyAgg([60])!])).toEqual({ avg: 55, sd: Math.sqrt(50), count: 2 });
  });
  it("daily pooling is the population statistics of the day values", () => {
    expect(dailyPool([dailyAgg([40])!, dailyAgg([50])!, dailyAgg([60])!])).toEqual({ avg: 50, sd: Math.sqrt(200 / 3), count: 3 });
  });
  it("one prior day gives SD 0; none gives null; only the last 60 days count", () => {
    expect(baseline([null, dailyAgg([45])], "daily")).toEqual({ avg: 45, sd: 0, count: 1 });
    expect(baseline([null, undefined], "combined")).toBeNull();
    const days = [...Array.from({ length: 10 }, () => dailyAgg([10])), ...Array.from({ length: 60 }, () => dailyAgg([50]))];
    expect(baseline(days, "daily")?.avg).toBe(50);
  });
});

describe("calibration (fix 17: the score shows, marked provisional until calibrated)", () => {
  it("needs 5 data days spanning the window", () => {
    expect(calibrated(0, 3, 4, 3)).toBe(false);
    expect(calibrated(0, 59, 5, 60)).toBe(false);
    expect(calibrated(0, 60, 5, 60)).toBe(true);
  });
});
