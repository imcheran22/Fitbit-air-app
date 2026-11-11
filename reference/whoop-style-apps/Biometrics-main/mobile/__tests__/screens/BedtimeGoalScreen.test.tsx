import React from 'react';
import { Linking, StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { withCharacter } from '../../jest-mocks/characterContext';
import { BedtimeGoalScreen } from '../../src/screens/BedtimeGoalScreen';
import { fetchSleepGoal, saveSleepGoal } from '../../src/api/sleep';
import { disableWindDown, enableWindDown, readWindDown, setWindDownLead } from '../../src/lib/windDown';
import { COLORS } from '../../src/theme';

jest.mock('../../src/api/sleep');
jest.mock('../../src/lib/windDown');

const SAVED = { sleepGoalMinutes: 480, bedtimeGoal: '23:00', wakeGoal: '07:00' };
const OFF = { enabled: false, leadMinutes: 30, bedtimeGoal: null, coachName: 'Kit', notificationId: null };
const ON = { enabled: true, leadMinutes: 30, bedtimeGoal: '23:00', coachName: 'Kit', notificationId: 'n1' };

beforeEach(() => {
  jest.clearAllMocks();
  (fetchSleepGoal as jest.Mock).mockResolvedValue(SAVED);
  (saveSleepGoal as jest.Mock).mockImplementation(async (patch) => ({ ...SAVED, ...patch }));
  (readWindDown as jest.Mock).mockResolvedValue(OFF);
  (enableWindDown as jest.Mock).mockResolvedValue('scheduled');
  (disableWindDown as jest.Mock).mockResolvedValue(undefined);
  (setWindDownLead as jest.Mock).mockResolvedValue(undefined);
});

afterEach(async () => {
  await act(async () => {});
});

function renderScreen() {
  return render(withCharacter(<BedtimeGoalScreen />, { characterId: 'kit' }));
}

async function loaded() {
  renderScreen();
  await screen.findByTestId('goal-bed-value');
}

const value = (id: string) => screen.getByTestId(id);
const press = (id: string, times = 1) => {
  for (let i = 0; i < times; i++) fireEvent.press(screen.getByTestId(id));
};

describe('BedtimeGoalScreen: load', () => {
  it('shows the saved goal', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 450, bedtimeGoal: '22:30', wakeGoal: '06:45' });
    await loaded();

    expect(value('goal-bed-value')).toHaveTextContent('10:30 pm');
    expect(value('goal-wake-value')).toHaveTextContent('6:45 am');
    expect(value('goal-sleep-value')).toHaveTextContent('7h 30m');
  });

  it('shows defaults when unset, without saving them', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
    await loaded();

    expect(value('goal-bed-value')).toHaveTextContent('11:00 pm');
    expect(value('goal-wake-value')).toHaveTextContent('7:00 am');
    expect(saveSleepGoal).not.toHaveBeenCalled();
  });

  it('offers a retry when the goal cannot be loaded', async () => {
    (fetchSleepGoal as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    renderScreen();

    fireEvent.press(await screen.findByTestId('goal-load-retry'));

    expect(await screen.findByTestId('goal-bed-value')).toBeTruthy();
    expect(fetchSleepGoal).toHaveBeenCalledTimes(2);
  });
});

describe('BedtimeGoalScreen: steppers', () => {
  it('moves times in 15-minute steps and wraps across midnight', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ ...SAVED, bedtimeGoal: '23:45' });
    await loaded();

    press('goal-bed-plus');
    expect(value('goal-bed-value')).toHaveTextContent('12:00 am');
    press('goal-bed-minus', 2);
    expect(value('goal-bed-value')).toHaveTextContent('11:30 pm');
    press('goal-wake-minus');
    expect(value('goal-wake-value')).toHaveTextContent('6:45 am');
  });

  it('keeps the sleep goal within 4h to 12h', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ ...SAVED, sleepGoalMinutes: 255 });
    await loaded();

    press('goal-sleep-minus', 3);
    expect(value('goal-sleep-value')).toHaveTextContent('4h');
    press('goal-sleep-plus', 40);
    expect(value('goal-sleep-value')).toHaveTextContent('12h');
  });
});

describe('BedtimeGoalScreen: window line', () => {
  it('turns orange when the window is shorter than the goal', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ ...SAVED, bedtimeGoal: '23:30' });
    await loaded();

    const line = value('goal-window-line');
    expect(line).toHaveTextContent("That's 7h 30m in bed. Your goal is 8h asleep.");
    expect([COLORS.light.scoreFair, COLORS.dark.scoreFair]).toContain(StyleSheet.flatten(line.props.style)?.color);
  });

  it('stays in the default colour when the window fits the goal', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ ...SAVED, bedtimeGoal: '22:30' });
    await loaded();

    const line = value('goal-window-line');
    expect(line).toHaveTextContent("That's 8h 30m in bed. Your goal is 8h asleep.");
    expect([COLORS.light.scoreFair, COLORS.dark.scoreFair]).not.toContain(StyleSheet.flatten(line.props.style)?.color);
  });

  it('never saves a bedtime equal to the wake time', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ ...SAVED, bedtimeGoal: '06:45' });
    await loaded();

    press('goal-bed-plus');
    expect(value('goal-window-line')).toHaveTextContent("Bedtime and wake time can't be the same.");
    expect(value('goal-save')).toBeDisabled();
    press('goal-save');
    expect(saveSleepGoal).not.toHaveBeenCalled();
  });
});

describe('BedtimeGoalScreen: save', () => {
  it('PUTs only the changed fields', async () => {
    await loaded();
    expect(value('goal-save')).toBeDisabled();

    press('goal-bed-plus');
    press('goal-sleep-minus');
    await act(async () => press('goal-save'));

    expect(saveSleepGoal).toHaveBeenCalledWith({ bedtimeGoal: '23:15', sleepGoalMinutes: 465 });
    expect(screen.queryByTestId('goal-error')).toBeNull();
  });

  it('keeps Save off for an unset goal with no edits', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
    await loaded();

    expect(value('goal-save')).toBeDisabled();
    press('goal-save');
    expect(saveSleepGoal).not.toHaveBeenCalled();
  });

  it('never writes the shown default times when only the sleep goal changed', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
    await loaded();

    press('goal-sleep-plus');
    await act(async () => press('goal-save'));

    expect(saveSleepGoal).toHaveBeenCalledWith({ sleepGoalMinutes: 495 });
  });

  it('sends both times once a time stepper is used on an unset goal', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
    await loaded();

    press('goal-bed-plus');
    await act(async () => press('goal-save'));

    expect(saveSleepGoal).toHaveBeenCalledWith({ bedtimeGoal: '23:15', wakeGoal: '07:00' });
  });

  it('goes back to the saved goal and says so when saving fails', async () => {
    (saveSleepGoal as jest.Mock).mockRejectedValueOnce(new Error('offline'));
    await loaded();

    press('goal-wake-plus');
    await act(async () => press('goal-save'));

    expect(value('goal-error')).toHaveTextContent("Your goal couldn't be saved. Check your connection and try again.");
    expect(value('goal-wake-value')).toHaveTextContent('7:00 am');
  });

  it('reschedules the reminder with the new bedtime and the current coach while it is on', async () => {
    (readWindDown as jest.Mock).mockResolvedValue(ON);
    await loaded();
    await waitFor(() => expect(value('winddown-switch').props.value).toBe(true));

    press('goal-bed-minus');
    await act(async () => press('goal-save'));

    expect(enableWindDown).toHaveBeenCalledWith({ bedtimeGoal: '22:45', leadMinutes: 30, coachName: 'Kit' });
  });

  it('leaves the reminder alone on save while it is off', async () => {
    await loaded();

    press('goal-bed-minus');
    await act(async () => press('goal-save'));

    expect(enableWindDown).not.toHaveBeenCalled();
  });
});

describe('BedtimeGoalScreen: wind-down reminder', () => {
  it('is disabled with "Set a bedtime first" when no bedtime is saved', async () => {
    (fetchSleepGoal as jest.Mock).mockResolvedValue({ sleepGoalMinutes: 480, bedtimeGoal: null, wakeGoal: null });
    await loaded();

    expect(value('winddown-switch')).toBeDisabled();
    expect(screen.getByText('Set a bedtime first')).toBeTruthy();
  });

  it('turns on with the saved bedtime, the lead and the coach name', async () => {
    await loaded();

    await act(async () => fireEvent(value('winddown-switch'), 'valueChange', true));

    expect(enableWindDown).toHaveBeenCalledWith({ bedtimeGoal: '23:00', leadMinutes: 30, coachName: 'Kit' });
    expect(value('winddown-switch').props.value).toBe(true);
  });

  it('goes back off and points to Settings when notifications are denied', async () => {
    (enableWindDown as jest.Mock).mockResolvedValue('denied');
    const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined);
    await loaded();

    await act(async () => fireEvent(value('winddown-switch'), 'valueChange', true));

    expect(value('winddown-switch').props.value).toBe(false);
    expect(value('winddown-denied')).toHaveTextContent('Notifications are off for Biometrics. Turn them on in Settings.');
    fireEvent.press(screen.getByTestId('winddown-settings'));
    expect(openSettings).toHaveBeenCalled();
  });

  it('goes back off with a short error when scheduling throws', async () => {
    (enableWindDown as jest.Mock).mockRejectedValue(new Error('native'));
    await loaded();

    await act(async () => fireEvent(value('winddown-switch'), 'valueChange', true));

    expect(value('winddown-switch').props.value).toBe(false);
    expect(value('winddown-error')).toHaveTextContent("Couldn't set the reminder. Try again.");
    expect(screen.queryByTestId('winddown-denied')).toBeNull();
  });

  it('turns off', async () => {
    (readWindDown as jest.Mock).mockResolvedValue(ON);
    await loaded();
    await waitFor(() => expect(value('winddown-switch').props.value).toBe(true));

    await act(async () => fireEvent(value('winddown-switch'), 'valueChange', false));

    expect(disableWindDown).toHaveBeenCalled();
    expect(value('winddown-switch').props.value).toBe(false);
  });

  it('holds the switch while a save is in flight, and Save while the switch is', async () => {
    let finishSave: (g: unknown) => void = () => {};
    (saveSleepGoal as jest.Mock).mockReturnValue(new Promise((r) => (finishSave = r)));
    let finishEnable: (r: 'scheduled') => void = () => {};
    await loaded();

    press('goal-bed-plus');
    await act(async () => press('goal-save'));
    expect(value('winddown-switch')).toBeDisabled();
    await act(async () => finishSave({ ...SAVED, bedtimeGoal: '23:15' }));
    expect(value('winddown-switch')).not.toBeDisabled();

    (enableWindDown as jest.Mock).mockReturnValue(new Promise((r) => (finishEnable = r)));
    await act(async () => fireEvent(value('winddown-switch'), 'valueChange', true));
    press('goal-wake-plus');
    expect(value('goal-save')).toBeDisabled();
    await act(async () => finishEnable('scheduled'));
    expect(value('goal-save')).not.toBeDisabled();
  });

  it('stores a new lead and updates the preview', async () => {
    await loaded();
    expect(value('winddown-preview')).toHaveTextContent('Kit: Wind-down time. Bed in 30 min.');

    await act(async () => press('winddown-lead-45'));

    expect(setWindDownLead).toHaveBeenCalledWith(45);
    expect(value('winddown-preview')).toHaveTextContent('Kit: Wind-down time. Bed in 45 min.');
  });

  it('refreshes the reminder title on open when the coach has changed', async () => {
    (readWindDown as jest.Mock).mockResolvedValue({ ...ON, coachName: 'Mochi' });
    await loaded();

    await waitFor(() => expect(enableWindDown).toHaveBeenCalledWith({ bedtimeGoal: '23:00', leadMinutes: 30, coachName: 'Kit' }));
    expect(enableWindDown).toHaveBeenCalledTimes(1);
  });

  it('does not reschedule on open when nothing has changed', async () => {
    (readWindDown as jest.Mock).mockResolvedValue(ON);
    await loaded();
    await waitFor(() => expect(value('winddown-switch').props.value).toBe(true));

    expect(enableWindDown).not.toHaveBeenCalled();
  });
});
