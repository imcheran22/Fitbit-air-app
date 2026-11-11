// mobile/__tests__/components/Character.test.tsx
import React from 'react';
import { render } from '@testing-library/react-native';
import { Character, DIMMED_OPACITY } from '../../src/components/characters/Character';
import { CharacterContext, type CharacterContextValue } from '../../src/characters/CharacterContext';
import { withCharacter } from '../../jest-mocks/characterContext';

let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => ({
  ...jest.requireActual('react-native-reanimated'),
  useReducedMotion: () => mockReduceMotion,
}));

// An unlabelled character is hidden from the accessibility tree, so queries must opt in to hidden elements.
const HIDDEN_OK = { includeHiddenElements: true };
const canvas = (utils: ReturnType<typeof render>) =>
  utils.getByTestId('character-canvas', HIDDEN_OK).props.accessibilityLabel;

describe('Character', () => {
  beforeEach(() => {
    mockReduceMotion = false;
  });

  it('draws the given character, mood, size and pause state', () => {
    const utils = render(<Character characterId="kit" mood="thinking" size={64} paused />);
    expect(canvas(utils)).toBe('character:kit:thinking:64:paused:bulb');
  });

  it('is Mochi outside a provider when no id is given', () => {
    const utils = render(<Character mood="idle" size={56} />);
    expect(canvas(utils)).toBe('character:mochi:idle:56:playing:none');
  });

  it("is the provider's character when no id is given", () => {
    const value = { characterId: 'kit' } as CharacterContextValue;
    const utils = render(
      <CharacterContext.Provider value={value}>
        <Character mood="resting" size={56} />
      </CharacterContext.Provider>,
    );
    expect(canvas(utils)).toBe('character:kit:resting:56:playing:none');
  });

  it('shows the thinking attachment only while thinking or answering', () => {
    expect(canvas(render(<Character characterId="kit" mood="idle" size={64} />))).toBe('character:kit:idle:64:playing:none');
    expect(canvas(render(<Character characterId="kit" mood="resting" size={64} />))).toBe('character:kit:resting:64:playing:none');
    expect(canvas(render(<Character characterId="kit" mood="thinking" size={64} />))).toBe('character:kit:thinking:64:playing:bulb');
    expect(canvas(render(<Character characterId="kit" mood="answering" size={64} />))).toBe('character:kit:answering:64:playing:bulb');
  });

  it('hides the attachment when told to, and uses the one it is given', () => {
    expect(canvas(render(<Character characterId="kit" mood="thinking" size={64} attachment={null} />))).toBe(
      'character:kit:thinking:64:playing:none',
    );
    expect(canvas(render(<Character characterId="kit" mood="thinking" size={64} attachment="gears" />))).toBe(
      'character:kit:thinking:64:playing:gears',
    );
  });

  it("uses the user's thinking attachment setting when no attachment is passed", () => {
    const utils = render(withCharacter(<Character mood="thinking" size={64} />, { thinkingAttachment: 'spinner' }));
    expect(canvas(utils)).toBe('character:mochi:thinking:64:playing:spinner');
  });

  it('hides the attachment below 24 pt, where it does not read', () => {
    expect(canvas(render(<Character characterId="kit" mood="thinking" size={20} />))).toBe('character:kit:thinking:20:playing:none');
    expect(canvas(render(<Character characterId="kit" mood="thinking" size={24} />))).toBe('character:kit:thinking:24:playing:bulb');
  });

  it("reserves the attachment's width (size × 36/24) only when it is shown", () => {
    const { getByTestId, rerender } = render(<Character mood="thinking" size={64} testID="c" />);
    expect(getByTestId('c', HIDDEN_OK)).toHaveStyle({ width: 96, height: 64 });
    rerender(<Character mood="answering" size={40} testID="c" />);
    expect(getByTestId('c', HIDDEN_OK)).toHaveStyle({ width: 60, height: 40 });
    rerender(<Character mood="thinking" size={64} attachment={null} testID="c" />);
    expect(getByTestId('c', HIDDEN_OK)).toHaveStyle({ width: 64, height: 64 });
    rerender(<Character mood="thinking" size={20} testID="c" />);
    expect(getByTestId('c', HIDDEN_OK)).toHaveStyle({ width: 20, height: 20 });
  });

  it('holds still when Reduce Motion is on, keeping the mood and its attachment (Review Focus 5)', () => {
    mockReduceMotion = true;
    expect(canvas(render(<Character characterId="kit" mood="answering" size={64} />))).toBe('character:kit:answering:64:paused:bulb');
    expect(canvas(render(<Character characterId="kit" mood="thinking" size={64} />))).toBe('character:kit:thinking:64:paused:bulb');
    expect(canvas(render(<Character characterId="kit" mood="resting" size={64} />))).toBe('character:kit:resting:64:paused:none');
  });

  it('is full opacity normally and dimmed when asked, and exactly its size', () => {
    const { getByTestId, rerender } = render(<Character mood="idle" size={64} testID="c" />);
    expect(getByTestId('c', HIDDEN_OK)).toHaveStyle({ opacity: 1, width: 64, height: 64 });
    rerender(<Character mood="idle" size={64} dimmed testID="c" />);
    expect(getByTestId('c', HIDDEN_OK)).toHaveStyle({ opacity: DIMMED_OPACITY });
  });

  it('is hidden from screen readers unless it has a label', () => {
    const { getByTestId, rerender } = render(<Character mood="idle" size={40} testID="c" />);
    expect(getByTestId('c', HIDDEN_OK).props.accessibilityElementsHidden).toBe(true);
    expect(getByTestId('c', HIDDEN_OK).props.importantForAccessibility).toBe('no-hide-descendants');

    rerender(<Character mood="idle" size={40} testID="c" accessibilityLabel="Mochi, your coach" />);
    expect(getByTestId('c', HIDDEN_OK).props.accessibilityRole).toBe('image');
    expect(getByTestId('c', HIDDEN_OK).props.accessibilityLabel).toBe('Mochi, your coach');
    expect(getByTestId('c', HIDDEN_OK).props.accessibilityElementsHidden).toBe(false);
  });
});
