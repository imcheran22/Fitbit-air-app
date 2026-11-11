import type { HabitStatusDTO, HabitTypeDTO } from '../api/habits';

// The server owns "what habit day is it" (04:00-local boundary, stored at write
// time); everything here only reads YYYY-MM-DD strings it was handed. Dates are
// parsed as UTC so the weekday never shifts with the device's zone.

const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// The server allows check-ins for the previous 7 days.
export const RETROACTIVE_DAYS = 7;

export function weekdayInitial(habitDay: string): string {
  return WEEKDAY_INITIALS[new Date(`${habitDay}T00:00:00Z`).getUTCDay()];
}

export function dayOfMonth(habitDay: string): string {
  return String(Number(habitDay.slice(8, 10)));
}

export interface StripDay {
  habitDay: string;
  done: boolean;
}

// The previous `count` habit days, oldest first. A day is done when it has a
// check-in, or when every habit type is already observed (logged) for it --
// otherwise it can still be checked in retroactively.
export function buildCheckInStrip(status: HabitStatusDTO, habitTypes: HabitTypeDTO[], count = RETROACTIVE_DAYS): StripDay[] {
  if (!status.today) return [];
  return status.days
    .filter((day) => day.habitDay < status.today)
    .sort((a, b) => (a.habitDay < b.habitDay ? -1 : 1))
    .slice(-count)
    .map((day) => ({
      habitDay: day.habitDay,
      done: day.checkedIn || (habitTypes.length > 0 && habitTypes.every((t) => day.observed[t.type] === true)),
    }));
}

function withDay(status: HabitStatusDTO, habitDay: string, update: (day: HabitStatusDTO['days'][number]) => HabitStatusDTO['days'][number]): HabitStatusDTO {
  const existing = status.days.find((d) => d.habitDay === habitDay);
  if (!existing) {
    return { ...status, days: [...status.days, update({ habitDay, checkedIn: false, observed: {} })] };
  }
  return { ...status, days: status.days.map((d) => (d.habitDay === habitDay ? update(d) : d)) };
}

// Local updates so the card reflects a write immediately, without a refetch.
export function withCheckIn(status: HabitStatusDTO, habitDay: string): HabitStatusDTO {
  return withDay(status, habitDay, (day) => ({ ...day, checkedIn: true }));
}

export function withObserved(status: HabitStatusDTO, habitDay: string, habitType: string): HabitStatusDTO {
  return withDay(status, habitDay, (day) => ({ ...day, observed: { ...day.observed, [habitType]: true } }));
}

// null when nothing has been entered; NaN when what was entered is not a
// non-negative number. 0 is a real value: it logs "none".
export function parseHabitValue(text: string): number | null {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) && value >= 0 ? value : Number.NaN;
}

export function stepValue(text: string, direction: 1 | -1, size: number): string {
  const parsed = parseHabitValue(text);
  const current = parsed === null || Number.isNaN(parsed) ? 0 : parsed;
  const next = Math.max(0, Math.round((current + direction * size) * 100) / 100);
  return String(next);
}
