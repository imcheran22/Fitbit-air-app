// Next-message feedback detector for pending coach memory (spec section 6):
// a PENDING entry becomes CONFIRMED when the user's NEXT message does not
// correct or dismiss THAT FACT, and is deleted when it does. The design is
// "assume yes unless corrected about that fact".
//
// The rule is deterministic (no LLM) and evaluated per entry:
//
//   1. Explicit memory-directed dismissal ("forget that", "delete it", "don't
//      save that", "that's wrong", "you got it wrong", "never mind that") ->
//      'dismiss', whatever the entry says.
//   2. Topical correction: the message contains a correction cue (no, not,
//      actually, instead, meant, changed...) AND shares at least one content
//      word with the entry's value ("Actually it's a full marathon" against
//      "training for a half-marathon in March") -> 'dismiss'.
//   3. Everything else -> 'confirm'.
//
// The bias is deliberately toward CONFIRM, the reverse of an earlier version
// that deleted on any negation word anywhere ("why is my score not higher"
// deleted an unrelated memory). The two errors are not symmetric: a wrongly
// CONFIRMED memory is visible (Settings lists it, it can be edited or deleted,
// and only categorised non-health values can exist at all), whereas a wrongly
// DELETED one is silent and the user never knows it was lost, so the rule only
// deletes on a dismissal or a correction about that fact.

const APOSTROPHES = /[‘’ʼ]/g;

const START = "(?<![\\p{L}\\p{N}'])";
const END = "(?![\\p{L}\\p{N}'])";
const THAT = '(?:that|it|this)';

const EXPLICIT_DISMISSALS: RegExp[] = [
  new RegExp(`${START}forget ${THAT}${END}`, 'u'),
  new RegExp(`${START}(?:remove|delete|erase|scratch|ignore|disregard|discard|undo|cancel) ${THAT}${END}`, 'u'),
  new RegExp(`${START}(?:don't|dont|do not) (?:remember|save|store|keep) ${THAT}${END}`, 'u'),
  new RegExp(
    `${START}that(?:'s| s|s| is| was) (?:not (?:right|correct|true|accurate)|wrong|incorrect|a mistake)${END}`,
    'u',
  ),
  new RegExp(`${START}that (?:isn't|wasn't) (?:right|correct|true|accurate)${END}`, 'u'),
  new RegExp(`${START}you got ${THAT} wrong${END}`, 'u'),
  new RegExp(`${START}never ?mind ${THAT}${END}`, 'u'),
];

const CORRECTION_CUES = new Set([
  'no', 'nope', 'not', 'actually', 'instead', 'rather', 'meant', 'wrong', 'incorrect', 'changed', 'change',
]);

const STOP_WORDS = new Set(
  (
    'the and for are but you your yours our his her its their them they she him who whom what which when where why how ' +
    'this that these those there here then than too very can could would should will just was were been being have has had ' +
    'does did doing done not nor with without from into onto over under out off about after before again once all any both ' +
    'each few more most other some such only own same able also get got let lets ive its ill youre thats whats dont ' +
    'doesnt didnt cant wont isnt wasnt arent yes yeah yep nope nah please thanks thank okay sure ' +
    'like likes liked prefer prefers preferred want wants wanted usually always often mostly really ' +
    'actually instead rather meant wrong incorrect changed change changes changing'
  ).split(' '),
);

/** The word plus its light-stemmed forms (strip ing / ed / es / s), each at least 3 letters. */
function forms(word: string): string[] {
  const out = [word];
  for (const suffix of ['ing', 'ed', 'es', 's']) {
    if (word.length - suffix.length >= 3 && word.endsWith(suffix)) out.push(word.slice(0, -suffix.length));
  }
  return out;
}

function contentWords(text: string): Set<string> {
  const words = new Set<string>();
  for (const raw of text.match(/\p{L}+/gu) ?? []) {
    if (raw.length < 3 || STOP_WORDS.has(raw)) continue;
    for (const f of forms(raw)) words.add(f);
  }
  return words;
}

function normalise(text: string): string {
  return text.toLowerCase().replace(APOSTROPHES, "'").replace(/\s+/g, ' ').trim();
}

export type MemoryFeedback = 'confirm' | 'dismiss';

/** Rule 1: the user is explicitly telling the coach to drop what it just noted. */
export function isExplicitMemoryDismissal(message: string): boolean {
  const text = normalise(message);
  return text.length > 0 && EXPLICIT_DISMISSALS.some((re) => re.test(text));
}

/**
 * Classifies the user's next message against ONE pending entry's value. Without
 * a value only rule 1 can fire.
 */
export function classifyMemoryFeedback(message: string, entryValue = ''): MemoryFeedback {
  if (isExplicitMemoryDismissal(message)) return 'dismiss';
  const text = normalise(message);
  const tokens = text.match(/\p{L}+/gu) ?? [];
  if (!tokens.some((t) => CORRECTION_CUES.has(t))) return 'confirm';
  const entry = contentWords(normalise(entryValue));
  if (entry.size === 0) return 'confirm';
  for (const w of contentWords(text)) if (entry.has(w)) return 'dismiss';
  return 'confirm';
}
