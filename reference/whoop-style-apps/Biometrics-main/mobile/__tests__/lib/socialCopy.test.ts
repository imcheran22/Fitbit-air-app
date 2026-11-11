import {
  CHECKIN_OPTIONS, clockTime, highlightKicker, highlightKickerColor, highlightLine, highlightsTitle, isoWeekNumber, knownHighlights, knownStoryFrames,
  knownTimelineItems, personName, timelineAction, timelineLine, timelineParts,
} from '../../src/lib/socialCopy';
import type { HighlightItem, StoryFrame, TimelineItem } from '../../src/api/social';

const sam = { id: 's', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };
const me = { id: 'm', handle: 'me', displayName: 'Me', coachId: 'mochi' };
const base = { id: 'x', at: '2026-10-07T15:00:00.000Z', actor: sam, mine: false };

it('offers the three check-in moods in order', () => {
  expect(CHECKIN_OPTIONS.map((o) => [o.mood, o.label, o.color])).toEqual([
    ['RESTED', 'Rested', '#86EFAC'], ['OKAY', 'Okay', '#93C5FD'], ['TIRED', 'Tired', '#FDBA74'],
  ]);
});

it('names a person, falling back to the handle when the display name is empty', () => {
  expect(personName(sam, false)).toBe('Sam');
  expect(personName(sam, true)).toBe('You');
  expect(personName({ ...sam, displayName: '' }, false)).toBe('@sam');
});

it('words every timeline kind without numbers', () => {
  const items: TimelineItem[] = [
    { ...base, kind: 'checkin', locked: false, mood: 'TIRED' },
    { ...base, kind: 'checkin', locked: true },
    { ...base, kind: 'step_goal' },
    { ...base, kind: 'badge', badge: { family: 'SLEEP_GOAL', level: 2 } },
    { ...base, kind: 'sticker', sticker: 'HEART', to: me },
    { ...base, kind: 'recap_share', recapKind: 'WEEK' },
    { ...base, actor: me, mine: true, kind: 'checkin', locked: false, mood: 'RESTED' },
    { ...base, actor: me, mine: true, kind: 'sticker', sticker: 'CHEER', to: sam },
    { ...base, actor: me, mine: true, kind: 'step_goal' },
    { ...base, actor: me, mine: true, kind: 'recap_share', recapKind: 'MONTH' },
  ];
  expect(items.map(timelineLine)).toEqual([
    'Sam woke up tired',
    'Sam checked in',
    'Sam passed their step goal',
    'Sam reached Sleep goal streak II',
    'Sam sent you a Heart',
    'Sam shared their weekly recap',
    'You checked in: rested',
    'You sent Sam a Cheer',
    'You passed your step goal',
    'You shared your monthly recap',
  ]);
  for (const line of items.map(timelineLine)) expect(line).not.toMatch(/\d/);
  // A locked check-in offers nothing: I can't react to a mood I can't see.
  expect(items.map(timelineAction)).toEqual(['rest_up', null, 'cheer', 'cheer', null, 'cheer', null, null, null, null]);
});

it('splits a line into the bold name and the muted rest', () => {
  expect(timelineParts({ ...base, kind: 'checkin', locked: true })).toEqual({ name: 'Sam', rest: 'checked in' });
  expect(timelineParts({ ...base, actor: me, mine: true, kind: 'sticker', sticker: 'CHEER', to: sam })).toEqual({ name: 'You', rest: 'sent Sam a Cheer' });
  expect(timelineParts({ ...base, actor: { ...sam, displayName: '' }, kind: 'step_goal' })).toEqual({ name: '@sam', rest: 'passed their step goal' });
});

it('words every highlight, with colour-coded kickers', () => {
  const h = (item: Partial<HighlightItem>) => ({ actor: sam, mine: false, ...item }) as HighlightItem;
  const items = [
    h({ type: 'top_story', reason: 'badge', family: 'STEP_GOAL', level: 3 }),
    h({ type: 'top_story', reason: 'checked_in_every_day' }),
    h({ type: 'most_cheered_you', count: 3 }),
    h({ type: 'comeback' }),
    h({ type: 'checked_in_every_day' }),
    { type: 'most_stickers_sent', count: 9, actor: me, mine: true } as HighlightItem,
  ];
  expect(items.map(highlightLine)).toEqual([
    'Sam reached Step goal streak III',
    'Sam checked in every day',
    'Sam cheered you most',
    'Sam bounced back to rested',
    'Sam checked in every day',
    'You sent 9 stickers',
  ]);
  expect(items.map(highlightKicker)).toEqual(['Top story', 'Top story', 'Most cheered', 'Comeback', 'Every day', 'Most generous']);
  expect(items.map(highlightKickerColor)).toEqual(['#A5B4FC', '#A5B4FC', '#FCD34D', '#86EFAC', null, null]);
});

it('names the week by its ISO week number', () => {
  expect([isoWeekNumber('2026-09-28'), isoWeekNumber('2025-12-29'), isoWeekNumber('2026-12-28'), isoWeekNumber('2027-01-04')]).toEqual([40, 1, 53, 1]);
  expect(highlightsTitle('2026-09-28')).toBe('Week 40 highlights');
});

it('shows a local clock time with padded minutes', () => {
  expect(clockTime(new Date(2026, 9, 7, 8, 5).toISOString())).toBe('8:05');
  expect(clockTime(new Date(2026, 9, 7, 23, 40).toISOString())).toBe('23:40');
});

it('skips items of a known kind carrying a value this app does not know (a newer server), instead of miswording them', () => {
  const odd = <T,>(v: unknown) => v as T;
  const timeline: TimelineItem[] = [
    { ...base, id: 'ok', kind: 'checkin', locked: false, mood: 'RESTED' },
    { ...base, id: 'lock', kind: 'checkin', locked: true },
    odd<TimelineItem>({ ...base, id: 'mood', kind: 'checkin', locked: false, mood: 'SLEEPY' }),
    odd<TimelineItem>({ ...base, id: 'fam', kind: 'badge', badge: { family: 'GOODNIGHT', level: 2 } }),
    odd<TimelineItem>({ ...base, id: 'lvl', kind: 'badge', badge: { family: 'SLEEP_GOAL', level: 9 } }),
    odd<TimelineItem>({ ...base, id: 'stk', kind: 'sticker', sticker: 'WAVE', to: me }),
    odd<TimelineItem>({ ...base, id: 'rec', kind: 'recap_share', recapKind: 'YEAR' }),
    { ...base, id: 'goal', kind: 'step_goal' },
  ];
  expect(knownTimelineItems(timeline).map((i) => i.id)).toEqual(['ok', 'lock', 'goal']);

  const highlights: HighlightItem[] = [
    { type: 'top_story', reason: 'checked_in_every_day', actor: sam, mine: false },
    { type: 'top_story', reason: 'badge', family: 'STEP_GOAL', level: 3, actor: sam, mine: false },
    // An S2 goodnight top story must not read as "Sam checked in every day".
    odd<HighlightItem>({ type: 'top_story', reason: 'goodnight_every_night', actor: sam, mine: false }),
    odd<HighlightItem>({ type: 'top_story', reason: 'badge', family: 'GOODNIGHT', level: 1, actor: sam, mine: false }),
    { type: 'comeback', actor: sam, mine: false },
  ];
  expect(knownHighlights(highlights).map(highlightLine)).toEqual([
    'Sam checked in every day', 'Sam reached Step goal streak III', 'Sam bounced back to rested',
  ]);

  const at = '2026-10-07T08:00:00.000Z';
  const frames: StoryFrame[] = [
    { kind: 'checkin', at, locked: true },
    odd<StoryFrame>({ kind: 'checkin', at, locked: false, mood: 'SLEEPY' }),
    { kind: 'badge', at, family: 'CHECK_IN', level: 1 },
    odd<StoryFrame>({ kind: 'badge', at, family: 'GOODNIGHT', level: 1 }),
    odd<StoryFrame>({ kind: 'recap', at, recapId: 'r', recapKind: 'YEAR', periodStart: '2026-01-01', periodEnd: '2026-12-31', line: 'A year', coachId: 'mochi' }),
    odd<StoryFrame>({ kind: 'goodnight', at }),
  ];
  expect(knownStoryFrames(frames).map((f) => f.kind)).toEqual(['checkin', 'badge']);
});

it('skips items and frames of a kind this app does not know (a newer server)', () => {
  const odd = <T,>(v: unknown) => v as T;
  const at = '2026-10-07T08:00:00.000Z';
  expect(knownTimelineItems([odd<TimelineItem>({ ...base, id: 'chat', kind: 'chat' }), { ...base, id: 'goal', kind: 'step_goal' }]).map((i) => i.id))
    .toEqual(['goal']);
  expect(knownStoryFrames([odd<StoryFrame>({ kind: 'chat', at }), { kind: 'checkin', at, locked: true }]).map((f) => f.kind)).toEqual(['checkin']);
});
