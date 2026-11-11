import type { StickerKind } from '../api/buddies';
import type { Card, CardType, ChatRow, LastMessage, Message, ReplyPreview, ReportReason } from '../api/chats';
import type { CheckInMood, StoryFrame } from '../api/social';
import { FAMILY_NAMES, numeral } from './badges';
import { STICKER_LABEL } from './buddyCopy';
import { CHECKIN_OPTIONS } from './socialCopy';

// Chats copy (spec 2026-10-07 social §8). Fixed templates over typed fields; the only free text is a buddy's own message
// or note, shown as it is. Every clock time is 12-hour, on the phone's clock.

// A Chats note is counted exactly like a camp note (code points of the NFC, trimmed draft): one counter (plan ruling P6).
export { noteLength } from './socialCopy';

export const STATUS_NOTE_MAX = 60;
export const MESSAGE_MAX = 1000;
/** An open thread re-reads its newest page this often (plan ruling). */
export const POLL_MS = 5000;
export const REPORT_REASONS: ReadonlyArray<{ reason: ReportReason; label: string }> = [
  { reason: 'spam', label: 'Spam' },
  { reason: 'harassment', label: 'Harassment' },
  { reason: 'other', label: 'Something else' },
];

// What this app can draw. A newer server may add kinds, stickers or card types: such a message is skipped, never drawn
// blank or mislabelled.
const MESSAGE_KINDS: ReadonlySet<string> = new Set(['TEXT', 'STICKER', 'CARD']);
const CARD_TYPES: ReadonlySet<string> = new Set<CardType>(['checkin', 'badge', 'recap', 'goodnight', 'note', 'camp_note']);
const knownSticker = (s: unknown): s is StickerKind => typeof s === 'string' && Object.prototype.hasOwnProperty.call(STICKER_LABEL, s);

export function isKnownMessage(m: Message): boolean {
  if (!MESSAGE_KINDS.has(m.kind)) return false;
  if (m.kind === 'STICKER') return knownSticker(m.sticker);
  if (m.kind === 'CARD') return m.card !== null && CARD_TYPES.has(m.card.type);
  return typeof m.text === 'string';
}
export const knownMessages = (list: readonly Message[]) => list.filter(isKnownMessage);

/** "now", "5m", "3h", "2d", "1w": how long ago, for an inbox line. */
export function shortAgo(iso: string, now: number): string {
  const min = Math.max(0, Math.floor((now - Date.parse(iso)) / 60_000));
  if (min < 1) return 'now';
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  return d < 7 ? `${d}d` : `${Math.floor(d / 7)}w`;
}

export const stickerLine = (kind: StickerKind) => STICKER_LABEL[kind];

/** A card in one line, for the inbox and reply quotes. */
export function cardSummary(type: CardType | null): string {
  switch (type) {
    case 'checkin': return 'Shared a check-in';
    case 'badge':
    case 'recap':
    case 'goodnight': return 'Replied to a story';
    case 'note': return 'Replied to a note';
    case 'camp_note': return 'Replied to a camp note';
    default: return 'Sent a message';
  }
}

/** "You: proud of that streak!", "Sent a Cheer sticker", "Shared a check-in". */
export function lastMessageText(last: LastMessage): string {
  if (last.kind === 'STICKER') {
    const what = knownSticker(last.sticker) ? `a ${STICKER_LABEL[last.sticker]} sticker` : 'a sticker';
    return last.mine ? `You sent ${what}` : `Sent ${what}`;
  }
  return `${last.mine ? 'You: ' : ''}${last.text ?? cardSummary(last.cardType)}`;
}

export const chatRowLine = (row: ChatRow, now: number) => `${lastMessageText(row.lastMessage)} · ${shortAgo(row.lastMessage.at, now)}`;

/** "Active now" (≤ 5 min), "Active 12m ago", "Active 3h ago"; null when the server sent no time. */
export function activeLine(activeAt: string | null, now: number): string | null {
  if (!activeAt) return null;
  const min = Math.max(0, Math.floor((now - Date.parse(activeAt)) / 60_000));
  if (min <= 5) return 'Active now';
  if (min < 60) return `Active ${min}m ago`;
  return `Active ${Math.floor(min / 60)}h ago`;
}

const MOOD_WORDS: Record<CheckInMood, string> = { RESTED: 'rested', OKAY: 'okay', TIRED: 'tired' };
export const moodColor = (mood: CheckInMood) => CHECKIN_OPTIONS.find((o) => o.mood === mood)?.color ?? '#9CA3AF';

export function cardKicker(card: Card): string {
  switch (card.type) {
    case 'checkin': return 'MORNING CHECK-IN';
    case 'badge': return 'BADGE';
    case 'recap': return card.recapKind === 'MONTH' ? 'MONTHLY RECAP' : 'WEEKLY RECAP';
    case 'goodnight': return 'GOODNIGHT';
    case 'note': return 'NOTE';
    case 'camp_note': return 'CAMP NOTE';
  }
}

/** A badge or recap card its author no longer shares (spec §9) arrives without its level or line. */
export const CARD_NOT_SHARED = 'No longer shared';

export function cardLine(card: Card): string {
  switch (card.type) {
    case 'checkin': return card.mood ? `Woke up ${MOOD_WORDS[card.mood]}` : 'Checked in';
    case 'badge': return card.available ? `${FAMILY_NAMES[card.family]} ${numeral(card.level)}` : CARD_NOT_SHARED;
    case 'recap': return card.available ? card.line : CARD_NOT_SHARED;
    case 'goodnight': return card.onTime ? 'Said goodnight, on time' : 'Said goodnight';
    case 'note':
    case 'camp_note': return card.text;
  }
}

/** The small line over a card: "You replied to their check-in", "Ben shared their check-in". */
export function cardCaption(card: Card, mine: boolean, name: string): string {
  const who = mine ? 'You' : name;
  if (card.type === 'checkin' && card.about === 'sender') return `${who} shared ${mine ? 'your' : 'their'} check-in`;
  const what = card.type === 'checkin' ? 'check-in' : card.type === 'note' ? 'note' : card.type === 'camp_note' ? 'camp note' : 'story';
  return `${who} replied to ${mine ? 'their' : 'your'} ${what}`;
}

/** The quote over a reply: "Ben: rough night", "You: Star sticker", or "Message unsent". */
export function replyLine(reply: ReplyPreview, name: string): string {
  if (reply.gone) return 'Message unsent';
  const what = reply.text ?? (knownSticker(reply.sticker) ? `${STICKER_LABEL[reply.sticker]} sticker` : cardSummary(reply.cardType));
  return `${reply.mine ? 'You' : name}: ${what}`;
}

const FRAME_WORDS: Record<StoryFrame['kind'], string> = { checkin: 'check-in', badge: 'badge', recap: 'recap', goodnight: 'goodnight' };
export const frameQuoteLabel = (kind: StoryFrame['kind'], name: string) => `${name}'s ${FRAME_WORDS[kind]}`;
export const noteQuoteLabel = (name: string) => `${name}'s note`;
export const campNoteQuoteLabel = (name: string) => `${name}'s camp note`;

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const time12 = (d: Date) => `${d.getHours() % 12 || 12}:${String(d.getMinutes()).padStart(2, '0')} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export const sameLocalDay = (a: string, b: string) => dayStart(new Date(a)) === dayStart(new Date(b));

/** A thread's day chip: "Today 7:31 AM", "Yesterday 9:02 PM", "Mon 12:00 PM" within the week, else "Sep 30 12:05 AM". */
export function dayChip(iso: string, now: Date): string {
  const d = new Date(iso);
  const days = Math.round((dayStart(now) - dayStart(d)) / 86_400_000);
  if (days === 0) return `Today ${time12(d)}`;
  if (days === 1) return `Yesterday ${time12(d)}`;
  if (days > 1 && days < 7) return `${WEEKDAYS[d.getDay()]} ${time12(d)}`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()} ${time12(d)}`;
}
