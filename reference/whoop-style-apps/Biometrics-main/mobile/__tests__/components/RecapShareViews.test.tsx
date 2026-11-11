import React from 'react';
import { StyleSheet } from 'react-native';
import { render, screen, within } from '@testing-library/react-native';
import { HIDDEN_OK } from '../../jest-mocks/characterContext';
import type { Recap } from '../../src/api/recaps';
import { RecapCardView } from '../../src/components/recap/RecapCardView';
import { coachStoryFit, STORY_FRAME_COUNT, WeeklyStoryFrame, WeeklyStoryView } from '../../src/components/recap/WeeklyStoryView';
import { YearPixelsView } from '../../src/components/recap/YearPixelsView';
import { quoteLines, resolveIncludes } from '../../src/lib/recapShare';
import { recapTint, yearCell } from '../../src/lib/recapTheme';
import { yearPixels } from '../../src/lib/yearPixels';

const BASE = { personaId: 'luna', builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, sleepGoalMinutes: 480, lineSource: 'ai' as const, story: null, rebuiltAt: null };
const MONTH: Recap = {
  ...BASE, id: 'm', kind: 'MONTH', periodStart: '2026-09-01', periodEnd: '2026-09-30', line: 'Six nights in a row on goal, lovely.',
  stats: { nightsWithData: 25, avgSleepMinutes: 425, longestOnGoalStreak: 6, bestRecovery: { date: '2026-09-09', score: 88 } },
};
const WEEK: Recap = {
  ...BASE, id: 'w', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A steady week.', story: 'Five nights on goal and a calm Sunday.',
  stats: {
    nightsWithData: 6, avgSleepMinutes: 455, nightsOnGoal: 5, longestOnGoalStreak: 3, bedtimeSpreadMinutes: 42, comparison: { avgSleepDelta: -12 },
    bestNight: { date: '2026-09-29', minutesAsleep: 485 },
    weekStrip: ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'].map((date, i) => ({
      date, minutesAsleep: i === 2 ? null : 480 - (i === 4 ? 60 : 0), onGoal: i === 2 ? null : i !== 4, recovery: null,
    })),
  },
};
const storyIncludes = resolveIncludes('story', {}, WEEK.stats);

describe('RecapCardView', () => {
  it("draws a 4:5 card on Luna's ground: MY {MONTH}, the sprite beside \"Luna's month\", the quote, stat tiles and the footer", () => {
    render(<RecapCardView recap={MONTH} coachId="luna" includes={resolveIncludes('card', { bestRecovery: true }, MONTH.stats)} scale={1.5} />);
    expect(screen.getByTestId('recap-card')).toHaveStyle({ width: 540, height: 675, backgroundColor: '#12132A' });
    expect(screen.getByTestId('recap-card-month')).toHaveTextContent('MY SEPTEMBER');
    expect(screen.getByTestId('recap-card-title')).toHaveTextContent("Luna's month");
    expect(screen.getByTestId('recap-card-coach', HIDDEN_OK)).toBeTruthy();
    expect(screen.getByTestId('recap-card-quote')).toHaveTextContent('“Six nights in a row on goal, lovely.”');
    expect(screen.getByTestId('recap-card-stat-avgSleep')).toHaveTextContent('AVERAGE SLEEP7h 5m');
    expect(screen.getByTestId('recap-card-stat-bestRecovery')).toHaveTextContent('BEST RECOVERY88');
    expect(screen.queryByTestId('recap-card-stat-steps')).toBeNull();
    expect(screen.getByText('Find your coach')).toBeTruthy();
    expect(screen.getByTestId('recap-card-app')).toHaveTextContent('Biometrics');
    expect(screen.getByTestId('recap-card-dots', HIDDEN_OK)).toBeTruthy();
  });

  it('tints the card with its coach', () => {
    render(<RecapCardView recap={MONTH} coachId="mochi" includes={resolveIncludes('card', {}, MONTH.stats)} scale={1} />);
    expect(screen.getByTestId('recap-card')).toHaveStyle({ backgroundColor: '#2A1420' });
    expect(screen.getByTestId('recap-card-title')).toHaveTextContent("Mochi's month");
  });

  it('leaves out what is switched off, Best recovery by default', () => {
    render(<RecapCardView recap={MONTH} coachId="luna" includes={resolveIncludes('card', { quote: false, coach: false, streak: false }, MONTH.stats)} scale={1} />);
    expect(screen.queryByTestId('recap-card-quote')).toBeNull();
    expect(screen.queryByTestId('recap-card-coach', HIDDEN_OK)).toBeNull();
    expect(screen.queryByTestId('recap-card-stat-streak')).toBeNull();
    expect(screen.queryByTestId('recap-card-stat-bestRecovery')).toBeNull();
  });
});

describe('WeeklyStoryFrame', () => {
  it('has three frames, each 9:16 with the progress bar filled up to it and "MY WEEK · N OF 3"', () => {
    expect(STORY_FRAME_COUNT).toBe(3);
    for (const index of [0, 1, 2] as const) {
      const { unmount } = render(<WeeklyStoryFrame recap={WEEK} coachId="mochi" includes={storyIncludes} scale={1.5} index={index} />);
      expect(screen.getByTestId('recap-story')).toHaveStyle({ width: 540, height: 960, backgroundColor: '#2A1420' });
      expect(screen.getByTestId('recap-story-eyebrow')).toHaveTextContent(`MY WEEK · ${index + 1} OF 3`);
      expect([0, 1, 2].map((i) => screen.getByTestId(`recap-story-progress-${i}`).props.accessibilityLabel)).toEqual([0, 1, 2].map((i) => (i <= index ? '100%' : '0%')));
      expect(screen.getByTestId('recap-story-app')).toHaveTextContent('Biometrics');
      unmount();
    }
  });

  it('frame 1: the big numbers, the change on last week coloured by direction', () => {
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={0} />);
    expect(screen.getByTestId('recap-story-title')).toHaveTextContent('My week');
    expect(screen.getByTestId('recap-story-stat-avgSleep')).toHaveTextContent('AVERAGE SLEEP7h 35m');
    expect(screen.getByTestId('recap-story-stat-onGoal')).toHaveTextContent('NIGHTS ON GOAL5 of 6');
    expect(screen.getByTestId('recap-story-stat-change')).toHaveTextContent('VS LAST WEEK−12m');
    expect(within(screen.getByTestId('recap-story-stat-change')).getByText('−12m')).toHaveStyle({ color: '#FDBA74' });
    expect(screen.getByTestId('recap-story-range')).toHaveTextContent('Sep 28 – Oct 4');
  });

  it('frame 1 without numbers shows the line instead', () => {
    render(<WeeklyStoryFrame recap={{ ...WEEK, stats: { nightsWithData: 0 } }} coachId="luna" includes={resolveIncludes('story', {}, { nightsWithData: 0 })} scale={1} index={0} />);
    expect(screen.getByTestId('recap-story-quote')).toHaveTextContent('“A steady week.”');
  });

  it('frame 2: seven coaches, dimmed on nights not on goal or without data; the best night and "<Coach> says"', () => {
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={1} />);
    expect(screen.getByTestId('recap-story-title')).toHaveTextContent('How Luna saw my week');
    expect(screen.getByTestId('recap-story-day-2026-09-28').props.accessibilityLabel).toBe('M: on goal');
    expect(screen.getByTestId('recap-story-day-2026-09-30').props.accessibilityLabel).toBe('W: no data');
    expect(screen.getByTestId('recap-story-day-2026-10-02').props.accessibilityLabel).toBe('F: short');
    expect(screen.getByTestId('recap-story-sprite-2026-09-28')).toHaveStyle({ opacity: 1 });
    expect(screen.getByTestId('recap-story-sprite-2026-09-30')).toHaveStyle({ opacity: 0.45 });
    expect(screen.getByTestId('recap-story-sprite-2026-10-02')).toHaveStyle({ opacity: 0.45 });
    expect(screen.getAllByTestId('character-canvas', HIDDEN_OK)).toHaveLength(7);
    expect(screen.getByTestId('recap-story-best')).toHaveTextContent('BEST NIGHTTuesday · 8h 5m');
    expect(screen.getByTestId('recap-story-says')).toHaveTextContent('LUNA SAYS“A steady week.”');
  });

  it('frame 2 with the coach switched off draws squares, not sprites', () => {
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={{ ...storyIncludes, coach: false }} scale={1} index={1} />);
    expect(screen.queryAllByTestId('character-canvas', HIDDEN_OK)).toHaveLength(0);
    expect(screen.getByTestId('recap-story-sprite-2026-10-02')).toHaveStyle({ opacity: 0.45 });
  });

  it("frame 3: the coach's story, the streak and the spread, and the footer", () => {
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} />);
    expect(screen.getByTestId('recap-story-title')).toHaveTextContent('Notes from Luna');
    expect(screen.getByTestId('recap-story-story')).toHaveTextContent('Five nights on goal and a calm Sunday.');
    expect(screen.getByTestId('recap-story-stat-streak')).toHaveTextContent('LONGEST STREAK3 nights');
    expect(screen.getByTestId('recap-story-stat-spread')).toHaveTextContent('BEDTIME SPREAD42m');
    expect(screen.getByText('Find your coach')).toBeTruthy();
  });

  it('frame 3 without a story (coach off) shows the line, never nothing', () => {
    render(<WeeklyStoryFrame recap={{ ...WEEK, story: null }} coachId="luna" includes={storyIncludes} scale={1} index={2} />);
    expect(screen.getByTestId('recap-story-story')).toHaveTextContent('A steady week.');
  });

  it('keeps the bar room but hides it for the story viewer to draw its own', () => {
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={0} showProgress={false} />);
    expect(screen.getByTestId('recap-story-progress-slot')).toHaveStyle({ opacity: 0 });
    expect(screen.getByTestId('recap-story-progress')).toBeTruthy();
  });

  it('WeeklyStoryView is frame 2', () => {
    render(<WeeklyStoryView recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} />);
    expect(screen.getByTestId('recap-story-eyebrow')).toHaveTextContent('MY WEEK · 2 OF 3');
  });

  it('frame 3 lists the badge levels earned that week in a card, and leaves room for it', () => {
    const badges = [{ family: 'SLEEP_GOAL' as const, level: 2 }, { family: 'STEADY_BEDTIME' as const, level: 1 }];
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={badges} />);
    expect(screen.getByTestId('recap-story-badges')).toHaveTextContent(/BADGES THIS WEEK/);
    expect(screen.getByTestId('recap-story-badge-SLEEP_GOAL-2')).toHaveTextContent('Sleep goal II');
    expect(screen.getByTestId('recap-story-badge-STEADY_BEDTIME-1')).toHaveTextContent('Bedtime I');
    expect(screen.getByTestId('recap-story-badge-SLEEP_GOAL-2-icon').props.accessibilityLabel).toBe('Sleep goal streak, level II, Silver');
    expect(screen.queryByTestId('recap-story-badges-more')).toBeNull();
    expect(coachStoryFit(WEEK, storyIncludes, 2).box).toBeLessThan(coachStoryFit(WEEK, storyIncludes).box);
  });

  it('shows no badge card without badges that week, and never on frames 1 and 2', () => {
    const first = render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={[]} />);
    expect(screen.queryByTestId('recap-story-badges')).toBeNull();
    first.unmount();
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={1} badges={[{ family: 'SLEEP_GOAL', level: 1 }]} />);
    expect(screen.queryByTestId('recap-story-badges')).toBeNull();
  });

  it('leaves the card out when "Badges this week" is switched off, and gives the story its room back', () => {
    const badges = [{ family: 'SLEEP_GOAL' as const, level: 2 }];
    const off = { ...storyIncludes, badges: false };
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={off} scale={1} index={2} badges={badges} />);
    expect(screen.queryByTestId('recap-story-badges')).toBeNull();
    expect(coachStoryFit(WEEK, off, 0).box).toBe(coachStoryFit(WEEK, storyIncludes).box);
  });

  it('shows at most four badges, then a "+n" chip for the rest (ruling F4)', () => {
    const badges = (['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'EVERY_DAY_LOGGED'] as const).map((family) => ({ family, level: 1 }));
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={badges} />);
    expect(screen.getByTestId('recap-story-badge-CHECK_IN-1')).toBeTruthy();
    expect(screen.queryByTestId('recap-story-badge-EVERY_DAY_LOGGED-1')).toBeNull();
    expect(screen.getByTestId('recap-story-badges-more')).toHaveTextContent('+1');
    expect(screen.getByTestId('recap-story-badges-more').props.accessibilityLabel).toBe('1 more badge this week');
  });

  it('above four, shows the highest level of each family first and counts the lower ones in the chip', () => {
    const badges = [
      { family: 'SLEEP_GOAL' as const, level: 1 }, { family: 'SLEEP_GOAL' as const, level: 2 }, { family: 'SLEEP_GOAL' as const, level: 3 },
      { family: 'STEADY_BEDTIME' as const, level: 1 }, { family: 'STEADY_BEDTIME' as const, level: 2 }, { family: 'STEP_GOAL' as const, level: 1 },
    ];
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={badges} />);
    const shown = within(screen.getByTestId('recap-story-badges')).getAllByTestId(/^recap-story-badge-[A-Z_]+-\d$/).map((n) => n.props.testID);
    expect(shown).toEqual(['recap-story-badge-SLEEP_GOAL-3', 'recap-story-badge-STEADY_BEDTIME-2', 'recap-story-badge-STEP_GOAL-1', 'recap-story-badge-SLEEP_GOAL-2']);
    expect(screen.getByTestId('recap-story-badges-more')).toHaveTextContent('+2');
    expect(screen.getByTestId('recap-story-badges-more').props.accessibilityLabel).toBe('2 more badges this week');
  });
});

describe('YearPixelsView', () => {
  it('draws every night in rows of 26 on the four-step purple scale, with the count and the current-goal caption', () => {
    const pixels = yearPixels(2026, [{ date: '2026-01-02', minutesAsleep: 500 }, { date: '2026-01-03', minutesAsleep: 400 }, { date: '2026-01-04', minutesAsleep: 200 }], 450, '2026-10-05');
    render(<YearPixelsView year={2026} pixels={pixels} goalMinutes={450} coachId="luna" includes={resolveIncludes('year', {}, null)} scale={1.5} />);
    expect(screen.getByTestId('year-pixels')).toHaveStyle({ width: 540, height: 540, backgroundColor: '#12132A' });
    expect(screen.getByTestId('year-pixels-eyebrow')).toHaveTextContent('2026 IN PIXELS');
    expect(screen.getByText('Every night, one square')).toBeTruthy();
    expect(screen.getByTestId('year-pixels-row-0').children).toHaveLength(26);
    expect(screen.queryByTestId('year-pixels-row-14')).toBeTruthy();
    expect(screen.queryByTestId('year-pixels-row-15')).toBeNull();
    const cell = (d: string) => screen.getByTestId(`year-pixels-cell-${d}`);
    const t = recapTint('luna');
    expect([cell('2026-01-04'), cell('2026-01-03'), cell('2026-01-02')].map((c) => StyleSheet.flatten(c.props.style).backgroundColor)).toEqual(['#6B4FA8', '#9333EA', '#D8B4FE']);
    // No data: an empty, outlined square; a night still to come: a faint fill, no outline.
    expect(StyleSheet.flatten(cell('2026-01-01').props.style)).toMatchObject({ backgroundColor: 'transparent', borderColor: yearCell('none', t).outline });
    expect(cell('2026-01-01').props.accessibilityLabel).toBe('no data');
    expect(StyleSheet.flatten(cell('2026-12-31').props.style)).toMatchObject({ backgroundColor: yearCell('future', t).fill, borderWidth: 0 });
    expect(cell('2026-01-02').props.accessibilityLabel).toBe('on goal');
    // "No data" has its own swatch, apart from the sleep scale.
    expect(screen.getByTestId('year-pixels-legend-none')).toHaveTextContent('No data');
    expect(screen.getByTestId('year-pixels-legend-scale')).toHaveTextContent('ShortOn goal');
    expect(screen.getByTestId('year-pixels-legend').props.accessibilityLabel).toBe('Outlined: no data. Then short, near goal and on goal, light to bright purple');
    expect(screen.getByTestId('year-pixels-count')).toHaveTextContent('1 night on goal');
    expect(screen.getByTestId('year-pixels-caption')).toHaveTextContent('on your current goal of 7h 30m');
    expect(screen.getByTestId('year-pixels-app')).toHaveTextContent('Biometrics');
    // The year artboard is a plain ground: no dot pattern, unlike the card and the story.
    expect(screen.queryByTestId('year-pixels-dots', HIDDEN_OK)).toBeNull();
  });

  it('drops the caption with the count, and the coach when switched off', () => {
    const pixels = yearPixels(2026, [], 450, '2026-10-05');
    render(<YearPixelsView year={2026} pixels={pixels} goalMinutes={450} coachId="luna" includes={{ count: false, coach: false }} scale={2} />);
    expect(screen.queryByTestId('year-pixels-count')).toBeNull();
    expect(screen.queryByTestId('year-pixels-caption')).toBeNull();
    expect(screen.queryByTestId('year-pixels-coach', HIDDEN_OK)).toBeNull();
  });
});

// 30 words, 199 characters: the longest line the coach writes for a recap.
const LONG = 'Six nights running on goal this September, and your bedtimes finally settled into a calm, unhurried rhythm after a rocky start; protect that wind-down routine and October looks wonderfully promising.';

// The quote may shrink (never truncate): its line cap covers the wrapped quote at the size it is drawn.
// `unit` maps a drawn size back to the view's own design units.
function expectQuoteFits(testID: string, unit: number, width: number, text = `“${LONG}”`) {
  const quote = screen.getByTestId(testID);
  const { fontSize } = StyleSheet.flatten(quote.props.style) as { fontSize: number };
  expect(quote.props.adjustsFontSizeToFit).toBe(true);
  expect(quote.props.minimumFontScale).toBe(0.7);
  expect(quote.props.numberOfLines).toBeGreaterThanOrEqual(quoteLines(text, fontSize / unit, width));
}

describe('a 30-word quote', () => {
  it('fits beside the sprite on the card with four stats on, the footer still drawn', () => {
    const recap: Recap = { ...MONTH, line: LONG, stats: { ...MONTH.stats, steps: { total: 210000, dailyAverage: 7000 } } };
    render(<RecapCardView recap={recap} coachId="luna" includes={resolveIncludes('card', { bestRecovery: true }, recap.stats)} scale={1.5} />);
    // The card is laid out on its 540-wide artboard: 1.5 × 360/540 = 1 point a unit.
    expectQuoteFits('recap-card-quote', 1, 268);
    expect(screen.getByTestId('recap-card-stat-steps')).toBeTruthy();
    expect(screen.getByTestId('recap-card-app')).toHaveTextContent('Biometrics');
  });

  it("fits the story's \"says\" card, the app name still drawn", () => {
    render(<WeeklyStoryFrame recap={{ ...WEEK, line: LONG }} coachId="luna" includes={storyIncludes} scale={1} index={1} />);
    expectQuoteFits('recap-story-quote', 1, 278);
    expect(screen.getByTestId('recap-story-app')).toHaveTextContent('Biometrics');
  });

  it('a long weekly story fits frame 3', () => {
    const story = Array.from({ length: 5 }, () => LONG).join(' ');
    render(<WeeklyStoryFrame recap={{ ...WEEK, story }} coachId="luna" includes={storyIncludes} scale={1} index={2} />);
    expectQuoteFits('recap-story-story', 1, 312, story);
  });

  it('a story at the longest the coach can write (about 2,000 characters) shrinks into its box, never truncated', () => {
    const story = Array.from({ length: 10 }, () => LONG).join(' ');
    for (const includes of [storyIncludes, { ...storyIncludes, coach: false }]) {
      const recap = { ...WEEK, story };
      const { unmount } = render(<WeeklyStoryFrame recap={recap} coachId="luna" includes={includes} scale={2} index={2} />);
      const fit = coachStoryFit(recap, includes);
      const text = screen.getByTestId('recap-story-story');
      const { fontSize, lineHeight } = StyleSheet.flatten(text.props.style) as { fontSize: number; lineHeight: number };
      expect(fontSize).toBe(fit.fontSize * 2);
      // At the size drawn, the estimated wrap fits the box the frame leaves it.
      expect(quoteLines(story, fit.fontSize, 312) * lineHeight).toBeLessThanOrEqual(fit.box * 2);
      expect(text.props.numberOfLines).toBeGreaterThanOrEqual(quoteLines(story, fit.fontSize, 312));
      expect(screen.getByTestId('recap-story-stat-spread')).toBeTruthy();
      expect(screen.getByTestId('recap-story-app')).toHaveTextContent('Biometrics');
      unmount();
    }
  });
});

describe('frame 3 with badges: the story is never truncated', () => {
  const FIVE = (['SLEEP_GOAL', 'STEADY_BEDTIME', 'STEP_GOAL', 'CHECK_IN', 'EVERY_DAY_LOGGED'] as const).map((family) => ({ family, level: 1 }));
  const storyOf = (n: number) => Array.from({ length: n }, () => LONG).join(' ');

  // At scale 2: the story is drawn at the fitted size, at least STORY_MIN (6), and its estimated wrap fits the box.
  function expectStoryFits(recap: Recap, includes: typeof storyIncludes, count: number) {
    const fit = coachStoryFit(recap, includes, count);
    const text = screen.getByTestId('recap-story-story');
    const { fontSize, lineHeight } = StyleSheet.flatten(text.props.style) as { fontSize: number; lineHeight: number };
    expect(fontSize).toBe(fit.fontSize * 2);
    expect(fit.fontSize).toBeGreaterThanOrEqual(6);
    expect(quoteLines(recap.story!, fit.fontSize, 312) * lineHeight).toBeLessThanOrEqual(fit.box * 2);
    expect(text.props.numberOfLines).toBeGreaterThanOrEqual(quoteLines(recap.story!, fit.fontSize, 312));
    return fit;
  }

  it('keeps the longest story whole with five badges on, trading the full card for a compact one or a line', () => {
    for (const includes of [storyIncludes, { ...storyIncludes, coach: false }]) {
      const recap = { ...WEEK, story: storyOf(10) };
      const { unmount } = render(<WeeklyStoryFrame recap={recap} coachId="luna" includes={includes} scale={2} index={2} badges={FIVE} />);
      const fit = expectStoryFits(recap, includes, FIVE.length);
      expect(screen.getByTestId('recap-story-badges')).toBeTruthy();
      // With the coach drawn (the tightest frame) the full card no longer fits; without it, it may.
      if (includes.coach) {
        expect(['compact', 'line']).toContain(fit.badges);
        expect(screen.queryByTestId('recap-story-badge-SLEEP_GOAL-1-title')).toBeNull();
      }
      expect(screen.getByTestId('recap-story-stat-spread')).toBeTruthy();
      expect(screen.getByTestId('recap-story-app')).toHaveTextContent('Biometrics');
      unmount();
    }
  });

  it('gives a short story the full card, titles kept readable', () => {
    const badges = [{ family: 'SLEEP_GOAL' as const, level: 2 }, { family: 'EVERY_DAY_LOGGED' as const, level: 3 }];
    expect(coachStoryFit(WEEK, storyIncludes, badges.length).badges).toBe('full');
    render(<WeeklyStoryFrame recap={WEEK} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={badges} />);
    const title = screen.getByTestId('recap-story-badge-EVERY_DAY_LOGGED-3-title');
    expect(title).toHaveTextContent('Every day III');
    expect(title.props.minimumFontScale).toBeGreaterThanOrEqual(0.85);
    expect(screen.queryByTestId('recap-story-badges-line')).toBeNull();
  });

  it('steps down from the full card to a compact one to a line as the story grows, never the other way', () => {
    const rank = { full: 0, compact: 1, line: 2 } as const;
    const seen: (keyof typeof rank)[] = [];
    for (let n = 1; n <= 16; n++) {
      const recap = { ...WEEK, story: storyOf(n) };
      const fit = coachStoryFit(recap, storyIncludes, FIVE.length);
      const mode = fit.badges!;
      if (seen.length > 0) expect(rank[mode]).toBeGreaterThanOrEqual(rank[seen[seen.length - 1]!]);
      seen.push(mode);
      const { unmount } = render(<WeeklyStoryFrame recap={recap} coachId="luna" includes={storyIncludes} scale={2} index={2} badges={FIVE} />);
      if (fit.fontSize > 6 || mode !== 'line') expectStoryFits(recap, storyIncludes, FIVE.length);
      if (mode === 'full') {
        expect(screen.getByTestId('recap-story-badge-SLEEP_GOAL-1-title')).toBeTruthy();
        expect(screen.getByTestId('recap-story-badges-more')).toHaveTextContent('+1');
      } else if (mode === 'compact') {
        expect(screen.getByTestId('recap-story-badge-SLEEP_GOAL-1-icon')).toBeTruthy();
        expect(screen.queryByTestId('recap-story-badge-SLEEP_GOAL-1-title')).toBeNull();
        expect(screen.getByTestId('recap-story-badges-more')).toHaveTextContent('+1');
      } else {
        expect(screen.getByTestId('recap-story-badges-line')).toHaveTextContent('5 badges this week');
        expect(screen.queryByTestId('recap-story-badge-SLEEP_GOAL-1-icon')).toBeNull();
      }
      unmount();
    }
    expect(seen).toEqual(expect.arrayContaining(['full', 'compact', 'line']));
  });

  it('says "1 badge this week" on the line for a single badge', () => {
    const recap = { ...WEEK, story: storyOf(16) };
    expect(coachStoryFit(recap, storyIncludes, 1).badges).toBe('line');
    render(<WeeklyStoryFrame recap={recap} coachId="luna" includes={storyIncludes} scale={1} index={2} badges={[{ family: 'SLEEP_GOAL', level: 2 }]} />);
    expect(screen.getByTestId('recap-story-badges-line')).toHaveTextContent('1 badge this week');
  });

  it('reports no badge room without badges, the box unchanged', () => {
    expect(coachStoryFit(WEEK, storyIncludes).badges).toBeNull();
    expect(coachStoryFit(WEEK, storyIncludes, 0).box).toBe(coachStoryFit(WEEK, storyIncludes).box);
  });
});
