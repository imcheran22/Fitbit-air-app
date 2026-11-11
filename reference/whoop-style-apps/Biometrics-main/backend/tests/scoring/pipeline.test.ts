import { scoreDay, PipelineInput } from '../../src/scoring/pipeline';
import { v1Config } from '../../src/scoring/configs/v1';
import { shiftDate } from '../../src/scoring/dates';
import type { DailyPoint, SleepSessionInput } from '../../src/scoring/types';
import { sleepSession } from './helpers';

const cfg = v1Config;
const START = '2026-06-01';

// Deterministic pseudo-noise: no Math.random, so failures reproduce.
function wave(days: number, base: number, amp: number, phase = 0): DailyPoint[] {
  return Array.from({ length: days }, (_, i) => ({
    date: shiftDate(START, i),
    value: base + amp * Math.sin((i + phase) * 1.7),
  }));
}

function input(over: Partial<PipelineInput> = {}, days = 40): PipelineInput {
  return {
    date: shiftDate(START, days - 1),
    hrv: wave(days, 50, 4),
    rhr: wave(days, 55, 2, 1),
    sleep: wave(days, 450, 30, 2),
    steps: wave(days, 8000, 1500, 3),
    sleepGoalMinutes: 480,
    ...over,
  };
}

function replaceToday(points: DailyPoint[], date: string, value: number | null): DailyPoint[] {
  const rest = points.filter((p) => p.date !== date);
  return value === null ? rest : [...rest, { date, value }];
}

describe('scoreDay', () => {
  it('produces a HIGH-confidence score from a full history with every factor present', () => {
    const r = scoreDay(input(), cfg);
    expect(r.hasObservedInput).toBe(true);
    expect(r.score).not.toBeNull();
    expect(r.confidenceLevel).toBe('HIGH');
    expect(r.factors.every((f) => !f.excluded && !f.imputed)).toBe(true);
    expect(r.algorithmVersion).toBe('v1');
  });

  it('scores a day with depressed HRV and elevated RHR below a day with the opposite', () => {
    const base = input();
    const d = base.date;
    const bad = scoreDay({ ...base, hrv: replaceToday(base.hrv, d, 35), rhr: replaceToday(base.rhr, d, 62) }, cfg);
    const good = scoreDay({ ...base, hrv: replaceToday(base.hrv, d, 60), rhr: replaceToday(base.rhr, d, 52) }, cfg);
    expect(bad.score!).toBeLessThan(50);
    expect(good.score!).toBeGreaterThan(50);
  });

  it('excludes every factor and returns a null score while all baselines are cold-starting', () => {
    const r = scoreDay(input({}, 10), cfg);
    expect(r.score).toBeNull();
    expect(r.confidenceLevel).toBe('LOW');
    expect(r.factors.every((f) => f.excluded)).toBe(true);
    const hrv = r.baselines.find((b) => b.metric === 'HRV')!.baseline;
    expect(hrv).toEqual({ coldStart: true, daysOfHistory: 9 });
    expect(r.features.hrvZ).toBeNull();
  });

  it('renormalizes weights around a cold-starting HRV (0.35/0.55 and 0.20/0.55)', () => {
    const base = input();
    const hrvOnly10 = base.hrv.slice(-10);
    const r = scoreDay({ ...base, hrv: hrvOnly10 }, cfg);
    const byFactor = Object.fromEntries(r.factors.map((f) => [f.factor, f]));
    expect(byFactor.HRV!.excluded).toBe(true);
    expect(byFactor.RHR!.weight).toBeCloseTo(0.35 / 0.55, 12);
    expect(byFactor.SLEEP_DEBT!.weight).toBeCloseTo(0.2 / 0.55, 12);
    expect(r.confidenceLevel).toBe('MEDIUM');
  });

  it('holds sleep debt in cold-start until 14 debt-series days exist (a full window plus 14 days of it)', () => {
    // 27 nights: the first full 14-night window ends on night 14, giving 13 debt values before day 27.
    const r = scoreDay(input({}, 27), cfg);
    expect(r.factors.find((f) => f.factor === 'SLEEP_DEBT')!.excluded).toBe(true);
    const r28 = scoreDay(input({}, 28), cfg);
    expect(r28.factors.find((f) => f.factor === 'SLEEP_DEBT')!.excluded).toBe(false);
  });

  it("imputes a missing HRV day from its own EWMA (z = 0), flags it imputed and lowers confidence", () => {
    const base = input();
    const r = scoreDay({ ...base, hrv: replaceToday(base.hrv, base.date, null) }, cfg);
    const hrv = r.factors.find((f) => f.factor === 'HRV')!;
    expect(hrv.imputed).toBe(true);
    expect(hrv.z).toBeCloseTo(0, 12);
    expect(r.features.hrvZImputed).toBe(true);
    expect(r.confidenceLevel).toBe('MEDIUM');
  });

  it('flags an outlier HRV reading, scores that day as a gap, and leaves the input record untouched', () => {
    const base = input();
    const withSpike = { ...base, hrv: replaceToday(base.hrv, base.date, 400) };
    const before = JSON.stringify(withSpike.hrv);
    const r = scoreDay(withSpike, cfg);

    expect(r.outlierFlags).toHaveLength(1);
    expect(r.outlierFlags[0]).toMatchObject({ metric: 'HRV', flag: { date: base.date, value: 400 } });
    expect(r.factors.find((f) => f.factor === 'HRV')!.imputed).toBe(true);
    expect(JSON.stringify(withSpike.hrv)).toBe(before); // flagged, never deleted or altered
  });

  it('does not let an outlier into the baseline it is later compared with', () => {
    const base = input();
    const spikeDay = shiftDate(base.date, -5);
    const spiked = { ...base, hrv: replaceToday(base.hrv, spikeDay, 400) };
    const clean = scoreDay(base, cfg);
    const withSpike = scoreDay(spiked, cfg);
    const eClean = (clean.baselines.find((b) => b.metric === 'HRV')!.baseline as { ewma: number }).ewma;
    const eSpike = (withSpike.baselines.find((b) => b.metric === 'HRV')!.baseline as { ewma: number }).ewma;
    expect(Math.abs(eSpike - eClean)).toBeLessThan(1);
  });

  it('stores acuteChronicLoadRatio but leaves it out of the composite', () => {
    const base = input();
    const a = scoreDay(base, cfg);
    const b = scoreDay({ ...base, steps: base.steps.map((p) => ({ ...p, value: p.date > shiftDate(base.date, -7) ? 30000 : p.value })) }, cfg);

    expect(a.features.acuteChronicLoadRatio).not.toBeNull();
    expect(b.features.acuteChronicLoadRatio).not.toBeNull();
    expect(b.features.acuteChronicLoadRatio).not.toBeCloseTo(a.features.acuteChronicLoadRatio!, 3);
    expect(b.score).toBe(a.score);
    expect(a.factors.map((f) => f.factor).sort()).toEqual(['HRV', 'RHR', 'SLEEP_DEBT']);
  });

  it('reads the sleep goal from the input rather than hardcoding 480', () => {
    const base = input();
    const low = scoreDay({ ...base, sleepGoalMinutes: 300 }, cfg);
    const high = scoreDay({ ...base, sleepGoalMinutes: 600 }, cfg);
    expect(low.features.sleepDebtRolling14d!).toBeLessThan(high.features.sleepDebtRolling14d!);
  });

  it('exposes the per-night sleep duration z and its imputed flag as a correlation series', () => {
    const base = input();
    const observed = scoreDay(base, cfg);
    expect(observed.features.sleepDurationZ).not.toBeNull();
    expect(observed.features.sleepDurationZImputed).toBe(false);

    const missing = scoreDay({ ...base, sleep: replaceToday(base.sleep, base.date, null) }, cfg);
    expect(missing.features.sleepDurationZ).toBeCloseTo(0, 12);
    expect(missing.features.sleepDurationZImputed).toBe(true);
    expect(missing.factors.find((f) => f.factor === 'SLEEP_DEBT')!.imputed).toBe(true);
  });

  it('reports no observed input when HRV, RHR and SLEEP are all missing on the day', () => {
    const base = input();
    const r = scoreDay(
      {
        ...base,
        hrv: replaceToday(base.hrv, base.date, null),
        rhr: replaceToday(base.rhr, base.date, null),
        sleep: replaceToday(base.sleep, base.date, null),
      },
      cfg,
    );
    expect(r.hasObservedInput).toBe(false);
  });

  it('ignores data after the scored day, so a recompute of a past day never sees the future', () => {
    const base = input({}, 40);
    const day = shiftDate(START, 34);
    const truncated = scoreDay({ ...base, date: day }, cfg);
    const withFuture = scoreDay({ ...base, date: day, hrv: [...base.hrv, { date: shiftDate(day, 3), value: 999 }] }, cfg);
    expect(withFuture).toEqual(truncated);
  });

  it('is deterministic: the same input scores identically every time (idempotent recompute)', () => {
    expect(scoreDay(input(), cfg)).toEqual(scoreDay(input(), cfg));
  });
});

// ---------------------------------------------------------------------------
// Slice 1.5: Sleep Score
// ---------------------------------------------------------------------------

/**
 * One session per day, ending on START + i (UTC), with a bedtime and an
 * asleep/in-bed ratio that both wobble deterministically so efficiency and
 * circadian consistency have a real spread (a flat series would just hit the
 * spread floor).
 */
function sessionsFor(days: number, over: { onset?: (i: number) => number; asleep?: (i: number) => number } = {}): SleepSessionInput[] {
  const onset = over.onset ?? ((i: number) => 630 + 25 * Math.sin(i * 1.3));
  const asleep = over.asleep ?? ((i: number) => 385 + 15 * Math.sin(i * 0.9 + 1));
  return Array.from({ length: days }, (_, i) => {
    const noon = new Date(`${shiftDate(START, i - 1)}T12:00:00Z`).getTime();
    return sleepSession(new Date(noon + onset(i) * 60_000).toISOString(), 420, asleep(i));
  });
}

describe('scoreDay: Sleep Score (Slice 1.5)', () => {
  it('produces a HIGH-confidence Sleep Score from a full history with all three factors present', () => {
    const r = scoreDay(input({ sessions: sessionsFor(40) }), cfg);
    const sleep = r.sleepScore!;
    expect(sleep.score).not.toBeNull();
    expect(sleep.confidenceLevel).toBe('HIGH');
    expect(sleep.factors.map((f) => f.factor).sort()).toEqual(['CIRCADIAN_CONSISTENCY', 'SLEEP_DURATION', 'SLEEP_EFFICIENCY']);
    expect(sleep.factors.every((f) => !f.excluded && !f.imputed)).toBe(true);
    expect(sleep.factors.reduce((sum, f) => sum + f.weight, 0)).toBeCloseTo(1, 12);
    // Stage 5: points sum to score - 50.
    expect(sleep.factors.reduce((sum, f) => sum + f.points, 0)).toBeCloseTo(sleep.score! - 50, 9);
  });

  it('fills the Slice 1.5 feature columns and their z series', () => {
    const r = scoreDay(input({ sessions: sessionsFor(40) }), cfg);
    expect(r.features.sleepEfficiency).toBeGreaterThan(0.85);
    expect(r.features.sleepEfficiency).toBeLessThanOrEqual(1);
    expect(r.features.circadianConsistencyScore).toBeGreaterThan(0);
    expect(r.features.sleepEfficiencyZ).not.toBeNull();
    expect(r.features.sleepEfficiencyZImputed).toBe(false);
    expect(r.features.circadianConsistencyZ).not.toBeNull();
    expect(r.features.circadianConsistencyZImputed).toBe(false);
    expect(r.baselines.map((b) => b.metric).sort()).toEqual([
      'CIRCADIAN_CONSISTENCY',
      'HRV',
      'RESTING_HR',
      'SLEEP',
      'SLEEP_DEBT',
      'SLEEP_EFFICIENCY',
    ]);
  });

  it('renormalizes around circadian consistency while it is cold-starting (0.45/0.80, 0.35/0.80)', () => {
    // 20 nights: efficiency and duration have 14+ history, but the circadian series only starts on night 14.
    const r = scoreDay(input({ sessions: sessionsFor(20) }, 20), cfg);
    const by = Object.fromEntries(r.sleepScore!.factors.map((f) => [f.factor, f]));
    expect(by.CIRCADIAN_CONSISTENCY!.excluded).toBe(true);
    expect(by.SLEEP_DURATION!.weight).toBeCloseTo(0.45 / 0.8, 12);
    expect(by.SLEEP_EFFICIENCY!.weight).toBeCloseTo(0.35 / 0.8, 12);
    expect(r.sleepScore!.confidenceLevel).toBe('MEDIUM');
    expect(r.features.circadianConsistencyZ).toBeNull();
  });

  it('without any sessions, only duration can score (efficiency and circadian cold-start), at LOW confidence', () => {
    const r = scoreDay(input(), cfg);
    const by = Object.fromEntries(r.sleepScore!.factors.map((f) => [f.factor, f]));
    expect(by.SLEEP_DURATION!.excluded).toBe(false);
    expect(by.SLEEP_DURATION!.weight).toBeCloseTo(1, 12);
    expect(by.SLEEP_EFFICIENCY!.excluded).toBe(true);
    expect(by.CIRCADIAN_CONSISTENCY!.excluded).toBe(true);
    expect(r.sleepScore!.confidenceLevel).toBe('LOW');
    expect(r.features.sleepEfficiency).toBeNull();
    expect(r.features.circadianConsistencyScore).toBeNull();
  });

  it('is all-excluded (null score) while the SLEEP baseline itself is cold-starting', () => {
    const r = scoreDay(input({}, 10), cfg);
    expect(r.sleepScore).not.toBeNull();
    expect(r.sleepScore!.score).toBeNull();
    expect(r.sleepScore!.factors.every((f) => f.excluded)).toBe(true);
  });

  describe('duration is scored against the sleep goal, clamped to [-3, +1] sigma', () => {
    const base = input({ sessions: sessionsFor(40) });
    const d = base.date;
    const durationZ = (minutes: number, goal = 480) => {
      const r = scoreDay({ ...base, sleep: replaceToday(base.sleep, d, minutes), sleepGoalMinutes: goal }, cfg);
      return r.sleepScore!.factors.find((f) => f.factor === 'SLEEP_DURATION')!.z!;
    };

    it('floors a very short night at -3 and caps a very long one at +1', () => {
      expect(durationZ(60)).toBe(-3);
      expect(durationZ(900)).toBe(1);
    });

    it('gives no extra credit for sleeping further past the goal', () => {
      expect(durationZ(700)).toBe(1);
      expect(durationZ(840)).toBe(1);
    });

    it('is 0 exactly on goal and follows the goal, not the baseline', () => {
      expect(durationZ(480, 480)).toBeCloseTo(0, 12);
      expect(durationZ(480, 420)).toBeGreaterThan(0); // the same 480 minutes beats a 420 goal
      expect(durationZ(480, 540)).toBeLessThan(0);
    });

    it('scores a goal-length night higher than a short one', () => {
      const long = scoreDay({ ...base, sleep: replaceToday(base.sleep, d, 480) }, cfg).sleepScore!.score!;
      const short = scoreDay({ ...base, sleep: replaceToday(base.sleep, d, 300) }, cfg).sleepScore!.score!;
      expect(long).toBeGreaterThan(short);
    });
  });

  it('produces no Sleep Score for a day with no observed sleep, while Recovery still scores', () => {
    const base = input({ sessions: sessionsFor(40) });
    const r = scoreDay({ ...base, sleep: replaceToday(base.sleep, base.date, null) }, cfg);
    expect(r.hasObservedInput).toBe(true); // HRV / RHR are still observed
    expect(r.score).not.toBeNull();
    expect(r.sleepScore).toBeNull();
  });

  it('imputes efficiency (z 0, flagged, lower confidence) when the night has a rollup but no usable session interval', () => {
    const sessions = sessionsFor(40).filter((s) => s.endTime.toISOString().slice(0, 10) !== shiftDate(START, 39));
    const r = scoreDay(input({ sessions }), cfg);
    const eff = r.sleepScore!.factors.find((f) => f.factor === 'SLEEP_EFFICIENCY')!;
    expect(eff.imputed).toBe(true);
    expect(eff.z).toBeCloseTo(0, 12);
    expect(r.features.sleepEfficiency).toBeNull();
    expect(r.features.sleepEfficiencyZImputed).toBe(true);
    expect(r.sleepScore!.confidenceLevel).toBe('MEDIUM');
  });

  it('treats an unstable bedtime as worse than a steady one', () => {
    const steady = scoreDay(input({ sessions: sessionsFor(40, { onset: () => 630 + 2 * Math.sin(1) }) }), cfg);
    // Same history except the last two weeks have a wild bedtime.
    const erratic = scoreDay(
      input({ sessions: sessionsFor(40, { onset: (i) => (i >= 26 ? (i % 2 === 0 ? 540 : 780) : 630 + 2 * Math.sin(i)) }) }),
      cfg,
    );
    const z = (r: typeof steady) => r.sleepScore!.factors.find((f) => f.factor === 'CIRCADIAN_CONSISTENCY')!.z!;
    expect(z(erratic)).toBeLessThan(z(steady));
  });

  it('buckets sessions by the local end date in the user timezone', () => {
    // Ends 03:00Z on the scored day: still that day in UTC, but 23:00 the evening before in New York.
    const sessions = [sleepSession(`${shiftDate(START, 38)}T20:00:00Z`, 420, 390)];
    const utc = scoreDay(input({ sessions, timezone: 'UTC' }), cfg);
    const ny = scoreDay(input({ sessions, timezone: 'America/New_York' }), cfg);
    expect(utc.features.sleepEfficiency).toBeCloseTo(390 / 420, 12);
    expect(ny.features.sleepEfficiency).toBeNull();
  });
});

describe('Recovery Score is unchanged by the Sleep Score work (regression)', () => {
  it('yields byte-identical Recovery output whether or not sessions are supplied', () => {
    const without = scoreDay(input(), cfg);
    const withSessions = scoreDay(input({ sessions: sessionsFor(40), timezone: 'America/New_York' }), cfg);
    expect(withSessions.score).toBe(without.score);
    expect(withSessions.confidenceLevel).toBe(without.confidenceLevel);
    expect(withSessions.factors).toEqual(without.factors);
    expect(withSessions.features.hrvZ).toBe(without.features.hrvZ);
    expect(withSessions.features.sleepDurationZ).toBe(without.features.sleepDurationZ);
    expect(withSessions.features.sleepDebtRolling14d).toBe(without.features.sleepDebtRolling14d);
  });

  it('keeps the Recovery factor vector at exactly the three original factors and weights', () => {
    const r = scoreDay(input({ sessions: sessionsFor(40) }), cfg);
    expect(r.factors.map((f) => f.factor).sort()).toEqual(['HRV', 'RHR', 'SLEEP_DEBT']);
    expect(cfg.weights).toEqual({ HRV: 0.45, RHR: 0.35, SLEEP_DEBT: 0.2 });
  });
});
