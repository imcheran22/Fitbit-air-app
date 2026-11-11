import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { RangeChart, nearestIndex, xAt, yAt, yDomain, shortDate } from '../../src/components/ui/range-chart';
import type { MetricRecord } from '../../src/lib/metricInsights';

function points(values: number[]): MetricRecord[] {
  return values.map((value, i) => ({
    id: `p-${i}`,
    metricType: 'HRV',
    value,
    recordedAt: `2026-09-${String(10 + i).padStart(2, '0')}T00:00:00.000Z`,
  }));
}

describe('chart geometry', () => {
  it('pads the domain around both the readings and the band', () => {
    const [min, max] = yDomain([50, 60], { low: 40, high: 70, readings: 10 });
    expect(min).toBeLessThan(40);
    expect(max).toBeGreaterThan(70);
  });

  it('gives a flat series a non-zero span', () => {
    const [min, max] = yDomain([50, 50], null);
    expect(max - min).toBeGreaterThan(0);
  });

  it('maps the first and last reading to the padded edges and higher values upward', () => {
    expect(xAt(0, 5, 300)).toBe(8);
    expect(xAt(4, 5, 300)).toBe(292);
    expect(yAt(60, [40, 60], 100)).toBeLessThan(yAt(40, [40, 60], 100));
  });

  it('finds the reading nearest a touch, clamped to the series', () => {
    expect(nearestIndex(8, 5, 300)).toBe(0);
    expect(nearestIndex(150, 5, 300)).toBe(2);
    expect(nearestIndex(-40, 5, 300)).toBe(0);
    expect(nearestIndex(900, 5, 300)).toBe(4);
  });

  it('labels a reading by its civil date', () => {
    expect(shortDate(points([1])[0])).toBe('Sep 10');
  });
});

describe('RangeChart', () => {
  function renderLaidOut(ui: React.ReactElement) {
    const utils = render(ui);
    fireEvent(utils.getByLabelText('chart'), 'layout', { nativeEvent: { layout: { width: 300, height: 180 } } });
    return utils;
  }

  it('draws the usual-range band and marks only readings outside it', () => {
    const { getByTestId, queryByTestId, getByText } = renderLaidOut(
      <RangeChart
        points={points([50, 52, 70, 51, 30, 53])}
        range={{ low: 48, high: 56, readings: 20 }}
        color="rgb(45, 212, 191)"
        format={(v) => `${v} ms`}
        accessibilityLabel="chart"
      />,
    );
    expect(getByTestId('range-band')).toBeTruthy();
    expect(getByTestId('range-outlier-2')).toBeTruthy();
    expect(getByTestId('range-outlier-4')).toBeTruthy();
    expect(queryByTestId('range-outlier-0')).toBeNull();
    expect(getByText('Usual range · 48–56 ms')).toBeTruthy();
  });

  it('draws no band, and marks nothing as outside, without a usual range', () => {
    const { queryByTestId, queryByText } = renderLaidOut(
      <RangeChart points={points([50, 90, 10])} range={null} color="rgb(45, 212, 191)" format={String} accessibilityLabel="chart" />,
    );
    expect(queryByTestId('range-band')).toBeNull();
    expect(queryByTestId('range-outlier-1')).toBeNull();
    expect(queryByText(/Usual range/)).toBeNull();
  });
});
