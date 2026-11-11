import {
  campBannerLine, campClock, campHeadline, campKicker, campSceneKicker, campStatus, fireCountLabel, fireLine, fireMoreLine,
  nightsLitLine, noteAudienceLine, noteLiveLine, goodnightOpensLine, goodnightSaidLine, highlightKicker,
  highlightKickerColor, highlightLine, knownHighlights, knownStoryFrames, knownTimelineItems, noteLength, timelineAction,
  timelineLine,
} from '../../src/lib/socialCopy';
import type { CampMember, HighlightItem, StoryFrame, TimelineItem } from '../../src/api/social';

const sam = { id: 's', handle: 'sam', displayName: 'Sam', coachId: 'mochi' };
const me = { id: 'm', handle: 'me', displayName: 'Me', coachId: 'mochi' };
const base = { id: 'x', at: '2026-10-07T22:00:00.000Z', actor: sam, mine: false };
const odd = <T,>(v: unknown) => v as T;

it('words the goodnight and camp-note rows, with no one-tap action', () => {
  const items: TimelineItem[] = [
    { ...base, kind: 'goodnight', onTime: true },
    { ...base, kind: 'goodnight', onTime: false },
    { ...base, kind: 'camp_note' },
    { ...base, actor: me, mine: true, kind: 'goodnight', onTime: true },
  ];
  expect(knownTimelineItems(items)).toHaveLength(4);
  expect(items.map(timelineLine)).toEqual(['Sam said goodnight, on time', 'Sam said goodnight', 'Sam left a camp note', 'You said goodnight, on time']);
  expect(items.map(timelineAction)).toEqual([null, null, null, null]);
  // A goodnight without its on-time flag is not worded as either.
  expect(knownTimelineItems([odd<TimelineItem>({ ...base, kind: 'goodnight' })])).toEqual([]);
});

it('knows a goodnight frame only with its on-time flag', () => {
  const frames: StoryFrame[] = [{ kind: 'goodnight', at: base.at, onTime: true }, odd<StoryFrame>({ kind: 'goodnight', at: base.at })];
  expect(knownStoryFrames(frames)).toEqual([{ kind: 'goodnight', at: base.at, onTime: true }]);
});

it('words the camp highlights, and skips a campfire without a real count', () => {
  const h = (item: Partial<HighlightItem>) => ({ actor: sam, mine: false, ...item }) as HighlightItem;
  const items = [
    h({ type: 'top_story', reason: 'on_time_every_night' }),
    { type: 'top_story', reason: 'on_time_every_night', actor: me, mine: true } as HighlightItem,
    { type: 'campfire', nights: 5, actor: me, mine: true } as HighlightItem,
    h({ type: 'joined' }),
    h({ type: 'first_badge' }),
    { type: 'first_badge', actor: me, mine: true } as HighlightItem,
  ];
  expect(knownHighlights(items)).toHaveLength(6);
  expect(items.map(highlightLine)).toEqual([
    'Sam was in bed on time every night',
    'You were in bed on time every night',
    'The fire was lit 5 nights',
    'Sam joined the camp',
    'Sam earned their first badge',
    'You earned your first badge',
  ]);
  expect(items.map(highlightKicker)).toEqual(['Top story', 'Top story', 'Campfire', 'New at camp', 'First badge', 'First badge']);
  expect(items.map(highlightKickerColor)).toEqual(['#A5B4FC', '#A5B4FC', '#FB923C', null, null, null]);
  expect(knownHighlights([
    odd<HighlightItem>({ type: 'campfire', nights: 0, actor: me, mine: true }),
    // The server's minimum is 2: never "The fire was lit 1 nights".
    odd<HighlightItem>({ type: 'campfire', nights: 1, actor: me, mine: true }),
    odd<HighlightItem>({ type: 'campfire', actor: me, mine: true }),
    odd<HighlightItem>({ type: 'campfire', nights: 2.5, actor: me, mine: true }),
    odd<HighlightItem>({ type: 'campfire', nights: '5', actor: me, mine: true }),
  ])).toEqual([]);
});

it('words the camp banner by night and by day, and for an older server', () => {
  expect(campBannerLine({ checkedIn: 4, members: 5, faces: [] })).toBe('4 checked in');
  expect(campBannerLine({ checkedIn: 4, members: 5, faces: [], night: false, awake: 5, asleep: 0 })).toBe('4 checked in');
  expect(campBannerLine({ checkedIn: 1, members: 5, faces: [], night: true, awake: 3, asleep: 2 })).toBe('3 awake · 2 asleep');
});

it("words the fire, who's here, the header kicker, a said goodnight and a note's length — every time in 12-hour", () => {
  expect(fireLine({ lit: 3, of: 5, segments: 3 })).toBe('3 of 5 in bed on time');
  const m = (over: Partial<CampMember>): CampMember => ({ person: sam, mine: false, asleep: false, asleepSince: null, onTime: null, note: null, ...over });
  // Built on the phone's own clock, so the words don't depend on the test machine's zone.
  const since = new Date(2026, 9, 7, 22, 15).toISOString();
  expect(campClock(since)).toBe('10:15 PM');
  expect(campClock(new Date(2026, 9, 8, 0, 5).toISOString())).toBe('12:05 AM');
  expect(campClock(new Date(2026, 9, 8, 12, 0).toISOString())).toBe('12:00 PM');
  expect(campStatus(m({ asleep: true, asleepSince: since, onTime: true }))).toBe('asleep since 10:15 PM · on time');
  expect(campStatus(m({ asleep: true, asleepSince: since, onTime: false }))).toBe('asleep since 10:15 PM');
  // An asleep member's whole note is read here: their bubble is cut to one line.
  expect(campStatus(m({ asleep: true, asleepSince: since, onTime: true, note: 'bed soon, night all' }))).toBe('asleep since 10:15 PM · on time · bed soon, night all');
  expect(campStatus(m({ asleep: true, asleepSince: since, onTime: false, note: 'bed soon, night all' }))).toBe('asleep since 10:15 PM · bed soon, night all');
  expect(campStatus(m({ note: 'bed soon' }))).toBe('awake · bed soon');
  expect(campStatus(m({}))).toBe('awake');
  expect(campKicker(new Date(2026, 9, 6, 22, 42))).toBe('TUESDAY · 10:42 PM');
  expect(campKicker(new Date(2026, 9, 7, 0, 5))).toBe('WEDNESDAY · 12:05 AM');
  expect(goodnightOpensLine('20:00')).toBe('You can say goodnight from 8:00 PM');
  expect(goodnightOpensLine('17:00')).toBe('You can say goodnight from 5:00 PM');
  expect(goodnightOpensLine('11:30')).toBe('You can say goodnight from 11:30 AM');
  expect(goodnightSaidLine({ localDate: '2026-10-07', at: since, onTime: true, undoUntil: since })).toBe('Goodnight said, on time');
  expect(goodnightSaidLine({ localDate: '2026-10-07', at: since, onTime: false, undoUntil: since })).toBe('Goodnight said');
  expect(noteLength('  🔥hi ')).toBe(3);
});

it('keeps the lowest real campfire count', () => {
  const two = { type: 'campfire', nights: 2, actor: me, mine: true } as HighlightItem;
  expect(knownHighlights([two]).map(highlightLine)).toEqual(['The fire was lit 2 nights']);
});

it('says nothing, never "NaN", for a time that is not one', () => {
  for (const bad of ['', 'soon', '8pm', '24:00', '20:60', '20:5', ':30', '20:00:00']) expect(goodnightOpensLine(bad)).toBe('');
  expect(goodnightOpensLine('0:00')).toBe('You can say goodnight from 12:00 AM');
  for (const bad of ['', 'not a time', '2026-13-45T99:99:00Z']) expect(campClock(bad)).toBe('');
  expect(campKicker(new Date('nope'))).toBe('');
  const m: CampMember = { person: sam, mine: false, asleep: true, asleepSince: 'garbage', onTime: true, note: null };
  expect(campStatus(m)).toBe('asleep · on time');
});

it('never counts a note shorter than the server will (P11)', () => {
  // The server normalises to NFC before counting: U+2ADC expands to two code points, so the counter must say 2.
  expect(noteLength('⫝̸')).toBe(2);
  // A format character the server strips is still counted: over-counting is allowed, under-counting is not.
  expect(noteLength('a​b')).toBe(3);
});

it("words the Campfire's scene headline and panel from the camp's own data", () => {
  const m = (asleep: boolean): CampMember => ({ person: sam, mine: false, asleep, asleepSince: null, onTime: null, note: null });
  expect(campSceneKicker(new Date(2026, 9, 6, 22, 42), true)).toBe('TUESDAY NIGHT');
  expect(campSceneKicker(new Date(2026, 9, 6, 12, 0), false)).toBe('TUESDAY');
  expect(campSceneKicker(new Date('nope'), true)).toBe('');
  expect(campHeadline({ night: true, members: [m(true), m(false), m(false)] })).toBe('1 asleep · 2 by the fire');
  expect(campHeadline({ night: false, members: [m(false), m(false)] })).toBe('2 awake · 0 asleep');
  const fire = (segments: number) => ({ lit: segments, of: 5, segments });
  expect(fireCountLabel(fire(3), true)).toBe('3/5');
  expect(fireCountLabel(fire(3), false)).toBe('3/5 tonight');
  expect(fireMoreLine(fire(3), true)).toBe('2 more on time lights it fully');
  expect(fireMoreLine(fire(5), true)).toBe('');
  expect(fireMoreLine(fire(3), false)).toBe('');
  expect(nightsLitLine(2)).toBe('Lit 2 nights');
  expect(nightsLitLine(1)).toBe('Lit 1 night');
  expect(noteAudienceLine(9)).toBe('Seen by your 9 buddies');
  expect(noteAudienceLine(1)).toBe('Seen by your 1 buddy');
  expect(noteAudienceLine(0)).toBe('');
  expect(noteLiveLine(new Date(2026, 9, 8, 6, 0).toISOString())).toBe('Live until 6:00 AM');
  expect(noteLiveLine('')).toBe('Live');
  expect(noteLiveLine(null)).toBe('Live');
});
