import React from 'react';
import { fireEvent, render, within } from '@testing-library/react-native';
import { CharacterGalleryScreen } from '../../src/screens/dev/CharacterGalleryScreen';
import { THINKING_ATTACHMENTS, THINKING_TEXTS } from '../../src/components/characters/thinking';
import { CHARACTER_IDS } from '../../src/components/characters/types';

// Synchronous icons: the real font load re-renders after these tests finish.
jest.mock('@expo/vector-icons', () => require('../../jest-mocks/vectorIcons'));

const HIDDEN_OK = { includeHiddenElements: true } as const;

// Unlabelled characters are hidden from accessibility, so the canvases are
// only reachable with includeHiddenElements.
const labelsIn = (node: Parameters<typeof within>[0]) =>
  within(node)
    .getAllByTestId('character-canvas', HIDDEN_OK)
    .map((n) => n.props.accessibilityLabel as string);
const labels = (utils: ReturnType<typeof render>) =>
  utils.getAllByTestId('character-canvas', HIDDEN_OK).map((n) => n.props.accessibilityLabel as string);

describe('CharacterGalleryScreen', () => {
  it('shows every coach in the 4 moods at 96', () => {
    const utils = render(<CharacterGalleryScreen />);
    for (const id of CHARACTER_IDS) {
      expect(labelsIn(utils.getByTestId(`gallery-coach-${id}`, HIDDEN_OK))).toEqual([
        `character:${id}:idle:96:playing:none`,
        `character:${id}:thinking:96:playing:bulb`,
        `character:${id}:answering:96:playing:bulb`,
        `character:${id}:resting:96:playing:none`,
      ]);
    }
  });

  it('shows the 9 attachments on Mochi at 72', () => {
    const utils = render(<CharacterGalleryScreen />);
    expect(labelsIn(utils.getByTestId('gallery-attachments', HIDDEN_OK))).toEqual(
      THINKING_ATTACHMENTS.map((a) => `character:mochi:thinking:72:playing:${a}`),
    );
  });

  it('shows the 10 thinking text styles and the size ladder', () => {
    const utils = render(<CharacterGalleryScreen />);
    expect(labelsIn(utils.getByTestId('gallery-texts', HIDDEN_OK))).toHaveLength(THINKING_TEXTS.length);
    expect(labelsIn(utils.getByTestId('gallery-ladder', HIDDEN_OK))).toEqual(
      [18, 20, 36, 40, 52, 64, 120, 180].map((size) => `character:mochi:idle:${size}:playing:none`),
    );
    expect(labels(utils)).toHaveLength(15 * 4 + 9 + 10 + 8);
  });

  it('pauses and resumes every character', () => {
    const utils = render(<CharacterGalleryScreen />);
    fireEvent.press(utils.getByTestId('gallery-pause'));
    expect(labels(utils).every((l) => l.includes(':paused:'))).toBe(true);
    fireEvent.press(utils.getByTestId('gallery-pause'));
    expect(labels(utils).every((l) => l.includes(':playing:'))).toBe(true);
  });
});
