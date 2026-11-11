import React from 'react';
import { StyleSheet } from 'react-native';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { UsualTiles } from '../../src/components/activity/UsualTiles';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate }) }));
beforeEach(() => mockNavigate.mockReset());

it('opens a metric, the Recovery page, Patterns and All trends', () => {
  const records = [{ id: 'h', metricType: 'HRV' as const, value: 61, recordedAt: '2026-10-06T00:00:00.000Z' }];
  const recovery = [{ id: 'r', metricType: 'RECOVERY' as const, value: 71, recordedAt: '2026-10-06T00:00:00.000Z' }];
  render(<UsualTiles records={records} recovery={recovery} today="2026-10-07" />);
  expect(screen.getByTestId('usual-tile-HRV-dot')).toBeTruthy();
  // A screen reader hears the value and the change, not just the name.
  expect(screen.getByTestId('usual-tile-HRV').props.accessibilityLabel).toBe('HRV, 61.0 ms, No readings from the 30 days before');
  expect(screen.getByTestId('usual-tile-SLEEP').props.accessibilityLabel).toBe('Sleep, no reading');
  fireEvent.press(screen.getByTestId('usual-tile-HRV'));
  expect(mockNavigate).toHaveBeenLastCalledWith('MetricDetail', { metricType: 'HRV', records, range: '30d' });
  fireEvent.press(screen.getByTestId('usual-tile-RECOVERY'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Recovery', { date: '2026-10-06' });
  fireEvent.press(screen.getByTestId('usual-patterns'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Patterns');
  fireEvent.press(screen.getByTestId('all-trends'));
  expect(mockNavigate).toHaveBeenLastCalledWith('Trends');
});

it('a Recovery tile without a score opens the Recovery page on today', () => {
  render(<UsualTiles records={[]} recovery={[]} today="2026-10-07" />);
  fireEvent.press(screen.getByTestId('usual-tile-RECOVERY'));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('Recovery', undefined);
});

it('lists the four as rows in one card (A-2), without sparklines', () => {
  render(<UsualTiles records={[]} recovery={[]} today="2026-10-07" />);
  const list = screen.getByTestId('usual-rows');
  for (const type of ['RESTING_HR', 'SLEEP', 'HRV', 'RECOVERY']) expect(screen.getByTestId(`usual-tile-${type}`)).toBeTruthy();
  expect(String(screen.getByTestId('usual-tile-SLEEP').props.className)).toContain('flex-row');
  expect(list).toBeTruthy();
  expect(screen.UNSAFE_queryAllByType(require('../../src/components/ui/trend-line').TrendLine)).toHaveLength(0);
});

// Sleep has its own page (spec §5.1): the tile opens the night of its latest reading, else the default night.
it('the Sleep tile opens the Sleep page on its latest night', () => {
  const records = [{ id: 's', metricType: 'SLEEP' as const, value: 432, recordedAt: '2026-10-06T00:00:00.000Z' }];
  render(<UsualTiles records={records} recovery={[]} today="2026-10-07" />);
  fireEvent.press(screen.getByTestId('usual-tile-SLEEP'));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('Sleep', { date: '2026-10-06' });
});

it('a Sleep tile without a reading opens the Sleep page on its default night', () => {
  render(<UsualTiles records={[]} recovery={[]} today="2026-10-07" />);
  fireEvent.press(screen.getByTestId('usual-tile-SLEEP'));
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  expect(mockNavigate).toHaveBeenCalledWith('Sleep', undefined);
});

it('keeps each row to one line: label and change, a tabular value that shrinks to fit', () => {
  const records = [{ id: 'h', metricType: 'HRV' as const, value: 61, recordedAt: '2026-10-06T00:00:00.000Z' }];
  render(<UsualTiles records={records} recovery={[]} today="2026-10-07" />);
  expect(screen.getByText('HRV').props.numberOfLines).toBe(1);
  expect(screen.getByText('No readings from the 30 days before').props.numberOfLines).toBe(1);
  const value = screen.getByText('61.0 ms');
  expect(StyleSheet.flatten(value.props.style).fontVariant).toEqual(['tabular-nums']);
  expect(value.props.numberOfLines).toBe(1);
  expect(value.props.adjustsFontSizeToFit).toBe(true);
});
