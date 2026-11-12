import { describe, expect, it } from "vitest";
import { dailyMetrics, dailyValues, loggedEntries, syncState } from "../db/schema";
import { ctxFor, freshDb, NOW, USER } from "../testing";
import { getLog } from "./log";

const DAY = "2026-10-02"; // NOW is 14:00 local on this day
const at = (hhmm: string, day = DAY) => Date.parse(`${day}T${hhmm}:00+05:30`) / 1000;

async function setup() {
  const db = await freshDb();
  const entry = (id: string, type: string, ts: number, data: unknown, o: { day?: string; source?: string; app?: string | null } = {}) => ({
    userId: USER,
    id,
    type,
    ts,
    day: o.day ?? DAY,
    data,
    googleName: `users/me/dataTypes/${type}/dataPoints/${id}`,
    source: o.source ?? "pulse",
    app: o.app ?? null,
    createdAt: NOW - 86_400,
  });
  await db.insert(loggedEntries).values([
    entry("w1", "hydration-log", at("07:40"), { ml: 250 }),
    entry("w2", "hydration-log", at("10:15"), { ml: 500 }, { source: "google", app: "FITBIT" }),
    entry("f1", "nutrition-log", at("08:10"), { name: "Poha", meal: "BREAKFAST", kcal: 320, protein: 8, carbs: 58, fat: 7 }, { source: "google", app: "FITBIT" }),
    entry("f2", "nutrition-log", at("13:20"), { name: "Dal", meal: "LUNCH", kcal: 640, protein: 22, carbs: 92, fat: 18 }),
    entry("kg", "weight", at("07:22"), { kg: 70.6 }, { source: "google", app: "FITBIT" }),
    entry("bf", "body-fat", at("07:22"), { pct: 23.5 }, { source: "google", app: "FITBIT" }),
    entry("m1", "moods", at("11:30"), { moods: ["CALM"], valence: "PLEASANT" }),
    entry("old", "hydration-log", at("09:00", "2026-10-01"), { ml: 900 }, { day: "2026-10-01" }),
    entry("p1", "menstrual-period", at("00:00", "2026-09-30"), { start: "2026-09-30", end: "2026-10-03", flow: null }, { day: "2026-09-30" }),
  ]);
  await db.insert(dailyValues).values([
    { userId: USER, day: DAY, key: "water", value: 1100 },
    { userId: USER, day: DAY, key: "calories_in", value: 960 },
    { userId: USER, day: DAY, key: "protein", value: 30 },
    { userId: USER, day: DAY, key: "carbs", value: 150 },
    { userId: USER, day: DAY, key: "fat", value: 25 },
    { userId: USER, day: "2026-10-01", key: "water", value: 900 },
  ]);
  await db.insert(dailyMetrics).values([{ userId: USER, day: "2026-09-28", source: "google", weightKg: 71 }]);
  return db;
}

describe("getLog", () => {
  it("groups the selected day's entries: drinks, food by meal, weigh-ins, mood, with where each came from", async () => {
    const db = await setup();
    const vm = await getLog(DAY, { ...ctxFor(db), mode: "google" });
    expect(vm.water.entries.map((e) => [e.detail, e.app])).toEqual([["250 ml", "Pulse"], ["500 ml", "Fitbit"]]);
    expect(vm.food.meals.map((m) => [m.meal, m.kcal, m.entries.map((e) => e.id)])).toEqual([
      ["BREAKFAST", 320, ["f1"]],
      ["LUNCH", 640, ["f2"]],
      ["DINNER", 0, []],
      ["SNACK", 0, []],
    ]);
    expect(vm.body.weighins).toMatchObject([{ kg: 70.6, pct: 23.5, entries: [{ id: "kg" }, { id: "bf" }] }]);
    expect(vm.body.latest).toEqual({ kg: 70.6, day: DAY });
    expect(vm.body.change).toEqual({ kg: -0.4, since: "2026-09-28" });
    expect(vm.moods.map((e) => e.id)).toEqual(["m1"]);
  });

  it("totals come from Google's roll-up plus Pulse entries the sync has not seen", async () => {
    const db = await setup();
    const vm = await getLog(DAY, ctxFor(db));
    expect(vm.water.total).toBe(1100 + 250); // demo: no sync row, so Pulse's own drink is still pending
    expect(vm.food.total).toEqual({ kcal: 960 + 640, protein: 52, carbs: 242, fat: 43 });
    expect(vm.week.map((w) => w.water)).toEqual([null, null, null, null, null, 900 + 900, 1350]);
  });

  it("another day shows only its own entries; the weight tile falls back to the last weigh-in", async () => {
    const db = await setup();
    const vm = await getLog("2026-10-01", ctxFor(db));
    expect(vm.water.entries.map((e) => e.id)).toEqual(["old"]);
    expect(vm.food.meals.every((m) => !m.entries.length)).toBe(true);
    expect(vm.body).toMatchObject({ latest: { kg: 71, day: "2026-09-28" }, change: null, weighins: [] });
  });

  it("food logged in Pulse stops counting as pending once the food sync has run", async () => {
    const db = await setup();
    await db.insert(syncState).values({ userId: USER, type: "nutrition-log", lastSuccessAt: NOW });
    expect((await getLog(DAY, ctxFor(db))).food.total).toEqual({ kcal: 960, protein: 30, carbs: 150, fat: 25 });
  });

  it("weight and body fat a moment apart are one weigh-in; a cycle symptom never shows on a male profile", async () => {
    const db = await setup();
    await db.delete(loggedEntries);
    await db.insert(loggedEntries).values([
      { userId: USER, id: "a", type: "weight", ts: at("07:22"), day: DAY, data: { kg: 70 }, createdAt: NOW },
      { userId: USER, id: "b", type: "body-fat", ts: at("07:22") + 30, day: DAY, data: { pct: 23 }, createdAt: NOW },
      { userId: USER, id: "c", type: "weight", ts: at("19:00"), day: DAY, data: { kg: 70.4 }, createdAt: NOW },
      { userId: USER, id: "s", type: "symptoms", ts: at("09:00"), day: DAY, data: { symptoms: ["CRAMPS"] }, createdAt: NOW },
    ]);
    const vm = await getLog(DAY, ctxFor(db));
    expect(vm.body.weighins.map((w) => [w.kg, w.pct, w.entries.map((e) => e.id)])).toEqual([[70, 23, ["a", "b"]], [70.4, null, ["c"]]]);
    expect(vm.body.latest).toEqual({ kg: 70.4, day: DAY });
    expect(vm.symptoms).toEqual([]);
  });

  it("a weight older than 90 days is not the latest; a day past the import window is not listed", async () => {
    const db = await setup();
    const vm = await getLog("2027-01-10", { ...ctxFor(db), now: Date.parse("2027-01-10T12:00:00+05:30") / 1000 });
    expect(vm.body.latest).toBeNull();
    const old = await getLog("2026-09-01", ctxFor(db));
    expect(old.listed).toBe(false);
    expect((await getLog(DAY, ctxFor(db))).listed).toBe(true);
  });

  it("a period running through the day shows on a female profile only", async () => {
    const db = await setup();
    const ctx = ctxFor(db);
    expect((await getLog(DAY, ctx)).cycle).toEqual([]);
    const female = await getLog(DAY, { ...ctx, profile: { ...ctx.profile, sex: "female" } });
    expect(female.cycle.map((e) => e.id)).toEqual(["p1"]);
    expect((await getLog("2026-10-04", { ...ctx, profile: { ...ctx.profile, sex: "female" } })).cycle).toEqual([]); // ended the day before
    expect(female.kinds).toContain("period");
  });
});
