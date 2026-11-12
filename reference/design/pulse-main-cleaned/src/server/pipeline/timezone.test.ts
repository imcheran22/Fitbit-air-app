// A change of TZ moves every day's bounds; its own file so its two full recomputes run beside pipeline.test.ts.
import { expect, it } from "vitest";
import { type Db, rows, sql } from "../db";
import { lastRun, recompute } from ".";
import { copyDb, dump, OPTS, seeded, USER } from "../testing";

const days = async (db: Db) =>
  (await rows<{ day: string }>(db, sql`select day from daily_scores where user_id = ${USER} order by day`)).map((r) => r.day);

it("a time-zone change reruns stage 1 for every day and matches a from-scratch run in the new zone", async () => {
  const utc = { ...OPTS, timeZone: "UTC" };
  const moved = await seeded();
  await recompute(moved, utc);
  const rerun = lastRun.stage1Days;
  const scratch = await copyDb(moved);
  await scratch.execute(sql`delete from daily_scores`);
  await scratch.execute(sql`delete from intraday_series`);
  await scratch.execute(sql`delete from reports`);
  await recompute(scratch, utc);
  expect(rerun).toEqual(await days(scratch));
  expect(await dump(moved, "daily_scores", "1, 2")).toBe(await dump(scratch, "daily_scores", "1, 2"));
  expect(await dump(moved, "intraday_series", "1, 2, 3")).toBe(await dump(scratch, "intraday_series", "1, 2, 3"));
}, 120_000);
