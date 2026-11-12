import { execFileSync } from "node:child_process";
import { SCENARIO } from "../src/server/sources/seed/scenario";

/** The e2e server's throwaway Postgres database (playwright.config.ts recreates it before each server start). */
export const E2E_DB = "pulse_e2e";
const PG = process.env.E2E_PG_ADMIN_URL ?? "postgres://pulse:pulse@localhost:5432/postgres";
/** DATABASE_URL for an e2e database on the same server. */
export const e2eUrl = (db: string) => Object.assign(new URL(PG), { pathname: `/${db}` }).toString();
const query = (db: string, before?: string) =>
  JSON.parse(execFileSync("node", ["e2e/db.mjs", "days", db, ...(before ? [before] : [])], { encoding: "utf8" })) as { first: string; run: string | null };

export type DayKey = "today" | "past" | "calibrating" | "illness" | "bandOff";
export const DAY_KEYS: DayKey[] = ["today", "past", "calibrating", "illness", "bandOff"];

const addDays = (day: string, n: number) => {
  const t = new Date(`${day}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
};

let cached: Record<DayKey, string | null> | undefined;

/**
 * Scenario days as `?d=` values (null = today, no param). Day indices count from the first seeded
 * day, read from the DB, so they stay right on a reused server that seeded on an earlier date.
 */
export function days(): Record<DayKey, string | null> {
  if (cached) return cached;
  const { first } = query(E2E_DB);
  const at = (i: number) => addDays(first, i);
  // The latest run before the band-off: Strain lists it, so journeys and the sweep find an activity there.
  const { run } = query(E2E_DB, at(SCENARIO.bandOff.day));
  cached = {
    today: null,
    past: run, // after the illness, before the band-off: an ordinary scored day with a run
    calibrating: at(2), // inside SCENARIO.calibratingDays

    illness: at(SCENARIO.illness.start + 2), // peak severity: the alert is raised (the seed is keyed by day index)
    bandOff: at(SCENARIO.bandOff.day + 1),
  };
  return cached;
}

/** `path` with `?d=` for the day (none for today). */
export const withDay = (route: string, d: string | null) => (d ? `${route}${route.includes("?") ? "&" : "?"}d=${d}` : route);
