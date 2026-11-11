import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { fetchRecaps } from '../../src/api/recaps';
import { RecapsScreen } from '../../src/screens/RecapsScreen';

jest.mock('../../src/api/recaps');
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const list = fetchRecaps as jest.Mock;
const summary = (id: string, kind: 'WEEK' | 'MONTH', periodStart: string, over: Record<string, unknown> = {}) => ({
  id, kind, periodStart, periodEnd: periodStart, line: `Line ${id}`, personaId: 'mochi', builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, ...over,
});

beforeEach(() => jest.clearAllMocks());

it('shows the latest month, the latest week, older recaps and Year in pixels', async () => {
  list.mockResolvedValue([summary('w2', 'WEEK', '2026-09-28'), summary('m1', 'MONTH', '2026-09-01', { openedAt: '2026-10-01T10:00:00.000Z' }), summary('w1', 'WEEK', '2026-09-21')]);
  render(<RecapsScreen />);
  expect(await screen.findByTestId('recaps-latest-month')).toHaveTextContent(/September 2026/);
  expect(screen.getByTestId('recaps-latest-week')).toHaveTextContent(/Week of Sep 28/);
  expect(screen.getByTestId('recaps-older-w1')).toHaveTextContent(/Week of Sep 21/);
  expect(screen.getByTestId('recaps-new-w2')).toBeTruthy();
  expect(screen.queryByTestId('recaps-new-m1')).toBeNull();
  expect(list).toHaveBeenCalledWith({ limit: 30 });
  fireEvent.press(screen.getByTestId('recaps-latest-week'));
  expect(mockNavigate).toHaveBeenCalledWith('Recap', { id: 'w2' });
  fireEvent.press(screen.getByTestId('recaps-year'));
  expect(mockNavigate).toHaveBeenCalledWith('YearInPixels');
});

it('explains an empty list and still offers Year in pixels', async () => {
  list.mockResolvedValue([]);
  render(<RecapsScreen />);
  expect(await screen.findByTestId('recaps-empty')).toHaveTextContent('Your first recap arrives after your first full week of sleep.');
  expect(screen.getByTestId('recaps-year')).toBeTruthy();
});

it('retries after a failure', async () => {
  list.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce([summary('w2', 'WEEK', '2026-09-28')]);
  render(<RecapsScreen />);
  fireEvent.press(await screen.findByTestId('recaps-retry'));
  expect(await screen.findByTestId('recaps-latest-week')).toBeTruthy();
});
