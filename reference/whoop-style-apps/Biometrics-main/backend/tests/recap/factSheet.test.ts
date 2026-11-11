import { buildRecapFactSheet, renderFactSheet } from '../../src/coach/answer/facts';
import { validateSentence } from '../../src/coach/answer/validate';
import { sentenceSplitter } from '../../src/coach/answer/sentences';
import { composeRecapStoryFallback, templateLine } from '../../src/recap/templates';
import type { RecapKind, RecapStats } from '../../src/recap/types';

const WEEK_STATS: RecapStats = {
  nightsWithData: 6, avgSleepMinutes: 478, nightsOnGoal: 5, longestOnGoalStreak: 2,
  bestNight: { date: '2026-09-29', minutesAsleep: 500 }, bestRecovery: { date: '2026-09-29', score: 89 }, avgRecovery: 72,
  steps: { total: 26000, dailyAverage: 8667 }, earlierBedtimes: { nights: 4, of: 6 }, bedtimeSpreadMinutes: 39,
  weekStrip: [
    { date: '2026-09-28', minutesAsleep: 480, onGoal: true, recovery: 70 },
    { date: '2026-09-29', minutesAsleep: 500, onGoal: true, recovery: 89 },
    { date: '2026-09-30', minutesAsleep: null, onGoal: null, recovery: null },
    { date: '2026-10-01', minutesAsleep: 490, onGoal: true, recovery: 88 },
    { date: '2026-10-02', minutesAsleep: 420, onGoal: false, recovery: 50 },
    { date: '2026-10-03', minutesAsleep: 485, onGoal: true, recovery: 66 },
    { date: '2026-10-04', minutesAsleep: 495, onGoal: true, recovery: 71 },
  ],
  comparison: { avgSleepDelta: 28, bedtimeSpreadDelta: -9, avgRecoveryDelta: -5 },
};
const EXACT = { exactNumbers: true } as const;
const sentences = (text: string) => {
  const s = sentenceSplitter();
  return [...s.push(text), ...s.end()];
};

describe('buildRecapFactSheet', () => {
  const sheet = buildRecapFactSheet('WEEK', WEEK_STATS, 480);
  const byId = new Map(sheet.facts.map((f) => [f.id, f]));

  it('holds exactly the section-1 numbers, every count with a count unit', () => {
    expect(sheet.route).toBe('recap');
    expect(byId.get('sleep.nights')).toMatchObject({ value: 6, unit: 'nights', display: '6 nights' });
    expect(byId.get('sleep.on_goal')).toMatchObject({ value: 5, unit: 'nights' });
    expect(byId.get('sleep.best_night')).toMatchObject({ value: 500, unit: 'minutes', label: 'Best night (Tuesday)' });
    expect(byId.get('recovery.best')).toMatchObject({ value: 89, unit: 'score', display: '89/100' });
    expect(byId.get('steps.daily_avg')).toMatchObject({ value: 8667, unit: 'count' });
    expect(byId.get('sleep.earlier_bedtimes')).toMatchObject({ value: 4, unit: 'nights' });
    expect(byId.get('sleep.bedtime_nights')).toMatchObject({ value: 6, unit: 'nights' });
    expect(byId.has('sleep.night.wed')).toBe(false); // no night: omitted
    expect(byId.get('recovery.day.fri')).toMatchObject({ value: 50, unit: 'score' });
    for (const f of sheet.facts) expect(['minutes', 'score', 'count', 'nights', 'days', 'times']).toContain(f.unit);
  });

  it('states each comparison with its direction', () => {
    expect(byId.get('sleep.avg_change')!.display).toBe('28m more than last week');
    expect(byId.get('sleep.bedtime_spread_change')!.display).toBe('bedtimes varied 9m less than last week');
    expect(byId.get('recovery.avg_change')!.display).toBe('5 points lower than last week');
  });

  it('notes missing data without digits, and adds the month milestones', () => {
    const month = buildRecapFactSheet('MONTH', { nightsWithData: 30, avgSleepMinutes: 470, milestones: { everyDayLogged: { days: 30 }, bestRecoveryWeek: { weekStart: '2026-09-07', avgRecovery: 80 }, steadiestMonth: { spreadMinutes: 10 } }, bedtimeSpreadMinutes: 10 }, 480);
    expect(month.notes).toContain('No recovery scores this month');
    expect(month.facts.find((f) => f.id === 'sleep.days_logged')).toMatchObject({ value: 30, unit: 'days' });
    expect(month.facts.find((f) => f.id === 'recovery.best_week')).toMatchObject({ value: 80, unit: 'score' });
    for (const note of month.notes) expect(note).not.toMatch(/\d/);
    expect(renderFactSheet(month)).toContain('[sleep.days_logged]');
  });

  it('no longer notes the old streak milestone (badges replaced it), and keeps the streak number', () => {
    const month = buildRecapFactSheet('MONTH', { nightsWithData: 28, longestOnGoalStreak: 9, milestones: { streak: { nights: 9 } } }, 480);
    expect(month.notes.join('\n')).not.toMatch(/run of nights on goal/);
    expect(month.facts.find((f) => f.id === 'sleep.streak')).toMatchObject({ value: 9 });
  });
});

describe('templates', () => {
  const sheet = buildRecapFactSheet('WEEK', WEEK_STATS, 480);

  it('writes the line from the comparison when there is one', () => {
    expect(templateLine('WEEK', WEEK_STATS, sheet)).toBe('You slept 7h 58m a night on average, 28m more than last week.');
  });

  it('falls back to on-goal nights, then adds a streak of 3 or more', () => {
    const { comparison: _dropped, ...rest } = WEEK_STATS;
    const stats: RecapStats = { ...rest, longestOnGoalStreak: 4 };
    const s = buildRecapFactSheet('WEEK', stats, 480);
    expect(templateLine('WEEK', stats, s)).toBe('You reached your sleep goal on 5 of 6 nights this week. Your best run was 4 nights on goal in a row.');
  });

  it('says month for a MONTH and has a number-free last resort', () => {
    const stats: RecapStats = { nightsWithData: 9, nightsOnGoal: 3 };
    expect(templateLine('MONTH', stats, buildRecapFactSheet('MONTH', stats, 480))).toBe('You reached your sleep goal on 3 of 9 nights this month.');
    expect(templateLine('MONTH', { nightsWithData: 9 }, buildRecapFactSheet('MONTH', { nightsWithData: 9 }, 480))).toBe("Here's your month in sleep.");
  });

  it('composes the weekly story from validated sentences, and none for a month', () => {
    const story = composeRecapStoryFallback('WEEK', WEEK_STATS, sheet)!;
    expect(story.startsWith("Here's your week.")).toBe(true);
    expect(story).toContain('Your best night was Tuesday, with 8h 20m asleep.');
    expect(story).toContain('Recovery averaged 72/100.');
    expect(story).toContain('You walked 26,000 steps, 8,667 a day on average.');
    for (const sentence of sentences(story)) expect(validateSentence(sentence, sheet, EXACT)).toEqual({ ok: true });
    expect(composeRecapStoryFallback('MONTH', WEEK_STATS, sheet)).toBeNull();
  });

  it('every template sentence passes the exact check', () => {
    for (const sentence of sentences(templateLine('WEEK', WEEK_STATS, sheet))) {
      expect(validateSentence(sentence, sheet, EXACT)).toEqual({ ok: true });
    }
  });

  // Every wording the templates can produce, over representative stats: none may be dropped by the
  // exact check (a dropped sentence would silently shorten the line or story).
  it.each<[string, RecapKind, RecapStats, string[], string[]]>([
    ['week, more sleep', 'WEEK', WEEK_STATS,
      ['You slept 7h 58m a night on average, 28m more than last week.'],
      ['You slept 7h 58m a night on average across 6 nights.', 'You reached your sleep goal on 5 nights.', 'Your best night was Tuesday, with 8h 20m asleep.', 'Recovery averaged 72/100.', 'You walked 26,000 steps, 8,667 a day on average.', "That's 28m more sleep a night than last week."]],
    ['week, less sleep and a streak', 'WEEK', { ...WEEK_STATS, longestOnGoalStreak: 3, comparison: { avgSleepDelta: -45 } },
      ['You slept 7h 58m a night on average, 45m less than last week.', 'Your best run was 3 nights on goal in a row.'],
      ["That's 45m less sleep a night than last week."]],
    ['week, one night on goal', 'WEEK', { nightsWithData: 3, avgSleepMinutes: 400, nightsOnGoal: 1 },
      ['You reached your sleep goal on 1 of 3 nights this week.'],
      ['You slept 6h 40m a night on average across 3 nights.', 'You reached your sleep goal on 1 night.']],
    ['month, comparison and streak', 'MONTH', { nightsWithData: 28, avgSleepMinutes: 470, nightsOnGoal: 20, longestOnGoalStreak: 12, comparison: { avgSleepDelta: 75 } },
      ['You slept 7h 50m a night on average, 1h 15m more than last month.', 'Your best run was 12 nights on goal in a row.'],
      []],
    ['month, no nights on goal', 'MONTH', { nightsWithData: 10, nightsOnGoal: 0 },
      ['You reached your sleep goal on 0 of 10 nights this month.'],
      []],
  ])('%s: every variant sentence passes the exact check', (_name, kind, stats, lineSentences, storySentences) => {
    const s = buildRecapFactSheet(kind, stats, 480);
    for (const sentence of [...lineSentences, ...storySentences]) expect([sentence, validateSentence(sentence, s, EXACT)]).toEqual([sentence, { ok: true }]);
    expect(templateLine(kind, stats, s)).toBe(lineSentences.join(' '));
    const story = composeRecapStoryFallback(kind, stats, s);
    if (kind === 'WEEK') for (const sentence of storySentences) expect(story).toContain(sentence);
  });
});
