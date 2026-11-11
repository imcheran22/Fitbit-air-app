import { describe, expect, it } from "vitest";
import { openMemoryStore } from "@/data/memory";
import type { Profile } from "@/data/types";
import type { QueryCtx } from "./ctx";
import { getDayLog } from "./journalExtras";
import { saveEntries } from "./log";

const TZ = "Asia/Kolkata";
const T = Date.parse("2026-10-02T06:00:00Z") / 1000; // Oct 2, 11:30 local
const DAY = 86_400;

const ctxOf = (sex: Profile["sex"]): QueryCtx => ({
  store: openMemoryStore(),
  profile: { birthDate: "1990-01-01", sex, maxHr: null, heightCm: null, timeZone: TZ },
  timeZone: TZ,
  today: "2026-10-02",
  now: T,
  sync: { lastSyncTs: null, firstDay: null, lastError: null },
});

describe("getDayLog", () => {
  it("adds up a past day's water and food, takes its latest weight and lists its moods; the week runs oldest first", async () => {
    const ctx = ctxOf("male");
    const y = T - DAY;
    await ctx.store.upsertDailyValues([{ day: "2026-10-01", key: "water", value: 1000 }]);
    await saveEntries(
      ctx.store,
      [
        { type: "hydration-log", ts: y, data: { ml: 250 } },
        { type: "nutrition-log", ts: y, data: { name: null, meal: "LUNCH", kcal: 600, protein: null, carbs: null, fat: null } },
        { type: "weight", ts: y - 10 * DAY, data: { kg: 72.5 } },
        { type: "moods", ts: y, data: { moods: ["CALM"], valence: null } },
        { type: "symptoms", ts: y, data: { symptoms: ["CRAMPS"] } },
        { type: "hydration-log", ts: T, data: { ml: 500 } },
      ],
      { tz: TZ, now: T },
    );
    const vm = await getDayLog("2026-10-01", ctx);
    expect(vm.water.total).toBe(1250);
    expect(vm.food.kcal).toBe(600);
    expect(vm.body.latest).toEqual({ kg: 72.5, day: "2026-09-21" });
    expect(vm.moods).toHaveLength(1);
    // A cycle symptom never shows on a male profile, and his sheets leave out the cycle kinds.
    expect(vm.symptoms).toEqual([]);
    expect(vm.kinds).not.toContain("period");
    expect(vm.week.map((w) => w.day)).toEqual(["2026-09-25", "2026-09-26", "2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01"]);
    expect(vm.week[6]).toEqual({ day: "2026-10-01", water: 1250, kcal: 600 });
    expect(vm.week[0]).toEqual({ day: "2026-09-25", water: null, kcal: null });
  });

  it("forgets a weight older than 90 days", async () => {
    const ctx = ctxOf("female");
    await saveEntries(ctx.store, [{ type: "weight", ts: T - 100 * DAY, data: { kg: 60 } }], { tz: TZ, now: T });
    const vm = await getDayLog("2026-10-02", ctx);
    expect(vm.body.latest).toBeNull();
    expect(vm.kinds).toContain("period");
  });
});
