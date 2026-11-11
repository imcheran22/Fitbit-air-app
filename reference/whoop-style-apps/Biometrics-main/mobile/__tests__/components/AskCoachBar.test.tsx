import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { characterLabel, withCharacter } from '../../jest-mocks/characterContext';
import { AskCoachBar } from '../../src/components/coach/AskCoachBar';

describe('AskCoachBar', () => {
  it('renders the label and labels the button with it', () => {
    const screen = render(withCharacter(<AskCoachBar label="Ask Axo about this" onPress={jest.fn()} focused />));

    expect(screen.getByText('Ask Axo about this')).toBeTruthy();
    expect(screen.getByTestId('ask-coach-button').props.accessibilityLabel).toBe('Ask Axo about this');
  });

  it('calls onPress when the button is pressed', () => {
    const onPress = jest.fn();
    const screen = render(withCharacter(<AskCoachBar label="Ask Coach about this" onPress={onPress} focused />));

    fireEvent.press(screen.getByTestId('ask-coach-button'));

    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders the coach character, paused when the screen is not focused', () => {
    const playing = render(withCharacter(<AskCoachBar label="Ask" onPress={jest.fn()} focused />));
    expect(characterLabel(playing, 'ask-coach-character')).toBe('character:mochi:idle:40:playing:none');
    playing.unmount();

    const paused = render(withCharacter(<AskCoachBar label="Ask" onPress={jest.fn()} focused={false} />));
    expect(characterLabel(paused, 'ask-coach-character')).toBe('character:mochi:idle:40:paused:none');
  });
});
