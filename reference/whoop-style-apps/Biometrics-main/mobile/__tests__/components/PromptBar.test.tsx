import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import {
  PromptBar,
  COACH_COMMANDS,
  clampRows,
  glyphPoints,
  matchCommands,
  parseSlashQuery,
  ARROW_POINTS,
  SQUARE_POINTS,
  sendColors,
} from '../../src/components/coach/PromptBar';

// The pure helpers carry the logic so the rules are testable without driving
// animations, matching pressable-scale.tsx's pressTargets().
describe('parseSlashQuery', () => {
  it('recognises a slash command being typed at the start', () => {
    expect(parseSlashQuery('/rec')).toBe('rec');
    expect(parseSlashQuery('/')).toBe('');
  });

  it('is case-insensitive on the query', () => {
    expect(parseSlashQuery('/REC')).toBe('rec');
  });

  // Once there is a space the user has moved on to writing a message; the menu
  // must not sit over the transcript for the rest of the sentence.
  it('stops matching once the token is finished', () => {
    expect(parseSlashQuery('/recovery why')).toBeNull();
    expect(parseSlashQuery('/ ')).toBeNull();
  });

  it('ignores a slash that is not the first character', () => {
    expect(parseSlashQuery('what about /sleep')).toBeNull();
    expect(parseSlashQuery('')).toBeNull();
    expect(parseSlashQuery('hello')).toBeNull();
  });

  it('ignores leading whitespace rather than treating it as a command', () => {
    expect(parseSlashQuery('  /rec')).toBeNull();
  });
});

describe('matchCommands', () => {
  it('returns every command for an empty query', () => {
    expect(matchCommands(COACH_COMMANDS, '')).toHaveLength(COACH_COMMANDS.length);
  });

  it('filters on the command key', () => {
    const hits = matchCommands(COACH_COMMANDS, 'sle');
    expect(hits).toHaveLength(1);
    expect(hits[0]!.key).toBe('sleep');
  });

  it('returns nothing when the query matches no command', () => {
    expect(matchCommands(COACH_COMMANDS, 'zzz')).toEqual([]);
  });
});

describe('clampRows', () => {
  const line = 20;
  it('grows with the content', () => {
    expect(clampRows(line * 2, line, 5)).toBe(line * 2);
  });

  it('never reports less than one row, so an empty bar keeps its height', () => {
    expect(clampRows(0, line, 5)).toBe(line);
    expect(clampRows(-40, line, 5)).toBe(line);
  });

  it('stops growing at the row cap and lets the field scroll instead', () => {
    expect(clampRows(line * 40, line, 5)).toBe(line * 5);
  });
});

describe('glyphPoints', () => {
  // The send control morphs between an arrow and a stop square, so the two
  // point lists have to stay interpolatable: same length, pairwise.
  it('keeps both glyphs the same shape so they can be interpolated', () => {
    expect(ARROW_POINTS).toHaveLength(SQUARE_POINTS.length);
    expect(ARROW_POINTS.length % 2).toBe(0);
  });

  it('is the arrow at rest and the square while busy', () => {
    expect(glyphPoints(0)).toEqual(ARROW_POINTS);
    expect(glyphPoints(1)).toEqual(SQUARE_POINTS);
  });

  it('interpolates pairwise midway between the two', () => {
    const mid = glyphPoints(0.5);
    expect(mid).toHaveLength(ARROW_POINTS.length);
    expect(mid[0]).toBeCloseTo((ARROW_POINTS[0]! + SQUARE_POINTS[0]!) / 2);
  });
});

// The bar reads as one surface: the send control only lights up when it means
// something, and otherwise recedes into the bar rather than sitting on it as a
// permanently coloured button.
describe('sendColors', () => {
  const colors = { barActive: 'WHITE', background: 'DARK', muted: 'GREY' };

  it('fills and inverts once there is something to do', () => {
    expect(sendColors(true, colors)).toEqual({ background: 'WHITE', glyph: 'DARK' });
  });

  it('is a bare arrow, with no fill, when there is nothing to send', () => {
    expect(sendColors(false, colors)).toEqual({ background: 'transparent', glyph: 'GREY' });
  });
});

describe('PromptBar', () => {
  function setup(over: Partial<React.ComponentProps<typeof PromptBar>> = {}) {
    const onSend = jest.fn();
    const onChangeText = jest.fn();
    const utils = render(
      <PromptBar value="" onChangeText={onChangeText} onSend={onSend} busy={false} {...over} />,
    );
    return { ...utils, onSend, onChangeText };
  }

  it('keeps the send control disabled while the field is empty', () => {
    const { getByTestId, onSend } = setup({ value: '   ' });
    fireEvent.press(getByTestId('coach-send-button'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends a message that has content', () => {
    const { getByTestId, onSend } = setup({ value: 'why is my recovery low' });
    fireEvent.press(getByTestId('coach-send-button'));
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  // A turn can hold the backend for up to a minute; a second tap must not
  // start another one.
  it('refuses to send again while a turn is in flight', () => {
    const { getByTestId, onSend } = setup({ value: 'hello', busy: true });
    fireEvent.press(getByTestId('coach-send-button'));
    expect(onSend).not.toHaveBeenCalled();
  });

  it('reports the stop glyph while busy and the arrow otherwise', () => {
    const { getByTestId, rerender } = setup({ value: 'hello' });
    expect(getByTestId('coach-send-glyph').props.accessibilityLabel).toBe('Send');

    rerender(<PromptBar value="hello" onChangeText={jest.fn()} onSend={jest.fn()} busy />);
    expect(getByTestId('coach-send-glyph').props.accessibilityLabel).toBe('Working');
  });

  it('opens the command menu on a slash and filters as you type', () => {
    const { getByTestId, queryByTestId, rerender } = setup({ value: '/' });
    expect(getByTestId('coach-command-menu')).toBeTruthy();
    expect(getByTestId('coach-command-sleep')).toBeTruthy();

    rerender(<PromptBar value="/sle" onChangeText={jest.fn()} onSend={jest.fn()} busy={false} />);
    expect(getByTestId('coach-command-sleep')).toBeTruthy();
    expect(queryByTestId('coach-command-recovery')).toBeNull();
  });

  it('closes the menu once the command token is finished', () => {
    const { queryByTestId } = setup({ value: '/recovery and also' });
    expect(queryByTestId('coach-command-menu')).toBeNull();
  });

  it('replaces the typed command with its full prompt when picked', () => {
    const { getByTestId, onChangeText } = setup({ value: '/sle' });
    fireEvent.press(getByTestId('coach-command-sleep'));
    const sleep = COACH_COMMANDS.find((c) => c.key === 'sleep')!;
    expect(onChangeText).toHaveBeenCalledWith(sleep.prompt);
  });

  it('shows no menu when the caller passes no commands', () => {
    const { queryByTestId } = setup({ value: '/', commands: [] });
    expect(queryByTestId('coach-command-menu')).toBeNull();
  });

  it('opens the shortcuts from the hint under an empty bar', () => {
    const { getByTestId, onChangeText } = setup({ value: '' });
    expect(getByTestId('coach-commands-button')).toHaveTextContent('Type / for shortcuts');
    fireEvent.press(getByTestId('coach-commands-button'));
    expect(onChangeText).toHaveBeenCalledWith('/');
  });

  it('hides the shortcuts hint once there is text, and while a turn runs', () => {
    expect(setup({ value: 'How did I sleep?' }).queryByTestId('coach-commands-button')).toBeNull();
    expect(setup({ value: '', busy: true }).queryByTestId('coach-commands-button')).toBeNull();
  });

  it('keeps the field and the send control in one row', () => {
    const { getByTestId } = setup({ value: 'Hi' });
    const bar = getByTestId('coach-prompt-bar');
    expect(bar).toContainElement(getByTestId('coach-input'));
    expect(bar).toContainElement(getByTestId('coach-send-button'));
    expect(bar.props.className).toContain('flex-row');
  });

  it('paints the send control as active while busy, so a running turn still reads as live', () => {
    const { getByTestId } = setup({ value: '', busy: true });
    // Empty field, but a turn is running: the control must not look dormant.
    expect(getByTestId('coach-send-button').props.accessibilityLabel).toBe('Working');
  });

  // Streaming answers can be stopped (coach redesign, spec 1.4).
  it('turns the square into a Stop button while busy when the caller can stop', () => {
    const onStop = jest.fn();
    const { getByTestId, onSend } = setup({ value: '', busy: true, onStop });
    const button = getByTestId('coach-send-button');

    expect(button.props.accessibilityLabel).toBe('Stop');
    expect(getByTestId('coach-send-glyph').props.accessibilityLabel).toBe('Stop');
    expect(button.props.accessibilityState).toEqual({ disabled: false });
    fireEvent.press(button);
    expect(onStop).toHaveBeenCalledTimes(1);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('sends as before when not busy, even with a stop handler', () => {
    const onStop = jest.fn();
    const { getByTestId, onSend } = setup({ value: 'hello', onStop });
    fireEvent.press(getByTestId('coach-send-button'));
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onStop).not.toHaveBeenCalled();
  });
});
