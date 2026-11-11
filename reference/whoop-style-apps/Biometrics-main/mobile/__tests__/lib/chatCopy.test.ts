import type { Card, LastMessage, Message } from '../../src/api/chats';
import {
  activeLine, campNoteQuoteLabel, cardCaption, cardKicker, cardLine, chatRowLine, dayChip, frameQuoteLabel, isKnownMessage,
  lastMessageText, noteLength, noteQuoteLabel, replyLine, sameLocalDay, shortAgo, stickerLine,
} from '../../src/lib/chatCopy';
import { noteLength as socialNoteLength } from '../../src/lib/socialCopy';

const NOW = new Date(2026, 9, 8, 18, 0).getTime(); // built on the phone's own clock
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();
const last = (over: Partial<LastMessage>): LastMessage => ({ mine: false, kind: 'TEXT', text: 'hi', sticker: null, cardType: null, at: ago(2), ...over });
const msg = (over: Partial<Message>): Message => ({ id: 'm', mine: false, kind: 'TEXT', text: 'hi', sticker: null, card: null, replyTo: null, reactions: [], createdAt: ago(1), ...over });

it('words an inbox row: the last message and how long ago', () => {
  expect(chatRowLine({ buddy: { id: 'b', handle: 'ben', displayName: 'Ben', coachId: 'mochi' }, lastMessage: last({ text: 'rough night lol' }), unread: 1, activeAt: null }, NOW)).toBe('rough night lol · 2m');
  expect(lastMessageText(last({ mine: true, text: 'proud of that streak!' }))).toBe('You: proud of that streak!');
  expect(lastMessageText(last({ kind: 'STICKER', text: null, sticker: 'CHEER' }))).toBe('Sent a Cheer sticker');
  expect(lastMessageText(last({ mine: true, kind: 'STICKER', text: null, sticker: 'REST_UP' }))).toBe('You sent a Rest up sticker');
  expect(lastMessageText(last({ kind: 'CARD', text: null, cardType: 'checkin' }))).toBe('Shared a check-in');
  expect(lastMessageText(last({ mine: true, kind: 'CARD', text: null, cardType: 'note' }))).toBe('You: Replied to a note');
  expect([shortAgo(ago(0), NOW), shortAgo(ago(59), NOW), shortAgo(ago(5 * 60), NOW), shortAgo(ago(26 * 60), NOW), shortAgo(ago(15 * 24 * 60), NOW)])
    .toEqual(['now', '59m', '5h', '1d', '2w']);
});

it('words activity status: now up to 5 minutes, then minutes, then hours; nothing without a time', () => {
  expect(activeLine(null, NOW)).toBeNull();
  expect(activeLine(ago(5), NOW)).toBe('Active now');
  expect(activeLine(ago(6), NOW)).toBe('Active 6m ago');
  expect(activeLine(ago(3 * 60 + 10), NOW)).toBe('Active 3h ago');
});

it('words cards: a kicker, a line and who shared or replied', () => {
  const checkin: Card = { type: 'checkin', available: true, about: 'recipient', localDate: '2026-10-08', mood: 'TIRED' };
  expect([cardKicker(checkin), cardLine(checkin)]).toEqual(['MORNING CHECK-IN', 'Woke up tired']);
  expect(cardLine({ ...checkin, mood: null })).toBe('Checked in');
  expect(cardCaption(checkin, true, 'Ben')).toBe('You replied to their check-in');
  expect(cardCaption({ ...checkin, about: 'sender' }, false, 'Ben')).toBe('Ben shared their check-in');
  expect(cardCaption({ type: 'note', available: true, text: 'x' }, false, 'Ben')).toBe('Ben replied to your note');
  const badge: Card = { type: 'badge', available: true, family: 'SLEEP_GOAL', level: 2 };
  expect([cardKicker(badge), cardLine(badge)]).toEqual(['BADGE', 'Sleep goal streak II']);
  expect(cardKicker({ type: 'recap', available: true, recapKind: 'MONTH', periodStart: '2026-09-01', periodEnd: '2026-09-30', line: 'A steadier month' })).toBe('MONTHLY RECAP');
  expect(cardLine({ type: 'goodnight', available: true, onTime: true })).toBe('Said goodnight, on time');
  const campNote: Card = { type: 'camp_note', available: true, text: 'bed soon' };
  expect([cardKicker(campNote), cardLine(campNote)]).toEqual(['CAMP NOTE', 'bed soon']);
});

it('a badge or recap card its author stopped sharing keeps its kicker and says "No longer shared"', () => {
  const badge: Card = { type: 'badge', available: false, family: 'SLEEP_GOAL' };
  expect([cardKicker(badge), cardLine(badge)]).toEqual(['BADGE', 'No longer shared']);
  const recap: Card = { type: 'recap', available: false, recapKind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04' };
  expect([cardKicker(recap), cardLine(recap)]).toEqual(['WEEKLY RECAP', 'No longer shared']);
  expect(cardCaption(recap, false, 'Ben')).toBe('Ben replied to your story');
  expect(isKnownMessage(msg({ kind: 'CARD', text: null, card: badge }))).toBe(true);
});

it('words a reply quote and a sticker', () => {
  expect(replyLine({ id: 'm', gone: true }, 'Ben')).toBe('Message unsent');
  expect(replyLine({ id: 'm', gone: false, mine: false, kind: 'TEXT', text: 'rough night', sticker: null, cardType: null }, 'Ben')).toBe('Ben: rough night');
  expect(replyLine({ id: 'm', gone: false, mine: true, kind: 'STICKER', text: null, sticker: 'STAR', cardType: null }, 'Ben')).toBe('You: Star sticker');
  expect(stickerLine('REST_UP')).toBe('Rest up');
});

it('labels a staged quote', () => {
  expect(frameQuoteLabel('checkin', 'Ben')).toBe("Ben's check-in");
  expect(frameQuoteLabel('goodnight', 'Ben')).toBe("Ben's goodnight");
  expect(noteQuoteLabel('Ben')).toBe("Ben's note");
  expect(campNoteQuoteLabel('Ben')).toBe("Ben's camp note");
});

it('labels the day a message falls on, on the phone clock', () => {
  const now = new Date(2026, 9, 8, 18, 0); // Thursday
  expect(dayChip(new Date(2026, 9, 8, 7, 31).toISOString(), now)).toBe('Today 7:31 AM');
  expect(dayChip(new Date(2026, 9, 7, 21, 2).toISOString(), now)).toBe('Yesterday 9:02 PM');
  expect(dayChip(new Date(2026, 9, 5, 12, 0).toISOString(), now)).toBe('Mon 12:00 PM');
  expect(dayChip(new Date(2026, 8, 30, 0, 5).toISOString(), now)).toBe('Sep 30 12:05 AM');
  expect(sameLocalDay(new Date(2026, 9, 8, 0, 1).toISOString(), new Date(2026, 9, 8, 23, 59).toISOString())).toBe(true);
  expect(sameLocalDay(new Date(2026, 9, 7, 23, 59).toISOString(), new Date(2026, 9, 8, 0, 1).toISOString())).toBe(false);
});

it('skips a message kind, sticker or card this app does not know', () => {
  expect(isKnownMessage(msg({}))).toBe(true);
  expect(isKnownMessage(msg({ kind: 'VOICE' as never }))).toBe(false);
  expect(isKnownMessage(msg({ kind: 'STICKER', text: null, sticker: 'KISS' as never }))).toBe(false);
  expect(isKnownMessage(msg({ kind: 'CARD', text: null, card: { type: 'poll' } as never }))).toBe(false);
  expect(isKnownMessage(msg({ kind: 'CARD', text: null, card: { type: 'goodnight', available: true, onTime: false } }))).toBe(true);
});

it('counts a note draft like the server (code points, trimmed): the Social note counter itself', () => {
  expect(noteLength('  🔥🔥 ')).toBe(2);
  expect(noteLength).toBe(socialNoteLength);
});
