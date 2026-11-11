import type { Ionicons } from '@expo/vector-icons';
import type { Mood, NumberKey, ShareKey, StickerKind } from '../api/buddies';

// Every buddy string the app shows (spec 2026-10-06 buddies §5-§7). Fixed text only: nothing here is
// model output, and a number appears only when the buddy shared it.

export const MOOD_COLORS: Record<Mood, string> = { good: '#86EFAC', ok: '#93C5FD', low: '#FDBA74', none: '#9CA3AF' };
export const TILE_COLORS: Record<Mood, string> = { good: '#7C93B8', ok: '#3B4A63', low: '#5A3A2A', none: 'transparent' };
export const MOOD_WORDS: Record<Mood, string> = { good: 'well rested', ok: 'doing okay', low: 'running low', none: 'no data' };

export const BUDDY_WEEK_COPY = { thisWeek: 'This week' } as const;
export const PAIR_UP_COPY = {
  privacy: "Buddies always see your KIP's mood. Your numbers stay private unless you share them in Profile.",
} as const;
export const STICKER_LABEL: Record<StickerKind, string> = { CHEER: 'Cheer', HEART: 'Heart', REST_UP: 'Rest up', STAR: 'Star' };
export const STICKERS: ReadonlyArray<{ kind: StickerKind; label: string; icon: keyof typeof Ionicons.glyphMap }> = [
  { kind: 'CHEER', label: 'Cheer', icon: 'megaphone-outline' },
  { kind: 'HEART', label: 'Heart', icon: 'heart-outline' },
  { kind: 'REST_UP', label: 'Rest up', icon: 'bed-outline' },
  { kind: 'STAR', label: 'Star', icon: 'star-outline' },
];

export const NUMBER_LABELS: Record<NumberKey, string> = { recovery: 'Recovery', sleepScore: 'Sleep score', hoursSlept: 'Hours slept', steps: 'Steps' };
export const SHARE_TITLES: Record<ShareKey, string> = {
  recovery: 'Recovery score', sleepScore: 'Sleep score', hoursSlept: 'Hours slept', steps: 'Steps', streaks: 'Streaks & badges',
};
export const SHARE_HINTS: Record<ShareKey, string> = {
  recovery: 'Your daily recovery score, last 7 days',
  sleepScore: 'Your daily sleep score, last 7 days',
  hoursSlept: 'How long you slept, last 7 days',
  steps: 'Your daily steps, and "moved a lot yesterday"',
  streaks: 'Your sleep streak and badge levels',
};
const SHARE_WORDS: Record<ShareKey, string> = { recovery: 'recovery', sleepScore: 'sleep score', hoursSlept: 'hours slept', steps: 'steps', streaks: 'streaks & badges' };

/**
 * The consent text's version: must equal the server's consentVersion for the switches to be changed here.
 * Keep in step with BUDDY_SHARING_CONSENT_VERSION in backend/src/buddies/sharing.ts (a mismatch is
 * refused as stale_consent_version); change both, and SHARING_CONSENT_LINES, together.
 */
export const SHARING_CONSENT_VERSION = 1;
export const SHARING_CONSENT_LINES: readonly string[] = [
  'Every buddy will see what you turn on:',
  'Recovery score: your daily score for the last 7 days.',
  'Sleep score: your daily score for the last 7 days.',
  'Hours slept: how long you slept each night, for the last 7 days.',
  'Steps: your daily steps for the last 7 days, and whether you moved a lot yesterday.',
  'Streaks & badges: your sleep streak and badge levels. Buddies may get a notification with your name when you reach a badge level.',
  'Your mood and coach are always shared. You can turn any of these off at any time.',
];

export const MOOD_NOTICE_TEXT =
  'Your mood comes from your recovery score. Every buddy always sees it (well rested, doing okay or running low) for today and the last 7 days. Your numbers stay private unless you share them in Profile.';

export function joinList(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

export function sharesSummary(name: string, shares: readonly ShareKey[]): string {
  return shares.length === 0 ? `${name} shares mood only` : `${name} shares ${joinList(['mood', ...shares.map((s) => SHARE_WORDS[s])])}`;
}

export function stickerSentLine(kind: StickerKind, name: string): string {
  return `Sent a ${STICKER_LABEL[kind]} to ${name}.`;
}

/** A reused code has less than a day left, so the message says how long this one has. */
export function shareMessage(code: string, expiresAt: string, now: number): string {
  return `Be my buddy on Biometrics! My buddy code is ${code}. ${expiresIn(expiresAt, now)}.`;
}

export function expiresIn(expiresAt: string, now: number): string {
  const ms = Date.parse(expiresAt) - now;
  if (!(ms > 0)) return 'Expired';
  const minutes = Math.ceil(ms / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours === 0) return `Expires in ${minutes} min`;
  return minutes % 60 === 0 ? `Expires in ${hours} h` : `Expires in ${hours} h ${minutes % 60} min`;
}

// One line per code in backend/src/buddies/errors.ts (BUDDY_ERROR_STATUS); anything else is the fallback.
const ERRORS: Record<string, string> = {
  code_invalid: "That code didn't work. Check it and try again.",
  not_found: 'No one has that handle.',
  own_handle: "That's your own handle.",
  blocked_by_you: 'You blocked this person. Unblock them in Profile first.',
  too_many_pending: 'You have 20 requests waiting. Cancel one to send another.',
  rate_limited: 'Too many tries. Please try again later.',
  try_later: "Couldn't do that right now. Try again in a minute.",
  not_buddies: "You're no longer buddies.",
  sticker_limit: "That's 5 stickers to this buddy today. Try again tomorrow.",
  handle_taken: 'That handle is taken.',
  invalid_handle: 'Use 3-20 letters, numbers or _ (no reserved words).',
  invalid_display_name: 'Use 1-30 characters (no reserved words).',
  setup_incomplete: 'Pick a handle and a display name.',
  request_gone: 'That request is no longer there.',
  handle_required: 'Pick a handle first.',
  mood_notice_required: 'Confirm the mood notice first.',
  consent_required: 'Confirm what your buddies will see first.',
  stale_consent_version: 'What buddies see has changed. Read it again and confirm.',
  invalid_settings: "Couldn't save that setting. Please try again.",
  invalid_sticker: "That sticker isn't available.",
  invalid_cursor: "Couldn't load more. Please refresh.",
  invalid_checkin: 'Pick how you woke up.',
  recap_not_found: "That recap can't be shared.",
  goodnight_closed: 'Goodnight opens this evening.',
  undo_expired: "It's too late to undo that goodnight.",
  invalid_note: 'Notes are 1 to 40 characters.',
  invalid_message: 'Messages are 1 to 1,000 characters.',
  message_gone: 'That message is no longer there.',
  invalid_reaction: "That reaction isn't available.",
  card_unavailable: "That can't be shared anymore.",
  invalid_status_note: 'Notes are 1 to 60 characters.',
  invalid_report: 'Pick a reason to report.',
  report_target_gone: "That's no longer there to report.",
};

export function buddyErrorMessage(code: string | null): string {
  return code !== null && Object.prototype.hasOwnProperty.call(ERRORS, code) ? ERRORS[code]! : 'Something went wrong. Please try again.';
}

const dayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();
export function weekdayLetter(date: string): string {
  return 'SMTWTFS'[dayOf(date)]!;
}
export function weekdayName(date: string): string {
  return ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][dayOf(date)]!;
}

/** A missing value (null, absent, not a number) shows as a dash, never as 0. */
export function formatNumber(key: NumberKey, value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  if (key === 'hoursSlept') return `${value}h`;
  if (key === 'steps') return value.toLocaleString('en-US');
  return String(value);
}
