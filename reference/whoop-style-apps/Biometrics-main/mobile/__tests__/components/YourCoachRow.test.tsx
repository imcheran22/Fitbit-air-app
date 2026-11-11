import React from 'react';
import { act, fireEvent, render } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { YourCoachRow } from '../../src/components/your-coach-row';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import type { CharacterId } from '../../src/components/characters/types';

// Synchronous icons: the real font load re-renders after these tests finish.
jest.mock('@expo/vector-icons', () => require('../../jest-mocks/vectorIcons'));

const navigate = jest.fn();
let listeners: Record<string, () => void> = {};
const navigation = {
  navigate,
  isFocused: () => true,
  addListener: (event: string, cb: () => void) => {
    listeners[event] = cb;
    return () => {
      delete listeners[event];
    };
  },
};

function renderRow(characterId: CharacterId | null) {
  const row = (
    <NavigationContext.Provider value={navigation as never}>
      <YourCoachRow />
    </NavigationContext.Provider>
  );
  return render(characterId ? withCharacter(row, { characterId }) : row);
}

beforeEach(() => {
  jest.clearAllMocks();
  listeners = {};
});

describe('YourCoachRow', () => {
  it('shows the current character, small and animating, with its name', () => {
    const utils = renderRow('kit');

    expect(utils.getByTestId('your-coach-row')).toHaveTextContent(/Kit/);
    expect(characterLabel(utils, 'your-coach-row')).toBe('character:kit:idle:36:playing:none');
  });

  it('is announced as "<Name>, your coach"', () => {
    const utils = renderRow('boba');

    expect(utils.getByLabelText('Boba, your coach')).toBeTruthy();
    expect(utils.getByTestId('your-coach-row').props.accessibilityLabel).toBe('Boba, your coach');
  });

  it('opens Meet your coach in switch mode', () => {
    const utils = renderRow('avo');

    fireEvent.press(utils.getByTestId('your-coach-row'));

    expect(navigate).toHaveBeenCalledWith('MeetYourCoach', { mode: 'switch' });
  });

  it('shows Mochi outside the provider', () => {
    const utils = renderRow(null);

    expect(utils.getByTestId('your-coach-row')).toHaveTextContent(/Mochi/);
    expect(characterLabel(utils, 'your-coach-row')).toBe('character:mochi:idle:36:playing:none');
  });

  it('holds still while Profile is not focused and moves again on return', () => {
    const utils = renderRow('jelly');

    act(() => listeners.blur?.());
    expect(characterLabel(utils, 'your-coach-row')).toBe('character:jelly:idle:36:paused:none');

    act(() => listeners.focus?.());
    expect(characterLabel(utils, 'your-coach-row')).toBe('character:jelly:idle:36:playing:none');
  });
});
