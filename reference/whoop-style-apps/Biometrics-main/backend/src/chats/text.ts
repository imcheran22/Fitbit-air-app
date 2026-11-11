// Chat free text (spec 2026-10-07 social §8.1, §8.2, §9). Pure. A message's text: NFC; \r\n, \r, NEL, U+2028 and
// U+2029 become \n and a tab becomes a space; every other control (Cc) is removed; format characters (Cf) are removed
// (bidi overrides, zero-widths) except the two that hold joined emoji together; trailing spaces on each line are
// dropped and a run of blank (or whitespace-only) lines becomes one blank line; trimmed; 1-1000 code points with
// something visible (default-ignorable fillers such as U+3164 do not count). Variation selectors stay, so an emoji
// keeps its form.
// Controller ruling (a deliberate departure from the letter of the spec, which strips every Cf as for camp notes):
// a chat message is where people send joined emoji, and splitting a family emoji into three faces or a Welsh flag into a
// plain black flag changes what they said. So a ZWJ (U+200D) stays only between two pictographic emoji (a VS16 or
// skin tone may sit before it), and tag characters (U+E0020-U+E007F) stay only in the run right after U+1F3F4 (the
// subdivision flags). Anywhere else they could hide text, so they go like every other Cf.
// A Chats note uses the camp-note sanitiser (no newlines at all, every Cf removed), 1-60 code points. A lone
// surrogate is refused before sanitising (Postgres cannot store it).
// The text is user free text: never logged (not even its length), never sent to the coach, never in analytics.

import { hasVisibleCharacter, isWellFormed, sanitiseDisplayName } from '../buddies/identity';

export const MESSAGE_TEXT_MAX = 1000;
export const STATUS_NOTE_MAX = 60;
/** An inbox line, a reply quote and a push preview: one line of at most this many code points. */
export const PREVIEW_MAX = 80;

const ZWJ = '\u200D';
const BLACK_FLAG = '\u{1F3F4}';
const isPictographic = (c: string | undefined): boolean => c !== undefined && /^\p{Extended_Pictographic}$/u.test(c);
const isEmojiModifier = (c: string | undefined): boolean => c !== undefined && /^[\uFE0F\u{1F3FB}-\u{1F3FF}]$/u.test(c);
const isTag = (c: string | undefined): boolean => c !== undefined && /^[\u{E0020}-\u{E007F}]$/u.test(c);

/** A ZWJ between two emoji (a VS16 or skin tone allowed just before it), or a tag in the run right after 🏴. */
function keepsFormatCharacter(points: string[], i: number): boolean {
  const c = points[i];
  if (c === ZWJ) {
    const before = isEmojiModifier(points[i - 1]) ? points[i - 2] : points[i - 1];
    return isPictographic(before) && isPictographic(points[i + 1]);
  }
  if (isTag(c)) {
    let start = i;
    while (isTag(points[start - 1])) start -= 1;
    return points[start - 1] === BLACK_FLAG;
  }
  return false;
}

export function sanitiseMessageText(raw: string): string {
  const points = [
    ...raw
      .normalize('NFC')
      .replace(/\r\n?|[\u0085\u2028\u2029]/g, '\n')
      .replace(/\t/g, ' '),
  ];
  return points
    .filter((c, i) => c === '\n' || !/^[\p{Cc}\p{Cf}]$/u.test(c) || keepsFormatCharacter(points, i))
    .join('')
    .replace(/[^\S\n]+$/gm, '')
    .replace(/\n{3,}[^\S\n]*/g, '\n\n')
    .trim();
}

/** The text to store, or null when it is not a valid message text. */
export function checkMessageText(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isWellFormed(raw)) return null;
  const text = sanitiseMessageText(raw);
  const length = [...text].length;
  // Hangul fillers are letters (\p{L}) but show nothing: judge visibility without default-ignorables.
  const visible = hasVisibleCharacter(text.replace(/\p{Default_Ignorable_Code_Point}/gu, ''));
  return length >= 1 && length <= MESSAGE_TEXT_MAX && visible ? text : null;
}

/** A Chats note to store, or null. */
export function checkStatusNote(raw: unknown): string | null {
  if (typeof raw !== 'string' || !isWellFormed(raw)) return null;
  const text = sanitiseDisplayName(raw);
  const length = [...text].length;
  return length >= 1 && length <= STATUS_NOTE_MAX && hasVisibleCharacter(text) ? text : null;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });

/**
 * One line: whitespace runs (newlines too) become one space. Longer than `max` code points: cut after the last whole
 * grapheme that fits (never inside a flag, a skin tone or a VS16) and end in "…".
 */
export function previewText(text: string, max: number = PREVIEW_MAX): string {
  const flat = text.replace(/\s+/gu, ' ').trim();
  if ([...flat].length <= max) return flat;
  let cut = '';
  let used = 0;
  for (const { segment } of graphemes.segment(flat)) {
    const size = [...segment].length;
    if (used + size > max) break;
    cut += segment;
    used += size;
  }
  return `${cut.trimEnd()}…`;
}
