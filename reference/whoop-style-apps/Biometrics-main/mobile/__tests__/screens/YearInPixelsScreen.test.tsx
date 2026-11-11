import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { fetchSleep, fetchSleepGoal } from '../../src/api/sleep';
import { YearInPixelsScreen } from '../../src/screens/YearInPixelsScreen';

jest.mock('../../src/api/sleep');
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const night = (date: string, minutesAsleep: number) => ({ date, minutesAsleep, minutesInBed: null, bedtime: null, wakeTime: null, sleepScore: null, minutesAwake: null, stageMinutes: null, hasStages: false });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers({ now: new Date(2026, 9, 5, 12, 0, 0) }); // 5 Oct 2026, local
  (fetchSleep as jest.Mock).mockResolvedValue({ nights: [night('2026-01-02', 500), night('2026-03-03', 480), night('2026-04-04', 400)], earliestDate: '2026-01-02', stagesBackfillPending: false });
  (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
});
afterEach(() => jest.useRealTimers());

it('draws this calendar year against the current goal and says so', async () => {
  render(withCharacter(<YearInPixelsScreen />));
  expect(await screen.findByTestId('year-pixels-count')).toHaveTextContent('2 nights on goal');
  expect(screen.getByTestId('year-pixels-caption')).toHaveTextContent('on your current goal of 8h');
  expect(fetchSleep).toHaveBeenCalledWith('2026-01-01', '2026-12-31');
  fireEvent.press(screen.getByTestId('year-share'));
  expect(mockNavigate).toHaveBeenCalledWith('RecapBuilder', { format: 'year' });
});

it('offers a retry after a failure', async () => {
  (fetchSleep as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  render(withCharacter(<YearInPixelsScreen />));
  fireEvent.press(await screen.findByTestId('year-retry'));
  expect(await screen.findByTestId('year-pixels-count')).toBeTruthy();
});
