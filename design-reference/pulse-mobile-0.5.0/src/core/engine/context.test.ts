import { describe, expect, it } from "vitest";
import { contextAt, find, minuteHr, primaryOf, timeline, within } from "./context";

const night = { id: "n", startTs: 1000, endTs: 2000 };
const tl = timeline({
  sessions: [night, { id: "nap", startTs: 5000, endTs: 5600 }],
  segments: [
    { sessionId: "n", startTs: 1000, endTs: 1300, stage: "light" },
    { sessionId: "n", startTs: 1300, endTs: 1600, stage: "deep" },
    { sessionId: "n", startTs: 1600, endTs: 1700, stage: "awake" },
    { sessionId: "n", startTs: 1700, endTs: 2000, stage: "rem" },
  ],
  workouts: [{ startTs: 1650, endTs: 1680 }, { startTs: 3000, endTs: 3600 }],
  exercise: [{ startTs: 3500, endTs: 4000 }],
});

describe("contextAt", () => {
  it("labels by stage with half-open spans: a boundary belongs to the span starting there", () => {
    expect(contextAt(tl, 1000)).toBe("otherSleep");
    expect(contextAt(tl, 1299)).toBe("otherSleep");
    expect(contextAt(tl, 1300)).toBe("remAndDeepSleep");
    expect(contextAt(tl, 1750)).toBe("remAndDeepSleep");
    expect(contextAt(tl, 2000)).toBe("awake");
  });
  it("sleep stage first, then workout over exercise over awake", () => {
    expect(contextAt(tl, 1660)).toBe("workout"); // awake segment inside a workout
    expect(contextAt(tl, 1620)).toBe("awake");
    expect(contextAt(tl, 3550)).toBe("workout");
    expect(contextAt(tl, 3700)).toBe("exercise");
    expect(contextAt(tl, 3700, false)).toBe("awake"); // exercise labels heart rate only
  });
  it("an unstaged session is sleep over its whole span", () => {
    expect(contextAt(tl, 5000)).toBe("otherSleep");
    expect(contextAt(tl, 5600)).toBe("awake");
  });
  it("a night's 5-minute samples land in their stages", () => {
    const labels = [1000, 1300, 1600, 1900].map((t) => contextAt(tl, t, false));
    expect(labels).toEqual(["otherSleep", "remAndDeepSleep", "awake", "remAndDeepSleep"]);
  });
});

describe("helpers", () => {
  it("find on an empty list", () => expect(find([], 5)).toBeNull());
  it("minute means", () => {
    expect(minuteHr([{ ts: 60, bpm: 60 }, { ts: 90, bpm: 70 }, { ts: 120, bpm: 50 }, { ts: 300, bpm: 80 }])).toEqual([
      { ts: 60, bpm: 65 },
      { ts: 120, bpm: 50 },
      { ts: 300, bpm: 80 },
    ]);
  });
  it("within is half-open", () => {
    const xs = [10, 20, 30, 40].map((ts) => ({ ts }));
    expect(within(xs, 20, 40).map((x) => x.ts)).toEqual([20, 30]);
  });
  it("primary: longest, then the earlier end (fix 13)", () => {
    const a = { startTs: 0, endTs: 100 };
    const b = { startTs: 0, endTs: 100 };
    const c = { startTs: -10, endTs: 90 };
    expect(primaryOf([a, b])).toBe(a);
    expect(primaryOf([a, c])).toBe(c);
    expect(primaryOf([{ startTs: 0, endTs: 50 }, a])).toBe(a);
    expect(primaryOf([])).toBeNull();
  });
});
