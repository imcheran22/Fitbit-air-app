// Highlights of one night, read off its stage timeline: how long it took to
// fall asleep, the longest deep and REM stretches, and each wake in the night.

import { midNightWakeIndexes, type StageSegment } from './sleepCycles';

export interface Stretch {
  minutes: number;
  start: string;
}

export interface SleepMoments {
  fellAsleepMinutes: number | null;
  deepest: Stretch | null;
  longestRem: Stretch | null;
  wakeUps: Stretch[];
}

function stretch(s: StageSegment): Stretch {
  return { minutes: Math.round((Date.parse(s.end) - Date.parse(s.start)) / 60000), start: s.start };
}

/** The longest single segment of `type`; the earliest wins a tie. */
function longest(segments: StageSegment[], type: StageSegment['type']): Stretch | null {
  let best: Stretch | null = null;
  for (const s of segments) {
    if (s.type !== type) continue;
    const candidate = stretch(s);
    if (!best || candidate.minutes > best.minutes) best = candidate;
  }
  return best;
}

/**
 * `minutesToFallAsleep` is the night's own figure from the server; when it is
 * null, the time from the first segment to the first sleep stands in.
 */
export function findSleepMoments(segments: StageSegment[], minutesToFallAsleep: number | null): SleepMoments {
  const onset = segments.find((s) => s.type !== 'AWAKE');
  const fromStages = onset && segments.length > 0 ? Math.round((Date.parse(onset.start) - Date.parse(segments[0]!.start)) / 60000) : null;
  const midNight = midNightWakeIndexes(segments);
  return {
    fellAsleepMinutes: minutesToFallAsleep ?? fromStages,
    deepest: longest(segments, 'DEEP'),
    longestRem: longest(segments, 'REM'),
    wakeUps: segments.filter((_, i) => midNight.has(i)).map(stretch),
  };
}
