import React from 'react';
import { StyleSheet } from 'react-native';
import { act, render, fireEvent, waitFor } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { HIDDEN_OK, characterLabel as label, withCharacter } from '../../jest-mocks/characterContext';
import { answer, doneEvent, openTurn, scriptTurn } from '../../jest-mocks/coachStreamFake';
import { CoachScreen } from '../../src/screens/CoachScreen';
import { fetchCoachStatus, fetchLatestConversation, fetchTodaySummary, type CoachStatusDTO } from '../../src/api/coach';
import { streamCoachMessage } from '../../src/api/coachStream';
import type { ScoreBand } from '../../src/lib/scoreInsights';

jest.mock('../../src/api/coach', () => ({
  ...jest.requireActual('../../src/api/coach'),
  fetchCoachStatus: jest.fn(),
  fetchLatestConversation: jest.fn(),
  fetchTodaySummary: jest.fn(),
}));
jest.mock('../../src/api/coachStream', () => ({
  ...jest.requireActual('../../src/api/coachStream'),
  streamCoachMessage: jest.fn(),
}));
jest.mock('../../src/lib/useKeyboardVisible', () => ({ useKeyboardVisible: jest.fn(() => false) }));
jest.mock('@react-navigation/native', () => ({
  ...jest.requireActual('@react-navigation/native'),
  useNavigation: () => ({ navigate: jest.fn(), setParams: jest.fn(), addListener: () => () => undefined }),
  useRoute: () => ({ params: undefined }),
}));

const stream = streamCoachMessage as jest.Mock;

const status: CoachStatusDTO = {
  enabled: true,
  consented: true,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'kit',
  personaChosen: true,
  personas: [],
};

const SAFETY = { type: 'safety' as const, text: 'Support is available.', resources: ['Call 988'] };

// The screen as the app mounts it: under CharacterProvider, inside a navigator
// whose focus the test controls.
function renderCoach({ recoveryBand = null, focused = true }: { recoveryBand?: ScoreBand | null; focused?: boolean } = {}) {
  const navigation = { isFocused: () => focused, addListener: () => () => undefined };
  return render(
    <NavigationContext.Provider value={navigation as never}>
      {withCharacter(<CoachScreen />, { characterId: 'kit', status, recoveryBand })}
    </NavigationContext.Provider>,
  );
}

async function tapSuggestion(utils: ReturnType<typeof render>) {
  await act(async () => {
    fireEvent.press(utils.getByTestId('coach-suggestion-0'));
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  stream.mockReset();
  (fetchCoachStatus as jest.Mock).mockResolvedValue(status);
  (fetchLatestConversation as jest.Mock).mockResolvedValue({ conversationId: null, messages: [] });
  (fetchTodaySummary as jest.Mock).mockResolvedValue({ date: '2026-09-30', hasData: false, sentence: null, bars: [] });
});

describe('CoachScreen: character', () => {
  it("shows the user's character, idle and animating, in the header and on the empty chat", async () => {
    const utils = renderCoach();
    await utils.findByTestId('coach-empty');

    expect(label(utils, 'coach-header-character')).toBe('character:kit:idle:36:playing:none');
    expect(label(utils, 'coach-hero-character')).toBe('character:kit:idle:64:playing:none');
  });

  it('keeps the header coach in a fixed 54 pt slot, so the title does not move between moods', async () => {
    const live = openTurn(stream);
    const utils = renderCoach();
    await utils.findByTestId('coach-input');
    const slotWidth = () => (StyleSheet.flatten(utils.getByTestId('coach-header-slot').props.style) as { width: number }).width;
    const coachWidth = () => (StyleSheet.flatten(utils.getByTestId('coach-header-character', HIDDEN_OK).props.style) as { width: number }).width;
    const seen: Array<[string, number, number]> = [];
    const record = () => seen.push([label(utils, 'coach-header-character').split(':')[2]!, slotWidth(), coachWidth()]);

    record();
    fireEvent.changeText(utils.getByTestId('coach-input'), 'How did I sleep?');
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });
    record();
    await live.finish({ type: 'text', sentence: 'Well.' }, doneEvent());
    record();

    expect(seen.map(([mood]) => mood)).toEqual(['idle', 'thinking', 'answering']);
    for (const [, slot, coach] of seen) {
      expect(slot).toBe(54);
      expect(coach).toBeLessThanOrEqual(54);
    }
  });

  it('rests on a poor recovery day', async () => {
    const utils = renderCoach({ recoveryBand: 'scorePoor' });
    await utils.findByTestId('coach-empty');

    expect(label(utils, 'coach-hero-character')).toBe('character:kit:resting:64:playing:none');
  });

  it('thinks from the question until the answer is done, with the 36 pt thinking coach and its attachment on the pending row', async () => {
    const live = openTurn(stream);
    const utils = renderCoach();
    await utils.findByTestId('coach-input');

    fireEvent.changeText(utils.getByTestId('coach-input'), 'How did I sleep?');
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });

    await utils.findByTestId('coach-thinking');
    expect(label(utils, 'coach-header-character')).toBe('character:kit:thinking:36:playing:bulb');
    expect(label(utils, 'coach-thinking')).toBe('character:kit:thinking:36:playing:bulb');

    await live.emit({ type: 'text', sentence: 'Well.' });
    expect(label(utils, 'coach-header-character')).toBe('character:kit:thinking:36:playing:bulb');
    await live.finish(doneEvent());
    expect(label(utils, 'coach-header-character')).toBe('character:kit:answering:36:playing:bulb');
  });

  it('answers right after an answer is done, then goes back to idle', async () => {
    jest.useFakeTimers();
    try {
      scriptTurn(stream, answer('You slept well.'));
      const utils = renderCoach();
      await utils.findByTestId('coach-input');

      await tapSuggestion(utils);
      await utils.findByText('You slept well.');

      expect(label(utils, 'coach-header-character')).toBe('character:kit:answering:36:playing:bulb');
      act(() => jest.advanceTimersByTime(2500));
      expect(label(utils, 'coach-header-character')).toBe('character:kit:idle:36:playing:none');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not celebrate a crisis-safety reply', async () => {
    scriptTurn(stream, [SAFETY, doneEvent()]);
    const utils = renderCoach();
    await utils.findByTestId('coach-input');

    await tapSuggestion(utils);
    await utils.findByTestId('coach-safety-resources');

    expect(label(utils, 'coach-header-character')).toBe('character:kit:idle:36:playing:none');
  });

  it('does not answer after a failed send, or after a stop', async () => {
    scriptTurn(stream, [], new Error('offline'));
    const utils = renderCoach();
    await utils.findByTestId('coach-input');

    await tapSuggestion(utils);
    await utils.findByTestId('coach-error');
    expect(label(utils, 'coach-header-character')).toBe('character:kit:idle:36:playing:none');

    const live = openTurn(stream);
    fireEvent.changeText(utils.getByTestId('coach-input'), 'Again');
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });
    await live.emit({ type: 'text', sentence: 'Partly.' });
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });
    await waitFor(() => expect(utils.getByText('Stopped')).toBeTruthy());
    expect(label(utils, 'coach-header-character')).toBe('character:kit:idle:36:playing:none');
  });

  it('leaves the character idle for a safety reply that lands right after a normal one', async () => {
    scriptTurn(stream, answer('You slept well.'));
    scriptTurn(stream, [SAFETY, doneEvent()]);
    const utils = renderCoach();
    await utils.findByTestId('coach-input');

    await tapSuggestion(utils);
    await utils.findByText('You slept well.');
    expect(label(utils, 'coach-header-character')).toBe('character:kit:answering:36:playing:bulb');

    fireEvent.changeText(utils.getByTestId('coach-input'), 'I feel awful');
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });
    await utils.findByTestId('coach-safety-resources');

    expect(label(utils, 'coach-header-character')).toBe('character:kit:idle:36:playing:none');
  });

  it('leaves the character idle for a failed send right after a normal answer', async () => {
    scriptTurn(stream, answer('You slept well.'));
    scriptTurn(stream, [], new Error('offline'));
    const utils = renderCoach();
    await utils.findByTestId('coach-input');

    await tapSuggestion(utils);
    await utils.findByText('You slept well.');
    expect(label(utils, 'coach-header-character')).toBe('character:kit:answering:36:playing:bulb');

    fireEvent.changeText(utils.getByTestId('coach-input'), 'And today?');
    await act(async () => {
      fireEvent.press(utils.getByTestId('coach-send-button'));
    });
    await utils.findByTestId('coach-error');

    expect(label(utils, 'coach-header-character')).toBe('character:kit:idle:36:playing:none');
  });

  it('holds the characters still while the Coach tab is not focused, even when an answer lands', async () => {
    scriptTurn(stream, answer('Done.'));
    const utils = renderCoach({ focused: false });
    await utils.findByTestId('coach-empty');
    expect(label(utils, 'coach-hero-character')).toBe('character:kit:idle:64:paused:none');

    await tapSuggestion(utils);
    await utils.findByText('Done.');

    expect(label(utils, 'coach-header-character')).toBe('character:kit:answering:36:paused:bulb');
  });

  it('stops the stream and does not update after unmount', async () => {
    const live = openTurn(stream);
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    const utils = renderCoach();
    await utils.findByTestId('coach-input');
    await tapSuggestion(utils);
    await utils.findByTestId('coach-thinking');

    utils.unmount();
    await act(async () => {});

    expect(live.signal?.aborted).toBe(true);
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('shows Mochi when rendered without a CharacterProvider', async () => {
    const utils = render(<CoachScreen />);
    await utils.findByTestId('coach-empty');

    await waitFor(() => expect(label(utils, 'coach-header-character')).toBe('character:mochi:idle:36:playing:none'));
  });
});
