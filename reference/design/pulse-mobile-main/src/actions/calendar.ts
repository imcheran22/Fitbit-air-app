// The calendar panel's month fetch: the shells' ShellCalendar `loadMonth` takes a month and returns its days.
import { getCalendarMonth } from "@/queries/calendar";
import type { QueryCtx } from "@/queries/ctx";
import type { CalendarDayVM } from "@/queries/types";

export async function loadCalendarMonth(ctx: QueryCtx, month: string): Promise<CalendarDayVM[]> {
  return (await getCalendarMonth(month, ctx)).days;
}
