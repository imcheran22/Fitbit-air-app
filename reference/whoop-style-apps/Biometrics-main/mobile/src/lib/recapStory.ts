import type { Recap, RecapStats, WeekStripEntry } from '../api/recaps';
import { signedChange, type ChangeTone } from './recapCopy';
import { formatShortDuration, formatTextDuration } from './sleepStats';

// The weekly story's three frames (recap restyle 2026-10-05), each its own 9:16 image:
//   1. the headline numbers, 2. how the coach saw the week (strip, best night, the line),
//   3. the coach's weekly story with the streak and the bedtime spread.
// What each frame says, pure, so the frame views, the story viewer and the tests share it.
// Every number comes from the stored recap stats.

export const STORY_FRAME_COUNT = 3;
export type StoryFrameIndex = 0 | 1 | 2;

export function storyEyebrow(index: number): string {
  return `MY WEEK · ${index + 1} OF ${STORY_FRAME_COUNT}`;
}

export interface HeadlineStat {
  key: 'avgSleep' | 'onGoal' | 'change';
  label: string;
  value: string;
  /** The change on last week only: coloured by whether it is better. */
  tone?: ChangeTone;
}

/** Frame 1: average sleep, nights on goal (of nights with data), the change on last week. */
export function headlineStats(stats: RecapStats): HeadlineStat[] {
  const out: HeadlineStat[] = [];
  if (stats.avgSleepMinutes !== undefined) out.push({ key: 'avgSleep', label: 'Average sleep', value: formatTextDuration(stats.avgSleepMinutes) });
  if (stats.nightsOnGoal !== undefined && stats.nightsWithData > 0) out.push({ key: 'onGoal', label: 'Nights on goal', value: `${stats.nightsOnGoal} of ${stats.nightsWithData}` });
  const delta = stats.comparison?.avgSleepDelta;
  if (delta !== undefined) {
    const change = signedChange('avgSleep', delta);
    out.push({ key: 'change', label: 'Vs last week', value: change.text, tone: change.tone });
  }
  return out;
}

const DAY_LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export interface StripDay {
  date: string;
  letter: string;
  state: 'goal' | 'short' | 'none';
  /** The coach is drawn dimmed on a night not on goal or without data. */
  dimmed: boolean;
}

/** Frame 2: Mon–Sun, one coach per night. */
export function stripDays(strip: WeekStripEntry[]): StripDay[] {
  return strip.map((d, i) => {
    const state = d.onGoal === null ? 'none' : d.onGoal ? 'goal' : 'short';
    return { date: d.date, letter: DAY_LETTERS[i % 7]!, state, dimmed: state !== 'goal' };
  });
}

/** Frame 3: the coach's weekly story; the line when there is none (coach off, or not written). */
export function coachFrameText(recap: Pick<Recap, 'story' | 'line'>): string {
  return recap.story?.trim() ? recap.story.trim() : recap.line;
}

export interface CoachFrameStat {
  key: 'streak' | 'spread';
  label: string;
  value: string;
}

export function coachFrameStats(stats: RecapStats): CoachFrameStat[] {
  const out: CoachFrameStat[] = [];
  const streak = stats.longestOnGoalStreak ?? 0;
  if (streak > 0) out.push({ key: 'streak', label: 'Longest streak', value: `${streak} ${streak === 1 ? 'night' : 'nights'}` });
  if (stats.bedtimeSpreadMinutes !== undefined) out.push({ key: 'spread', label: 'Bedtime spread', value: formatShortDuration(stats.bedtimeSpreadMinutes) });
  return out;
}
