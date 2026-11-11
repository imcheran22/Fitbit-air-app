import { describe, expect, it } from "vitest";
import { timeline } from "./context";
import { dayAggregates } from "./days";

// A night 00:00–01:00 (deep then light, an awake stretch), then a day to 02:00 with a workout.
const night = { id: "n", startTs: 0, endTs: 3600 };
const tl = timeline({
  sessions: [night],
  segments: [
    { sessionId: "n", startTs: 0, endTs: 1800, stage: "deep" },
    { sessionId: "n", startTs: 1800, endTs: 3000, stage: "light" },
    { sessionId: "n", startTs: 3000, endTs: 3600, stage: "awake" },
  ],
  workouts: [{ startTs: 5400, endTs: 6000 }],
});
const minutes = (from: number, to: number, bpm: number) => Array.from({ length: (to - from) / 60 }, (_, k) => ({ ts: from + k * 60, bpm }));

describe("dayAggregates", () => {
  const aggs = dayAggregates({
    dayStart: 0,
    dayEnd: 7200,
    primary: night,
    tl,
    hr: [...minutes(0, 3000, 50), ...minutes(3000, 3600, 70), ...minutes(3600, 5400, 80), ...minutes(5400, 6000, 150), ...minutes(6000, 7200, 90)],
    hrv: [
      { ts: 0, ms: 60 },
      { ts: 1800, ms: 40 },
      { ts: 3300, ms: 20 }, // awake: not resting HRV
      { ts: 4000, ms: 30 }, // daytime: averageHRV only
    ],
    respBpm: 15,
    tempDeltaC: -0.2,
  });
  it("resting HRV and HR come from the sleep-labelled samples in the primary sleep", () => {
    expect(aggs.restingHRV).toEqual({ avg: 50, sd: 0, count: 1 });
    expect(aggs.restingHR).toEqual({ avg: 50, sd: 0, count: 50 });
  });
  it("average HRV takes every sample of the day", () => expect(aggs.averageHRV?.avg).toBe(37.5));
  it("inactive HR takes the awake minutes only, not sleep or the workout, with a histogram", () => {
    expect(aggs.inactiveHR?.count).toBe(10 + 30 + 20);
    expect(aggs.inactiveHR?.hist).toEqual([
      [70, 10],
      [80, 30],
      [90, 20],
    ]);
  });
  it("single nightly values", () => {
    expect(aggs.resp).toEqual({ avg: 15, sd: 0, count: 1 });
    expect(aggs.temp).toEqual({ avg: -0.2, sd: 0, count: 1 });
  });
  it("no primary sleep: no resting values", () => {
    const a = dayAggregates({ dayStart: 0, dayEnd: 7200, primary: null, tl, hr: [], hrv: [], respBpm: null, tempDeltaC: null });
    expect(a.restingHRV).toBeNull();
    expect(a.restingHR).toBeNull();
  });
});
