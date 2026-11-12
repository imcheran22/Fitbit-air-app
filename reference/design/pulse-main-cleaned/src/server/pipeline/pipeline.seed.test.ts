// End-to-end check on demo data, run by hand: PULSE_E2E=1 pnpm vitest run src/server/pipeline/pipeline.seed.test.ts
// Seeds a fresh in-process (PGlite) demo database up to now, recomputes, and prints the distributions
// docs/data-notes.md records. Needs no DATABASE_URL.
import { describe, expect, it } from "vitest";

const percentiles = (xs: number[], ps = [10, 25, 50, 75, 90]) => {
  const s = [...xs].sort((a, b) => a - b);
  return Object.fromEntries(ps.map((p) => [`p${p}`, +s[Math.min(s.length - 1, Math.round((p / 100) * (s.length - 1)))].toFixed(1)]));
};

describe.skipIf(!process.env.PULSE_E2E)("demo end to end", () => {
  it("seeds once and reports the seed's distributions", async () => {
    const { freshDb, ctxFor, PROFILE, TZ, USER } = await import("../testing");
    const { seedPull } = await import("../sources/seed/generate");
    const { recompute } = await import(".");
    const { rows: query, sql } = await import("../db");
    const { getProfile } = await import("../profile");
    const { ensureDefaultTags } = await import("../journalTags");
    const { getHome } = await import("../queries/home");
    const { todayOf } = await import("../queries/common");
    const { addDays } = await import("../time");

    const db = await freshDb();
    const now = Math.floor(Date.now() / 1000);
    await ensureDefaultTags(db, USER);
    await seedPull(db, { userId: USER, now, timeZone: TZ, maxHr: PROFILE.maxHr });
    const opts = { userId: USER, timeZone: TZ, profile: (await getProfile(db, USER)) ?? PROFILE };
    const firstRun = { ...(await recompute(db, opts)) };
    // Full recompute timing: force stage 1 for every day, then a no-op run.
    await db.execute(sql`update daily_scores set scoring_version = 0 where user_id = ${USER}`);
    const full = { ...(await recompute(db, opts)) };
    const noop = { ...(await recompute(db, opts)) };
    expect(noop.stage1Days).toEqual([]);

    type Row = { day: string; recovery: any; strain: any; energy_bank: any }; // eslint-disable-line @typescript-eslint/no-explicit-any
    const rows = (
      await query<Row>(db, sql`select day, recovery, strain, energy_bank from daily_scores where user_id = ${USER} order by day`)
    ).map((r) => ({ day: r.day, rec: r.recovery, s1: r.strain, eb: r.energy_bank }));
    const ctx = ctxFor(db, now);
    const today = todayOf(ctx);
    const exerciseDays = new Set(
      (await query<{ day: string }>(db, sql`select distinct day from exercises where user_id = ${USER}`)).map((r) => r.day),
    );

    const scored = rows.filter((r) => r.rec.value != null).map((r) => r.rec.value as number);
    const bands = { green: scored.filter((v) => v >= 67).length, yellow: scored.filter((v) => v >= 34 && v < 67).length, red: scored.filter((v) => v < 34).length };
    const strain = (r: (typeof rows)[number]) => (r.s1.effort * 21) / 100;
    const complete = rows.filter((r) => r.day < today && r.s1.effort != null && r.s1.hrCount > 4000);
    const rest = complete.filter((r) => !exerciseDays.has(r.day)).map(strain);
    const workout = complete.filter((r) => exerciseDays.has(r.day)).map(strain);
    const ebEnds = rows.filter((r) => r.day < today && r.eb.value != null && r.s1.hrCount > 4000).map((r) => r.eb.value as number);

    // Reasons that appear on Home over the range.
    const reasons = new Set<string>();
    for (const r of rows) {
      const vm = await getHome(r.day, ctx);
      for (const m of [vm.dials.recovery, vm.dials.sleep, vm.dials.strain, vm.energyBank, vm.tonight, vm.monitor, vm.stress, ...vm.keyStats.map((s) => s.metric)]) {
        if (m.reason) reasons.add(m.reason);
        if (m.provisional) reasons.add("provisional");
        for (const t of m.tags ?? []) reasons.add(t);
      }
    }

    // Fitted baseline spreads (abs-dev units, σ = 1.253 × spread) on trusted days.
    const spreads = (key: "hrv" | "rhr" | "resp", floor: number) => {
      const xs = rows.map((r) => r.rec.baselines[key]).filter((b) => b && b.status === "trusted").map((b) => b.sd / 1.253);
      return { floor, ...percentiles(xs, [10, 50, 90]), atFloor: `${xs.filter((x) => x <= floor + 1e-9).length}/${xs.length}`, last: +xs.at(-1)!.toFixed(2) };
    };

    const report = {
      days: rows.length,
      firstRun: { ms: firstRun.ms, stage1Days: firstRun.stage1Days.length },
      fullRecompute: { ms: full.ms, stage1Ms: full.stage1Ms, stage2Ms: full.stage2Ms, stage1Days: full.stage1Days.length },
      noopRecompute: { ms: noop.ms, stage1Days: noop.stage1Days.length },
      recoveryBands: { ...bands, scored: scored.length, pct: Object.fromEntries(Object.entries(bands).map(([k, v]) => [k, Math.round((100 * v) / scored.length)])) },
      strainRestDays: { n: rest.length, ...percentiles(rest) },
      strainWorkoutDays: { n: workout.length, ...percentiles(workout) },
      energyBankEnd: { n: ebEnds.length, ...percentiles(ebEnds), in15to40: ebEnds.filter((v) => v >= 15 && v <= 40).length },
      reasons: [...reasons].sort(),
      spreads: { hrv: spreads("hrv", 5), rhr: spreads("rhr", 2), resp: spreads("resp", 0.5) },
      yesterday: addDays(today, -1),
    };
    console.log(JSON.stringify(report, null, 2));
  }, 300_000);
});
