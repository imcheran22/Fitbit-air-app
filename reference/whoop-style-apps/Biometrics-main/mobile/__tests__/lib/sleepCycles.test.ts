import { MOCKUP_SEGMENTS, seg } from '../../jest-mocks/sleepNightFixture';
import { findSleepCycles, midNightWakeIndexes } from '../../src/lib/sleepCycles';

describe('findSleepCycles', () => {
  it('splits the mockup night into five cycles ending on REM, with the final wake as the tail', () => {
    const { cycles, tail, averageMinutes } = findSleepCycles(MOCKUP_SEGMENTS);

    expect(cycles.map((c) => c.minutes)).toEqual([92, 95, 100, 95, 65]);
    expect(cycles.map((c) => c.n)).toEqual([1, 2, 3, 4, 5]);
    expect(averageMinutes).toBe(89);
    expect(tail).toEqual({ awakeMinutes: 7, sleepMinutes: 0 });
    // The first cycle starts at sleep onset (after 8 min awake) and ends with the first REM.
    expect(cycles[0]!.start).toBe(seg('LIGHT', 8, 8).start);
    expect(cycles[0]!.end).toBe(seg('REM', 100, 100).start);
    expect(cycles[0]!.stageMinutes).toEqual({ AWAKE: 0, LIGHT: 29, DEEP: 45, REM: 18 });
    // A brief wake inside the third cycle does not split it.
    expect(cycles[2]!.stageMinutes).toEqual({ AWAKE: 3, LIGHT: 57, DEEP: 15, REM: 25 });
  });

  it('merges REM segments less than 15 min apart into one period', () => {
    const { cycles } = findSleepCycles([
      seg('LIGHT', 0, 60),
      seg('REM', 60, 70),
      seg('LIGHT', 70, 84),
      seg('REM', 84, 90),
      seg('LIGHT', 90, 150),
    ]);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.minutes).toBe(90);
    expect(cycles[0]!.stageMinutes.REM).toBe(16);
  });

  it('keeps REM segments 15 min or more apart as separate periods', () => {
    const { cycles, tail } = findSleepCycles([
      seg('LIGHT', 0, 60),
      seg('REM', 60, 70),
      seg('LIGHT', 70, 85),
      seg('REM', 85, 90),
      seg('LIGHT', 90, 150),
    ]);

    expect(cycles.map((c) => c.minutes)).toEqual([70, 20]);
    expect(tail).toEqual({ awakeMinutes: 0, sleepMinutes: 60 });
  });

  it('finds no cycles without REM: the whole night after onset is the tail', () => {
    const { cycles, tail, averageMinutes } = findSleepCycles([
      seg('AWAKE', 0, 10),
      seg('LIGHT', 10, 100),
      seg('DEEP', 100, 160),
      seg('AWAKE', 160, 165),
    ]);

    expect(cycles).toEqual([]);
    expect(averageMinutes).toBeNull();
    expect(tail).toEqual({ awakeMinutes: 5, sleepMinutes: 150 });
  });

  it('finds no cycles in a night that is all awake', () => {
    const result = findSleepCycles([seg('AWAKE', 0, 30)]);
    expect(result).toEqual({ cycles: [], tail: { awakeMinutes: 0, sleepMinutes: 0 }, averageMinutes: null });
  });

  it('ignores leading awake time: the first cycle starts at sleep onset', () => {
    const { cycles } = findSleepCycles([seg('AWAKE', 0, 40), seg('LIGHT', 40, 100), seg('REM', 100, 120)]);

    expect(cycles[0]!.start).toBe(seg('LIGHT', 40, 40).start);
    expect(cycles[0]!.minutes).toBe(80);
    expect(cycles[0]!.stageMinutes.AWAKE).toBe(0);
  });

  it('counts awake time inside a cycle without splitting it', () => {
    const { cycles } = findSleepCycles([
      seg('LIGHT', 0, 30),
      seg('AWAKE', 30, 50),
      seg('DEEP', 50, 80),
      seg('REM', 80, 100),
    ]);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.stageMinutes).toEqual({ AWAKE: 20, LIGHT: 30, DEEP: 30, REM: 20 });
  });

  it('works across gaps in the data: a cycle spans the gap, its stages count only what was recorded', () => {
    const { cycles } = findSleepCycles([seg('LIGHT', 0, 30), seg('DEEP', 40, 70), seg('REM', 80, 90), seg('LIGHT', 90, 120)]);

    expect(cycles).toHaveLength(1);
    expect(cycles[0]!.minutes).toBe(90);
    expect(cycles[0]!.stageMinutes).toEqual({ AWAKE: 0, LIGHT: 30, DEEP: 30, REM: 10 });
  });
});

describe('midNightWakeIndexes', () => {
  it('picks awake segments strictly between the first and last sleep, of any length', () => {
    const indexes = midNightWakeIndexes([
      seg('AWAKE', 0, 10),
      seg('LIGHT', 10, 60),
      seg('AWAKE', 60, 90),
      seg('REM', 90, 120),
      seg('AWAKE', 120, 130),
    ]);
    expect([...indexes]).toEqual([2]);
  });

  it('ignores a wake that rounds to 0 min', () => {
    const indexes = midNightWakeIndexes([seg('LIGHT', 0, 60), seg('AWAKE', 60, 60.4), seg('LIGHT', 60.4, 90), seg('AWAKE', 90, 91), seg('REM', 91, 120)]);
    expect([...indexes]).toEqual([3]);
  });
});
