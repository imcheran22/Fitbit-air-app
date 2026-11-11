import { ALL_FAMILIES, FAMILIES, familyDef, levelsReached, nextThreshold } from '../../src/achievements/catalogue';
import { earnedLevels, summariseRuns, type MarkedDay } from '../../src/achievements/runs';
import { shiftDate } from '../../src/scoring/dates';

const MARK = { h: 'hit', m: 'miss', n: 'none', s: 'skip' } as const;
/** One mark per letter from `from`: h hit, m miss, n no data, s neither counts nor breaks. */
const days = (from: string, marks: string): MarkedDay[] =>
  marks.split('').map((c, i) => ({ date: shiftDate(from, i), mark: MARK[c as keyof typeof MARK] }));
const lengths = (s: { runs: { hits: string[] }[] }) => s.runs.map((r) => r.hits.length);

describe('catalogue', () => {
  it('has the seven families, their kinds and thresholds, in catalogue order', () => {
    expect(FAMILIES.map((f) => [f.family, f.kind, [...f.thresholds]])).toEqual([
      ['SLEEP_GOAL', 'streak', [3, 7, 14, 30, 100]],
      ['STEADY_BEDTIME', 'streak', [3, 7, 14, 30, 100]],
      ['STEP_GOAL', 'streak', [3, 7, 14, 30, 100]],
      ['CHECK_IN', 'streak', [7, 14, 30, 60, 180]],
      ['BEST_RECOVERY_WEEK', 'monthly', [1, 3, 6, 12, 24]],
      ['EVERY_DAY_LOGGED', 'monthly', [1, 3, 6, 12, 24]],
      ['STEADIEST_MONTH', 'monthly', [1, 2, 4, 6, 12]],
    ]);
    expect(ALL_FAMILIES).toHaveLength(7);
    expect(familyDef('BEST_RECOVERY_WEEK').milestone).toBe('bestRecoveryWeek');
    expect(familyDef('SLEEP_GOAL').goalKind).toBe('SLEEP_MINUTES');
    expect(familyDef('STEADY_BEDTIME').goalKind).toBe('BEDTIME');
  });

  it('lists the levels a best value reached, and the next threshold', () => {
    expect(levelsReached(familyDef('CHECK_IN'), 29)).toEqual([1, 2]);
    expect(levelsReached(familyDef('CHECK_IN'), 6)).toEqual([]);
    expect(levelsReached(familyDef('STEADIEST_MONTH'), 12)).toEqual([1, 2, 3, 4, 5]);
    expect(nextThreshold(familyDef('SLEEP_GOAL'), 0)).toBe(3);
    expect(nextThreshold(familyDef('SLEEP_GOAL'), 2)).toBe(14);
    expect(nextThreshold(familyDef('SLEEP_GOAL'), 5)).toBeNull();
  });
});

describe('summariseRuns', () => {
  it('splits runs at a miss and reports the best and the unbroken latest run', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhmhhhh'), { today: '2026-10-08', pausable: true });
    expect(lengths(s)).toEqual([3, 4]);
    expect(s).toMatchObject({ best: 4, current: 4 });
  });

  it('pauses a synced run over missing recent days (late sync never costs a streak)', () => {
    // Oct 6 and 7 have no data yet; Oct 5 is exactly 2 days before today, so still paused.
    const s = summariseRuns(days('2026-10-01', 'hhhhnnn'), { today: '2026-10-07', pausable: true });
    expect(s).toMatchObject({ best: 4, current: 4 });
    expect(s.runs[0]!.broken).toBe(false);
  });

  it('breaks it once a missing day is more than 2 days before today', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhhnnnn'), { today: '2026-10-08', pausable: true });
    expect(s).toMatchObject({ best: 4, current: 0 });
  });

  it('breaks it at a missing day when a later day has data', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhnh'), { today: '2026-10-05', pausable: true });
    expect(lengths(s)).toEqual([3, 1]);
    expect(s).toMatchObject({ best: 3, current: 1 });
  });

  it('never pauses a family that is not synced: a missing day breaks at once', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhn'), { today: '2026-10-04', pausable: false });
    expect(s).toMatchObject({ best: 3, current: 0 });
  });

  it('lets a skipped day neither count nor break', () => {
    const s = summariseRuns(days('2026-10-01', 'hhshh'), { today: '2026-10-05', pausable: true });
    expect(lengths(s)).toEqual([4]);
  });

  it('is empty for no days', () => {
    expect(summariseRuns([], { today: '2026-10-05', pausable: true })).toEqual({ runs: [], best: 0, current: 0 });
  });
});

describe('earnedLevels', () => {
  const thresholds = [3, 7, 14, 30, 100];

  it('dates each level by the hit that first reached it', () => {
    const s = summariseRuns(days('2026-10-01', 'hhhhhhhmhhh'), { today: '2026-10-11', pausable: true });
    expect(earnedLevels(s.runs, thresholds)).toEqual([
      { level: 1, value: 3, earnedOn: '2026-10-03' },
      { level: 2, value: 7, earnedOn: '2026-10-07' },
    ]);
  });

  it('uses the first run long enough, not the first run', () => {
    // A run of 2 (Oct 1-2), a miss, then a run of 8 from Oct 4.
    const s = summariseRuns(days('2026-10-01', 'hhmhhhhhhhh'), { today: '2026-10-11', pausable: true });
    expect(earnedLevels(s.runs, thresholds)).toEqual([
      { level: 1, value: 3, earnedOn: '2026-10-06' },
      { level: 2, value: 7, earnedOn: '2026-10-10' },
    ]);
  });
});
