// Journal's Log (spec §11 LG1): which sheets to offer, whether each can write to Google, and one day's log, grouped
// the way people think about it (water, food by meal, body, mood and symptoms), with the day's totals and its week.
import { and, desc, eq, gte, isNotNull, lte } from "drizzle-orm";
import { CYCLE_SYMPTOMS, isCycleKind, KIND_TYPES, LOG_DAYS, LOG_KINDS, MEALS, type LogData, type LogKind, type Meal } from "@/lib/log";
import { dailyMetrics } from "../db/schema";
import { entriesOnDay, foodOn, logAccess, totalsBetween, type DayTotals, type Food, type LogAccess, type LoggedEntry } from "../log";
import { addDays } from "../time";
import { type QueryCtx, todayOf } from "./common";

export type MealGroup = { meal: Meal; label: string; kcal: number; entries: LoggedEntry[] };
/** A weight and the body fat logged with it (one weigh-in writes both), as one row. */
export type Weighin = { ts: number; kg: number | null; pct: number | null; entries: LoggedEntry[] };
export type WeekDay = DayTotals;

/** A weight older than this is not "the latest": the tile shows nothing rather than a reading from months ago. */
const WEIGHT_DAYS = 90;
/** A scale may write weight and body fat a moment apart: within this they are one weigh-in. */
const WEIGHIN_S = 60;

export type LogVM = {
  /** Cycle kinds are absent on a male profile. */
  kinds: LogKind[];
  /** Per sheet: the worst access of the types it writes (weight needs weight and body fat). */
  access: Record<LogKind, LogAccess>;
  /** The day shown (Journal's selected day) and today, both local. */
  day: string;
  today: string;
  timeZone: string;
  /** Demo mode: entries stay in Pulse. */
  demo: boolean;
  /** Whether other apps' entries are listed for the day: the sync brings them home for the last LOG_DAYS only. */
  listed: boolean;
  /** The day's water: Google's roll-up plus what Pulse logged since that sync, and each drink. */
  water: { total: number; entries: LoggedEntry[] };
  /** The day's food the same way, and each entry under its meal (every meal, empty ones too). */
  food: { total: Food | null; meals: MealGroup[] };
  /** The latest weight on or before the day, its change from the one before, and the day's weigh-ins. */
  body: { latest: { kg: number; day: string } | null; change: { kg: number; since: string } | null; weighins: Weighin[] };
  moods: LoggedEntry[];
  symptoms: LoggedEntry[];
  /** Periods running through the day and ovulation tests on it (female profiles only). */
  cycle: LoggedEntry[];
  /** The seven days ending on the day, oldest first. */
  week: WeekDay[];
};

const RANK: Record<LogAccess, number> = { ok: 0, demo: 0, reconnect: 1, not_connected: 2 };

export async function getLog(day: string, ctx: QueryCtx): Promise<LogVM> {
  const { db, userId } = ctx;
  const female = ctx.profile.sex === "female";
  const [byType, entries, weights, week, food] = await Promise.all([
    logAccess(db, userId, ctx.mode),
    entriesOnDay(db, userId, day),
    db
      .select({ day: dailyMetrics.day, kg: dailyMetrics.weightKg })
      .from(dailyMetrics)
      .where(and(eq(dailyMetrics.userId, userId), lte(dailyMetrics.day, day), gte(dailyMetrics.day, addDays(day, -WEIGHT_DAYS)), isNotNull(dailyMetrics.weightKg)))
      .orderBy(desc(dailyMetrics.day))
      .limit(2),
    totalsBetween(db, userId, addDays(day, -6), day),
    foodOn(db, userId, day),
  ]);
  const kinds = LOG_KINDS.filter((k) => female || !isCycleKind(k));
  const access = Object.fromEntries(
    LOG_KINDS.map((k) => [k, KIND_TYPES[k].map((t) => byType[t]).reduce((a, b) => (RANK[b] > RANK[a] ? b : a))]),
  ) as Record<LogKind, LogAccess>;
  const of = (t: LoggedEntry["type"]) => entries.filter((e) => e.type === t);

  const foods = of("nutrition-log");
  // A meal value Pulse does not know files under Snack rather than vanishing (the import maps Google's own to Snack).
  const mealOf = (e: LoggedEntry) => {
    const m = String((e.data as LogData["nutrition-log"]).meal ?? "").toUpperCase();
    return MEALS.some(([k]) => k === m) ? m : "SNACK";
  };
  const meals = MEALS.map(([meal, label]) => {
    const mine = foods.filter((e) => mealOf(e) === meal);
    return { meal, label, kcal: mine.reduce((a, e) => a + (e.data as LogData["nutrition-log"]).kcal, 0), entries: mine };
  });

  const weighins: Weighin[] = [];
  for (const e of [...of("weight"), ...of("body-fat")].sort((a, b) => a.ts - b.ts)) {
    const slot = e.type === "weight" ? "kg" : "pct";
    let w = weighins.find((x) => x[slot] === null && Math.abs(x.ts - e.ts) <= WEIGHIN_S);
    if (!w) weighins.push((w = { ts: e.ts, kg: null, pct: null, entries: [] }));
    if (e.type === "weight") w.kg = (e.data as LogData["weight"]).kg;
    else w.pct = (e.data as LogData["body-fat"]).pct;
    w.entries.push(e);
  }

  // A weigh-in logged in Pulse today reaches daily_metrics only with the next sync: it is the latest until then.
  const loggedKg = weighins.findLast((w) => w.kg !== null)?.kg ?? null;
  const [last, prev] = weights.map((w) => ({ day: w.day, kg: w.kg! }));
  const latest = loggedKg !== null ? { kg: loggedKg, day } : (last ?? null);
  const before = loggedKg !== null ? (last && last.day < day ? last : prev) : prev;
  const change = latest && before ? { kg: Math.round((latest.kg - before.kg) * 10) / 10, since: before.day } : null;

  return {
    kinds,
    access,
    day,
    today: todayOf(ctx),
    timeZone: ctx.timeZone,
    demo: ctx.mode === "demo",
    listed: day >= addDays(todayOf(ctx), 1 - LOG_DAYS),
    water: { total: week[6].water ?? 0, entries: of("hydration-log") },
    food: { total: food, meals },
    body: { latest, change, weighins },
    moods: of("moods"),
    symptoms: female ? of("symptoms") : of("symptoms").filter((e) => !(e.data as LogData["symptoms"]).symptoms.some((s) => CYCLE_SYMPTOMS.has(s))),
    // A male profile never sees cycle entries, even ones logged before the profile changed.
    cycle: female ? entries.filter((e) => e.type === "menstrual-period" || e.type === "ovulation-test") : [],
    week,
  };
}
