// The pipeline on the kind of data Health Connect often gives (mobile additions): heart rate without Fitbit's resting
// HR or any sleep session, one resting-HR reading in 50 days, a few short-HR days, and an unfit, heavier person
// (27 years, 173 cm, 89.8 kg at 27 % fat, resting HR 78, max HR 189 by Tanaka).
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { emptyMetrics, type HrSample, type Metrics, type Profile, type StepsMinute } from "@/data/types";
import { addDays, localMidnight } from "@/lib/time";
import { getHealthspan } from "@/queries/health";
import type { QueryCtx } from "@/queries/ctx";
import { runPipeline, type HealthspanRow, type Stage1Day, type TrainingLoadRow } from "@/pipeline";

const TZ = "UTC";
const TODAY = "2026-10-07";
const DAYS = 50;
const FIRST = addDays(TODAY, 1 - DAYS);
const PROFILE: Profile = { birthDate: "1999-06-01", sex: "male", maxHr: null, heightCm: 173, timeZone: TZ };
const dayAt = (i: number) => addDays(FIRST, i);
/** The only resting-HR reading: Fitbit's daily value on day 5. */
const RHR_DAY = 5;
/** HR from 08:00 to 14:00 only (6 h): too little for the day's zone and strength minutes in Pulse Age. */
const SHORT_DAY = 20;
/** Ten HR samples: too few for an Effort. */
const SCRAP_DAY = 21;

/** A day's minute HR: 78 bpm asleep to 07:00 (no session written), 92 awake, a 30-minute walk at 128 bpm at 18:00. */
const bpmAt = (m: number) => (m < 420 ? 78 : m >= 1080 && m < 1110 ? 128 : 92);
/** Steps: 110 a minute on the walk, 30 every 20th awake minute. */
const stepsAt = (m: number) => (m >= 1080 && m < 1110 ? 110 : m >= 420 && m % 20 === 0 ? 30 : 0);

async function build() {
  const store = new MemoryStore();
  await store.setProfile(PROFILE);
  const metrics: Metrics[] = [];
  for (let i = 0; i < DAYS; i++) {
    const day = dayAt(i);
    const start = localMidnight(day, TZ);
    const hr: HrSample[] = [];
    const steps: StepsMinute[] = [];
    for (let m = 0; m < 1440; m++) {
      const inShort = m >= 480 && m < 840;
      if (i === SCRAP_DAY ? m >= 600 && m < 610 : i !== SHORT_DAY || inShort) hr.push({ ts: start + m * 60, bpm: bpmAt(m) });
      if (stepsAt(m)) steps.push({ ts: start + m * 60, v: stepsAt(m) });
    }
    await store.putHr(hr);
    await store.putSteps(steps);
    metrics.push({
      ...emptyMetrics(day),
      steps: steps.reduce((a, s) => a + s.v, 0),
      rhrBpm: i === RHR_DAY ? 78 : null,
      ...(i === 2 && { weightKg: 89.8, bodyFatPct: 27 }),
    });
  }
  await store.upsertMetrics(metrics);
  return store;
}

let store: MemoryStore;
const s1 = async (i: number) => (await store.getScores(dayAt(i)))!.strain as Stage1Day;
beforeAll(async () => {
  store = await build();
  await runPipeline(store, PROFILE, { today: TODAY });
}, 120_000);

describe("resting HR without Fitbit's daily value or a sleep session", () => {
  it("is estimated from the day's still HR before any reading, then the reading, then carried 30 days, then estimated", async () => {
    for (const i of [0, 4]) expect(await s1(i)).toMatchObject({ restingHr: 78, restingHrSource: "estimated" });
    expect(await s1(RHR_DAY)).toMatchObject({ restingHr: 78, restingHrSource: "daily" });
    for (const i of [6, SHORT_DAY, 35]) expect(await s1(i)).toMatchObject({ restingHr: 78, restingHrSource: "carried" });
    expect(await s1(36)).toMatchObject({ restingHr: 78, restingHrSource: "estimated" });
  });

  it("puts the zones on it: the 128 bpm walk (45 % of the reserve) is Zone 1, from 122.4 bpm, not Zone 2 on 60 bpm", async () => {
    const d = await s1(40);
    expect(d.maxHr).toBe(189);
    expect(d.zoneLower[0]).toBe(122.4);
    expect(d.zoneSeconds).toEqual([30 * 60, 0, 0, 0, 0]);
    // The walk is above the waking floor (92 bpm awake, 13 % of the reserve), so it earns some Strain.
    expect(d.effort).toBeGreaterThan(0);
  });

  it("an unchanged rerun redoes nothing", async () => {
    expect(await runPipeline(store, PROFILE, { today: TODAY })).toEqual({ days: DAYS, stage1Reran: 0 });
  });
});

describe("Pulse Age on sparse data", () => {
  it("puts the walk (68 % of max HR) in zone 2 on the engine's zones, every full day", async () => {
    expect((await s1(40)).engine?.strain?.zoneS?.[2]).toBe(30 * 60);
    expect((await s1(SHORT_DAY)).hrMinutesAm + (await s1(SHORT_DAY)).hrMinutesPm).toBe(360);
  });

  it("has no sleep consistency without recorded sleep (it read a perfectly regular 100 from heart rate alone)", async () => {
    for (const i of [10, 40]) expect(((await store.getScores(dayAt(i)))!.sleep as { sri: number | null }).sri).toBeNull();
  });

  it("shows no Pulse Age on four factors (fix 9: at least five)", async () => {
    // Steps, zones 2–3, zones 4–5 and strength; no sleep (so no sleep heart rate for resting HR or consistency), no VO2
    // max, and the one body-fat reading is outside the 28 days.
    const hs = (await store.getScores(TODAY))!.healthspan as HealthspanRow;
    expect(hs).toMatchObject({ reason: "calibrating" });
    const ctx: QueryCtx = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: localMidnight(TODAY, TZ) + 20 * 3600, sync: { lastSyncTs: null, firstDay: FIRST, lastError: null } };
    expect((await getHealthspan(TODAY, ctx)).result.value).toBeNull();
  });
});

describe("Training load on sparse data", () => {
  it("leaves a worn day without an Effort out (it breaks the run like a day off), instead of a rest day of 0", async () => {
    expect((await s1(SCRAP_DAY)).hrCount).toBe(10);
    expect((await s1(SCRAP_DAY)).effort).toBeNull();
    const tl = (i: number) => store.getScores(dayAt(i)).then((r) => r!.training_load as TrainingLoadRow);
    expect((await tl(SCRAP_DAY)).contiguousDays).toBe(0);
    expect((await tl(SCRAP_DAY + 1)).contiguousDays).toBe(1);
  });
});
