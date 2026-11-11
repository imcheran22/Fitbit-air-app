import { getAnswerBudgetMs } from '../../src/coach/config';
import { resetWarmState, warmModel, WARM_INTERVAL_MS } from '../../src/coach/answer/warm';
import { ScriptedStreamProvider } from '../../src/coach/model/provider';

describe('getAnswerBudgetMs', () => {
  const saved = { ...process.env };
  afterEach(() => {
    process.env = { ...saved };
  });

  it('defaults to 45 s local and 30 s hosted', () => {
    delete process.env.COACH_LOCAL_BUDGET_MS;
    delete process.env.COACH_HOSTED_BUDGET_MS;
    expect(getAnswerBudgetMs('local')).toBe(45_000);
    expect(getAnswerBudgetMs('hosted')).toBe(30_000);
  });

  it('reads COACH_LOCAL_BUDGET_MS / COACH_HOSTED_BUDGET_MS, ignoring junk', () => {
    process.env.COACH_LOCAL_BUDGET_MS = '60000';
    process.env.COACH_HOSTED_BUDGET_MS = 'soon';
    expect(getAnswerBudgetMs('local')).toBe(60_000);
    expect(getAnswerBudgetMs('hosted')).toBe(30_000);
    process.env.COACH_LOCAL_BUDGET_MS = '-5';
    expect(getAnswerBudgetMs('local')).toBe(45_000);
  });

  // Final review I6: 0.5 or a value past setTimeout's 2^31-1 made every answer time out at once.
  it('clamps a budget to 5 s - 10 min, as whole milliseconds, and logs the clamp once', () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      process.env.COACH_LOCAL_BUDGET_MS = '0.5';
      expect(getAnswerBudgetMs('local')).toBe(5_000);
      expect(getAnswerBudgetMs('local')).toBe(5_000);
      process.env.COACH_HOSTED_BUDGET_MS = '3000000000';
      expect(getAnswerBudgetMs('hosted')).toBe(600_000);
      process.env.COACH_LOCAL_BUDGET_MS = '61234.9';
      expect(getAnswerBudgetMs('local')).toBe(61_234);
      const clamped = log.mock.calls.map(([line]) => JSON.parse(String(line))).filter((e) => e.event === 'coach.config_clamped');
      expect(clamped).toEqual([
        { event: 'coach.config_clamped', name: 'COACH_LOCAL_BUDGET_MS', value: 5_000 },
        { event: 'coach.config_clamped', name: 'COACH_HOSTED_BUDGET_MS', value: 600_000 },
      ]);
    } finally {
      log.mockRestore();
    }
  });
});

describe('warmModel', () => {
  beforeEach(() => resetWarmState());

  const warmable = (warm: () => Promise<void>) => Object.assign(new ScriptedStreamProvider([]), { warm: jest.fn(warm) });

  it('calls the provider warm-up without waiting for it, at most once per interval', () => {
    const p = warmable(() => new Promise<void>(() => {}));
    expect(warmModel(p, 1_000)).toBe(true);
    expect(warmModel(p, 1_000 + WARM_INTERVAL_MS - 1)).toBe(false);
    expect(warmModel(p, 1_000 + WARM_INTERVAL_MS)).toBe(true);
    expect(p.warm).toHaveBeenCalledTimes(2);
  });

  it('does nothing for a provider without warm-up', () => {
    expect(warmModel(new ScriptedStreamProvider([]), 0)).toBe(false);
  });

  it('swallows a warm-up failure', async () => {
    const p = warmable(() => Promise.reject(new Error('down')));
    expect(warmModel(p, 0)).toBe(true);
    await new Promise((r) => setImmediate(r)); // an unhandled rejection would fail the suite
  });
});
