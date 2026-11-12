// The /activities journal: day groups newest first, today always present, and "Show older".
import { beforeAll, describe, expect, it } from "vitest";
import { type Db, row, sql } from "../db";
import { ctxFor, seeded, USER } from "../testing";
import { addDays } from "../time";
import { getActivities } from "./activities";

let db: Db;
beforeAll(async () => {
  db = await seeded();
});

describe("getActivities", () => {
  it("groups the window's workouts by day, newest first, with today leading", async () => {
    const vm = await getActivities(30, ctxFor(db));
    const days = vm.groups.map((g) => g.day);
    expect(days[0]).toBe(vm.today);
    expect([...days].sort().reverse()).toEqual(days);
    const { n } = (await row<{ n: number }>(db, sql`select count(*) n from exercises where user_id = ${USER} and day > ${addDays(vm.today, -30)}`))!;
    expect(vm.groups.reduce((a, g) => a + g.items.length, 0)).toBe(n);
    for (const g of vm.groups) for (const a of g.items) expect(a.day).toBe(g.day);
    expect(vm.older).toBe(true);
  });

  it("has nothing older once the window covers every workout", async () => {
    expect((await getActivities(3650, ctxFor(db))).older).toBe(false);
  });
});
