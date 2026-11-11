import { describe, expect, it } from "vitest";
import { dayStrain, weight, workoutStrain, zonesOf } from "@/core/engine/strain";
import { LiveStrain, strainOfBase, targetCrossing, unitsForStrain } from "./liveStrain";
import { workoutSetup } from "./workoutSetup";
import type { DayRow } from "@/queries/common";

const REST = 60;
const MAX = 190; // engine zones on max HR: 95 / 114 / 133 / 152 / 171
const Z = zonesOf(MAX);
/** Engine units a second at `bpm`. */
const w = (bpm: number) => weight(bpm, Z);

/** Feeds `bpm` once a second for `seconds`, from `t0` (ms); returns the next free time. */
function feed(s: LiveStrain, bpm: number, t0: number, seconds: number): number {
  for (let i = 0; i < seconds; i++) s.add(t0 + i * 1000, bpm);
  return t0 + seconds * 1000;
}

describe("base ↔ units", () => {
  it("inverts Daily Strain: the units for a strain give that strain back", () => {
    for (const [strain, steps] of [[12, 0], [42, 6000], [90, 12000]]) expect(dayStrain(steps, unitsForStrain(strain, steps))).toBeCloseTo(strain, 9);
    expect(unitsForStrain(5, 20000)).toBe(0); // steps alone already past it
    expect(unitsForStrain(200, 0)).toBe(Infinity); // past what units can reach
    expect(strainOfBase(null)).toBe(0);
    expect(strainOfBase({ units: 20000, steps: 7000 })).toBeCloseTo(dayStrain(7000, 20000), 9);
  });
});

describe("LiveStrain", () => {
  it("adds each reading's zone weight times its seconds", () => {
    // 20 minutes at 1 Hz: 5 at 130, 10 at 155, 5 at 180.
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, base: null });
    let t = feed(s, 130, 0, 300);
    t = feed(s, 155, t, 600);
    feed(s, 180, t, 300);
    expect(s.units).toBeCloseTo(300 * w(130) + 600 * w(155) + 299 * w(180), 6);
    expect(s.sessionStrain).toBeCloseTo(workoutStrain(s.units), 9);
    expect(s.dayStrain).toBeCloseTo(dayStrain(0, s.units), 9);
    expect(s.zoneSeconds.map(Math.round)).toEqual([0, 0, 300, 0, 600, 299]); // the engine's zones on max HR
    expect(s.avgHr).toBe(155);
    expect(s.maxBpm).toBe(180);
  });

  it("carries on from the day's stored units and steps", () => {
    const base = { units: 15000, steps: 8000 };
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, base });
    expect(s.dayStartStrain).toBeCloseTo(dayStrain(8000, 15000), 9);
    feed(s, 160, 0, 1201);
    expect(s.dayStrain).toBeCloseTo(dayStrain(8000, 15000 + 1200 * w(160)), 6);
    expect(s.dayStrain).toBeGreaterThan(s.dayStartStrain);
    // A day already loaded moves less for the same workout than a fresh one.
    const fresh = new LiveStrain({ restingHr: REST, maxHr: MAX, base: null });
    feed(fresh, 160, 0, 1201);
    expect(s.dayStrain - s.dayStartStrain).toBeLessThan(fresh.dayStrain);
  });

  it("credits at most 2 minutes across a gap", () => {
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, base: null });
    s.add(0, 170);
    s.add(10 * 60_000, 170);
    expect(s.units).toBeCloseTo(w(170) * 120, 6);
  });

  it("rejects impossible readings and jumps", () => {
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, base: null });
    expect(s.add(0, 20)).toBe(false);
    expect(s.add(0, 100)).toBe(true);
    expect(s.add(1000, 160)).toBe(false); // +60 in a second
    expect(s.add(1000, 100)).toBe(true);
    expect(s.add(1000, 101)).toBe(false); // not after the last
    expect(s.add(30_000, 160)).toBe(true); // a big change is fine once enough time has passed
  });

  it("knows the zone and estimates minutes to a target from the recent rate", () => {
    const s = new LiveStrain({ restingHr: REST, maxHr: MAX, base: null });
    expect(s.zoneOf(94)).toBe(0);
    expect(s.zoneOf(95)).toBe(1); // Zone 1 from 50 % of max HR (the engine's zones)
    expect(s.zoneOf(140)).toBe(3);
    expect(s.zoneOf(190)).toBe(5);
    expect(s.minutesTo(20, 0)).toBeNull();
    const t = feed(s, 155, 0, 240);
    expect(s.rate(t)).toBeCloseTo(60 * w(155), 6);
    const m = s.minutesTo(40, t)!;
    expect(m).toBeCloseTo((unitsForStrain(40, 0) - s.units) / (60 * w(155)), 6);
    expect(s.minutesTo(2, t)).toBe(0);
    // Below zone 1 the target is out of reach at this effort.
    const t2 = feed(s, 70, t, 400);
    expect(s.minutesTo(70, t2)).toBeNull();
  });
});

describe("targetCrossing", () => {
  it("fires once into the range and once past it", () => {
    const tg: [number, number] = [40, 60];
    expect(targetCrossing(39.9, 40, tg)).toBe("low");
    expect(targetCrossing(40, 45, tg)).toBeNull();
    expect(targetCrossing(59.9, 60.1, tg)).toBe("high");
    expect(targetCrossing(35, 70, tg)).toBe("high");
    expect(targetCrossing(35, 70, null)).toBeNull();
  });
});

describe("workoutSetup", () => {
  type Row = Pick<DayRow, "s1" | "strainTarget" | "recovery">;
  const s1 = (restingHr: number, units: number | null, hrCount = 500) =>
    ({ restingHr, maxHr: 185, hrCount, engine: units == null ? {} : { strain: { value: 40, steps: 5000, passiveUnits: units - 1000, workoutUnits: 1000 } } }) as unknown as DayRow["s1"];

  it("reads today's resting and max HR, Strain inputs, target and Recovery", () => {
    const rows = new Map<string, Row>([
      [
        "2026-10-07",
        {
          s1: s1(52, 9000),
          strainTarget: { reason: null, low: 40, high: 60, base: 12, band: "green", coldStart: false, acwrRule: null },
          recovery: { value: 71 } as DayRow["recovery"],
        },
      ],
    ]);
    expect(workoutSetup(rows, "2026-10-07", 190)).toEqual({ restingHr: 52, maxHr: 185, base: { units: 9000, steps: 5000 }, target: [40, 60], recovery: 71, synced: true, sex: "male" });
  });

  it("falls back to the week's resting HR and the profile's max before today has a row", () => {
    const rows = new Map<string, Row>([["2026-10-05", { s1: s1(55, null), strainTarget: null, recovery: null }]]);
    expect(workoutSetup(rows, "2026-10-07", 190)).toEqual({ restingHr: 55, maxHr: 190, base: null, target: null, recovery: null, synced: false, sex: "male" });
    expect(workoutSetup(new Map(), "2026-10-07", 190).restingHr).toBe(60);
  });

  it("has no target while the target is missing a reason's worth of data", () => {
    const rows = new Map<string, Row>([["2026-10-07", { s1: s1(52, null, 0), strainTarget: { reason: "calibrating" }, recovery: null }]]);
    expect(workoutSetup(rows, "2026-10-07", 190)).toMatchObject({ target: null, base: null, synced: false });
  });
});
