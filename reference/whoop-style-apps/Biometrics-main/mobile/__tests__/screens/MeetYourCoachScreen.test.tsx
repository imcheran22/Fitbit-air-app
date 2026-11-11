import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { MeetYourCoachScreen } from '../../src/screens/MeetYourCoachScreen';
import { HIDDEN_OK, characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import type { CharacterContextValue } from '../../src/characters/CharacterContext';
import type { CoachStatusDTO } from '../../src/api/coach';
import { CHARACTER_IDS } from '../../src/components/characters/types';
import { CHARACTERS } from '../../src/components/characters/registry';
import { MOTION } from '../../src/theme';

const mockGoBack = jest.fn();
let mockParams: unknown;
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ goBack: mockGoBack, navigate: jest.fn() }),
  useRoute: () => ({ params: mockParams }),
}));

const mockToastShow = jest.fn();
jest.mock('../../src/components/ui/toast', () => ({ useToast: () => ({ show: mockToastShow }) }));

const status: CoachStatusDTO = {
  enabled: true,
  consented: false,
  consent: { version: 'v1', summary: 's', dataItems: ['x'] },
  personaId: 'mochi',
  personaChosen: false,
  personas: [
    { id: 'mochi', name: 'Mochi', verbosity: 'normal', proactivity: 'threshold-triggered', tagline: 'Server tagline for Mochi.', greeting: 'Server hello from Mochi.' },
    { id: 'boba', name: 'Boba', verbosity: 'terse', proactivity: 'threshold-triggered', tagline: null, greeting: '   ' },
  ],
};

let chooseCharacter: jest.Mock;

function renderMeet(params: { mode?: 'first' | 'switch' } | undefined, overrides: Partial<CharacterContextValue> = {}) {
  mockParams = params;
  return render(withCharacter(<MeetYourCoachScreen />, { chooseCharacter, ...overrides }));
}

// Labels of the characters that are animating.
function playing(utils: ReturnType<typeof render>) {
  return utils
    .getAllByTestId('character-canvas', HIDDEN_OK)
    .map((node) => node.props.accessibilityLabel as string)
    .filter((label) => label.includes(':playing:'));
}

function openSheet(utils: ReturnType<typeof render>, id: string) {
  fireEvent.press(utils.getByTestId(`meet-tile-${id}`));
  return utils.getByTestId('meet-sheet');
}

// The sheet slides out on a timer before it closes; tests that close it run
// on fake timers and advance past the exit animation.
function closeSheet(utils: ReturnType<typeof render>) {
  fireEvent.press(utils.getByTestId('meet-sheet-backdrop'));
  act(() => {
    jest.advanceTimersByTime(MOTION.duration.normal + 10);
  });
  expect(utils.queryByTestId('meet-sheet')).toBeNull();
}

beforeEach(() => {
  jest.clearAllMocks();
  chooseCharacter = jest.fn(() => Promise.resolve());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('MeetYourCoachScreen: grid', () => {
  it('shows all 15 coaches in a grid, only the selected one animating', () => {
    const s = renderMeet({ mode: 'first' });
    for (const id of CHARACTER_IDS) expect(s.getByTestId(`meet-tile-${id}`)).toBeTruthy();
    expect(characterLabel(s, 'meet-tile-mochi')).toMatch(/:playing:/);
    expect(characterLabel(s, 'meet-tile-kit')).toMatch(/:paused:/);
    expect(playing(s)).toEqual(['character:mochi:idle:56:playing:none']);
  });

  it('labels tiles with name and focus for screen readers, as buttons with a selected state', () => {
    const s = renderMeet({ mode: 'first' });
    expect(s.getByTestId('meet-tile-luna').props.accessibilityLabel).toBe('Luna, Sleep');
    for (const id of CHARACTER_IDS) {
      const tile = s.getByTestId(`meet-tile-${id}`);
      expect(tile).toHaveProp('accessibilityRole', 'button');
      expect(tile.props.accessibilityLabel).toBe(`${CHARACTERS[id].name}, ${CHARACTERS[id].focus}`);
      expect(tile.props.accessibilityState).toEqual(expect.objectContaining({ selected: id === 'mochi' }));
    }
  });

  it('does not open the sheet by itself', () => {
    const s = renderMeet({ mode: 'first' });
    expect(s.queryByTestId('meet-sheet')).toBeNull();
    expect(s.queryByTestId('meet-choose')).toBeNull();
  });

  it('a tap selects the tile: it animates and the others pause', () => {
    const s = renderMeet({ mode: 'first' });
    fireEvent.press(s.getByTestId('meet-tile-gloop'));
    expect(s.getByTestId('meet-tile-gloop').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(s.getByTestId('meet-tile-mochi').props.accessibilityState).toEqual(expect.objectContaining({ selected: false }));
    expect(characterLabel(s, 'meet-tile-mochi')).toMatch(/:paused:/);
  });
});

describe('MeetYourCoachScreen: card sheet', () => {
  it('opens the card sheet on tap and chooses that coach', async () => {
    const s = renderMeet({ mode: 'switch' }, { chooseCharacter, characterId: 'mochi' });
    fireEvent.press(s.getByTestId('meet-tile-kit'));
    expect(s.getByTestId('meet-sheet')).toBeTruthy();
    expect(s.getByText('Dry wit. Gently judges your bedtime.')).toBeTruthy();
    expect(s.getByTestId('meet-choose')).toHaveTextContent('Choose Kit');
    await act(async () => fireEvent.press(s.getByTestId('meet-choose')));
    expect(chooseCharacter).toHaveBeenCalledWith('kit');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it("shows the server's tagline and greeting when it has them, else the app's own", () => {
    const s = renderMeet({ mode: 'first' }, { status });
    openSheet(s, 'mochi');
    expect(s.getByTestId('meet-tagline-mochi')).toHaveTextContent('Server tagline for Mochi.');
    expect(s.getByTestId('meet-greeting-mochi')).toHaveTextContent('Server hello from Mochi.');
  });

  it('falls back to the app copy for a null or blank server field, or a coach the server does not list', () => {
    const s = renderMeet({ mode: 'first' }, { status });
    openSheet(s, 'boba');
    expect(s.getByTestId('meet-tagline-boba')).toHaveTextContent(CHARACTERS.boba.tagline);
    expect(s.getByTestId('meet-greeting-boba')).toHaveTextContent(CHARACTERS.boba.greeting);
  });

  it('uses the app copy when the status is unknown', () => {
    const s = renderMeet({ mode: 'first' }, { status: null });
    openSheet(s, 'luna');
    expect(s.getByTestId('meet-greeting-luna')).toHaveTextContent(CHARACTERS.luna.greeting);
  });

  it('pauses the grid while the sheet is open, so only the card animates', () => {
    const s = renderMeet({ mode: 'first' });
    openSheet(s, 'kit');
    expect(playing(s)).toEqual(['character:kit:idle:120:playing:none']);
  });

  it('moves screen-reader focus to the card name when the sheet opens', () => {
    jest.useFakeTimers();
    const focus = jest.spyOn(AccessibilityInfo, 'sendAccessibilityEvent');
    const s = renderMeet({ mode: 'first' });
    openSheet(s, 'kit');
    expect(focus).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(focus).toHaveBeenCalledTimes(1);
    expect(focus).toHaveBeenCalledWith(expect.anything(), 'focus');
    focus.mockRestore();
  });

  it('closes the sheet from its backdrop without saving', () => {
    jest.useFakeTimers();
    const s = renderMeet({ mode: 'first' });
    openSheet(s, 'kit');
    closeSheet(s);
    expect(chooseCharacter).not.toHaveBeenCalled();
    expect(mockGoBack).not.toHaveBeenCalled();
    // The tapped coach stays selected.
    expect(s.getByTestId('meet-tile-kit').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
  });

  it('saves once for a double tap', async () => {
    let resolveSave!: () => void;
    chooseCharacter.mockImplementation(() => new Promise<void>((r) => (resolveSave = r)));
    const s = renderMeet({ mode: 'first' });
    openSheet(s, 'avo');

    fireEvent.press(s.getByTestId('meet-choose'));
    fireEvent.press(s.getByTestId('meet-choose'));
    await act(async () => resolveSave());

    expect(chooseCharacter).toHaveBeenCalledTimes(1);
    expect(chooseCharacter).toHaveBeenCalledWith('avo');
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });
});

describe('MeetYourCoachScreen: first visit', () => {
  it('preselects Mochi and offers Skip, not Close', () => {
    const s = renderMeet({ mode: 'first' }, { characterId: 'kit', personaChosen: false });
    expect(s.getByTestId('meet-tile-mochi').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(s.getByTestId('meet-skip')).toBeTruthy();
    expect(s.queryByTestId('meet-close')).toBeNull();
  });

  it('Skip saves Mochi', async () => {
    const chooseCharacter = jest.fn(async () => {});
    const s = renderMeet({ mode: 'first' }, { chooseCharacter });
    await act(async () => fireEvent.press(s.getByTestId('meet-skip')));
    expect(chooseCharacter).toHaveBeenCalledWith('mochi');
  });

  it('Skip saves Mochi even when another tile is selected and Mochi is already current', async () => {
    jest.useFakeTimers();
    const s = renderMeet({ mode: 'first' }, { characterId: 'mochi', personaChosen: false });
    openSheet(s, 'bao');
    closeSheet(s);

    await act(async () => fireEvent.press(s.getByTestId('meet-skip')));

    expect(mockGoBack).toHaveBeenCalledTimes(1);
    expect(chooseCharacter).toHaveBeenCalledWith('mochi');
    expect(chooseCharacter).toHaveBeenCalledTimes(1);
  });

  it('closes anyway, with a short error, when saving fails', async () => {
    chooseCharacter.mockRejectedValue(new Error('offline'));
    const s = renderMeet({ mode: 'first' }, { personaChosen: false });
    openSheet(s, 'peep');

    fireEvent.press(s.getByTestId('meet-choose'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(chooseCharacter).toHaveBeenCalledWith('peep');
    expect(mockToastShow).toHaveBeenCalledWith("Couldn't save your coach. We'll ask again later.", 'error');
  });
});

describe('MeetYourCoachScreen: switching from Profile', () => {
  it('preselects the current coach and has Close instead of Skip', () => {
    const s = renderMeet({ mode: 'switch' }, { characterId: 'cap', personaChosen: true });
    expect(s.getByTestId('meet-tile-cap').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(playing(s)).toEqual(['character:cap:idle:56:playing:none']);
    expect(s.queryByTestId('meet-skip')).toBeNull();
    fireEvent.press(s.getByTestId('meet-close'));
    expect(mockGoBack).toHaveBeenCalledTimes(1);
  });

  it('closes without saving when the current coach is chosen again', async () => {
    const s = renderMeet({ mode: 'switch' }, { characterId: 'bao', personaChosen: true });
    openSheet(s, 'bao');

    fireEvent.press(s.getByTestId('meet-choose'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(chooseCharacter).not.toHaveBeenCalled();
  });

  it('saves the current coach when none has been chosen yet, so the first-visit picker does not come back', async () => {
    const s = renderMeet({ mode: 'switch' }, { characterId: 'mochi', personaChosen: false });
    openSheet(s, 'mochi');

    fireEvent.press(s.getByTestId('meet-choose'));

    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(chooseCharacter).toHaveBeenCalledWith('mochi');
  });

  it('stays open with a short error in the sheet when saving fails, and can try again', async () => {
    chooseCharacter.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
    const s = renderMeet({ mode: 'switch' }, { characterId: 'mochi' });
    openSheet(s, 'boba');

    fireEvent.press(s.getByTestId('meet-choose'));

    expect(await s.findByTestId('meet-error')).toHaveTextContent("Boba couldn't be saved. Please try again.");
    expect(s.getByTestId('meet-sheet')).toBeTruthy();
    expect(mockGoBack).not.toHaveBeenCalled();
    expect(mockToastShow).not.toHaveBeenCalled();

    fireEvent.press(s.getByTestId('meet-choose'));
    await waitFor(() => expect(mockGoBack).toHaveBeenCalledTimes(1));
    expect(chooseCharacter).toHaveBeenCalledTimes(2);
  });

  it('clears the error when another coach is opened', async () => {
    jest.useFakeTimers();
    chooseCharacter.mockRejectedValueOnce(new Error('offline'));
    const s = renderMeet({ mode: 'switch' }, { characterId: 'mochi' });
    openSheet(s, 'boba');
    await act(async () => fireEvent.press(s.getByTestId('meet-choose')));
    expect(s.getByTestId('meet-error')).toBeTruthy();

    closeSheet(s);
    openSheet(s, 'kit');

    expect(s.queryByTestId('meet-error')).toBeNull();
  });

  it('treats missing params as switch mode', () => {
    const s = renderMeet(undefined, { characterId: 'jelly' });
    expect(s.getByTestId('meet-tile-jelly').props.accessibilityState).toEqual(expect.objectContaining({ selected: true }));
    expect(s.queryByTestId('meet-skip')).toBeNull();
  });
});
