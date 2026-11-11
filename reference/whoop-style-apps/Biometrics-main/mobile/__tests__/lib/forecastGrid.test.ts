import { READY } from '../../jest-mocks/forecastFixture';
import { contributionLabel, exposedFor, findCell, snapSleep } from '../../src/lib/forecastGrid';

describe('forecastGrid', () => {
  it('snapSleep rounds to 0.5 h inside 4-10 (Review Focus 5)', () => {
    expect(snapSleep(7.3)).toBe(7.5);
    expect(snapSleep(3.7)).toBe(4);
    expect(snapSleep(11)).toBe(10);
  });

  it('exposes only CONFIRMED habits at or above threshold', () => {
    expect(exposedFor(READY.levers, { ALCOHOL: 2, CAFFEINE: 6, WORKOUT: 60 })).toEqual(['ALCOHOL']);
    expect(exposedFor(READY.levers, { ALCOHOL: 1 })).toEqual([]);
  });

  it('finds the matching cell regardless of habit order or off-grid sleep', () => {
    expect(findCell(READY, { sleepHours: 7.5, habits: { ALCOHOL: 3 } }).score).toBe(50 + 22.5 - 9);
    expect(findCell(READY, { sleepHours: 11, habits: {} }).sleepHours).toBe(10);
    expect(findCell(READY, { sleepHours: 3.7, habits: { CAFFEINE: 5 } }).exposed).toEqual([]);
  });

  it('labels contributions in plain language', () => {
    const v = { sleepHours: 6.5, habits: { ALCOHOL: 3 } };
    expect(contributionLabel('CARRY_OVER', READY, v)).toBe('Recent trend');
    expect(contributionLabel('SLEEP', READY, v)).toBe('Sleep 6.5 h');
    expect(contributionLabel('ALCOHOL', READY, v)).toBe('3 drinks');
    expect(contributionLabel('MYSTERY', READY, v)).toBe('MYSTERY');
  });

  it('singularizes the habit unit for exactly one', () => {
    expect(contributionLabel('ALCOHOL', READY, { sleepHours: 7, habits: { ALCOHOL: 1 } })).toBe('1 drink');
    expect(contributionLabel('WORKOUT', READY, { sleepHours: 7, habits: { WORKOUT: 1 } })).toBe('1 minute');
    expect(contributionLabel('ALCOHOL', READY, { sleepHours: 7, habits: { ALCOHOL: 2 } })).toBe('2 drinks');
  });
});
