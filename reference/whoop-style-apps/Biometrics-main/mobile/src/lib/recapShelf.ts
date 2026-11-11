import type { RecapKind, RecapSummary } from '../api/recaps';
import { MONTH_SHORT } from './heatmap';
import { monthName, shortDate, weekRange } from './recapCopy';
import { isRecapWatched } from './unwatchedRecap';

// The story shelf at the top of Sleep (weekly story placement, design D): every recap as a
// circle, newest first. Pure, so the order and the words are tested without the screen.

export interface ShelfItem {
  id: string;
  kind: RecapKind;
  personaId: string | null;
  /** Inside the circle: "WK 40" or "SEP". */
  badge: string;
  /** Under it: "This week", "Sep 21" or "September". */
  label: string;
  /** Not opened yet: the coach-colour ring. */
  unwatched: boolean;
  accessibilityLabel: string;
}

const DAY_MS = 86_400_000;
/** The newest week stays "This week" until the next one is due (a week after it ended). */
const THIS_WEEK_DAYS = 7;

function utc(date: string): number {
  return Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)));
}

/** ISO 8601 week number of a civil date: Monday weeks, week 1 holds the year's first Thursday. */
export function isoWeek(date: string): number {
  const t = new Date(utc(date));
  const day = t.getUTCDay() || 7;
  // The Thursday of this week decides the year.
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  return Math.ceil(((t.getTime() - yearStart) / DAY_MS + 1) / 7);
}

/** The shelf, newest first (by the period's end, then when built). `today` is a civil date. */
export function shelfItems(recaps: readonly RecapSummary[], today: string, watched: ReadonlySet<string>): ShelfItem[] {
  const sorted = [...recaps].sort((a, b) => b.periodEnd.localeCompare(a.periodEnd) || b.builtAt.localeCompare(a.builtAt));
  const newestWeek = sorted.find((r) => r.kind === 'WEEK');
  return sorted.map((r) => {
    const unwatched = !isRecapWatched(r, watched);
    const isWeek = r.kind === 'WEEK';
    const thisWeek = isWeek && r === newestWeek && (utc(today) - utc(r.periodEnd)) / DAY_MS <= THIS_WEEK_DAYS;
    const name = isWeek ? `Week of ${shortDate(r.periodStart)}` : `${monthName(r.periodStart)} recap`;
    return {
      id: r.id,
      kind: r.kind,
      personaId: r.personaId,
      badge: isWeek ? `WK ${isoWeek(r.periodStart)}` : MONTH_SHORT[Number(r.periodStart.slice(5, 7)) - 1]!.toUpperCase(),
      label: isWeek ? (thisWeek ? 'This week' : shortDate(r.periodStart)) : monthName(r.periodStart),
      unwatched,
      accessibilityLabel: unwatched ? `${name}, new` : name,
    };
  });
}

/** The story viewer's "Ask <Coach> about your week…": the question put in the chat, to edit or send. */
export function askAboutWeekPrompt(recap: { periodStart: string; periodEnd: string }): string {
  return `What stood out in my week of ${weekRange(recap.periodStart, recap.periodEnd)}?`;
}
