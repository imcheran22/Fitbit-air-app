import React from 'react';
import { AccessibilityInfo, StyleSheet } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import type { AnswerCardDTO } from '../../src/api/coach';
import { AnswerCard } from '../../src/components/coach/AnswerCard';
import { ErrorCard } from '../../src/components/coach/ErrorCard';
import { FollowUpChips } from '../../src/components/coach/FollowUpChips';
import { COLORS } from '../../src/theme';

let mockScheme: 'light' | 'dark' = 'light';
jest.mock('nativewind', () => ({
  ...jest.requireActual('nativewind'),
  useColorScheme: () => ({ colorScheme: mockScheme, setColorScheme: jest.fn(), toggleColorScheme: jest.fn() }),
}));

const style = (el: { props: { style?: unknown } }) => StyleSheet.flatten(el.props.style as never) as Record<string, unknown>;

const tiles: AnswerCardDTO = {
  headline: 'Decent night, broken after 4am',
  tiles: [
    { factId: 'sleep.total', label: 'total', display: '6h 48m', value: 408, usual: 433, status: 'below' },
    { factId: 'sleep.deep', label: 'deep', display: '1h 12m', value: 72, usual: 70, status: 'near' },
    { factId: 'sleep.wakeups', label: 'wake-ups', display: '4', value: 4 },
  ],
  tip: 'a cooler room tonight, then see if the early wake-ups drop.',
  source: 'Sleep · last night vs your 30-day usual',
};

const ranked: AnswerCardDTO = {
  headline: 'What moves your recovery',
  ranked: [
    { factId: 'habit.caffeine_late', label: 'Caffeine after 2pm', display: '−8 pts', value: -8 },
    { factId: 'habit.walk', label: 'Evening walk', display: '+6 pts', value: 6 },
    { factId: 'habit.alcohol', label: 'Alcohol', display: '−4 pts · low confidence', value: -4 },
  ],
  source: 'Habit correlations · last 90 days',
};

beforeEach(() => {
  mockScheme = 'light';
});

describe('AnswerCard', () => {
  it('shows the headline and one tile per number, with how each compares to usual', () => {
    const { getByTestId } = render(<AnswerCard card={tiles} />);

    expect(getByTestId('answer-card')).toHaveTextContent(/^Decent night, broken after 4am/);
    expect(getByTestId('answer-tile-sleep.total')).toHaveTextContent('6h 48mtotal · below usual');
    expect(getByTestId('answer-tile-sleep.deep')).toHaveTextContent('1h 12mdeep · on par');
    expect(getByTestId('answer-tile-sleep.wakeups')).toHaveTextContent('4wake-ups');
  });

  it('words a resting HR above usual by the number, though its status is below', () => {
    const card: AnswerCardDTO = {
      headline: 'Resting HR up',
      tiles: [{ factId: 'rhr.today', label: 'resting HR', display: '62 bpm', value: 62, usual: 56, status: 'below' }],
      source: 'Resting HR · today vs your 30-day usual',
    };
    const { getByTestId } = render(<AnswerCard card={card} />);

    expect(getByTestId('answer-tile-rhr.today')).toHaveTextContent('62 bpmresting HR · above usual');
  });

  // R41: the difference from usual, like the chosen mockup ("total · −25m vs usual").
  it('shows the difference from usual when the server sends it, and reads it in words', () => {
    const card: AnswerCardDTO = {
      headline: 'Decent night',
      tiles: [
        { factId: 'sleep.total', label: 'total', display: '6h 48m', value: 408, usual: 433, status: 'near', deltaDisplay: '−25m' },
        { factId: 'sleep.long', label: 'longest', display: '9h 0m', value: 540, usual: 433, status: 'above', deltaDisplay: '+1h 47m' },
        { factId: 'rhr.today', label: 'resting HR', display: '61 bpm', value: 61, usual: 57, status: 'below', deltaDisplay: '+4 bpm' },
        { factId: 'recovery.today', label: 'recovery', display: '46', value: 46, usual: 58, status: 'below', deltaDisplay: '−12 points' },
      ],
      source: 'Today',
    };
    const { getByTestId } = render(<AnswerCard card={card} />);

    expect(getByTestId('answer-tile-sleep.total')).toHaveTextContent('6h 48mtotal · −25m vs usual');
    expect(getByTestId('answer-tile-rhr.today')).toHaveTextContent('61 bpmresting HR · +4 bpm vs usual');
    expect(getByTestId('answer-tile-sleep.total').props.accessibilityLabel).toBe('total 6h 48m, 25 minutes below usual');
    expect(getByTestId('answer-tile-sleep.long').props.accessibilityLabel).toBe('longest 9h 0m, 1 hour 47 minutes above usual');
    expect(getByTestId('answer-tile-rhr.today').props.accessibilityLabel).toBe('resting HR 61 bpm, 4 beats per minute above usual');
    expect(getByTestId('answer-tile-recovery.today').props.accessibilityLabel).toBe('recovery 46, 12 points below usual');
  });

  it('sets tile captions as text-caption', () => {
    const { getByTestId } = render(<AnswerCard card={tiles} />);

    expect(String(getByTestId('answer-tile-caption-sleep.total').props.className)).toContain('text-caption');
  });

  it('says nothing about usual when there is no usual and the value is not near it', () => {
    const card: AnswerCardDTO = {
      headline: 'h',
      tiles: [
        { factId: 'a', label: 'below', display: '1', value: 1, status: 'below' },
        { factId: 'b', label: 'near', display: '2', value: 2, status: 'near' },
      ],
      source: 's',
    };
    const { getByTestId } = render(<AnswerCard card={card} />);

    expect(getByTestId('answer-tile-a')).toHaveTextContent(/^1below$/);
    expect(getByTestId('answer-tile-a').props.accessibilityLabel).toBe('below 1');
    expect(getByTestId('answer-tile-b')).toHaveTextContent('2near · on par');
  });

  // The mockup's grid: three equal columns; a 4th tile wraps at a third of the row.
  it('lays tiles out in three equal columns', () => {
    const four: AnswerCardDTO = {
      ...tiles,
      tiles: [...tiles.tiles!, { factId: 'sleep.rem', label: 'REM', display: '1h 30m', value: 90 }],
    };
    const { getByTestId } = render(<AnswerCard card={four} />);

    for (const id of ['sleep.total', 'sleep.deep', 'sleep.wakeups', 'sleep.rem']) {
      expect(style(getByTestId(`answer-tile-cell-${id}`)).width).toBe('33.3333%');
    }
  });

  it('renders a repeated fact id twice without a key clash', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const card: AnswerCardDTO = { ...ranked, ranked: [ranked.ranked![0]!, ranked.ranked![0]!] };
    const { getAllByText } = render(<AnswerCard card={card} />);

    expect(getAllByText('Caffeine after 2pm')).toHaveLength(2);
    expect(spy.mock.calls.some((call) => String(call[0]).includes('same key'))).toBe(false);
    spy.mockRestore();
  });

  it('shows the ranked effect brighter than the source line', () => {
    const { getByTestId } = render(<AnswerCard card={ranked} />);

    // The plain source line (nowhere to open) keeps the muted token; the effect uses the text token at 80%.
    expect(String(getByTestId('answer-rank-effect-1').props.className)).toContain('text-foreground/80');
    expect(String(getByTestId('answer-source').props.className)).toContain('text-muted-foreground');
  });

  it('draws an openable source as a standard link Button with a chevron', () => {
    const { getByTestId } = render(<AnswerCard card={ranked} onOpenSource={() => {}} />);

    // The shadcn link look (foreground, underlined), not a hand-rolled muted line.
    const label = getByTestId('answer-source-label');
    expect(label.props.children).toBe('Habit correlations · last 90 days');
    expect(String(label.props.className).split(' ')).toEqual(expect.arrayContaining(['text-foreground', 'underline']));
    expect(String(getByTestId('answer-source').props.className).split(' ')).toEqual(expect.arrayContaining(['h-auto', 'px-0', 'self-start']));
  });

  it('reads each tile to a screen reader in words', () => {
    const { getByTestId } = render(<AnswerCard card={tiles} />);

    expect(getByTestId('answer-tile-sleep.total').props.accessibilityLabel).toBe('total 6h 48m, below usual');
    expect(getByTestId('answer-tile-sleep.wakeups').props.accessibilityLabel).toBe('wake-ups 4');
  });

  // R40: tile numbers take the text-safe status colours (rose/teal-700 in
  // light mode); a value near usual stays in the text colour.
  it('colours tile values with the text-safe status colours in light mode', () => {
    const { getByTestId } = render(<AnswerCard card={tiles} />);

    expect(style(getByTestId('answer-tile-value-sleep.total')).color).toBe(COLORS.light.statusBelowText);
    expect(style(getByTestId('answer-tile-value-sleep.total')).color).not.toBe(COLORS.light.statusBelow);
    expect(style(getByTestId('answer-tile-value-sleep.deep')).color).toBe(COLORS.light.foreground);
  });

  it('colours a tile value by its status in dark mode', () => {
    mockScheme = 'dark';
    const { getByTestId } = render(<AnswerCard card={tiles} />);

    expect(style(getByTestId('answer-tile-value-sleep.total')).color).toBe(COLORS.dark.statusBelowText);
    expect(style(getByTestId('answer-tile-value-sleep.deep')).color).toBe(COLORS.dark.foreground);
  });

  it('shows a ranked list with bars sized to the effect and coloured by its sign', () => {
    const { getByTestId, queryByTestId } = render(<AnswerCard card={ranked} />);

    expect(getByTestId('answer-rank-1')).toHaveTextContent('1Caffeine after 2pm−8 pts');
    expect(getByTestId('answer-rank-3')).toHaveTextContent('3Alcohol−4 pts · low confidence');
    expect(getByTestId('answer-rank-1').props.accessibilityLabel).toBe('1. Caffeine after 2pm, −8 pts');
    expect(style(getByTestId('answer-rank-bar-1')).width).toBe(70);
    expect(style(getByTestId('answer-rank-bar-2')).width).toBeCloseTo(52.5);
    expect(style(getByTestId('answer-rank-bar-1')).backgroundColor).toBe(COLORS.light.statusBelow);
    expect(style(getByTestId('answer-rank-bar-2')).backgroundColor).toBe(COLORS.light.statusAbove);
    expect(queryByTestId(/^answer-tile-/)).toBeNull();
  });

  it('prefixes the tip with "Try:" once', () => {
    const { getByTestId, rerender } = render(<AnswerCard card={tiles} />);
    expect(getByTestId('answer-tip')).toHaveTextContent('Try: a cooler room tonight, then see if the early wake-ups drop.');

    rerender(<AnswerCard card={{ ...tiles, tip: 'Try: an earlier night.' }} />);
    expect(getByTestId('answer-tip')).toHaveTextContent(/^Try: an earlier night\.$/);
  });

  it('opens the source when its line is tapped, and has no tip line without a tip', () => {
    const onOpenSource = jest.fn();
    const { getByTestId, queryByTestId } = render(<AnswerCard card={ranked} onOpenSource={onOpenSource} />);

    expect(queryByTestId('answer-tip')).toBeNull();
    const source = getByTestId('answer-source');
    // The chevron is the Button's iconEnd now, not a › in the label.
    expect(getByTestId('answer-source-label').props.children).toBe('Habit correlations · last 90 days');
    expect(source.props.accessibilityRole).toBe('link');
    expect(source.props.accessibilityLabel).toBe('Habit correlations · last 90 days');
    fireEvent.press(source);
    expect(onOpenSource).toHaveBeenCalledTimes(1);
  });

  it('shows the source as plain text when there is nowhere to open', () => {
    const { getByTestId } = render(<AnswerCard card={ranked} />);

    expect(getByTestId('answer-source')).toHaveTextContent(/^Habit correlations · last 90 days$/);
  });
});

describe('FollowUpChips', () => {
  it('asks the tapped question', () => {
    const onAsk = jest.fn();
    const { getByTestId } = render(<FollowUpChips questions={['Why after 4am?', "How's my week?"]} onAsk={onAsk} />);

    fireEvent.press(getByTestId('follow-up-1'));

    expect(onAsk).toHaveBeenCalledWith("How's my week?");
    expect(getByTestId('follow-up-0').props.accessibilityRole).toBe('button');
  });

  it('cannot be tapped while an answer is streaming', () => {
    const onAsk = jest.fn();
    const { getByTestId } = render(<FollowUpChips questions={['Why after 4am?']} onAsk={onAsk} disabled />);

    fireEvent.press(getByTestId('follow-up-0'));

    expect(onAsk).not.toHaveBeenCalled();
  });

  it('lets a long question wrap instead of truncating it', () => {
    const question = "What's been moving my resting heart rate lately?";
    const { getByTestId } = render(<FollowUpChips questions={[question]} onAsk={() => {}} />);

    const label = getByTestId('follow-up-0-label');
    expect(label.props.children).toBe(question);
    expect(label.props.numberOfLines).toBeUndefined();
    // The chip grows with its lines: no fixed 32px height, exact px padding.
    const classes = String(getByTestId('follow-up-0').props.className).split(' ');
    expect(classes).toEqual(expect.arrayContaining(['h-auto', 'min-h-[32px]', 'py-[6px]', 'max-w-full']));
    expect(classes).not.toContain('h-[32px]');
  });

  it('renders nothing when there are no follow-ups', () => {
    const { queryByTestId } = render(<FollowUpChips questions={[]} onAsk={() => {}} />);

    expect(queryByTestId('follow-up-chips')).toBeNull();
  });
});

describe('ErrorCard', () => {
  const request = { message: 'How did I sleep?' };

  it.each([
    ['unavailable', "I couldn't answer that just now."],
    ['timeout', 'That took too long. Nothing was lost; you can try again.'],
    ['interrupted', 'The answer stopped part-way. You can try again.'],
    ['busy', "I'm still finishing your last answer. Give it a moment, then try again."],
    ['rate_limited', "You've sent a lot of messages in a short time. Try again a little later."],
  ] as const)('explains %s and offers retry', (kind, text) => {
    const onRetry = jest.fn();
    const { getByTestId } = render(<ErrorCard error={{ kind, retryable: true, received: true, request }} onRetry={onRetry} />);

    expect(getByTestId('coach-error')).toHaveTextContent(text);
    fireEvent.press(getByTestId('coach-retry-button'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it.each([
    [20, 'Try again in under a minute.'],
    [60, 'Try again in about a minute.'],
    [150, 'Try again in about 3 minutes.'],
    [7200, 'Try again in about 2 hours.'],
  ])('says when to try again after a rate limit of %ss', (retryAfterSeconds, text) => {
    const { getByTestId } = render(<ErrorCard error={{ kind: 'rate_limited', retryable: true, received: false, retryAfterSeconds, request }} onRetry={() => {}} />);

    expect(getByTestId('coach-error')).toHaveTextContent(`You've sent a lot of messages in a short time. ${text}`);
  });

  it('offers no retry when the server says it would not help, and suggests rephrasing', () => {
    const { getByTestId, queryByTestId } = render(<ErrorCard error={{ kind: 'unavailable', retryable: false, received: true, request }} onRetry={() => {}} />);

    expect(queryByTestId('coach-retry-button')).toBeNull();
    expect(getByTestId('coach-error')).toHaveTextContent("I couldn't answer that just now. Try asking it a different way.");
  });

  it('says the connection dropped when nothing arrived before the interruption', () => {
    const { getByTestId } = render(<ErrorCard error={{ kind: 'interrupted', retryable: true, received: false, request }} onRetry={() => {}} />);

    expect(getByTestId('coach-error')).toHaveTextContent('The connection dropped before I could answer. You can try again.');
  });

  describe('waiting out a rate limit', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('keeps Try again disabled until Retry-After has passed, counted from when the error appeared', () => {
      const onRetry = jest.fn();
      const error = { kind: 'rate_limited', retryable: true, received: false, retryAfterSeconds: 30, request } as const;
      const { getByTestId } = render(<ErrorCard error={error} onRetry={onRetry} />);

      const button = () => getByTestId('coach-retry-button');
      expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));
      fireEvent.press(button());
      expect(onRetry).not.toHaveBeenCalled();

      act(() => jest.advanceTimersByTime(29_000));
      expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

      expect(getByTestId('coach-error')).toHaveTextContent("You've sent a lot of messages in a short time. Try again in under a minute.");

      act(() => jest.advanceTimersByTime(1_000));
      expect(button().props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
      expect(getByTestId('coach-error')).toHaveTextContent(/^You've sent a lot of messages in a short time\. You can try again now\.$/);
      fireEvent.press(button());
      expect(onRetry).toHaveBeenCalledTimes(1);
    });

    it('starts a new wait for a new rate-limit error and clears its timer on unmount', () => {
      const first = { kind: 'rate_limited', retryable: true, received: false, retryAfterSeconds: 10, request } as const;
      const { getByTestId, rerender, unmount } = render(<ErrorCard error={first} onRetry={() => {}} />);
      act(() => jest.advanceTimersByTime(10_000));
      expect(getByTestId('coach-retry-button').props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));

      rerender(<ErrorCard error={{ ...first }} onRetry={() => {}} />);
      expect(getByTestId('coach-retry-button').props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

      const clear = jest.spyOn(global, 'clearTimeout');
      unmount();
      expect(clear).toHaveBeenCalled();
      clear.mockRestore();
    });

    it('does not hold back a rate limit without Retry-After', () => {
      const { getByTestId } = render(<ErrorCard error={{ kind: 'rate_limited', retryable: true, received: false, request }} onRetry={() => {}} />);

      expect(getByTestId('coach-retry-button').props.accessibilityState).toEqual(expect.objectContaining({ disabled: false }));
    });
  });

  it('announces the error once when it appears', () => {
    const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});
    announce.mockClear();
    const error = { kind: 'timeout', retryable: true, received: false, request } as const;
    const { getByTestId, rerender } = render(<ErrorCard error={error} onRetry={() => {}} />);

    expect(getByTestId('coach-error').props.accessibilityLiveRegion).toBe('polite');
    rerender(<ErrorCard error={error} onRetry={() => {}} />);
    expect(announce).toHaveBeenCalledTimes(1);
    expect(announce).toHaveBeenCalledWith('That took too long. Nothing was lost; you can try again.');
    announce.mockRestore();
  });
});
