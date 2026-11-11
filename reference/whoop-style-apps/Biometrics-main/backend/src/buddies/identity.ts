// Handles and display names (spec 2026-10-06 buddies §2). Pure.

import { createHmac } from 'crypto';

export const HANDLE_MIN = 3;
export const HANDLE_MAX = 20;
export const DISPLAY_NAME_MAX = 30;
export const RESERVED_WORDS: readonly string[] = ['biometrics', 'admin', 'support', 'official', 'team', 'staff', 'moderator'];

/** One leading "@" stripped (after trimming), lowercased. Used by setup, edit, availability and requests alike. */
export function normaliseHandleInput(raw: string): string {
  const trimmed = raw.trim();
  return (trimmed.startsWith('@') ? trimmed.slice(1) : trimmed).toLowerCase();
}

/**
 * A contains check on a folded copy: compatibility forms unified (NFKC, so fullwidth letters match),
 * marks stripped (NFKD then \p{M}, so "ADM\u0130N" matches), lowercased, "_", whitespace and the
 * braille blank ignored. Only the check folds; the caller stores the value unchanged.
 */
export function containsReserved(text: string): boolean {
  const folded = text
    .normalize('NFKC')
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[_\s\u2800]/g, '');
  return RESERVED_WORDS.some((word) => folded.includes(word));
}

export type HandleProblem = 'length' | 'characters' | 'reserved';

export function checkHandle(raw: unknown): { ok: true; handle: string } | { ok: false; problem: HandleProblem } {
  if (typeof raw !== 'string') return { ok: false, problem: 'characters' };
  const handle = normaliseHandleInput(raw);
  if (handle.length < HANDLE_MIN || handle.length > HANDLE_MAX) return { ok: false, problem: 'length' };
  if (!/^[a-z0-9_]+$/.test(handle)) return { ok: false, problem: 'characters' };
  if (containsReserved(handle)) return { ok: false, problem: 'reserved' };
  return { ok: true, handle };
}

/**
 * NFC, then Cc (controls, incl. \n \r), Cf (bidi overrides, zero-widths), default-ignorable code points
 * (variation selectors, the grapheme joiner, Hangul fillers) and line/paragraph separators removed, then trimmed.
 */
export function sanitiseDisplayName(raw: string): string {
  return raw.normalize('NFC').replace(/[\p{Cc}\p{Cf}\p{Default_Ignorable_Code_Point}\u2028\u2029]/gu, '').trim();
}

/** At least one letter, number, symbol or punctuation mark; the braille blank (U+2800, a symbol) does not count. */
export function hasVisibleCharacter(text: string): boolean {
  return /[\p{L}\p{N}\p{S}\p{P}]/u.test(text.replace(/\u2800/g, ''));
}

/** String.prototype.isWellFormed (ES2024; this tsconfig's lib is ES2022): false when the text holds a lone surrogate. */
export function isWellFormed(text: string): boolean {
  return !/\p{Cs}/u.test(text);
}

export type DisplayNameProblem = 'empty' | 'length' | 'reserved';

export function checkDisplayName(raw: unknown): { ok: true; displayName: string } | { ok: false; problem: DisplayNameProblem } {
  if (typeof raw !== 'string') return { ok: false, problem: 'empty' };
  // A lone surrogate is not text: Postgres cannot store it (a 500), so refuse it before sanitising.
  if (!isWellFormed(raw)) return { ok: false, problem: 'empty' };
  const displayName = sanitiseDisplayName(raw);
  const length = [...displayName].length;
  if (length === 0 || !hasVisibleCharacter(displayName)) return { ok: false, problem: 'empty' };
  if (length > DISPLAY_NAME_MAX) return { ok: false, problem: 'length' };
  if (containsReserved(displayName)) return { ok: false, problem: 'reserved' };
  return { ok: true, displayName };
}

const SIGN_IN_FALLBACK_NAME = 'Biometrics user';

/**
 * The setup screen's starting value: the first word of User.name, unless the name is what sign-in
 * stores when the provider gave none (the email's local part, or 'Biometrics user', auth.ts) — then
 * empty. A first word that would not be a valid display name is empty too.
 */
export function displayNamePrefill(user: { name: string; email: string }): string {
  const name = user.name.trim();
  const localPart = user.email.split('@')[0] ?? '';
  if (!name || name.toLowerCase() === localPart.toLowerCase() || name === SIGN_IN_FALLBACK_NAME) return '';
  const first = name.split(/\s+/)[0]!;
  const check = checkDisplayName(first);
  return check.ok ? check.displayName : '';
}

/**
 * The HandleHold key. Production requires HANDLE_HOLD_SECRET (the server refuses to start without
 * it, assertHandleHoldSecret); development and tests may fall back to BETTER_AUTH_SECRET.
 * ROTATING IT RELEASES EVERY HELD HANDLE: stored hashes stop matching. Rotate only deliberately.
 */
export function handleHashSecret(env: NodeJS.ProcessEnv = process.env): string {
  const own = env.HANDLE_HOLD_SECRET?.trim();
  if (own) return own;
  const fallback = env.NODE_ENV === 'production' ? undefined : env.BETTER_AUTH_SECRET?.trim();
  if (!fallback) throw new Error('HANDLE_HOLD_SECRET is not set (required in production)');
  return fallback;
}

/** Called once at server start: a production server without HANDLE_HOLD_SECRET must not start. */
export function assertHandleHoldSecret(env: NodeJS.ProcessEnv = process.env): void {
  handleHashSecret(env);
}

/** Expects a handle already normalised by checkHandle. HMAC-SHA-256 of it: exact lookups still work, released handles cannot be listed. */
export function handleHash(handle: string, secret: string = handleHashSecret()): string {
  return createHmac('sha256', secret).update(`handle-hold:v1:${handle}`).digest('hex');
}
