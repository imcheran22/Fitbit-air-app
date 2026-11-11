import type { FactSheet } from '../../src/coach/answer/facts';
import { countDisplay } from '../../src/coach/answer/facts';
import { validateSentence } from '../../src/coach/answer/validate';

const EXACT = { exactNumbers: true } as const;
const ok = { ok: true };
const unknown = { ok: false, reason: 'unknown_number' };

const RECAP: FactSheet = {
  route: 'recap',
  facts: [
    { id: 'sleep.goal', label: 'Sleep goal', value: 480, unit: 'minutes', display: '8h 0m' },
    { id: 'sleep.nights', label: 'Nights with sleep recorded this week', value: 6, unit: 'nights', display: '6 nights' },
    { id: 'sleep.avg', label: 'Average sleep a night', value: 432, unit: 'minutes', display: '7h 12m' },
    { id: 'sleep.on_goal', label: 'Nights at or above the sleep goal', value: 5, unit: 'nights', display: '5 nights' },
    { id: 'sleep.streak', label: 'Most nights on goal in a row', value: 4, unit: 'nights', display: '4 nights' },
    { id: 'recovery.best', label: 'Best recovery (Thursday)', value: 87, unit: 'score', display: '87/100' },
    { id: 'recovery.avg', label: 'Average recovery', value: 71, unit: 'score', display: '71/100' },
    { id: 'steps.total', label: 'Steps in total', value: 52340, unit: 'count', display: '52,340' },
    { id: 'steps.daily_avg', label: 'Average steps a day', value: 7477, unit: 'count', display: '7,477' },
    { id: 'sleep.days_logged', label: 'Days with sleep logged', value: 31, unit: 'days', display: '31 days' },
  ],
  notes: [],
};
const TIMES: FactSheet = {
  route: 'recap',
  facts: [{ id: 'sleep.early', label: 'Early nights', value: 3, unit: 'times', display: '3 times' }],
  notes: [],
};

describe('validateSentence with exactNumbers (recaps)', () => {
  it('rejects a night count that is off by one (6 vs 5)', () => {
    const sheet: FactSheet = {
      route: 'recap',
      facts: [
        { id: 'sleep.nights', label: 'Nights with sleep recorded this week', value: 7, unit: 'nights', display: '7 nights' },
        { id: 'sleep.on_goal', label: 'Nights at or above the sleep goal', value: 5, unit: 'nights', display: '5 nights' },
      ],
      notes: [],
    };
    expect(validateSentence('You reached your goal on 5 nights.', sheet, EXACT)).toEqual(ok);
    expect(validateSentence('You reached your goal on 6 nights.', sheet, EXACT)).toEqual(unknown);
  });

  it('rejects a score off by one (88 vs 87) that the chat check accepts', () => {
    expect(validateSentence('Your best recovery was 87/100.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('Your best recovery was 88/100.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('Your best recovery was 88/100.', RECAP)).toEqual(ok);
  });

  it('checks "7-night streak" and "last 7 nights" as numbers instead of exempting them', () => {
    expect(validateSentence('That was a 4-night streak.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('That was a 7-night streak.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('That was a 7-night streak.', RECAP)).toEqual(ok);
    expect(validateSentence('Over the last 7 nights you slept well.', RECAP, EXACT)).toEqual(unknown);
  });

  it('never lets a steps sentence borrow a night count', () => {
    expect(validateSentence('Your steps averaged 6 a day.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You walked 6 steps.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You walked 52,340 steps, 7,477 a day.', RECAP, EXACT)).toEqual(ok);
  });

  it('lets a bare number match only a count fact, and a night count only next to "nights"', () => {
    expect(validateSentence('You were on goal 5 of 6 nights.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('Recovery averaged 71.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('Recovery averaged 71/100.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('You hit 5.', RECAP, EXACT)).toEqual(unknown);
  });

  it('gives hedges no tolerance and durations exactly ±1 minute', () => {
    expect(validateSentence('You slept about 7 hours a night.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You slept about 7 hours a night.', RECAP)).toEqual(ok);
    expect(validateSentence('You slept 7h 13m a night.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('You slept 7.2 hours a night.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('You slept 7h 14m a night.', RECAP, EXACT)).toEqual(unknown);
  });

  it('reads number words before night, day and time nouns (Review Focus 2)', () => {
    expect(validateSentence('You were on goal five nights.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('You were on goal seven nights.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('That was a seven-night run.', RECAP, EXACT)).toEqual(unknown);
    // The chat check leaves the words alone, which is why recaps need the stricter mode.
    expect(validateSentence('You were on goal seven nights.', RECAP)).toEqual(ok);
  });

  it('keeps days and times as their own families', () => {
    expect(validateSentence('Sleep was logged on 31 days.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('Sleep was logged on 31 nights.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You turned in early 3 times.', TIMES, EXACT)).toEqual(ok);
    expect(validateSentence('You turned in early 4 times.', TIMES, EXACT)).toEqual(unknown);
  });

  it('keeps dates, times of day and the /100 scale exempt', () => {
    expect(validateSentence('On Oct 9 you went to bed at 10:30pm and slept 7h 12m.', RECAP, EXACT)).toEqual(ok);
  });

  it('formats count units', () => {
    expect(countDisplay('nights', 1)).toBe('1 night');
    expect(countDisplay('days', 31)).toBe('31 days');
    expect(countDisplay('times', 3)).toBe('3 times');
  });

  it('never lets a bare number borrow a count fact from a count noun elsewhere in the sentence (review fix 1)', () => {
    const counts: FactSheet = { ...RECAP, facts: [...RECAP.facts, ...TIMES.facts] };
    expect(validateSentence('Your steps averaged 31 a day.', counts, EXACT)).toEqual(unknown);
    expect(validateSentence('Recovery averaged 6 a night.', counts, EXACT)).toEqual(unknown);
    expect(validateSentence('You slept 7h 12m a night, best was 4.', counts, EXACT)).toEqual(unknown);
    expect(validateSentence('This time your recovery hit 3.', counts, EXACT)).toEqual(unknown);
    // A count noun right after the number, or after "of 6" or a short adjective, still counts.
    expect(validateSentence('You were on goal 5 straight nights.', counts, EXACT)).toEqual(ok);
    expect(validateSentence('You were on goal 5 out of 6 nights.', counts, EXACT)).toEqual(ok);
    expect(validateSentence('You were on goal 5 Friday nights.', counts, EXACT)).toEqual(unknown);
  });

  it('checks number words wherever they appear (review fix 2)', () => {
    expect(validateSentence('You were on goal seven straight nights.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You were on goal five straight nights.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('Your best recovery was eighty-eight.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You went to bed early twice.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You went to bed early thrice.', TIMES, EXACT)).toEqual(ok);
    expect(validateSentence('You logged sleep on a dozen nights.', RECAP, EXACT)).toEqual(unknown);
    expect(validateSentence('You were on goal five out of six nights.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('You were on goal three out of six nights.', RECAP, EXACT)).toEqual(unknown);
    // Only a lone "a"/"an" and "one of" stay prose.
    expect(validateSentence('That was one of your best weeks, on goal 5 nights.', RECAP, EXACT)).toEqual(ok);
    expect(validateSentence('It was an easy week, with a 4-night streak.', RECAP, EXACT)).toEqual(ok);
    // The chat check is unchanged.
    expect(validateSentence('Your best recovery was eighty-eight.', RECAP)).toEqual(ok);
  });

  it('checks every other number word too, fail-safe over prose (review fix round 2)', () => {
    const counts: FactSheet = { ...RECAP, facts: [...RECAP.facts, ...TIMES.facts] };
    const rejected = [
      'Your recovery hit one hundred.',
      'Your best recovery was one hundred.',
      'Recovery stayed under one hundred all week.',
      'You walked one thousand.',
      'Your recovery hit a perfect hundred.',
      'Your recovery hit a solid hundred.',
      'Your recovery reached the hundred mark.',
      'You went to bed early once.',
      'You were on goal one straight night.',
      'You had one late night.',
      'You were on goal zero straight nights.',
      'You had zero late nights.',
      'You were on goal a couple of nights.',
      'You missed your goal on a single night.',
      'You had 4 more good nights than last week.',
      'Two things stood out.',
    ];
    for (const sentence of rejected) expect([sentence, validateSentence(sentence, counts, EXACT)]).toEqual([sentence, unknown]);
    // The same shapes pass when the count is true.
    expect(validateSentence('You went to bed early three times.', counts, EXACT)).toEqual(ok);
    expect(validateSentence('You were on goal four straight nights.', counts, EXACT)).toEqual(ok);
    // The chat check is unchanged.
    expect(validateSentence('Your recovery hit one hundred.', counts)).toEqual(ok);
    expect(validateSentence('You went to bed early once.', counts)).toEqual(ok);
  });

  describe('closes the residual count forms (final review F2)', () => {
    const nights = (value: number): FactSheet => ({
      route: 'recap',
      facts: [{ id: 'sleep.streak', label: 'Most nights on goal in a row', value, unit: 'nights', display: `${value} nights` }],
      notes: [],
    });

    it('checks a numeric ordinal as a count ("6th straight night")', () => {
      expect(validateSentence('It was your 4th straight night on goal.', RECAP, EXACT)).toEqual(ok);
      expect(validateSentence('It was your 7th straight night on goal.', RECAP, EXACT)).toEqual(unknown);
      // The chat check still exempts ordinals.
      expect(validateSentence('It was your 7th straight night on goal.', RECAP)).toEqual(ok);
    });

    it('keeps month-day ordinals exempt as dates', () => {
      expect(validateSentence('On Oct 9th you slept 7h 12m.', RECAP, EXACT)).toEqual(ok);
      expect(validateSentence('On 9th October you slept 7h 12m.', RECAP, EXACT)).toEqual(ok);
      expect(validateSentence('On the 9th of October you slept 7h 12m.', RECAP, EXACT)).toEqual(ok);
      expect(validateSentence('On Oct 9th you slept 7h 20m.', RECAP, EXACT)).toEqual(unknown);
    });

    it('reads ordinal words first..thirty-first as digits ("fifth straight night")', () => {
      expect(validateSentence('It was your fourth straight night on goal.', RECAP, EXACT)).toEqual(ok);
      expect(validateSentence('It was your seventh straight night on goal.', RECAP, EXACT)).toEqual(unknown);
      expect(validateSentence('It was your twenty-first straight night on goal.', nights(21), EXACT)).toEqual(ok);
      expect(validateSentence('It was your twenty-first straight night on goal.', nights(20), EXACT)).toEqual(unknown);
      expect(validateSentence('It was your thirty-first straight night on goal.', nights(31), EXACT)).toEqual(ok);
      expect(validateSentence('It was your thirty-first straight night on goal.', nights(30), EXACT)).toEqual(unknown);
      expect(validateSentence('It was your fifteenth straight night on goal.', nights(15), EXACT)).toEqual(ok);
      expect(validateSentence('It was your fifteenth straight night on goal.', nights(14), EXACT)).toEqual(unknown);
      // Month-day ordinal words stay dates.
      expect(validateSentence('On October ninth you slept 7h 12m.', RECAP, EXACT)).toEqual(ok);
    });

    it('reads "a couple nights" as 2', () => {
      expect(validateSentence('You were on goal a couple nights.', nights(2), EXACT)).toEqual(ok);
      expect(validateSentence('You were on goal a couple nights.', RECAP, EXACT)).toEqual(unknown);
    });

    it('reads "a pair of nights" as 2', () => {
      expect(validateSentence('You were on goal a pair of nights.', nights(2), EXACT)).toEqual(ok);
      expect(validateSentence('You were on goal a pair of nights.', RECAP, EXACT)).toEqual(unknown);
    });

    it('reads "a week straight" as 7 nights, with "full" or "whole" too', () => {
      for (const sentence of ['You were on goal a week straight.', 'You were on goal a full week straight.', 'You were on goal a whole week straight.']) {
        expect([sentence, validateSentence(sentence, nights(7), EXACT)]).toEqual([sentence, ok]);
        expect([sentence, validateSentence(sentence, RECAP, EXACT)]).toEqual([sentence, unknown]);
      }
    });

    it('reads "a fortnight straight" as 14 nights', () => {
      expect(validateSentence('You were on goal a fortnight straight.', nights(14), EXACT)).toEqual(ok);
      expect(validateSentence('You were on goal a fortnight straight.', nights(7), EXACT)).toEqual(unknown);
    });

    it('never exempts a count before a month name as a date (re-review)', () => {
      const month: FactSheet = {
        route: 'recap',
        facts: [
          { id: 'sleep.on_goal', label: 'Nights at or above the sleep goal', value: 20, unit: 'nights', display: '20 nights' },
          { id: 'sleep.nights', label: 'Nights with sleep recorded', value: 28, unit: 'nights', display: '28 nights' },
        ],
        notes: [],
      };
      expect(validateSentence("You were on goal 25 of October's 28 nights.", month, EXACT)).toEqual(unknown);
      expect(validateSentence("You were on goal 20 of October's 28 nights.", month, EXACT)).toEqual(ok);
      expect(validateSentence('You hit goal on 25 October nights.', month, EXACT)).toEqual(unknown);
      // Like "5 Friday nights", a month name is not in COUNT_LEAD's closed set, so this shape is
      // never a recognised count: fail-safe even when true. The plain shape passes.
      expect(validateSentence('You hit goal on 20 October nights.', month, EXACT)).toEqual(unknown);
      expect(validateSentence('You hit goal on 20 nights in October.', month, EXACT)).toEqual(ok);
      expect(validateSentence('You hit goal on 25 nights in October.', month, EXACT)).toEqual(unknown);
    });

    it('leaves an ordinal alone unless a count noun follows it (re-review)', () => {
      for (const sentence of ['A third of your nights were on goal.', 'You were on goal for the third week.', 'This was your 3rd best month.', 'That was your second week running on goal.', 'It was your twenty-third week of tracking.']) {
        expect([sentence, validateSentence(sentence, RECAP, EXACT)]).toEqual([sentence, ok]);
      }
      // Before a count noun the ordinal is still a checked count.
      expect(validateSentence('It was your fourth night on goal.', RECAP, EXACT)).toEqual(ok);
      expect(validateSentence('It was your fifth night on goal.', RECAP, EXACT)).toEqual(ok);
      expect(validateSentence('It was your seventh night on goal.', RECAP, EXACT)).toEqual(unknown);
      expect(validateSentence('It was your 7th night on goal.', RECAP, EXACT)).toEqual(unknown);
    });

    it('leaves the chat check unchanged for these forms', () => {
      expect(validateSentence('You were on goal a couple nights.', RECAP)).toEqual(ok);
      expect(validateSentence('You were on goal a week straight.', RECAP)).toEqual(ok);
      expect(validateSentence('It was your seventh straight night on goal.', RECAP)).toEqual(ok);
    });
  });

  it('reads the singular "time" too (pre-flight M12)', () => {
    const once: FactSheet = {
      route: 'recap',
      facts: [{ id: 'sleep.early', label: 'Early nights', value: 1, unit: 'times', display: '1 time' }],
      notes: [],
    };
    expect(validateSentence('You turned in early 1 time.', once, EXACT)).toEqual(ok);
    expect(validateSentence('You turned in early one time.', once, EXACT)).toEqual(ok);
    expect(validateSentence('You turned in early 2 time.', once, EXACT)).toEqual(unknown);
  });
});
