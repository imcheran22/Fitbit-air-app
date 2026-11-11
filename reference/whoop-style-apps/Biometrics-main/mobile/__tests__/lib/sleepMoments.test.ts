import { MOCKUP_SEGMENTS, seg } from '../../jest-mocks/sleepNightFixture';
import { findSleepMoments } from '../../src/lib/sleepMoments';

describe('findSleepMoments', () => {
  it('reads the mockup night\'s highlights off its stages', () => {
    expect(findSleepMoments(MOCKUP_SEGMENTS, null)).toEqual({
      fellAsleepMinutes: 8,
      deepest: { minutes: 45, start: seg('DEEP', 25, 25).start },
      longestRem: { minutes: 30, start: seg('REM', 360, 360).start },
      wakeUps: [{ minutes: 3, start: seg('AWAKE', 265, 265).start }],
    });
  });

  it('prefers the night\'s own time to fall asleep when it has one', () => {
    expect(findSleepMoments(MOCKUP_SEGMENTS, 12).fellAsleepMinutes).toBe(12);
    expect(findSleepMoments(MOCKUP_SEGMENTS, 0).fellAsleepMinutes).toBe(0);
  });

  it('lists every mid-night wake, of any length, but not the first or final one', () => {
    const { wakeUps } = findSleepMoments(
      [seg('AWAKE', 0, 10), seg('LIGHT', 10, 60), seg('AWAKE', 60, 90), seg('REM', 90, 100), seg('AWAKE', 100, 104), seg('LIGHT', 104, 150), seg('AWAKE', 150, 160)],
      null,
    );
    expect(wakeUps.map((w) => w.minutes)).toEqual([30, 4]);
  });

  it('does not count a wake that rounds to 0 min', () => {
    const { wakeUps } = findSleepMoments([seg('LIGHT', 0, 60), seg('AWAKE', 60, 60.4), seg('LIGHT', 60.4, 90), seg('AWAKE', 90, 93), seg('REM', 93, 120)], null);
    expect(wakeUps).toEqual([{ minutes: 3, start: seg('AWAKE', 90, 90).start }]);
  });

  it('omits what a night without REM or wake-ups does not have', () => {
    expect(findSleepMoments([seg('LIGHT', 0, 60), seg('DEEP', 60, 100), seg('LIGHT', 100, 150)], null)).toEqual({
      fellAsleepMinutes: 0,
      deepest: { minutes: 40, start: seg('DEEP', 60, 60).start },
      longestRem: null,
      wakeUps: [],
    });
  });

  it('has no highlights for a night that is all awake', () => {
    expect(findSleepMoments([seg('AWAKE', 0, 30)], null)).toEqual({ fellAsleepMinutes: null, deepest: null, longestRem: null, wakeUps: [] });
  });
});
