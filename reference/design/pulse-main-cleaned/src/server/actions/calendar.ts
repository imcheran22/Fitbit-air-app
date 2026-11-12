"use server";
// Read-only Server Function for the calendar panel's month fetches.
import { currentUser } from "../auth";
import { getCalendarMonth } from "../queries/calendar";
import { userCtx } from "../queries/common";
import type { CalendarMonthVM } from "../queries/types";

export async function loadCalendarMonth(month: string): Promise<CalendarMonthVM> {
  const user = await currentUser();
  if (!user) throw new Error("signed_out");
  return getCalendarMonth(month, await userCtx(user.userId));
}
