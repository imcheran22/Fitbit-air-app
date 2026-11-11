import type { RecapStats } from '../../src/api/recaps';
import { coachFrameStats, coachFrameText, headlineStats, STORY_FRAME_COUNT, storyEyebrow, stripDays } from '../../src/lib/recapStory';

const strip = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((date, i) => ({
  date, minutesAsleep: i === 2 ? null : 480, onGoal: i === 2 ? null : i !== 4, recovery: null,
}));

it('has three frames, each saying which it is', () => {
  expect(STORY_FRAME_COUNT).toBe(3);
  expect([0, 1, 2].map(storyEyebrow)).toEqual(['MY WEEK · 1 OF 3', 'MY WEEK · 2 OF 3', 'MY WEEK · 3 OF 3']);
});

describe('frame 1: the headline numbers', () => {
  it('shows average sleep, nights on goal of nights with data, and the signed change on last week', () => {
    const stats: RecapStats = { nightsWithData: 6, avgSleepMinutes: 455, nightsOnGoal: 4, comparison: { avgSleepDelta: -12 } };
    expect(headlineStats(stats)).toEqual([
      { key: 'avgSleep', label: 'Average sleep', value: '7h 35m' },
      { key: 'onGoal', label: 'Nights on goal', value: '4 of 6' },
      { key: 'change', label: 'Vs last week', value: '−12m', tone: 'worse' },
    ]);
  });

  it('leaves out what the week has no number for', () => {
    expect(headlineStats({ nightsWithData: 0 })).toEqual([]);
    expect(headlineStats({ nightsWithData: 3, nightsOnGoal: 0, comparison: { avgRecoveryDelta: 2 } })).toEqual([{ key: 'onGoal', label: 'Nights on goal', value: '0 of 3' }]);
  });
});

describe('frame 2: the week strip', () => {
  it('gives each day its letter and state; a night not on goal or without data is dimmed', () => {
    const days = stripDays(strip);
    expect(days.map((d) => d.letter).join('')).toBe('MTWTFSS');
    expect(days.map((d) => d.state)).toEqual(['goal', 'goal', 'none', 'goal', 'short', 'goal', 'goal']);
    expect(days.map((d) => d.dimmed)).toEqual([false, false, true, false, true, false, false]);
  });
});

describe("frame 3: the coach's story", () => {
  it("shows the coach's weekly story, or the line when there is none (never empty)", () => {
    expect(coachFrameText({ story: 'You hit your goal on 5 nights.', line: 'A steady week.' })).toBe('You hit your goal on 5 nights.');
    expect(coachFrameText({ story: null, line: 'A steady week.' })).toBe('A steady week.');
    expect(coachFrameText({ story: '  ', line: 'A steady week.' })).toBe('A steady week.');
  });

  it('adds the longest streak and the bedtime spread when the week has them', () => {
    expect(coachFrameStats({ nightsWithData: 6, longestOnGoalStreak: 3, bedtimeSpreadMinutes: 42 })).toEqual([
      { key: 'streak', label: 'Longest streak', value: '3 nights' },
      { key: 'spread', label: 'Bedtime spread', value: '42m' },
    ]);
    expect(coachFrameStats({ nightsWithData: 6, longestOnGoalStreak: 0 })).toEqual([]);
  });
});
