// The sleep goal on the in-memory Store over the 180-day demo seed: the automatic estimate, and a profile goal reaching
// the stored Sleep rows.
import { beforeAll, describe, expect, it } from "vitest";
import { MemoryStore } from "@/data/memory";
import { seedDemo } from "@/data/seed";
import type { Profile } from "@/data/types";
import { runPipeline } from "@/pipeline";
import type { QueryCtx } from "./ctx";
import { sleepGoalView } from "./sleepGoal";

const TZ = "Asia/Kolkata";
const TODAY = "2026-10-02";
const NOW = Date.parse("2026-10-02T14:00:00+05:30") / 1000;
const PROFILE: Profile = { birthDate: "1990-01-01", sex: "male", maxHr: 183, heightCm: 178, timeZone: TZ };

let store: MemoryStore;
beforeAll(async () => {
  store = new MemoryStore();
  await seedDemo(store, { today: TODAY, timeZone: TZ, now: NOW });
  await runPipeline(store, PROFILE, { today: TODAY });
});

describe("sleep goal", () => {
  it("is 7.5 h without one, with an estimate from the stored nights", async () => {
    const ctx: QueryCtx = { store, profile: PROFILE, timeZone: TZ, today: TODAY, now: NOW, sync: await store.getSyncState() };
    const vm = await sleepGoalView(ctx);
    expect(vm.hours).toBe(7.5);
    expect(vm.estimate?.status).toBe("sufficient");
    expect(vm.estimate!.hours).toBeGreaterThan(5);
    expect(vm.estimate!.hours).toBeLessThan(10);
  });

  it("feeds the profile's goal to the stored Sleep rows", async () => {
    await runPipeline(store, { ...PROFILE, sleepGoal: { hours: 8.25, method: "manual" } }, { today: TODAY });
    expect((await store.getScores(TODAY))?.sleep?.needHours).toBe(8.25);
  });
});
