// Journal's Log tiles and This week card for any day: the day's water, food, latest weight, moods, symptoms and blood
// oxygen, and the seven days of water and food ending on it. halo's getLog (log.ts) covers today only; this is the
// per-day half of pulse's queries/log.ts, read from halo's Store (logged_entries of both sources, daily_values) and
// counted as halo counts them (waterOn, dayTotals in food.ts).
import { metricsWithLoggedBody } from "@/data/body";
import { addDays, localMidnight } from "@/lib/time";
import { type QueryCtx, todayOf } from "./common";
import { dayTotals } from "./food";
import { CYCLE_SYMPTOMS, isCycleKind, LOG_KINDS, type LogData, type LogKind } from "./log";
import type { LogType } from "./_lib";

/** A weight older than this is not "the latest": the tile shows nothing rather than a reading from months ago. */
const WEIGHT_DAYS = 90;

export type DayEntry = { id: string; type: LogType; ts: number; data: unknown };
export type WeekDay = { day: string; water: number | null; kcal: number | null };

export type DayLogVM = {
  /** Cycle kinds are absent on a male profile. */
  kinds: LogKind[];
  /** The day shown (Journal's selected day) and today, both local. */
  day: string;
  today: string;
  timeZone: string;
  /** The day's water: the synced roll-up plus what Pulse logged. */
  water: { total: number };
  /** The day's calories, as the nutrition metrics count them; null when none. */
  food: { kcal: number | null };
  /** The latest weight on or before the day, within 90 days. */
  body: { latest: { kg: number; day: string } | null };
  /** The day's latest blood oxygen logged in Pulse, %. */
  spo2: number | null;
  moods: DayEntry[];
  symptoms: DayEntry[];
  /** The seven days ending on the day, oldest first. */
  week: WeekDay[];
};

export async function getDayLog(day: string, ctx: QueryCtx): Promise<DayLogVM> {
  const { store, timeZone } = ctx;
  const female = ctx.profile.sex === "female";
  const from = addDays(day, -6);
  const [values, rows, metrics] = await Promise.all([
    store.dailyValues({ from, to: day }),
    // ponytail: entries since the week's start, newest first, capped; a day-range read if logs ever grow that long.
    store.loggedEntries(localMidnight(from, timeZone), 10_000),
    metricsWithLoggedBody(store),
  ]);
  const waterOf = (d: string) =>
    (values.find((v) => v.day === d && v.key === "water")?.value ?? 0) +
    rows.filter((e) => e.day === d && e.type === "hydration-log" && e.source === "pulse").reduce((a, e) => a + Number((e.data as LogData["hydration-log"]).ml ?? 0), 0);
  const week: WeekDay[] = [];
  for (let d = from; d <= day; d = addDays(d, 1)) {
    const water = waterOf(d);
    week.push({ day: d, water: water || null, kcal: dayTotals(values, rows, d).kcal });
  }
  const mine = rows
    .filter((e) => e.day === day)
    .sort((a, b) => a.ts - b.ts)
    .map((e): DayEntry => ({ id: e.id, type: e.type as LogType, ts: e.ts, data: e.data }));
  const of = (t: LogType) => mine.filter((e) => e.type === t);
  const weight = metrics.findLast((m) => m.day <= day && m.day >= addDays(day, -WEIGHT_DAYS) && m.weightKg != null);
  const spo2 = of("oxygen-saturation").at(-1);
  return {
    kinds: LOG_KINDS.filter((k) => female || !isCycleKind(k)),
    day,
    today: todayOf(ctx),
    timeZone,
    water: { total: waterOf(day) },
    food: { kcal: week[6].kcal },
    body: { latest: weight ? { kg: weight.weightKg!, day: weight.day } : null },
    spo2: spo2 ? (spo2.data as LogData["oxygen-saturation"]).pct : null,
    moods: of("moods"),
    symptoms: female ? of("symptoms") : of("symptoms").filter((e) => !(e.data as LogData["symptoms"]).symptoms.some((s) => CYCLE_SYMPTOMS.has(s))),
    week,
  };
}
