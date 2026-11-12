import { createHash } from "node:crypto";
import { type SQL, sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { type Db, rows as query } from "../../db";
import { account, user } from "../../db/schema";
import { DEMO_EMAIL, DEMO_PASSWORD } from "../../auth";
import { addUser, freshDb as emptyDb, USER } from "../../testing";
import { verifyPassword } from "better-auth/crypto";
import { ensureDemoUser, generateDay, localMidnight, seedPull } from "./generate";
import { DEFAULT_JOURNAL_TAGS, SCENARIO, SEED_DAYS } from "./scenario";

const TZ = "Asia/Kolkata"; // no DST, so day i starts at ANCHOR_START + i * DAY
const MAX_HR = 183;
const HOUR = 3600;
const DAY = 86_400;
/** Friday 14:00, after wake. The seeded range then starts on Monday 2026-04-06. */
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const TODAY = "2026-10-02";
const ANCHOR = "2026-04-06";
const ANCHOR_START = localMidnight(ANCHOR, TZ);
const TODAY_I = SEED_DAYS - 1;
const opts = (now: number, userId = USER) => ({ userId, now, timeZone: TZ, maxHr: MAX_HR });
const dayAt = (i: number) => new Date(Date.parse(ANCHOR) + i * DAY * 1000).toISOString().slice(0, 10);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, k) => from + k);

/**
 * A migrated database with sample views: `hr_samples (ts, bpm)` and `steps_minutes (ts, steps)` unnest the day
 * arrays, so the assertions read samples the way they did when each sample was a row.
 */
async function freshDb() {
  const db = await emptyDb({ install: false });
  await db.execute(sql`create view hr_samples as select user_id, bucket * 86400 + o as ts, v as bpm from hr_days, unnest(offsets, "values") as u(o, v)`);
  await db.execute(sql`create view steps_minutes as select user_id, bucket * 86400 + o as ts, v as steps from steps_days, unnest(offsets, "values") as u(o, v)`);
  return db;
}

/** A test query in `?` placeholder form, sent with parameters. Days come back as text (`day::text`). */
const bind = (q: string, args: unknown[]): SQL => {
  const parts = q.split("?");
  return parts.slice(1).reduce((acc, part, i) => sql`${acc}${args[i]}${sql.raw(part)}`, sql.raw(parts[0]));
};
const rows = <T>(db: Db, q: string, ...args: unknown[]) => query<T>(db, bind(q, args));
const row = async (db: Db, q: string, ...args: unknown[]) => (await rows<Record<string, unknown>>(db, q, ...args))[0];
const value = async <T>(db: Db, q: string, ...args: unknown[]) => Object.values((await row(db, q, ...args)) ?? {})[0] as T;

const indexOf = (day: string) => Math.round((Date.parse(day) - Date.parse(ANCHOR)) / DAY / 1000);
const clampZone = (z: number) => Math.min(5, Math.max(0, z));

/** sha256 of a table's (or view's) rows in column order. */
async function tableHash(db: Db, table: string, where = "") {
  const columns = await value<number>(db, "select count(*) from information_schema.columns where table_schema = 'public' and table_name = ?", table);
  const h = createHash("sha256");
  for (const r of await rows(db, `select * from "${table}" ${where} order by ${range(1, columns)}`)) h.update(JSON.stringify(r));
  return h.digest("hex");
}

/** Every data table's hash (not better-auth's, which carry creation times). */
async function checksums(db: Db) {
  const tables = await rows<{ name: string }>(
    db,
    "select table_name as name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' and table_name not in ('user', 'session', 'account', 'verification', 'rate_limit')",
  );
  return Object.fromEntries(await Promise.all(tables.map(async ({ name }) => [name, await tableHash(db, name)])));
}

type Metrics = { day: string; hrv_ms: number | null; rhr_bpm: number | null; resp_bpm: number | null; nightly_temp_c: number | null; spo2_pct: number | null; steps: number | null };
type Session = { id: string; day: string; start_ts: number; end_ts: number; is_main: boolean; stages_status: string | null; asleep_min: number; awake_min: number; deep_min: number; light_min: number; rem_min: number };
const METRICS = "select day::text as day, hrv_ms, rhr_bpm, resp_bpm, nightly_temp_c, spo2_pct, steps from daily_metrics";
const SESSIONS = "select id, day::text as day, start_ts, end_ts, is_main, stages_status, asleep_min, awake_min, deep_min, light_min, rem_min from sleep_sessions";

let db: Db;
let seedSeconds = 0;
let metrics: Map<number, Metrics>;
let mainSleep: Map<number, Session>;
beforeAll(async () => {
  db = await freshDb();
  const t = performance.now();
  expect(await seedPull(db, opts(NOW))).toEqual({ changed: true });
  seedSeconds = (performance.now() - t) / 1000;
  metrics = new Map((await rows<Metrics>(db, METRICS)).map((m) => [indexOf(m.day), m]));
  mainSleep = new Map((await rows<Session>(db, `${SESSIONS} where is_main`)).map((s) => [indexOf(s.day), s]));
}, 60_000);
const hrCount = (i: number) => value<number>(db, "select count(*) from hr_samples where ts >= ? and ts < ?", ANCHOR_START + i * DAY, ANCHOR_START + (i + 1) * DAY);

describe("a fresh seed", () => {
  it(`fills ${SEED_DAYS} local days ending today, within a few seconds`, () => {
    expect([...metrics.keys()].sort((a, b) => a - b)).toEqual(range(0, TODAY_I));
    expect(metrics.get(TODAY_I)!.day).toBe(TODAY);
    expect(seedSeconds).toBeLessThan(20);
  });

  it("writes HR every 15 s on the local-day grid, a full day being 5760 readings", async () => {
    expect(await value(db, "select count(*) from hr_samples where ts % 15 != 0")).toBe(0);
    expect(await hrCount(100)).toBe(5760);
    expect(await value(db, "select max(ts) from hr_samples")).toBeLessThan(NOW);
    expect(await value(db, "select min(bpm) >= 38 and max(bpm) <= ? from hr_samples", MAX_HR)).toBe(true);
  });

  it("marks every day with HR or steps intraday_dirty", async () => {
    const dirty = (await rows<{ day: string }>(db, "select day::text as day from intraday_dirty order by day")).map((r) => indexOf(r.day));
    expect(dirty).toEqual(range(0, TODAY_I).filter((i) => i !== 156));
  });

  it("seeds the default journal tags and a check-in on most past days, none today", async () => {
    expect(await rows(db, "select tag, label, is_default as d from journal_tags order by tag")).toEqual(
      DEFAULT_JOURNAL_TAGS.map(({ tag, label }) => ({ tag, label, d: true })).sort((a, b) => a.tag.localeCompare(b.tag)),
    );
    const perDay = await rows<{ day: string; n: number }>(db, "select day::text as day, count(*) n from journal_entries group by day");
    expect(perDay.every((d) => d.n === DEFAULT_JOURNAL_TAGS.length)).toBe(true);
    expect(perDay.some((d) => d.day === TODAY)).toBe(false);
    expect(perDay.length).toBeGreaterThan(0.85 * TODAY_I);
    expect(perDay.length).toBeLessThan(TODAY_I);
  });
});

describe("reason coverage", () => {
  const staged = (i: number) => mainSleep.get(i)?.stages_status === "SUCCEEDED";

  it("calibrating: valid nights from day 0, so days 0–6 have fewer than 7 prior nights", () => {
    for (const i of range(0, SCENARIO.calibratingDays)) {
      expect(staged(i), `day ${i}`).toBe(true);
      expect(metrics.get(i)!.hrv_ms, `day ${i}`).not.toBeNull();
    }
  });

  it("no_hrv_last_night: exactly one staged night without HRV", () => {
    expect(range(0, TODAY_I).filter((i) => staged(i) && metrics.get(i)!.hrv_ms === null)).toEqual([SCENARIO.noHrvNight]);
  });

  it("band_not_worn: two past days without sleep, one of them without any HR", async () => {
    expect(range(0, TODAY_I).filter((i) => !mainSleep.has(i))).toEqual([156, 157]);
    expect(await hrCount(156)).toBe(0);
    expect(metrics.get(156)!.steps).toBeNull();
  });

  it("insufficient_hr_data: the band goes back on minutes before midnight (under 600 readings spanning under 600 s)", async () => {
    const { n, spanS } = (await row(db, "select count(*) n, max(ts) - min(ts) as \"spanS\" from hr_samples where ts >= ? and ts < ?", ANCHOR_START + 157 * DAY, ANCHOR_START + 158 * DAY)) as {
      n: number;
      spanS: number;
    };
    expect(n).toBeGreaterThanOrEqual(20);
    expect(n).toBeLessThan(600);
    expect(spanS).toBeLessThan(600);
  });

  it("stale_baseline: skin temperature is missing for the first 3 nights and 15 nights in a row later", () => {
    const missing = range(0, TODAY_I).filter((i) => mainSleep.has(i) && metrics.get(i)!.nightly_temp_c === null);
    expect(missing).toEqual([...range(0, 2), ...range(SCENARIO.skinTempGap.start, SCENARIO.skinTempGap.end)]);
  });
});

describe("scenario", () => {
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const field = (k: keyof Metrics, days: number[]) => days.map((i) => metrics.get(i)![k] as number).filter((v) => v !== null);

  it("illness week: HRV down, RHR, respiration and temperature up, SpO2 under 95 at the peak", async () => {
    const before = range(104, 117);
    const peak = range(119, 121);
    expect(mean(field("hrv_ms", peak)) / mean(field("hrv_ms", before))).toBeLessThan(0.85);
    expect(mean(field("rhr_bpm", peak)) - mean(field("rhr_bpm", before))).toBeGreaterThan(4);
    expect(mean(field("resp_bpm", peak)) - mean(field("resp_bpm", before))).toBeGreaterThan(1);
    expect(mean(field("nightly_temp_c", peak)) - mean(field("nightly_temp_c", before))).toBeGreaterThan(0.4);
    expect(Math.max(...field("spo2_pct", peak))).toBeLessThan(95);
    const ill = (await rows<{ day: string }>(db, "select day::text as day from journal_entries where tag = 'illness' and value = 1")).map((r) => indexOf(r.day));
    expect(ill.every((i) => i >= SCENARIO.illness.start && i <= SCENARIO.illness.end)).toBe(true);
    expect(await value(db, "select count(*) from exercises where day between ?::date and ?::date", dayAt(118), dayAt(125))).toBe(0);
  });

  it("training block: Edwards-effort ACWR (7 / 28 days) rises above 1.3, and not before", async () => {
    const trimp = new Array<number>(SEED_DAYS).fill(0);
    for (const { ts, bpm } of await rows<{ ts: number; bpm: number }>(db, "select ts, bpm from hr_samples")) {
      const i = Math.floor((ts - ANCHOR_START) / DAY);
      const rhr = metrics.get(i)!.rhr_bpm ?? 56;
      trimp[i] += (clampZone(Math.floor((10 * (bpm - rhr)) / (MAX_HR - rhr)) - 4) * 15) / 60;
    }
    const effort = trimp.map((t) => (100 * Math.log(t + 1)) / Math.log(7201));
    const avg = (from: number, to: number) => mean(effort.slice(from, to + 1));
    const acwr = (i: number) => avg(i - 6, i) / avg(i - 27, i);
    expect(Math.max(...range(SCENARIO.trainingBlock.start, SCENARIO.trainingBlock.end).map(acwr))).toBeGreaterThan(1.3);
    expect(Math.max(...range(28, SCENARIO.trainingBlock.start - 1).map(acwr))).toBeLessThan(1.3);
  });

  it("sleep debt: five nights under 6 h asleep after a normal fortnight", () => {
    const asleepH = (i: number) => mainSleep.get(i)!.asleep_min / 60;
    expect(range(SCENARIO.shortSleep.start, SCENARIO.shortSleep.end).every((i) => asleepH(i) < 6)).toBe(true);
    expect(mean(range(154, 167).filter((i) => mainSleep.has(i)).map(asleepH))).toBeGreaterThan(7);
  });

  it("alcohol lowers next-night HRV by about 12%", async () => {
    const alcohol = new Set((await rows<{ day: string }>(db, "select day::text as day from journal_entries where tag = 'alcohol' and value = 1")).map((r) => indexOf(r.day)));
    const recorded = new Set((await rows<{ day: string }>(db, "select distinct day::text as day from journal_entries")).map((r) => indexOf(r.day)));
    const nextHrv = (yes: boolean) => [...recorded].filter((i) => alcohol.has(i) === yes).flatMap((i) => field("hrv_ms", [i + 1]));
    expect(alcohol.size).toBeGreaterThan(20);
    const ratio = mean(nextHrv(true)) / mean(nextHrv(false));
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(0.95);
  });

  it("workouts mix runs, rides and strength, with run VO2max, weekly daily VO2max and monthly weigh-ins", async () => {
    const types = await rows<{ type: string; n: number }>(db, "select type, count(*) n from exercises group by type");
    expect(Object.fromEntries(types.map((t) => [t.type, t.n > 10]))).toMatchObject({ RUNNING: true, BIKING: true, STRENGTH_TRAINING: true });
    expect(await value(db, "select count(*) from daily_metrics where vo2max_run is not null")).toBe(await value(db, "select count(distinct day) from exercises where type = 'RUNNING'"));
    expect(await value(db, "select count(*) from daily_metrics where vo2max_daily is not null")).toBeGreaterThanOrEqual(24);
    expect(await value(db, "select count(*) from daily_metrics where weight_kg is not null and body_fat_pct is not null")).toBe(6);
  });

  it("naps: unstaged side sessions, more of them when ill or short on sleep", async () => {
    const naps = (await rows<Session>(db, `${SESSIONS} where not is_main`)).map((s) => ({ ...s, i: indexOf(s.day) }));
    expect(naps.length).toBeGreaterThan(5);
    expect(naps.every((s) => s.stages_status === null && s.asleep_min > 0)).toBe(true);
    expect(await value(db, "select count(*) from sleep_segments where session_id like 'seed-nap-%'")).toBe(0);
    expect(naps.filter((s) => (s.i >= 118 && s.i <= 124) || (s.i >= 168 && s.i <= 172)).length).toBeGreaterThanOrEqual(5);
  });

  it("sleep sessions and workouts never overlap", async () => {
    const spans = await rows<{ s: number; e: number }>(db, "select start_ts s, end_ts e from sleep_sessions union all select start_ts, end_ts from exercises order by 1");
    for (let k = 1; k < spans.length; k++) expect(spans[k].s).toBeGreaterThanOrEqual(spans[k - 1].e);
  });
});

describe("plausibility", () => {
  it("nightly metrics stay in physiological ranges", () => {
    const all = [...metrics.values()];
    const within = (k: keyof Metrics, lo: number, hi: number) =>
      expect(all.filter((m) => m[k] !== null && ((m[k] as number) < lo || (m[k] as number) > hi)), k).toEqual([]);
    within("hrv_ms", 20, 120);
    within("rhr_bpm", 45, 75);
    within("resp_bpm", 10, 22);
    within("spo2_pct", 90, 100);
    within("nightly_temp_c", 32, 37);
  });

  it("main sleeps last 4–10 h with stage shares in physiological ranges", () => {
    for (const s of mainSleep.values()) {
      const inBedH = (s.end_ts - s.start_ts) / HOUR;
      expect(inBedH, s.day).toBeGreaterThanOrEqual(4);
      expect(inBedH, s.day).toBeLessThanOrEqual(10);
      expect(s.asleep_min / 60, s.day).toBeGreaterThanOrEqual(4);
      expect(s.asleep_min + s.awake_min).toBe((s.end_ts - s.start_ts) / 60);
      expect(s.deep_min / s.asleep_min, `${s.day} deep`).toBeGreaterThan(0.1);
      expect(s.deep_min / s.asleep_min, `${s.day} deep`).toBeLessThan(0.3);
      expect(s.rem_min / s.asleep_min, `${s.day} rem`).toBeGreaterThan(0.12);
      expect(s.rem_min / s.asleep_min, `${s.day} rem`).toBeLessThan(0.32);
      expect(s.awake_min / (s.asleep_min + s.awake_min), `${s.day} awake`).toBeLessThan(0.2);
    }
  });

  it("segments tile each main sleep exactly", async () => {
    const segs = await rows<{ session_id: string; start_ts: number; end_ts: number }>(db, "select * from sleep_segments order by session_id, start_ts");
    const bySession = Map.groupBy(segs, (g) => g.session_id);
    for (const s of mainSleep.values()) {
      const list = bySession.get(s.id)!;
      expect(list[0].start_ts).toBe(s.start_ts);
      expect(list.at(-1)!.end_ts).toBe(s.end_ts);
      for (let k = 1; k < list.length; k++) expect(list[k].start_ts).toBe(list[k - 1].end_ts);
    }
  });

  it("full worn days have 1k–30k steps (sick days are the low end)", () => {
    const full = [...metrics.entries()].filter(([i]) => i < TODAY_I && i !== 155 && i !== 156 && i !== 157);
    expect(full.filter(([, m]) => m.steps! < 1000 || m.steps! > 30_000).map(([i, m]) => [i, m.steps])).toEqual([]);
  });

  it("daily extras: activity roll-ups every worn day in Fitbit-like ranges, no nutrition, none on the band-off day", async () => {
    const extras = new Map<string, Record<string, number>>();
    for (const r of await rows<{ day: string; key: string; value: number }>(db, "select day, key, value from daily_values")) extras.set(r.day, { ...extras.get(r.day), [r.key]: r.value });
    expect(extras.has(dayAt(156))).toBe(false);
    expect(await value(db, "select count(*) from daily_values where key in ('water', 'calories_in', 'protein', 'glucose', 'core_temp')")).toBe(0);
    for (const [i, m] of metrics) {
      const x = extras.get(dayAt(i))!;
      if (i === TODAY_I || (i >= 155 && i <= 157)) continue;
      const day = dayAt(i);
      // About 0.7-1.1 m a step, a Fitbit day's minutes add up to the waking day, and elevation follows floors.
      expect(x.distance / m.steps!, day).toBeGreaterThan(0.0007);
      expect(x.distance / m.steps!, day).toBeLessThan(0.0011);
      expect(x.floors, day).toBeLessThanOrEqual(30);
      expect(x.elevation, day).toBe(Math.round(x.floors * 3.05));
      expect(x.active_minutes + x.light_minutes + x.sedentary_minutes, day).toBeLessThanOrEqual(24 * 60);
      expect(x.sedentary_minutes, day).toBeGreaterThan(x.active_minutes);
      expect(x.azm, day).toBeGreaterThanOrEqual(0);
      expect(x.avg_hr, day).toBeGreaterThan(45);
      expect(x.avg_hr, day).toBeLessThan(100);
    }
    // Workout days earn Active Zone Minutes; rest days a few at most.
    const run = await value<string>(db, "select day::text from exercises where type = 'RUNNING' limit 1");
    expect(extras.get(run)!.azm).toBeGreaterThan(20);
  });
});

describe("HRV spread", () => {
  it("has a fitted EWMA spread above noop's 5 ms floor and reaches both tails", () => {
    const hrv = [...metrics.values()].sort((a, b) => a.day.localeCompare(b.day)).flatMap((m) => (m.hrv_ms === null ? [] : [m.hrv_ms]));
    const centreAlpha = 1 - 2 ** (-1 / 14);
    const spreadAlpha = 1 - 2 ** (-1 / 21);
    let centre = hrv[0];
    let spread = 5;
    const fitted: { spread: number; z: number }[] = [];
    for (const x of hrv.slice(1)) {
      fitted.push({ spread, z: (x - centre) / (1.253 * spread) });
      spread += spreadAlpha * (Math.abs(x - centre) - spread);
      centre += centreAlpha * (x - centre);
    }
    const settled = fitted.slice(30);
    const median = settled.map((f) => f.spread).sort((a, b) => a - b)[settled.length >> 1];
    expect(median).toBeGreaterThan(5);
    // Recovery is green above z ≈ +0.25 and red below z ≈ −0.65: both need real days.
    expect(settled.filter((f) => f.z > 0.5).length / settled.length).toBeGreaterThan(0.1);
    expect(settled.filter((f) => f.z < -0.8).length / settled.length).toBeGreaterThan(0.1);
  });
});

const ctx = { anchor: ANCHOR, timeZone: TZ, maxHr: MAX_HR };

describe("determinism", () => {
  it("generates a day identically twice, and different days differently", () => {
    expect(generateDay(ctx, 120)).toEqual(generateDay(ctx, 120));
    expect(generateDay(ctx, 121).bpm).not.toEqual(generateDay(ctx, 120).bpm);
  });

  it("seeds the full range identically twice", async () => {
    const again = await freshDb();
    await seedPull(again, opts(NOW));
    expect(await checksums(again)).toEqual(await checksums(db));
  }, 60_000);
});

describe("incremental pulls", () => {
  it("this morning: awaiting sleep sync until 30 min after wake, skin temperature 90 min later, then equal to a fresh seed", async () => {
    const early = await freshDb();
    const wake = generateDay(ctx, TODAY_I).sleeps.find((s) => s.row.isMain)!.row.endTs;
    const today = () => row(early, "select hrv_ms, nightly_temp_c from daily_metrics where day = ?::date", TODAY);
    const mainSleeps = () => value(early, "select count(*) from sleep_sessions where day = ?::date and is_main", TODAY);
    const fiveAm = Date.parse(`${TODAY}T05:00:00+05:30`) / 1000;
    expect(fiveAm).toBeLessThan(wake);

    await seedPull(early, opts(fiveAm));
    expect(await value(early, "select max(ts) from hr_samples")).toBe(fiveAm - 15);
    expect([await mainSleeps(), await today()]).toEqual([0, { hrv_ms: null, nightly_temp_c: null }]);
    await seedPull(early, opts(wake + 15 * 60));
    expect([await mainSleeps(), await today()]).toEqual([0, { hrv_ms: null, nightly_temp_c: null }]);
    await seedPull(early, opts(wake + 45 * 60));
    expect(await mainSleeps()).toBe(1);
    expect(await today()).toEqual({ hrv_ms: expect.any(Number), nightly_temp_c: null });
    await seedPull(early, opts(NOW));
    expect(await today()).toEqual({ hrv_ms: expect.any(Number), nightly_temp_c: expect.any(Number) });
    expect(await checksums(early)).toEqual(await checksums(db));
  }, 60_000);

  describe("on a seeded database", () => {
    let b: Db;
    beforeAll(async () => {
      b = await freshDb();
      await seedPull(b, opts(NOW));
    }, 60_000);

    it("a pull at the same instant, or an earlier one, changes nothing", async () => {
      const before = await checksums(b);
      expect(await seedPull(b, opts(NOW))).toEqual({ changed: false });
      expect(await seedPull(b, opts(NOW - HOUR))).toEqual({ changed: false });
      expect(await checksums(b)).toEqual(before);
    });

    it("a tick an hour later only adds HR and steps for that hour and updates today's totals", async () => {
      // Friday afternoon of the seeded range is a rest day with no nap, so nothing else ends in this hour.
      const before = await checksums(b);
      const earlier = (t: string) => tableHash(b, t, `where ts < ${NOW}`);
      const beforeIntraday = [await earlier("hr_samples"), await earlier("steps_minutes")];
      const pastMetrics = await rows(b, "select * from daily_metrics where day < ?::date order by day", TODAY);
      await b.execute(sql`delete from intraday_dirty`);

      expect(await seedPull(b, opts(NOW + HOUR))).toEqual({ changed: true });
      expect(await value(b, "select count(*) from hr_samples where ts >= ?", NOW)).toBe(HOUR / 15);
      expect(await value(b, "select max(ts) from hr_samples")).toBe(NOW + HOUR - 15);
      expect(await value(b, "select min(ts) >= ? and max(ts) < ? from steps_minutes where ts >= ?", NOW, NOW + HOUR, NOW - 60)).toBe(true);
      const after = await checksums(b);
      expect([await earlier("hr_samples"), await earlier("steps_minutes")]).toEqual(beforeIntraday);
      for (const t of ["sleep_sessions", "sleep_segments", "exercises", "journal_entries", "journal_tags"]) expect(after[t], t).toBe(before[t]);
      expect(await rows(b, "select * from daily_metrics where day < ?::date order by day", TODAY)).toEqual(pastMetrics);
      expect(await rows(b, "select day::text as day from intraday_dirty")).toEqual([{ day: TODAY }]);
    });

    it("rolling into the next day extends the range and keeps the user's own check-in", async () => {
      await rows(b, "insert into journal_entries (user_id, day, tag, value) values (?, ?::date, 'alcohol', 1)", USER, TODAY);
      const tomorrow = dayAt(SEED_DAYS);
      await seedPull(b, opts(NOW + DAY));
      expect(await rows(b, "select tag, value from journal_entries where day = ?::date", TODAY)).toEqual([{ tag: "alcohol", value: 1 }]);
      expect(await value(b, "select count(*) from journal_entries where day = ?::date", tomorrow)).toBe(0);
      expect(await value(b, "select min(day)::text || ' ' || max(day)::text from daily_metrics")).toBe(`${ANCHOR} ${tomorrow}`);
      expect(await value(b, "select count(*) from sleep_sessions where day = ?::date and is_main", tomorrow)).toBe(1);
    });

    it("another user's seed is their own: same data under their id, nothing of the first user's touched", async () => {
      const before = await checksums(b);
      const other = await addUser(b);
      await seedPull(b, opts(NOW, other));
      const count = (t: string, u: number) => value<number>(b, `select count(*) from ${t} where user_id = ?`, u);
      expect(await count("daily_metrics", other)).toBe(SEED_DAYS);
      expect(await count("hr_samples", other)).toBe(await value<number>(b, "select count(*) from hr_samples where user_id = ? and ts < ?", USER, NOW));
      await rows(b, "delete from \"user\" where id = ?", other); // cascade
      expect(await checksums(b)).toEqual(before);
    });
  });
});

describe("ensureDemoUser", () => {
  it("creates the demo user once, with a credential account better-auth can verify", async () => {
    const d = await emptyDb({ install: false });
    const id = await ensureDemoUser(d);
    expect(await ensureDemoUser(d)).toBe(id);
    const [u] = await d.select().from(user).where(sql`${user.id} = ${id}`);
    expect(u).toMatchObject({ email: DEMO_EMAIL, username: "demo", name: "Demo" });
    const accounts = await d.select().from(account);
    expect(accounts).toHaveLength(1);
    expect(accounts[0]).toMatchObject({ providerId: "credential", accountId: String(id), userId: id });
    expect(await verifyPassword({ hash: accounts[0].password!, password: DEMO_PASSWORD })).toBe(true);
  });
});
