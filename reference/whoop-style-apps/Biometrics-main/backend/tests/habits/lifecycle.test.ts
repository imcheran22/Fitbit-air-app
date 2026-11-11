import { nextLifecycleState, LifecycleState } from '../../src/habits/lifecycle';

const S = (status: LifecycleState['status'], p: number, m: number): LifecycleState => ({
  status,
  consecutivePasses: p,
  consecutiveMisses: m,
});

/** Applies a run history (true = pass) to a fresh hypothesis. */
function run(history: boolean[], from: LifecycleState | null = null): LifecycleState | null {
  return history.reduce<LifecycleState | null>((state, passed) => nextLifecycleState(state, passed), from);
}

describe('persistence lifecycle', () => {
  it('a hypothesis that has never passed has no row', () => {
    expect(nextLifecycleState(null, false)).toBeNull();
    expect(run([false, false, false])).toBeNull();
  });

  it('one pass yields a CANDIDATE', () => {
    expect(nextLifecycleState(null, true)).toEqual(S('CANDIDATE', 1, 0));
  });

  it('a second CONSECUTIVE pass yields CONFIRMED', () => {
    expect(run([true, true])).toEqual(S('CONFIRMED', 2, 0));
  });

  it('pass, miss, pass does not confirm (passes must be consecutive)', () => {
    expect(run([true, false, true])).toEqual(S('CANDIDATE', 1, 0));
  });

  it('a CANDIDATE that misses stays a CANDIDATE and restarts its pass count', () => {
    expect(run([true, false])).toEqual(S('CANDIDATE', 0, 1));
  });

  it('one miss leaves a CONFIRMED row CONFIRMED', () => {
    expect(run([true, true, false])).toEqual(S('CONFIRMED', 0, 1));
  });

  it('a pass after one miss resets the miss streak', () => {
    expect(run([true, true, false, true])).toEqual(S('CONFIRMED', 1, 0));
    // ...so it then takes two fresh misses to retire, not one.
    expect(run([true, true, false, true, false])).toEqual(S('CONFIRMED', 0, 1));
  });

  it('a second CONSECUTIVE miss retires a CONFIRMED row', () => {
    expect(run([true, true, false, false])).toEqual(S('RETIRED', 0, 2));
  });

  it('a RETIRED row stays RETIRED on further misses and after a single pass', () => {
    expect(run([true, true, false, false, false])).toEqual(S('RETIRED', 0, 3));
    expect(run([true, true, false, false, true])).toEqual(S('RETIRED', 1, 0));
  });

  it('two consecutive passes re-confirm a RETIRED row', () => {
    expect(run([true, true, false, false, true, true])).toEqual(S('CONFIRMED', 2, 0));
  });

  it('pass, miss, pass does not re-confirm a RETIRED row', () => {
    expect(run([true, true, false, false, true, false, true])).toEqual(S('RETIRED', 1, 0));
  });
});
