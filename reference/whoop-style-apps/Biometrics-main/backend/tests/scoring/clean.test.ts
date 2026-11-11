import { rejectOutliers, imputeFromBaseline } from '../../src/scoring/clean';
import { v1Config } from '../../src/scoring/configs/v1';
import { series, alternating } from './helpers';

const cfg = v1Config;

describe('Stage 1: rejectOutliers', () => {
  it('flags a value more than 5 raw MAD from the trailing median and leaves it out of the kept series', () => {
    // 20 days alternating 40/42: median 41, raw MAD 1. Day 21 = 50 is 9 MAD away.
    const points = series('2026-08-01', [...alternating(20, 40, 42), 50]);
    const { kept, outliers } = rejectOutliers(points, cfg);

    expect(outliers).toEqual([{ date: '2026-08-21', value: 50, median: 41, mad: 1 }]);
    expect(kept).toHaveLength(20);
    expect(kept.find((p) => p.date === '2026-08-21')).toBeUndefined();
  });

  it('never mutates or drops from the input: rejection only decides what the score skips', () => {
    const points = series('2026-08-01', [...alternating(20, 40, 42), 50]);
    const copy = JSON.parse(JSON.stringify(points));
    rejectOutliers(points, cfg);
    expect(points).toEqual(copy);
  });

  it('keeps a value within 5 MAD', () => {
    const points = series('2026-08-01', [...alternating(20, 40, 42), 45.5]); // 4.5 MAD
    expect(rejectOutliers(points, cfg).outliers).toEqual([]);
  });

  // The spec's wording is a literal raw MAD, not the sigma-scaled one. 47 is 6
  // raw MAD away (flagged) but only 6/1.4826 = 4.05 scaled MAD (would pass).
  it('uses the raw, unscaled MAD as the spec words it', () => {
    const points = series('2026-08-01', [...alternating(20, 40, 42), 47]);
    expect(rejectOutliers(points, cfg).outliers.map((o) => o.date)).toEqual(['2026-08-21']);
  });

  it('rejects nothing until there is enough history for a median to mean something', () => {
    const points = series('2026-08-01', [...alternating(10, 40, 42), 90]);
    expect(rejectOutliers(points, cfg).outliers).toEqual([]);
  });

  it('rejects nothing on a perfectly flat history (MAD 0 would flag every different value)', () => {
    const points = series('2026-08-01', [...Array(20).fill(50), 51]);
    expect(rejectOutliers(points, cfg).outliers).toEqual([]);
  });

  it('only looks back over the trailing 90 days', () => {
    // 20 old points near 100, then a gap of over 90 days, then a run near 40 and a 41: the old
    // level must not be part of the median for the recent points.
    const old = series('2026-01-01', alternating(20, 99, 101));
    const recent = series('2026-06-01', [...alternating(20, 40, 42), 41]);
    expect(rejectOutliers([...old, ...recent], cfg).outliers).toEqual([]);
  });

  it('does not lock itself out after a genuine level shift', () => {
    // A user whose HRV really moves from ~40 to ~60: rejected points still count toward the
    // median, so it follows the new level instead of rejecting it forever.
    const before = series('2026-05-01', alternating(30, 40, 42));
    const after = series('2026-05-31', alternating(60, 60, 62));
    const { kept } = rejectOutliers([...before, ...after], cfg);
    expect(kept.slice(-10).map((p) => p.date)).toEqual(after.slice(-10).map((p) => p.date));
  });
});

describe('Stage 1: imputeFromBaseline', () => {
  it("imputes a missing day from the metric's own Stage-3 EWMA and marks it imputed", () => {
    expect(imputeFromBaseline({ coldStart: false, daysOfHistory: 30, ewma: 42, spread: 3, mad: 2 })).toEqual({
      value: 42,
      imputed: true,
    });
  });

  it('cannot impute while the baseline is cold-starting (no fabricated per-user number)', () => {
    expect(imputeFromBaseline({ coldStart: true, daysOfHistory: 5 })).toBeNull();
  });
});
