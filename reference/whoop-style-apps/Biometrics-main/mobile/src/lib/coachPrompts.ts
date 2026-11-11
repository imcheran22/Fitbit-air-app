import type { RecoveryState } from '../api/recovery';
import { formatDayLong, formatDayShort } from './recoveryCopy';

// Questions pre-filled into the chat from an entry point. They deliberately
// carry no numbers: the coach must fetch today's real values itself (spec 2),
// and a score copied from the screen into the prompt would be a second,
// possibly stale, source of truth.
export function recoveryQuestion(p: { state: RecoveryState; isToday: boolean; date: string }): string {
  if (p.state === 'BUILDING') return 'When will my recovery score be ready?';
  if (p.state === 'NO_DATA') return p.isToday ? "Why don't I have a recovery score today?" : `Why don't I have a recovery score for ${formatDayShort(p.date)}?`;
  return p.isToday ? 'Why is my recovery where it is today?' : `Why was my recovery what it was on ${formatDayShort(p.date)}?`;
}

/** Ask about the selected night (spec §3.13). The night is named by its date only, never by a value on the page. */
export function sleepQuestion(date: string, isLastNight: boolean, hasNight: boolean): string {
  const which = isLastNight ? 'last night' : formatDayLong(date);
  if (!hasNight) return `Why don't I have sleep data for ${which}?`;
  return isLastNight ? 'How was my sleep last night?' : `How was my sleep on ${which}?`;
}
