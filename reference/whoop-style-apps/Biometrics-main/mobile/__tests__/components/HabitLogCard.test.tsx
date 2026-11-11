import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { HabitLogCard } from '../../src/components/habit-log-card';
import { createCheckIn, fetchHabitConfig, fetchHabitStatus, logHabit } from '../../src/api/habits';
import { fetchAchievements } from '../../src/api/achievements';
import { resetAchievements } from '../../src/lib/achievementsStore';

jest.mock('../../src/api/habits');
jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => require('../../jest-mocks/timezoneSettled'));

const habitTypes = [
  { type: 'ALCOHOL', label: 'Alcohol', unit: 'drinks', exposureThreshold: 2, builtIn: true },
  { type: 'CAFFEINE', label: 'Caffeine', unit: 'cups', exposureThreshold: 3, builtIn: true },
  { type: 'WORKOUT', label: 'Workout', unit: 'minutes', exposureThreshold: 20, builtIn: true },
];

// Today is 2026-09-20; the 14-day window runs 2026-09-07 .. 2026-09-20.
function makeStatus(overrides: { checkedInToday?: boolean; checkedIn?: string[] } = {}) {
  const days = [];
  for (let d = 7; d <= 20; d++) {
    const habitDay = `2026-09-${String(d).padStart(2, '0')}`;
    const checkedIn = habitDay === '2026-09-20' ? !!overrides.checkedInToday : (overrides.checkedIn ?? []).includes(habitDay);
    days.push({ habitDay, checkedIn, observed: { ALCOHOL: checkedIn, CAFFEINE: checkedIn, WORKOUT: checkedIn } });
  }
  return { today: '2026-09-20', days };
}

function loadWith(status = makeStatus()) {
  (fetchHabitConfig as jest.Mock).mockResolvedValue(habitTypes);
  (fetchHabitStatus as jest.Mock).mockResolvedValue(status);
}

function logResponse(value: number, habitType = 'ALCOHOL') {
  return { id: 'l1', habitType, value, unit: 'drinks', loggedAt: '2026-09-20T20:00:00.000Z', habitDay: '2026-09-20', note: null };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('HabitLogCard', () => {
  it('shows a loading state while the config and status are fetched', () => {
    (fetchHabitConfig as jest.Mock).mockReturnValue(new Promise(() => {}));
    (fetchHabitStatus as jest.Mock).mockReturnValue(new Promise(() => {}));

    const { getByTestId } = render(<HabitLogCard />);

    expect(getByTestId('habit-log-loading')).toBeTruthy();
  });

  it('asks "Anything to log today?" with the habit types, a Nothing today button and a 7-day strip', async () => {
    loadWith();

    const { getByText, getByTestId, getAllByTestId } = render(<HabitLogCard />);

    await waitFor(() => expect(getByText('Anything to log today?')).toBeTruthy());
    expect(fetchHabitStatus).toHaveBeenCalledWith(14);
    expect(getByTestId('habit-type-ALCOHOL')).toBeTruthy();
    expect(getByTestId('habit-type-CAFFEINE')).toBeTruthy();
    expect(getByTestId('habit-type-WORKOUT')).toBeTruthy();
    expect(getByTestId('nothing-today-button')).toBeTruthy();
    expect(getAllByTestId(/^checkin-day-/)).toHaveLength(7);
  });

  it('logs a quantity for the selected habit in that habit\'s unit', async () => {
    loadWith();
    (logHabit as jest.Mock).mockResolvedValue(logResponse(3));

    const { getByTestId, findByText, getByText } = render(<HabitLogCard />);
    await findByText('Anything to log today?');

    fireEvent.changeText(getByTestId('habit-value-input'), '3');
    expect(getByText('Log 3 drinks')).toBeTruthy();
    fireEvent.press(getByTestId('habit-log-submit'));

    await waitFor(() => expect(logHabit).toHaveBeenCalledWith({ habitType: 'ALCOHOL', value: 3, unit: 'drinks' }));
    expect(await findByText('Logged Alcohol: 3 drinks')).toBeTruthy();
    // The field clears for the next entry.
    expect(getByTestId('habit-value-input').props.value).toBe('');
  });

  it('logs "none" when 0 is entered, sending a real value of 0', async () => {
    loadWith();
    (logHabit as jest.Mock).mockResolvedValue(logResponse(0));

    const { getByTestId, findByText, getByText } = render(<HabitLogCard />);
    await findByText('Anything to log today?');

    fireEvent.changeText(getByTestId('habit-value-input'), '0');
    expect(getByText('Log none')).toBeTruthy();
    fireEvent.press(getByTestId('habit-log-submit'));

    await waitFor(() => expect(logHabit).toHaveBeenCalledWith({ habitType: 'ALCOHOL', value: 0, unit: 'drinks' }));
    expect(await findByText('Logged Alcohol: none')).toBeTruthy();
  });

  it('does not log until a valid non-negative number is entered', async () => {
    loadWith();

    const { getByTestId, findByText } = render(<HabitLogCard />);
    await findByText('Anything to log today?');

    fireEvent.press(getByTestId('habit-log-submit'));
    fireEvent.changeText(getByTestId('habit-value-input'), '-2');
    fireEvent.press(getByTestId('habit-log-submit'));
    fireEvent.changeText(getByTestId('habit-value-input'), 'abc');
    fireEvent.press(getByTestId('habit-log-submit'));

    expect(logHabit).not.toHaveBeenCalled();
  });

  it('steps the value with the stepper and switches unit and step size with the habit type', async () => {
    loadWith();

    const { getByTestId, findByText, getByText } = render(<HabitLogCard />);
    await findByText('Anything to log today?');

    fireEvent.press(getByTestId('habit-increment'));
    fireEvent.press(getByTestId('habit-increment'));
    expect(getByTestId('habit-value-input').props.value).toBe('2');
    fireEvent.press(getByTestId('habit-decrement'));
    expect(getByTestId('habit-value-input').props.value).toBe('1');

    // Switching habit clears the entry (1 drink is not 1 minute); workout is
    // measured in minutes and steps by 5.
    fireEvent.press(getByTestId('habit-type-WORKOUT'));
    expect(getByTestId('habit-value-input').props.value).toBe('');
    expect(getByText('minutes')).toBeTruthy();
    fireEvent.press(getByTestId('habit-increment'));
    expect(getByTestId('habit-value-input').props.value).toBe('5');
  });

  it('shows an inline error when logging fails, keeping the entered value to retry', async () => {
    loadWith();
    (logHabit as jest.Mock).mockRejectedValue(new Error('boom'));

    const { getByTestId, findByText } = render(<HabitLogCard />);
    await findByText('Anything to log today?');

    fireEvent.changeText(getByTestId('habit-value-input'), '2');
    fireEvent.press(getByTestId('habit-log-submit'));

    expect(await findByText(/Could not save that/i)).toBeTruthy();
    expect(getByTestId('habit-value-input').props.value).toBe('2');
  });

  it('creates today\'s check-in with one tap on "Nothing today", then shows the checked-in state', async () => {
    loadWith();
    (createCheckIn as jest.Mock).mockResolvedValue({ habitDay: '2026-09-20' });

    const { getByTestId, queryByTestId, findByTestId } = render(<HabitLogCard />);
    await findByTestId('nothing-today-button');

    fireEvent.press(getByTestId('nothing-today-button'));

    await waitFor(() => expect(createCheckIn).toHaveBeenCalledTimes(1));
    // No habitDay: the server uses today's habit day.
    expect((createCheckIn as jest.Mock).mock.calls[0]).toEqual([]);
    expect(await findByTestId('checked-in-today')).toBeTruthy();
    expect(queryByTestId('nothing-today-button')).toBeNull();
  });

  it('shows the already-checked-in state, without a Nothing today button, when today is checked in', async () => {
    loadWith(makeStatus({ checkedInToday: true }));

    const { findByTestId, queryByTestId, getByText } = render(<HabitLogCard />);

    expect(await findByTestId('checked-in-today')).toBeTruthy();
    expect(getByText(/checked in for today/i)).toBeTruthy();
    expect(queryByTestId('nothing-today-button')).toBeNull();
  });

  it('shows an inline error when the check-in fails and keeps the button to retry', async () => {
    loadWith();
    (createCheckIn as jest.Mock).mockRejectedValue(new Error('boom'));

    const { getByTestId, findByText } = render(<HabitLogCard />);
    await findByText('Anything to log today?');

    fireEvent.press(getByTestId('nothing-today-button'));

    expect(await findByText(/Could not check in/i)).toBeTruthy();
    expect(getByTestId('nothing-today-button')).toBeTruthy();
  });

  it('lets a past day be checked in retroactively from the strip', async () => {
    loadWith(makeStatus({ checkedIn: ['2026-09-18'] }));
    (createCheckIn as jest.Mock).mockResolvedValue({ habitDay: '2026-09-15' });

    const { getByTestId, findByTestId } = render(<HabitLogCard />);
    const cell = await findByTestId('checkin-day-2026-09-15');

    expect(cell.props.accessibilityLabel).toMatch(/tap to check in/i);
    fireEvent.press(cell);

    await waitFor(() => expect(createCheckIn).toHaveBeenCalledWith('2026-09-15'));
    await waitFor(() => expect(getByTestId('checkin-day-2026-09-15').props.accessibilityLabel).toMatch(/checked in$/i));
  });

  it('marks already-checked-in past days as done and does not re-submit them', async () => {
    loadWith(makeStatus({ checkedIn: ['2026-09-18'] }));

    const { getByTestId, findByTestId } = render(<HabitLogCard />);
    const done = await findByTestId('checkin-day-2026-09-18');

    expect(done.props.accessibilityLabel).toMatch(/checked in$/i);
    fireEvent.press(getByTestId('checkin-day-2026-09-18'));
    expect(createCheckIn).not.toHaveBeenCalled();
  });

  it('shows an error with a retry when loading fails, and recovers on retry', async () => {
    (fetchHabitConfig as jest.Mock).mockRejectedValueOnce(new Error('boom'));
    (fetchHabitStatus as jest.Mock).mockRejectedValueOnce(new Error('boom'));

    const { findByText, getByTestId } = render(<HabitLogCard />);
    expect(await findByText(/Habits are unavailable right now/i)).toBeTruthy();

    loadWith();
    fireEvent.press(getByTestId('habit-log-retry'));

    expect(await findByText('Anything to log today?')).toBeTruthy();
  });

  it('re-checks badges right after a check-in is saved, so a celebration can follow', async () => {
    resetAchievements();
    loadWith();
    (createCheckIn as jest.Mock).mockResolvedValue({ habitDay: '2026-09-20' });
    (fetchAchievements as jest.Mock).mockResolvedValue(null);
    const { getByTestId, findByTestId } = render(<HabitLogCard />);
    await findByTestId('nothing-today-button');
    expect(fetchAchievements).not.toHaveBeenCalled();
    fireEvent.press(getByTestId('nothing-today-button'));
    await waitFor(() => expect(fetchAchievements).toHaveBeenCalledTimes(1));
  });
});
