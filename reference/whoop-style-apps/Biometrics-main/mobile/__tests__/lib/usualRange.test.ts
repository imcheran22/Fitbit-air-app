import {
  formatRange,
  quantile,
  rangePendingText,
  rangePosition,
  rangeSentence,
  usualRange,
  USUAL_RANGE_MIN_READINGS,
} from '../../src/lib/usualRange';
import { addDays } from '../../src/lib/heatmap';
import type { MetricRecord } from '../../src/lib/metricInsights';
import { METRIC_CONFIG } from '../../src/theme';

const asOf = '2026-09-29';

function daily(values: number[], endDate = asOf): MetricRecord[] {
  return values.map((value, i) => ({
    id: String(i),
    metricType: 'HRV',
    value,
    recordedAt: `${addDays(endDate, -(values.length - 1 - i))}T00:00:00.000Z`,
  }));
}

describe('quantile', () => {
  it('interpolates between ranks', () => {
    expect(quantile([1, 2, 3, 4], 0.25)).toBeCloseTo(1.75);
    expect(quantile([1, 2, 3, 4], 0.75)).toBeCloseTo(3.25);
    expect(quantile([5], 0.5)).toBe(5);
  });
});

describe('usualRange', () => {
  it('is the middle 80% of the last 30 days of readings', () => {
    const range = usualRange(daily([40, 44, 48, 50, 52, 56, 60, 64]), asOf);
    expect(range!.low).toBeCloseTo(42.8);
    expect(range!.high).toBeCloseTo(61.2);
    expect(range!.readings).toBe(8);
  });

  it('ignores readings older than 30 days and newer than asOf', () => {
    const old = daily([500, 500, 500], addDays(asOf, -40));
    const future = daily([900], addDays(asOf, 2));
    const recent = daily([50, 50, 50, 50, 50, 50, 50]);
    expect(usualRange([...old, ...recent, ...future], asOf)).toEqual({ low: 50, high: 50, readings: 7 });
  });

  it('needs enough readings before it calls anything usual', () => {
    expect(usualRange(daily(Array(USUAL_RANGE_MIN_READINGS - 1).fill(50)), asOf)).toBeNull();
  });
});

describe('rangePosition and rangeSentence', () => {
  const range = { low: 48, high: 60, readings: 20 };
  const format = METRIC_CONFIG.HRV.format;

  it('places a value relative to the band, inclusive at the edges', () => {
    expect(rangePosition(62, range)).toBe('above');
    expect(rangePosition(60, range)).toBe('within');
    expect(rangePosition(48, range)).toBe('within');
    expect(rangePosition(44, range)).toBe('below');
  });

  it('describes the position with the unit written once', () => {
    expect(rangeSentence(62, range, format)).toBe('Above your usual range of 48.0–60.0 ms');
    expect(rangeSentence(55, range, format)).toBe('Within your usual range of 48.0–60.0 ms');
    expect(rangeSentence(44, range, format)).toBe('Below your usual range of 48.0–60.0 ms');
  });
});

describe('formatRange', () => {
  it('writes both ends in full when the unit is not a single shared word', () => {
    expect(formatRange(400, 450, METRIC_CONFIG.SLEEP.format)).toBe('6h 40m–7h 30m');
    expect(formatRange(8000, 11000, METRIC_CONFIG.STEPS.format)).toBe('8,000–11,000');
    expect(formatRange(52, 58, METRIC_CONFIG.RESTING_HR.format)).toBe('52–58 bpm');
  });
});

describe('rangePendingText', () => {
  it('counts the readings still needed', () => {
    expect(rangePendingText(4)).toBe('Your usual range appears after 3 more readings');
    expect(rangePendingText(6)).toBe('Your usual range appears after 1 more reading');
  });
});
