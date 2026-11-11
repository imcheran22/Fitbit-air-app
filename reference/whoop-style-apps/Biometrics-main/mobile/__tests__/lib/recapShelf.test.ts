import type { RecapSummary } from '../../src/api/recaps';
import { askAboutWeekPrompt, isoWeek, shelfItems } from '../../src/lib/recapShelf';

const recap = (over: Partial<RecapSummary>): RecapSummary => ({
  id: 'x', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A line.', personaId: 'mochi',
  builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, ...over,
});

it('numbers weeks the ISO way (Monday weeks; week 1 holds the first Thursday)', () => {
  expect(isoWeek('2026-09-28')).toBe(40);
  expect(isoWeek('2026-09-21')).toBe(39);
  expect(isoWeek('2026-01-01')).toBe(1);
  expect(isoWeek('2025-12-29')).toBe(1);
  expect(isoWeek('2027-01-01')).toBe(53);
});

describe('shelfItems (the Sleep story shelf)', () => {
  const list = [
    recap({ id: 'w39', periodStart: '2026-09-21', periodEnd: '2026-09-27', builtAt: '2026-09-28T09:00:00.000Z', openedAt: 'x' }),
    recap({ id: 'sep', kind: 'MONTH', periodStart: '2026-09-01', periodEnd: '2026-09-30', builtAt: '2026-10-01T09:00:00.000Z', personaId: 'luna', openedAt: 'x' }),
    recap({ id: 'w40' }),
    recap({ id: 'aug', kind: 'MONTH', periodStart: '2026-08-01', periodEnd: '2026-08-31', builtAt: '2026-09-01T09:00:00.000Z', openedAt: 'x' }),
  ];

  it('puts the newest first, whatever order they arrive in', () => {
    expect(shelfItems(list, '2026-10-05', new Set()).map((i) => i.id)).toEqual(['w40', 'sep', 'w39', 'aug']);
  });

  it('badges a week by its week number and a month by its short name; labels this week, older weeks by their Monday, months by name', () => {
    const items = shelfItems(list, '2026-10-05', new Set());
    expect(items.map((i) => [i.badge, i.label])).toEqual([
      ['WK 40', 'This week'],
      ['SEP', 'September'],
      ['WK 39', 'Sep 21'],
      ['AUG', 'August'],
    ]);
  });

  it('calls the newest week "This week" only while it is the week just gone', () => {
    expect(shelfItems([recap({ id: 'w40' })], '2026-10-11', new Set())[0]!.label).toBe('This week');
    expect(shelfItems([recap({ id: 'w40' })], '2026-10-12', new Set())[0]!.label).toBe('Sep 28');
  });

  it('marks unwatched ones (not opened on the server, nor in this session), with words for a screen reader', () => {
    const items = shelfItems(list, '2026-10-05', new Set());
    expect(items.map((i) => i.unwatched)).toEqual([true, false, false, false]);
    expect(items[0]!.accessibilityLabel).toBe('Week of Sep 28, new');
    expect(items[1]!.accessibilityLabel).toBe('September recap');
    expect(shelfItems(list, '2026-10-05', new Set(['w40']))[0]!.unwatched).toBe(false);
  });
});

it("asks the coach about that week in the user's words, ready to edit", () => {
  expect(askAboutWeekPrompt({ periodStart: '2026-09-28', periodEnd: '2026-10-04' })).toBe('What stood out in my week of Sep 28 – Oct 4?');
});
