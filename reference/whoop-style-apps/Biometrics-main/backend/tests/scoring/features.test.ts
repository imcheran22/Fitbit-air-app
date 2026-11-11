import {
  nightlyDeficits,
  sleepDebtRolling,
  buildSleepDebtSeries,
  baselineDeviationPct,
  acuteChronicLoadRatio,
  sleepEfficiency,
  groupSessionsByNight,
  mainSessionOnsets,
  circadianConsistencyOn,
  buildSleepEfficiencySeries,
  buildCircadianSeries,
  populationStdDev,
  spreadToScore,
} from '../../src/scoring/features';
import { v1Config } from '../../src/scoring/configs/v1';
import { series, sleepSession, noonAnchoredNights } from './helpers';

const cfg = v1Config;

describe('Stage 2: sleepDebtRolling14d', () => {
  it('sums max(0, goal - minutesAsleep) over the 14 days ending on the date, inclusive', () => {
    const sleep = series('2026-08-01', Array(14).fill(420)); // 60 short each night
    expect(sleepDebtRolling(sleep, '2026-08-14', 480, cfg)).toBe(14 * 60);
  });

  it("floors each night at 0: a long night does not pay back another night's deficit", () => {
    const sleep = series('2026-08-01', [300, 600, ...Array(12).fill(480)]);
    expect(sleepDebtRolling(sleep, '2026-08-14', 480, cfg)).toBe(180);
  });

  it('only looks at the trailing 14 days', () => {
    const sleep = series('2026-08-01', [0, ...Array(14).fill(480)]); // the 0 is outside the window ending 08-15
    expect(sleepDebtRolling(sleep, '2026-08-15', 480, cfg)).toBe(0);
  });

  it('counts a missing night as no information (0), not as a full-goal deficit', () => {
    const sleep = series('2026-08-01', [400]);
    expect(sleepDebtRolling(sleep, '2026-08-14', 480, cfg)).toBe(80);
  });

  it('uses the supplied goal, not a hardcoded 480', () => {
    const sleep = series('2026-08-14', [420]);
    expect(sleepDebtRolling(sleep, '2026-08-14', 420, cfg)).toBe(0);
    expect(sleepDebtRolling(sleep, '2026-08-14', 540, cfg)).toBe(120);
  });
});

describe('Stage 2: nightlyDeficits', () => {
  it('lists the window oldest first, a missing night 0, and sums to sleepDebtRolling', () => {
    // 08-01 is outside the window ending 08-15; 08-03 is missing; 08-05 is a long night.
    const sleep = series('2026-08-01', [0, 400, 480, 300, 600, ...Array(10).fill(470)]).filter((n) => n.date !== '2026-08-03');
    const d = nightlyDeficits(sleep, '2026-08-15', 480, cfg);
    expect(d).toEqual([80, 0, 180, 0, ...Array(10).fill(10)]);
    expect(d.reduce((s, v) => s + v, 0)).toBe(sleepDebtRolling(sleep, '2026-08-15', 480, cfg));
  });
});

describe('Stage 2: buildSleepDebtSeries', () => {
  it("only emits days whose full 14-day window lies inside the user's history", () => {
    // A window that starts before the user's first night would be understated by
    // construction and bias the baseline; those days are not part of the series.
    const sleep = series('2026-08-01', Array(20).fill(420));
    const debt = buildSleepDebtSeries(sleep, '2026-08-20', 480, cfg);
    expect(debt[0]).toEqual({ date: '2026-08-14', value: 14 * 60 });
    expect(debt).toHaveLength(7);
  });

  it('is empty when there is less than a full window of history', () => {
    expect(buildSleepDebtSeries(series('2026-08-01', Array(10).fill(420)), '2026-08-10', 480, cfg)).toEqual([]);
  });
});

describe('Stage 2: baselineDeviationPct', () => {
  it('is (value - ewma) / ewma * 100', () => {
    expect(baselineDeviationPct(44, 40)).toBeCloseTo(10, 10);
    expect(baselineDeviationPct(36, 40)).toBeCloseTo(-10, 10);
  });
});

describe('Stage 2: acuteChronicLoadRatio', () => {
  it('is the 7-day mean over the 28-day mean of steps', () => {
    const steps = series('2026-07-01', [...Array(21).fill(6000), ...Array(7).fill(12000)]);
    // acute mean 12000; chronic mean (21*6000 + 7*12000)/28 = 7500
    expect(acuteChronicLoadRatio(steps, '2026-07-28', cfg)).toBeCloseTo(12000 / 7500, 10);
  });

  it('is 1 for constant load', () => {
    expect(acuteChronicLoadRatio(series('2026-07-01', Array(28).fill(8000)), '2026-07-28', cfg)).toBeCloseTo(1, 10);
  });

  it('is null without enough chronic history', () => {
    expect(acuteChronicLoadRatio(series('2026-07-20', Array(9).fill(8000)), '2026-07-28', cfg)).toBeNull();
  });
});

describe('Slice 1.5 Stage 2: sleepEfficiency', () => {
  it('is sum(minutesAsleep) / sum(end - start) over the sessions ending on the local day', () => {
    // A nap ending 14:00 on 08-01 and a main sleep 22:00 -> 06:00, ending on 08-02.
    const sessions = [sleepSession('2026-08-01T13:00:00Z', 60, 50), sleepSession('2026-08-01T22:00:00Z', 480, 420)];
    const byNight = groupSessionsByNight(sessions, 'UTC');
    expect(sleepEfficiency(byNight.get('2026-08-02')!)).toBeCloseTo(420 / 480, 12);
    expect(sleepEfficiency(byNight.get('2026-08-01')!)).toBeCloseTo(50 / 60, 12);
  });

  it('pools several sessions ending the same day as a ratio of sums, not a mean of ratios', () => {
    const sessions = [sleepSession('2026-08-01T04:00:00Z', 60, 60), sleepSession('2026-08-01T05:00:00Z', 300, 150)];
    const day = groupSessionsByNight(sessions, 'UTC').get('2026-08-01')!;
    expect(day).toHaveLength(2);
    expect(sleepEfficiency(day)).toBeCloseTo(210 / 360, 12);
  });

  it("buckets by the local end date in the user's timezone", () => {
    // Ends 03:00Z on 08-02 = 23:00 on 08-01 in New York.
    const s = [sleepSession('2026-08-01T20:00:00Z', 420, 380)];
    expect(groupSessionsByNight(s, 'America/New_York').has('2026-08-01')).toBe(true);
    expect(groupSessionsByNight(s, 'UTC').has('2026-08-02')).toBe(true);
  });

  it('guards a zero-duration session: it is ignored, and an all-zero day has no efficiency', () => {
    const zero = sleepSession('2026-08-01T05:00:00Z', 0, 0);
    expect(sleepEfficiency([zero])).toBeNull();
    const good = sleepSession('2026-08-01T04:00:00Z', 400, 360);
    expect(sleepEfficiency([zero, good])).toBeCloseTo(0.9, 12);
  });

  it('guards a negative duration (end before start) the same way', () => {
    const negative = { startTime: new Date('2026-08-01T06:00:00Z'), endTime: new Date('2026-08-01T05:00:00Z'), minutesAsleep: 30 };
    expect(sleepEfficiency([negative])).toBeNull();
  });

  it('never exceeds 1 when the derived interval is shorter than minutesAsleep', () => {
    expect(sleepEfficiency([sleepSession('2026-08-01T04:00:00Z', 300, 330)])).toBe(1);
  });

  it('builds a per-night series keyed by local end date, dropping nights with no valid interval', () => {
    const sessions = [
      sleepSession('2026-08-01T22:00:00Z', 480, 432), // ends 08-02
      sleepSession('2026-08-02T22:00:00Z', 0, 0), // ends 08-02, zero duration: ignored
      sleepSession('2026-08-03T22:00:00Z', 400, 300), // ends 08-04
      sleepSession('2026-08-05T22:00:00Z', 0, 0), // ends 08-05, nothing valid: no point at all
    ];
    const built = buildSleepEfficiencySeries(sessions, 'UTC', '2026-08-06');
    expect(built.map((p) => p.date)).toEqual(['2026-08-02', '2026-08-04']);
    expect(built[0]!.value).toBeCloseTo(0.9, 12);
    expect(built[1]!.value).toBeCloseTo(0.75, 12);
  });

  it('leaves out nights after the through date', () => {
    const sessions = [sleepSession('2026-08-01T22:00:00Z', 480, 432), sleepSession('2026-08-03T22:00:00Z', 480, 432)];
    expect(buildSleepEfficiencySeries(sessions, 'UTC', '2026-08-02').map((p) => p.date)).toEqual(['2026-08-02']);
  });
});

describe('Slice 1.5 Stage 2: circadian consistency', () => {
  it('measures onset in minutes since 12:00 local so bedtimes either side of midnight do not wrap', () => {
    const sessions = [
      sleepSession('2026-08-01T23:30:00Z', 480, 440), // 23:30 -> 690
      sleepSession('2026-08-03T00:30:00Z', 480, 440), // 00:30 -> 750: 60 later, not 23h earlier
    ];
    expect(mainSessionOnsets(sessions, 'UTC').map((o) => o.value)).toEqual([690, 750]);
  });

  it("reads a session's own UTC offsets over the user's timezone: night date from the end offset, onset from the start offset", () => {
    // User zone New York. The record says +09:00 (Tokyo): starts 14:30Z = 23:30 local Sep 2, ends 22:00Z = 07:00 Sep 3.
    const s = {
      ...sleepSession('2026-09-02T14:30:00Z', 450, 420),
      startUtcOffsetSeconds: 32400,
      endUtcOffsetSeconds: 32400,
    };
    expect([...groupSessionsByNight([s], 'America/New_York').keys()]).toEqual(['2026-09-03']);
    expect(mainSessionOnsets([s], 'America/New_York')).toEqual([{ date: '2026-09-03', value: 690 }]);
    // Without offsets the same instants follow New York: end 18:00 Sep 2, onset 10:30 -> 1350.
    const bare = sleepSession('2026-09-02T14:30:00Z', 450, 420);
    expect(mainSessionOnsets([bare], 'America/New_York')).toEqual([{ date: '2026-09-02', value: 1350 }]);
    // Null offsets are "absent", not zero.
    const nulls = { ...bare, startUtcOffsetSeconds: null, endUtcOffsetSeconds: null };
    expect(mainSessionOnsets([nulls], 'America/New_York')).toEqual([{ date: '2026-09-02', value: 1350 }]);
  });

  it('a night crossing local midnight at half-hour and negative offsets stays one contiguous run of onsets', () => {
    const at = (startIso: string, offset: number) => ({ ...sleepSession(startIso, 480, 440), startUtcOffsetSeconds: offset, endUtcOffsetSeconds: offset });
    const onsets = mainSessionOnsets(
      [
        at('2026-09-01T18:00:00Z', 19800), // 23:30 local (+05:30), ends 07:30 Sep 2
        at('2026-09-03T00:00:00Z', -18000), // 19:00 local (-05:00) Sep 2, ends 03:00 Sep 3 local: onset 420
        at('2026-09-03T19:00:00Z', 19800), // 00:30 local Sep 4 (+05:30): onset 750
      ],
      'UTC',
    );
    expect(onsets.map((o) => o.value)).toEqual([690, 420, 750]);
  });

  it("uses the user's timezone for the wall clock (23:30 in New York is 03:30Z)", () => {
    const sessions = [sleepSession('2026-08-02T03:30:00Z', 480, 440)];
    expect(mainSessionOnsets(sessions, 'America/New_York')[0]!.value).toBe(690);
    expect(mainSessionOnsets(sessions, 'UTC')[0]!.value).toBe(930); // 03:30 UTC
  });

  it('takes the main (longest by minutesAsleep) session of a night, ignoring a nap', () => {
    const sessions = [
      sleepSession('2026-08-01T13:00:00Z', 60, 55), // a lone nap, ends 14:00 on 08-01
      sleepSession('2026-08-01T22:00:00Z', 480, 420), // main sleep, ends 06:00 on 08-02
      sleepSession('2026-08-02T01:00:00Z', 30, 20), // a brief split, ends 01:30 on 08-02: same night as the main
    ];
    expect(mainSessionOnsets(sessions, 'UTC')).toEqual([
      { date: '2026-08-01', value: 60 }, // the lone nap is that day's only session (13:00 -> 60)
      { date: '2026-08-02', value: 600 }, // 22:00 -> 600, beating the 20-minute session
    ]);
  });

  it('is 100 for a perfectly regular bedtime', () => {
    const onsets = mainSessionOnsets(noonAnchoredNights('2026-07-01', 14, [630]), 'UTC');
    expect(circadianConsistencyOn(onsets, '2026-07-15', cfg)).toBeCloseTo(100, 9);
  });

  it('inverts and normalizes the stddev: 30 min of spread against a 120 min ceiling is 75', () => {
    // 23:30 / 00:30 alternate: population stddev is exactly 30 minutes. Wrapped at midnight it would be ~690.
    const onsets = mainSessionOnsets(noonAnchoredNights('2026-07-01', 14, [690, 750]), 'UTC');
    expect(circadianConsistencyOn(onsets, '2026-07-15', cfg)).toBeCloseTo(75, 9);
  });

  it('floors at 0 once the spread reaches the ceiling', () => {
    const onsets = mainSessionOnsets(noonAnchoredNights('2026-07-01', 14, [540, 780]), 'UTC'); // 21:00 / 01:00: stddev 120
    expect(circadianConsistencyOn(onsets, '2026-07-15', cfg)).toBe(0);
  });

  it('is null (cold start) until 14 nights of history exist', () => {
    const thirteen = mainSessionOnsets(noonAnchoredNights('2026-07-01', 13, [630]), 'UTC');
    expect(circadianConsistencyOn(thirteen, '2026-07-14', cfg)).toBeNull();
    const fourteen = mainSessionOnsets(noonAnchoredNights('2026-07-01', 14, [630]), 'UTC');
    expect(circadianConsistencyOn(fourteen, '2026-07-15', cfg)).not.toBeNull();
  });

  it('is null when the trailing window holds too few nights for a meaningful spread', () => {
    // Plenty of old history, then only 3 nights inside the last 14 days.
    const sessions = [...noonAnchoredNights('2026-05-01', 30, [630]), ...noonAnchoredNights('2026-07-12', 3, [630])];
    expect(circadianConsistencyOn(mainSessionOnsets(sessions, 'UTC'), '2026-07-15', cfg)).toBeNull();
  });

  it('only looks at the trailing window ending on the date', () => {
    const wild = noonAnchoredNights('2026-06-01', 10, [540, 780]); // long before the window
    const steady = noonAnchoredNights('2026-06-20', 26, [630]);
    const onsets = mainSessionOnsets([...wild, ...steady], 'UTC');
    expect(circadianConsistencyOn(onsets, '2026-07-15', cfg)).toBeCloseTo(100, 9);
  });

  it('builds a daily series that starts on the first day the feature is computable', () => {
    const onsets = mainSessionOnsets(noonAnchoredNights('2026-07-01', 20, [630]), 'UTC');
    const built = buildCircadianSeries(onsets, '2026-07-25', cfg);
    // Night 14 ends on 07-15: the first day with 14 nights of history.
    expect(built[0]!.date).toBe('2026-07-15');
    expect(built[built.length - 1]!.date).toBe('2026-07-25');
    expect(built.every((p) => Math.abs(p.value - 100) < 1e-9)).toBe(true);
  });
});

describe('spread maths shared by circadian consistency and sleep regularity', () => {
  it('spreadToScore inverts and normalizes a stddev against the ceiling, floored at 0', () => {
    expect(spreadToScore(0, 120)).toBe(100);
    expect(spreadToScore(60, 120)).toBe(50);
    expect(spreadToScore(240, 120)).toBe(0);
  });

  it('populationStdDev divides by n, not n - 1', () => {
    expect(populationStdDev([10, 20, 30])).toBeCloseTo(8.165, 3);
    expect(populationStdDev([630, 630, 630])).toBe(0);
  });
});
