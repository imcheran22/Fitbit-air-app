import React from 'react';
import { Modal, PixelRatio, StyleSheet } from 'react-native';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { HIDDEN_OK, withCharacter } from '../../jest-mocks/characterContext';
import { CelebrationModal } from '../../src/components/achievements/CelebrationModal';
import { captureToPng, shareImage } from '../../src/lib/recapCapture';

jest.mock('../../src/lib/recapCapture', () => ({ captureToPng: jest.fn(), saveImage: jest.fn(), shareImage: jest.fn() }));
let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReduceMotion };
});

const StyleSheetFlatten = (style: unknown) => StyleSheet.flatten(style as never) as Record<string, number>;

const GOLD = { family: 'SLEEP_GOAL' as const, level: 3, value: 14, earnedOn: '2026-10-14', ids: ['s3'] };
const THRESHOLDS = [3, 7, 14, 30, 100];

beforeEach(() => {
  jest.clearAllMocks();
  mockReduceMotion = false;
});
afterEach(() => jest.restoreAllMocks());

it('shows the new level with the coach, its value, the coach line and confetti', () => {
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.getByTestId('celebration-title')).toHaveTextContent('SLEEP GOAL STREAK III');
  expect(screen.getByTestId('celebration-value')).toHaveTextContent('14 nights in a row at your sleep goal.');
  expect(screen.getByTestId('celebration-coach-line')).toHaveTextContent('16 more nights for Diamond');
  expect(screen.getByTestId('celebration-badge').props.accessibilityLabel).toBe('Sleep goal streak, level III, Gold');
  expect(screen.getByTestId('celebration-coach', HIDDEN_OK)).toBeTruthy();
  expect(screen.getByTestId('celebration-confetti', HIDDEN_OK)).toBeTruthy();
});

// An iPhone with a Dynamic Island: the content must clear the island and the home indicator.
const ISLAND = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } };

it('pads the screen by the safe-area insets, buttons pinned below the block', () => {
  render(
    <SafeAreaProvider initialMetrics={ISLAND}>
      {withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />)}
    </SafeAreaProvider>,
  );
  expect(screen.getByTestId('celebration-screen')).toHaveStyle({ paddingTop: 47, paddingBottom: 34 });
  // The block is centred in a scroll view (it scrolls rather than clip on small phones); the buttons are outside it.
  const scroll = screen.getByTestId('celebration-scroll');
  expect(scroll.props.contentContainerStyle).toMatchObject({ flexGrow: 1, justifyContent: 'center' });
  expect(within(scroll).getByTestId('celebration-title')).toBeTruthy();
  expect(within(scroll).queryByTestId('celebration-done')).toBeNull();
  expect(within(screen.getByTestId('celebration-actions')).getByTestId('celebration-done')).toBeTruthy();
});

it('draws a smaller badge on a small phone', () => {
  const small = { frame: { x: 0, y: 0, width: 375, height: 667 }, insets: { top: 20, left: 0, right: 0, bottom: 0 } };
  jest.spyOn(require('react-native'), 'useWindowDimensions').mockReturnValue({ width: 375, height: 667, scale: 2, fontScale: 1 });
  render(
    <SafeAreaProvider initialMetrics={small}>
      {withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />)}
    </SafeAreaProvider>,
  );
  expect(screen.getByTestId('celebration-badge')).toHaveStyle({ width: 140 });
});

it('draws the confetti behind the content and only in the side margins or beside the badge', () => {
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  // Painted first, so everything after it draws on top.
  const page = screen.getByTestId('celebration-screen');
  expect((page.children[0] as { props: { testID?: string } }).props.testID).toBe('celebration-confetti');
  // The margin squares stay within the page's 24 pt side padding, clear of the text and the card.
  const margin = within(screen.getByTestId('celebration-confetti', HIDDEN_OK)).getAllByTestId('celebration-confetti-square', HIDDEN_OK);
  expect(margin.length).toBeGreaterThan(0);
  for (const square of margin) {
    const { left, right, width } = StyleSheetFlatten(square.props.style);
    expect((left ?? right) + width).toBeLessThanOrEqual(24);
  }
  // The rest sit in the badge's row, painted before the badge, and within the badge's height.
  const hero = screen.getByTestId('celebration-hero');
  const heroConfetti = within(hero).getByTestId('celebration-hero-confetti', HIDDEN_OK);
  expect((hero.children[0] as { props: { testID?: string } }).props.testID).toBe('celebration-hero-confetti');
  for (const square of within(heroConfetti).getAllByTestId('celebration-confetti-square', HIDDEN_OK)) {
    const { left, right, top, width, height } = StyleSheetFlatten(square.props.style);
    // In the gap beside the 236 pt badge-and-coach row on a 375 pt phone (327 pt wide hero).
    expect((left ?? right) + width).toBeLessThanOrEqual((327 - 236) / 2);
    expect(top + height).toBeLessThanOrEqual(190);
  }
});

it('says "Top level!" at level V', () => {
  render(withCharacter(<CelebrationModal celebration={{ ...GOLD, level: 5, value: 100 }} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.getByTestId('celebration-coach-line')).toHaveTextContent('Top level!');
});

it('draws no confetti under Reduce Motion', () => {
  mockReduceMotion = true;
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.queryByTestId('celebration-confetti', HIDDEN_OK)).toBeNull();
  expect(screen.queryByTestId('celebration-hero-confetti', HIDDEN_OK)).toBeNull();
});

it('closes with "Nice!"', () => {
  const onDone = jest.fn();
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={onDone} />));
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('closes once, however fast "Nice!" is pressed twice', () => {
  const onDone = jest.fn();
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={onDone} />));
  fireEvent.press(screen.getByTestId('celebration-done'));
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(onDone).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('celebration-done')).toBeDisabled();
});

it('closes once when the system back gesture follows "Nice!" (Android back)', () => {
  const onDone = jest.fn();
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={onDone} />));
  fireEvent.press(screen.getByTestId('celebration-done'));
  screen.UNSAFE_getByType(Modal).props.onRequestClose();
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('closes once when the system back gesture comes first', () => {
  const onDone = jest.fn();
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={onDone} />));
  screen.UNSAFE_getByType(Modal).props.onRequestClose();
  screen.UNSAFE_getByType(Modal).props.onRequestClose();
  fireEvent.press(screen.getByTestId('celebration-done'));
  expect(onDone).toHaveBeenCalledTimes(1);
});

it('says so when the share image could not be made', async () => {
  (captureToPng as jest.Mock).mockRejectedValue(new Error('capture'));
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.queryByTestId('celebration-notice')).toBeNull();
  fireEvent.press(screen.getByTestId('celebration-share'));
  expect(await screen.findByTestId('celebration-notice')).toHaveTextContent("The image couldn't be made. Please try again.");
  expect(shareImage).not.toHaveBeenCalled();
});

it('shares a 1080 px badge card through the recap export pipeline', async () => {
  jest.spyOn(PixelRatio, 'get').mockReturnValue(3);
  (captureToPng as jest.Mock).mockResolvedValue('file:///cache/recap-1.png');
  (shareImage as jest.Mock).mockResolvedValue(undefined);
  render(withCharacter(<CelebrationModal celebration={GOLD} thresholds={THRESHOLDS} onDone={jest.fn()} />));
  expect(screen.getByTestId('celebration-export', HIDDEN_OK)).toHaveStyle({ width: 360, height: 360 });
  expect(screen.getByTestId('badge-share-card', HIDDEN_OK)).toHaveTextContent(/SLEEP GOAL STREAK III/);
  expect(screen.getByTestId('badge-share-app', HIDDEN_OK)).toHaveTextContent('Biometrics');
  fireEvent.press(screen.getByTestId('celebration-share'));
  await waitFor(() => expect(shareImage).toHaveBeenCalledWith('file:///cache/recap-1.png'));
});
