import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { MetricTile, trendCaption } from '../../src/components/home/metric-tile';
import { FONTS } from '../../src/theme';
import type { MetricRecord } from '../../src/lib/metricInsights';

function records(type: MetricRecord['metricType'], values: number[]): MetricRecord[] {
  return values.map((value, i) => ({
    id: String(i),
    metricType: type,
    value,
    recordedAt: new Date(Date.UTC(2026, 8, 1 + i)).toISOString(),
  }));
}

describe('trendCaption', () => {
  it('compares the latest reading with the person’s own average', () => {
    expect(trendCaption(records('HRV', [50, 50, 60]))).toBe('20% above your average');
    expect(trendCaption(records('HRV', [50, 50, 40]))).toBe('20% below your average');
  });

  it('calls a small move steady', () => {
    expect(trendCaption(records('HRV', [50, 50, 51]))).toBe('Steady vs your average');
  });

  it('has nothing to say about a single reading', () => {
    expect(trendCaption(records('HRV', [50]))).toBeNull();
  });
});

describe('MetricTile', () => {
  it('shows progress toward a real goal for goal metrics', () => {
    const { getByText } = render(<MetricTile type="STEPS" series={records('STEPS', [8000, 8400])} onPress={jest.fn()} />);
    expect(getByText('Steps')).toBeTruthy();
    expect(getByText('8,400')).toBeTruthy();
    expect(getByText('84% of goal')).toBeTruthy();
  });

  it('shows the own-average comparison for metrics with no universal goal', () => {
    const { getByText } = render(<MetricTile type="HRV" series={records('HRV', [50, 50, 60])} onPress={jest.fn()} />);
    expect(getByText('60.0 ms')).toBeTruthy();
    expect(getByText('20% above your average')).toBeTruthy();
  });

  it('draws its number in tabular figures on one line that shrinks to fit', () => {
    const { getByText } = render(<MetricTile type="STEPS" series={records('STEPS', [8000, 18400])} onPress={jest.fn()} />);
    const value = getByText('18,400');
    expect(StyleSheet.flatten(value.props.style)).toEqual(expect.objectContaining({ fontFamily: FONTS.sansBold, fontVariant: ['tabular-nums'] }));
    expect(String(value.props.className).split(' ')).toEqual(expect.arrayContaining(['text-display', 'tabular-nums']));
    expect(value.props.numberOfLines).toBe(1);
    expect(value.props.adjustsFontSizeToFit).toBe(true);
  });

  it('opens its detail when pressed', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(<MetricTile type="HRV" series={records('HRV', [50, 60])} onPress={onPress} />);
    fireEvent.press(getByTestId('metric-card-HRV'));
    expect(onPress).toHaveBeenCalled();
  });
});
