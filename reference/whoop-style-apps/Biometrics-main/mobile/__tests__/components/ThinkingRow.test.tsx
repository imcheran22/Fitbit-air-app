import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { ThinkingRow } from '../../src/components/coach/thinking/ThinkingRow';
import { ReplyFrame, REPLY_FRAME_STYLES } from '../../src/components/coach/thinking/ReplyFrame';
import { SILKSCREEN, pixelFont } from '../../src/components/coach/thinking/shared';
import { DIALOG_TEXT_CLASS } from '../../src/components/coach/thinking/Dialog';
import { FONTS } from '../../src/theme';
import { THINKING_TEXTS } from '../../src/components/characters/thinking';
import { characterLabel } from '../../jest-mocks/characterContext';

let mockReduceMotion = false;
jest.mock('react-native-reanimated', () => {
  const actual = jest.requireActual('react-native-reanimated');
  // `default` (Animated) is not an own enumerable key, so a spread alone drops it.
  return { __esModule: true, ...actual, default: actual.default, useReducedMotion: () => mockReduceMotion };
});

// App.tsx loads Silkscreen at start-up; here the test decides whether it is in.
let mockFontLoaded = true;
jest.mock('expo-font', () => ({
  ...jest.requireActual('expo-font'),
  isLoaded: (family: string) => mockFontLoaded && family === 'Silkscreen',
}));

const steps = [
  { id: 'route', label: 'Looking at your sleep…', done: true },
  { id: 'facts', label: 'Going through your recent nights…', done: false },
];

beforeEach(() => {
  mockReduceMotion = false;
  mockFontLoaded = true;
});

afterEach(() => {
  jest.useRealTimers();
});

const flatStyle = (style: unknown): Record<string, unknown> => Object.assign({}, ...[style].flat(Infinity).filter(Boolean));

it.each(THINKING_TEXTS)('%s renders the coach thinking at 36pt with its text', (style) => {
  const s = render(<ThinkingRow style={style} characterId="luna" steps={steps} paused testID="row" />);
  expect(characterLabel(s, 'row')).toMatch(/^character:luna:thinking:36:paused:/);
  expect(s.toJSON()).toBeTruthy();
});

it.each(THINKING_TEXTS)('%s is a polite live region with a plain spoken label', (style) => {
  const s = render(<ThinkingRow style={style} characterId="luna" steps={steps} paused testID="row" />);
  const row = s.getByTestId('row');
  expect(row.props.accessibilityLiveRegion).toBe('polite');
  expect(row.props.accessible).toBe(true);
  // steps speaks the step it is on; every other style says who is thinking.
  expect(row.props.accessibilityLabel).toBe(style === 'steps' ? 'Going through your recent nights' : 'Luna is thinking');
});

it('steps shows the real steps, ticking finished ones', () => {
  const s = render(<ThinkingRow style="steps" characterId="luna" steps={steps} paused testID="row" />);
  expect(s.getByText('Going through your recent nights…')).toBeTruthy();
  expect(s.getByTestId('thinking-step-route-done')).toBeTruthy();
  expect(s.getByTestId('thinking-step-facts-active')).toBeTruthy();
});

it('steps shows an all-ticked list (the 300 ms linger after the turn) with no active row', () => {
  const all = steps.map((step) => ({ ...step, done: true }));
  const s = render(<ThinkingRow style="steps" characterId="luna" steps={all} paused testID="row" />);
  expect(s.getByTestId('thinking-step-route-done')).toBeTruthy();
  expect(s.getByTestId('thinking-step-facts-done')).toBeTruthy();
  expect(s.queryByTestId('thinking-step-facts-active')).toBeNull();
  expect(s.getByTestId('row').props.accessibilityLabel).toBe('Going through your recent nights');
});

it('steps shows a stepless status from an older server as a single line (Review Focus 3)', () => {
  const s = render(<ThinkingRow style="steps" characterId="luna" steps={[{ id: 'status', label: 'Thinking…', done: false }]} paused testID="row" />);
  expect(s.getByTestId('thinking-step-status-active')).toHaveTextContent(/Thinking…/);
});

it('steps falls back to a personality line before the first status arrives (Review Focus 3)', () => {
  const s = render(<ThinkingRow style="steps" characterId="luna" steps={[]} paused testID="row" />);
  expect(s.getByText(/Luna is counting stars/)).toBeTruthy();
});

it("lines rotates through the coach's three lines", () => {
  jest.useFakeTimers();
  const s = render(<ThinkingRow style="lines" characterId="kit" steps={[]} paused={false} testID="row" />);
  expect(s.getByText(/pretending not to care/)).toBeTruthy();
  act(() => {
    jest.advanceTimersByTime(2400);
  });
  expect(s.getByText(/judging your bedtime/)).toBeTruthy();
});

it('lines holds its first line when paused', () => {
  jest.useFakeTimers();
  const s = render(<ThinkingRow style="lines" characterId="kit" steps={[]} paused testID="row" />);
  act(() => {
    jest.advanceTimersByTime(5000);
  });
  expect(s.getByText(/pretending not to care/)).toBeTruthy();
});

it('nameplate, shimmer and bouncy name the coach', () => {
  for (const style of ['nameplate', 'shimmer', 'bouncy'] as const) {
    const s = render(<ThinkingRow style={style} characterId="pengu" steps={[]} paused testID="row" />);
    expect(s.getAllByText(/Pengu/).length).toBeGreaterThan(0);
  }
});

it('bouncy speaks one sentence and hides its separate letters from screen readers', () => {
  const s = render(<ThinkingRow style="bouncy" characterId="pengu" steps={[]} paused testID="row" />);
  const word = s.getByTestId('thinking-bouncy');
  expect(word.props.accessibilityLabel).toBe('Pengu is thinking');
  const letters = s.getByTestId('thinking-bouncy-letters', { includeHiddenElements: true });
  expect(letters.props.importantForAccessibility).toBe('no-hide-descendants');
  expect(letters.props.accessibilityElementsHidden).toBe(true);
});

it('typewriter and dialog show the whole first line when frozen (Reduce Motion stays readable)', () => {
  for (const style of ['typewriter', 'dialog'] as const) {
    const s = render(<ThinkingRow style={style} characterId="boba" steps={[]} paused testID="row" />);
    expect(s.getByText(/stirring the pearls/)).toBeTruthy();
  }
});

it('typewriter types the line out over time', () => {
  jest.useFakeTimers();
  const s = render(<ThinkingRow style="typewriter" characterId="boba" steps={[]} paused={false} testID="row" />);
  act(() => {
    jest.advanceTimersByTime(300);
  });
  const early = s.getByTestId('thinking-typewriter-text').props.children as string;
  expect('Boba is stirring the pearls…'.startsWith(early)).toBe(true);
  expect(early.length).toBeLessThan('Boba is stirring the pearls…'.length);
  act(() => {
    jest.advanceTimersByTime(1500);
  });
  expect(s.getByTestId('thinking-typewriter-text')).toHaveTextContent('Boba is stirring the pearls…');
});

it('Reduce Motion freezes the styles even when the screen is focused', () => {
  mockReduceMotion = true;
  jest.useFakeTimers();
  const s = render(<ThinkingRow style="typewriter" characterId="boba" steps={[]} paused={false} testID="row" />);
  act(() => {
    jest.advanceTimersByTime(100);
  });
  expect(s.getByTestId('thinking-typewriter-text')).toHaveTextContent('Boba is stirring the pearls…');
});

it('tag shows a pixel-font THINKING tag over the personality line', () => {
  const s = render(<ThinkingRow style="tag" characterId="boba" steps={[]} paused testID="row" />);
  expect(flatStyle(s.getByText('THINKING').props.style).fontFamily).toBe(SILKSCREEN);
  expect(s.getByText(/Boba is stirring the pearls/)).toBeTruthy();
});

it('pixelFont falls back to Geist, never a mono face, if Silkscreen did not load', () => {
  mockFontLoaded = false;
  expect(pixelFont()).toBe(FONTS.sans);
  mockFontLoaded = true;
  expect(pixelFont()).toBe(SILKSCREEN);
});

it('dialog types its line in the pixel label face on an 18-pt line', () => {
  const s = render(<ThinkingRow style="dialog" characterId="pengu" steps={[]} paused testID="row" />);
  const line = s.getByText(/…$/);
  expect(String(line.props.className).split(' ')).toEqual(expect.arrayContaining(DIALOG_TEXT_CLASS.split(' ')));
  expect(flatStyle(line.props.style).fontFamily).toBe(SILKSCREEN);
});

it('shimmer counts the seconds since it appeared', () => {
  const s = render(<ThinkingRow style="shimmer" characterId="pengu" steps={[]} paused testID="row" />);
  expect(s.getByText('Pengu is thinking')).toBeTruthy();
  expect(s.getByTestId('thinking-shimmer-seconds')).toHaveTextContent('0s');
});

it('dialog has a name tab in the pixel font', () => {
  const s = render(<ThinkingRow style="dialog" characterId="pengu" steps={[]} paused testID="row" />);
  const tab = s.getByTestId('thinking-dialog-tab');
  expect(tab).toHaveTextContent('Pengu');
  expect(flatStyle(tab.props.style).fontFamily).toBe(SILKSCREEN);
});

it('placeholder and strip show the personality line', () => {
  for (const style of ['placeholder', 'strip'] as const) {
    const s = render(<ThinkingRow style={style} characterId="luna" steps={[]} paused testID="row" />);
    expect(s.getByText(/counting stars/)).toBeTruthy();
  }
});

it('placeholder draws three shimmer bars', () => {
  const s = render(<ThinkingRow style="placeholder" characterId="luna" steps={[]} paused testID="row" />);
  expect(s.getAllByTestId(/^thinking-placeholder-bar-/, { includeHiddenElements: true })).toHaveLength(3);
});

describe('ReplyFrame', () => {
  it('frames only the placeholder and dialog styles', () => {
    expect([...REPLY_FRAME_STYLES]).toEqual(['placeholder', 'dialog']);
  });

  it('wraps the streaming answer in the placeholder bubble', () => {
    const s = render(
      <ReplyFrame style="placeholder" characterId="kit">
        <Text>Mostly clear.</Text>
      </ReplyFrame>,
    );
    expect(s.getByTestId('reply-frame-placeholder')).toHaveTextContent(/Mostly clear\./);
  });

  it('wraps the streaming answer in the dialog box with the name tab', () => {
    const s = render(
      <ReplyFrame style="dialog" characterId="kit">
        <Text>Mostly clear.</Text>
      </ReplyFrame>,
    );
    expect(s.getByTestId('reply-frame-dialog')).toHaveTextContent(/Mostly clear\./);
    expect(s.getByTestId('thinking-dialog-tab')).toHaveTextContent('Kit');
  });

  // Spec §5 "the same box": the first sentence must not move it sideways or down.
  it.each(REPLY_FRAME_STYLES)('%s keeps the pending row layout: the 36 pt thinking coach, then the box', (style) => {
    const pending = render(<ThinkingRow style={style} characterId="kit" steps={[]} paused={false} testID="row" />);
    const streaming = render(
      <ReplyFrame style={style} characterId="kit">
        <Text>Mostly clear.</Text>
      </ReplyFrame>,
    );
    const row = streaming.getByTestId('reply-frame-row');
    expect(row.props.className ?? '').toBe(pending.getByTestId('row').props.className);
    expect(characterLabel(streaming, 'reply-frame-row')).toBe(characterLabel(pending, 'row'));
    expect(characterLabel(streaming, 'reply-frame-row')).toBe('character:kit:thinking:36:playing:bulb');
  });

  it('the placeholder answer bubble keeps the thinking bubble’s width floor and bottom lift', () => {
    const s = render(
      <ReplyFrame style="placeholder" characterId="kit">
        <Text>Ok.</Text>
      </ReplyFrame>,
    );
    const style = StyleSheet.flatten(s.getByTestId('reply-frame-placeholder').props.style);
    expect(style).toMatchObject({ minWidth: 210, marginBottom: 10 });
  });
});
