import { MESSAGE_TEXT_MAX, STATUS_NOTE_MAX, checkMessageText, checkStatusNote, previewText, sanitiseMessageText } from '../../src/chats/text';
import { BUDDY_ERROR_STATUS } from '../../src/buddies/errors';

// Built at run time so no editor or tool can turn the lone surrogate into other bytes.
const LONE_SURROGATE = String.fromCharCode(0xd800);

// Joined emoji, spelled out so the invisible joiners and tags are plain to see.
const FAMILY = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}';
const HEART_ON_FIRE = '\u2764\uFE0F\u200D\u{1F525}';
const RAINBOW_FLAG = '\u{1F3F3}\uFE0F\u200D\u{1F308}';
const TRANS_FLAG = '\u{1F3F3}\uFE0F\u200D\u26A7\uFE0F';
const ENGLAND_FLAG = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
const THUMBS_UP_MEDIUM = '\u{1F44D}\u{1F3FD}';
const UK_FLAG = '\u{1F1EC}\u{1F1E7}';

it('keeps newlines, turns CR/CRLF, NEL and the Unicode separators into \\n and a tab into a space, strips every other control and format character', () => {
  expect(sanitiseMessageText('a\r\nb\rc\u2028d\u2029e\u0085f')).toBe('a\nb\nc\nd\ne\nf');
  expect(sanitiseMessageText('a\tb\u0000c\u200Bd\u202Ee')).toBe('a bcde');
  expect(sanitiseMessageText('one\n\n\n\n\ntwo')).toBe('one\n\ntwo');
  expect(sanitiseMessageText('  \n hi \n  ')).toBe('hi');
  expect(sanitiseMessageText('e\u0301')).toBe('\u00E9');
  // A variation selector stays: the heart keeps its emoji form.
  expect(sanitiseMessageText('\u2764\uFE0F')).toBe('\u2764\uFE0F');
});

it('treats whitespace-only lines as blank and drops trailing spaces on each line', () => {
  expect(sanitiseMessageText('a\n \n \n \n b')).toBe('a\n\nb');
  expect(sanitiseMessageText('a  \n\t\nb')).toBe('a\n\nb');
  expect(sanitiseMessageText('a \nb')).toBe('a\nb');
});

it('keeps joined emoji whole: a ZWJ between two emoji and tags after the black flag', () => {
  for (const emoji of [FAMILY, HEART_ON_FIRE, RAINBOW_FLAG, TRANS_FLAG, ENGLAND_FLAG]) {
    expect(sanitiseMessageText(`hi ${emoji}!`)).toBe(`hi ${emoji}!`);
  }
});

it('strips a ZWJ that does not join two emoji, and tags that do not follow the black flag', () => {
  expect(sanitiseMessageText('a\u200Db')).toBe('ab');
  expect(sanitiseMessageText('\u{1F468}\u200Db')).toBe('\u{1F468}b');
  expect(sanitiseMessageText('a\u200D\u{1F468}')).toBe('a\u{1F468}');
  expect(sanitiseMessageText('\u200D\u{1F468}')).toBe('\u{1F468}');
  expect(sanitiseMessageText('\u{1F468}\u200D')).toBe('\u{1F468}');
  expect(sanitiseMessageText('hi\u{E0067}\u{E0062}\u{E007F} there')).toBe('hi there');
  expect(sanitiseMessageText('\u{1F3F3}\u{E0067}\u{E007F}')).toBe('\u{1F3F3}');
  expect(checkMessageText('\u200D\u200D')).toBeNull();
});

it('accepts 1-1000 code points with something visible, and refuses everything else', () => {
  expect(checkMessageText(' rough night lol ')).toBe('rough night lol');
  expect(checkMessageText('x'.repeat(MESSAGE_TEXT_MAX))).toHaveLength(1000);
  expect(checkMessageText('x'.repeat(MESSAGE_TEXT_MAX + 1))).toBeNull();
  expect(checkMessageText('🔥'.repeat(1000))).toBe('🔥'.repeat(1000)); // code points, not UTF-16 units
  expect(checkMessageText('🔥'.repeat(1001))).toBeNull();
  const bads = ['', '   ', '\n\n', '\u200B\u200D', '\u2800', '\u3164', '\u115F', '\uFFA0', '\u3164 \u115F\n\uFFA0',
    42, null, undefined, ['hi'], { text: 'hi' }, `hi${LONE_SURROGATE}`];
  for (const bad of bads) {
    expect([bad, checkMessageText(bad)]).toEqual([bad, null]);
  }
  // A filler next to real text is stored unchanged: only the visibility check ignores it.
  expect(checkMessageText('hi\u3164')).toBe('hi\u3164');
});

it('sanitises a Chats note like a camp note (no newlines) and allows 1-60 code points', () => {
  expect(checkStatusNote(' early\nnight ')).toBe('earlynight');
  expect(checkStatusNote('x'.repeat(STATUS_NOTE_MAX))).toHaveLength(60);
  expect(checkStatusNote('x'.repeat(61))).toBeNull();
  expect(checkStatusNote('admin says hi')).toBe('admin says hi');
  // The camp-note sanitiser is unchanged: a note still drops every format character.
  expect(checkStatusNote(FAMILY)).toBe('\u{1F468}\u{1F469}\u{1F467}');
  for (const bad of ['', '  ', '\u200B', 7, `${LONE_SURROGATE}hi`]) expect(checkStatusNote(bad)).toBeNull();
});

it('previews a text on one line of at most 80 code points, ending with an ellipsis when cut', () => {
  expect(previewText('rough night\nlol')).toBe('rough night lol');
  expect(previewText('x'.repeat(80))).toBe('x'.repeat(80));
  expect(previewText(`${'x'.repeat(79)} yz`)).toBe(`${'x'.repeat(79)}…`);
  expect(previewText('🔥'.repeat(81))).toBe(`${'🔥'.repeat(80)}…`);
  expect(previewText('abcdef', 3)).toBe('abc…');
});

it('cuts a preview only between whole graphemes', () => {
  const x79 = 'x'.repeat(79);
  expect(previewText(`${x79}\u2764\uFE0Fz`)).toBe(`${x79}…`);
  expect(previewText(`${x79}${THUMBS_UP_MEDIUM}z`)).toBe(`${x79}…`);
  expect(previewText(`${x79}${UK_FLAG}z`)).toBe(`${x79}…`);
  expect(previewText(`${'x'.repeat(75)}${FAMILY}z`)).toBe(`${'x'.repeat(75)}${FAMILY}…`);
  expect(previewText(`${'x'.repeat(76)}${FAMILY}z`)).toBe(`${'x'.repeat(76)}…`);
  expect(previewText(THUMBS_UP_MEDIUM.repeat(41))).toBe(`${THUMBS_UP_MEDIUM.repeat(40)}…`);
});

it('has the S3 error codes', () => {
  expect(BUDDY_ERROR_STATUS).toMatchObject({
    invalid_message: 400, message_gone: 404, invalid_reaction: 400, card_unavailable: 409,
    invalid_status_note: 400, invalid_report: 400, report_target_gone: 404,
  });
});
