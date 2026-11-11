import { readFileSync } from 'fs';
import { join } from 'path';
import { SHARING_CONSENT_LINES, buddyErrorMessage, expiresIn, formatNumber, joinList, sharesSummary, stickerSentLine, weekdayLetter } from '../../src/lib/buddyCopy';

it('summarises what a buddy shares', () => {
  expect(sharesSummary('Sam', [])).toBe('Sam shares mood only');
  expect(sharesSummary('Sam', ['sleepScore'])).toBe('Sam shares mood and sleep score');
  expect(sharesSummary('Sam', ['recovery', 'steps', 'streaks'])).toBe('Sam shares mood, recovery, steps and streaks & badges');
  expect(joinList(['a', 'b'])).toBe('a and b');
});

it('words a sent sticker, a code expiry, and an error code', () => {
  expect(stickerSentLine('REST_UP', 'Sam')).toBe('Sent a Rest up to Sam.');
  const now = Date.parse('2026-10-07T12:00:00Z');
  expect(expiresIn('2026-10-08T11:30:00Z', now)).toBe('Expires in 23 h 30 min');
  expect(expiresIn('2026-10-07T12:05:00Z', now)).toBe('Expires in 5 min');
  expect(expiresIn('2026-10-07T11:00:00Z', now)).toBe('Expired');
  expect(buddyErrorMessage('not_buddies')).toBe("You're no longer buddies.");
  expect(buddyErrorMessage('code_invalid')).toBe("That code didn't work. Check it and try again.");
  expect(buddyErrorMessage(null)).toBe('Something went wrong. Please try again.');
});

it('says a code expiring on the hour in whole hours', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  expect(expiresIn('2026-10-07T13:00:00Z', now)).toBe('Expires in 1 h');
  expect(expiresIn('2026-10-08T12:00:00Z', now)).toBe('Expires in 24 h');
  expect(expiresIn('2026-10-07T13:00:01Z', now)).toBe('Expires in 1 h 1 min');
});

it('says the sticker limit is per buddy', () => {
  expect(buddyErrorMessage('sticker_limit')).toMatch(/this buddy/);
});

// Every code in the server's BUDDY_ERROR_STATUS has its own words. The codes are read from the
// backend source as text (never imported), so a code added there fails here until it is worded.
function serverCodes(): string[] {
  const source = readFileSync(join(__dirname, '../../../backend/src/buddies/errors.ts'), 'utf8');
  const table = /BUDDY_ERROR_STATUS = \{([^}]*)\}/.exec(source)?.[1] ?? '';
  return [...table.matchAll(/^\s*([a-z_]+):\s*\d{3},?\s*$/gm)].map((m) => m[1]!);
}

it('words every server error code, and falls back for anything else', () => {
  const generic = buddyErrorMessage(null);
  const codes = serverCodes();
  expect(codes.length).toBeGreaterThanOrEqual(21);
  for (const code of codes) expect([code, buddyErrorMessage(code)]).not.toEqual([code, generic]);
  expect(buddyErrorMessage('something_new')).toBe(generic);
  expect(buddyErrorMessage('toString')).toBe(generic);
});

it('puts the 7-day window on the numbers only, not on streaks and badge levels', () => {
  const [intro, ...rest] = SHARING_CONSENT_LINES;
  expect(intro).not.toMatch(/7 days/);
  const line = (start: string) => rest.find((l) => l.startsWith(start)) ?? '';
  for (const start of ['Recovery score:', 'Sleep score:', 'Hours slept:', 'Steps:']) expect(line(start)).toMatch(/last 7 days/);
  expect(line('Streaks & badges:')).not.toMatch(/7 days/);
});

it('labels days and shared numbers', () => {
  expect(weekdayLetter('2026-10-05')).toBe('M');
  expect(formatNumber('hoursSlept', 7.5)).toBe('7.5h');
  expect(formatNumber('steps', 12345)).toBe('12,345');
  expect(formatNumber('recovery', null)).toBe('–');
});

it('shows a missing number as absent, never as 0', () => {
  expect(formatNumber('steps', undefined)).toBe('–');
  expect(formatNumber('recovery', Number.NaN)).toBe('–');
  expect(formatNumber('recovery', 0)).toBe('0');
});
