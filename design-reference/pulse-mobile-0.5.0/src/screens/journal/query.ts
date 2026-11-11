import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseDay } from "@/lib/url";
import { type QueryCtx, todayOf } from "@/queries/common";
import { getJournal } from "@/queries/journal";
import { getDayLog } from "@/queries/journalExtras";

/** Set once the Journal has offered yesterday's check-in (app/(tabs)/journal.tsx `useOfferYesterday`). */
export const YESTERDAY_OFFERED_KEY = "pulse.journal.yesterdayOffered";

/** The Journal tab's query and key, by the route's `d` (none or empty: today); Home prefetches them. */
export const journalQuery = (raw?: string) => async (ctx: QueryCtx) => {
  const day = parseDay(raw, todayOf(ctx)).d;
  const [vm, log, offered] = await Promise.all([getJournal(day, ctx), getDayLog(day, ctx), AsyncStorage.getItem(YESTERDAY_OFFERED_KEY).catch(() => null)]);
  return { vm, log, offered: !!offered };
};
export const journalKey = (raw?: string) => ["journal", raw || null] as const;
