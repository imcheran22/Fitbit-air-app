// Sentence and card validation (spec 2026-09-30, section 2.4): the model writes
// numbers directly, and every number it writes must be one the fact sheet
// already holds.
//
//   * Numbers: every number, duration and h:mm in a sentence must match a
//     value the sheet holds: a fact's value, usual or precomputed comparison,
//     or a number in a fact note or sheet note. Digits inside fact ids and
//     labels ("recovery.avg7", "30-day average") never count. Integers match
//     within ±1, decimals within ±1%, durations within ±1% or ±1 minute, with
//     "6h 48m" = "408 minutes" = "6.8 hours". A hedged number ("about 7
//     hours", "~8,000 steps", "just under 400 minutes") may be within ±10%.
//   * Units and metrics: a number with a unit next to it ("62 ms", "26%",
//     "3,120 steps", "32 points", "26/100") matches only values of that unit;
//     a bare number matches any non-duration value. When the sentence names
//     one or more metrics (recovery, sleep score, HRV, resting HR, sleep,
//     steps), only the named metrics' values (and metric-less ones, e.g.
//     missing-data notes) count, so "Your HRV is 61" cannot borrow resting
//     HR's 61, nor "Your recovery dropped 8%" the HRV trend's 8%, nor "Your
//     HRV is 26 after a short night" recovery's 26. A score driver's points
//     ([factor.*]) count only when the sentence names the driver (its metric
//     or its own words: "irregular bedtimes") and the score it moves (or a bare
//     "score"): "HRV took 9 points off your recovery", never "Your HRV is 9"; the nights-recorded note is sleep's; a memory note's
//     numbers count only in a sentence naming no metric. The one exception
//     is a unit owned by a single metric that is related to the named one:
//     "your sleep score was 36 ... your average dipped to 6h 53m" matches
//     the duration against the sleep facts (see candidatesFor).
//   * Number words ("seven hours", "five points", "nine thousand steps") are
//     read as numbers when a unit or metric word follows; "one thing to try"
//     is left alone.
//   * Exempt: times of day ("10pm", "at 22:30"), month-name dates with an
//     optional year ("Sep 26, 2026"), ordinals, line-start list markers, the
//     "/100" or "out of 100" scale and the sheet's 7- and 30-day windows.
//   * General route: an unknown number is allowed as general knowledge
//     ("most adults need 7–9 hours") unless the sentence is about the user:
//     "you/your" within a few words of the number, a time word ("last night",
//     "today"), a user-only score (recovery, sleep score), or a phrase like
//     "you slept"/"your HRV".
//   * exactNumbers (recaps): exact integers, no hedges, no window exemptions,
//     count units nights/days/times; durations ±1 minute. A night, day or
//     time count needs its noun right after the number ("5 nights", "5 of 6
//     nights", "5 straight nights"), and every number word is checked
//     (zero, one, hundred, once, twice, a dozen, a couple (of), a pair (of),
//     a single, a week/fortnight straight = 7/14 nights...; only a lone
//     "a"/"an" and "one of" stay prose). Ordinals are counts too ("your 6th
//     straight night", "fifth", "twenty-first"), except in a date ("Oct 9th",
//     "9th October"). Known limit: a count matches
//     per family, not per fact, so "on goal 6 nights" can match the
//     nights-recorded fact.
//   * Topics: medication and dosing (the crisis classifier's medication
//     patterns), supplement recommendations and diagnoses are never shown.
//
// A sentence is judged on its own so the pipeline can drop one bad sentence
// and keep streaming (drop-and-continue). Known limit: the direction of a
// change ("higher" vs "lower") is not checked.

import { classifyCrisis } from '../guardrails/crisis';
import { AnswerCard, CardItem, deltaDisplayOf, statusOf } from './card';
import { Fact, FactSheet, FactUnit, MEMORY_NOTE_PREFIX, SLEEP_NIGHTS_NOTE_PREFIX, SheetRoute, USUAL_DAYS, comparisonDiff } from './facts';
import type { RawCard } from './parse';

/** `hedged` marks a number introduced by "about", "around", "~" and the like (HEDGE_RE). */
export type NumberToken = ({ kind: 'plain'; value: number } | { kind: 'duration'; minutes: number }) & { hedged?: true };

/** A hedged approximation just before a number; checked against the text ending at the number. */
const HEDGE_RE = /(?:\b(?:about|around|roughly|nearly|almost|close\s+to|just\s+(?:under|over))\s+|~\s*)$/i;
/** How far a hedged number may be from a fact value of its family (durations or plain numbers). */
export const HEDGE_TOLERANCE = 0.1;

/** Count units (spec 2026-10-04 §2): each its own family, separate from steps' `count`. */
type CountFamily = 'nights' | 'days' | 'times';
/** The kind of value a number is: durations, one per unit, or 'none' (a bare count from a note). */
type Family = 'duration' | 'ms' | 'bpm' | 'percent' | 'count' | 'score' | 'none' | CountFamily;
export type Metric = 'recovery' | 'sleep_score' | 'hrv' | 'rhr' | 'sleep' | 'steps';

const FAMILY_OF_UNIT: Record<FactUnit, Family> = {
  minutes: 'duration',
  ms: 'ms',
  bpm: 'bpm',
  percent: 'percent',
  count: 'count',
  score: 'score',
  none: 'none',
  nights: 'nights',
  days: 'days',
  times: 'times',
};

/** The sheet's averaging windows ("7-day average", "last 30 days") are not data. */
const WINDOW_DAYS = `(?:7|${USUAL_DAYS})`;

/** Never data in any mode: list markers, times of day, dates, ordinals and the /100 scale. */
const BASE_EXEMPT_PATTERNS: RegExp[] = [
  // A list marker at the start of a line: "1. Sleep earlier tonight."
  /^\s*\d{1,2}[.)]\s/gm,
  // A clock time with a meridiem; the lookahead stops "5 amazing" matching as "5 am".
  /\b(1[0-2]|0?[1-9])(:[0-5]\d)?\s?(a\.?m\.?|p\.?m\.?)(?![A-Za-z])/gi,
  // A 24-hour time introduced as a time of day: "at 22:30", "after 04:00".
  /\b(at|after|before|around|by|until|till|from|past)\s+([01]?\d|2[0-3]):[0-5]\d\b/gi,
  // A month name followed by a day and an optional year: "March 14", "Sep 26, 2026".
  /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2}(st|nd|rd|th)?\b(,?\s+\d{4}\b)?/g,
  // The score scale after a number: "26/100", "26 out of 100" (the 26 is still checked).
  /(?<=\d)\s*\/\s*100\b/g,
  /(?<=\d)\s+out\s+of\s+100\b/gi,
];
/**
 * An ordinal: "the 14th", "9th October", "your 3rd best month". Under exactNumbers an ordinal
 * before a count noun ("your 6th straight night") was already read as digits (ordinalsToDigits),
 * so only the others stay exempt.
 */
const ORDINAL_EXEMPT_PATTERN = /\b\d{1,2}(st|nd|rd|th)\b/g;
/** The sheet's averaging windows. Off under exactNumbers, where "a 7-night streak" is a claim. */
const WINDOW_EXEMPT_PATTERNS: RegExp[] = [
  // The sheet's windows: "7-day average", "30-night", "the last 30 days", and the trend label's own
  // "over 30 days" (also "in/across/for the past 7 nights"), which the model echoes.
  new RegExp(String.raw`\b${WINDOW_DAYS}-(?:day|night)s?\b`, 'gi'),
  new RegExp(String.raw`\b(?:last|past)\s+${WINDOW_DAYS}\s+(?:days|nights)\b`, 'gi'),
  new RegExp(String.raw`\b(?:over|in|across|for)\s+(?:the\s+)?(?:(?:last|past)\s+)?${WINDOW_DAYS}\s+(?:days|nights)\b`, 'gi'),
];
const EXEMPT_PATTERNS: RegExp[] = [...BASE_EXEMPT_PATTERNS, ORDINAL_EXEMPT_PATTERN, ...WINDOW_EXEMPT_PATTERNS];
const EXACT_EXEMPT_PATTERNS: RegExp[] = [...BASE_EXEMPT_PATTERNS, ORDINAL_EXEMPT_PATTERN];

/** A unit right after a plain number, which limits what the number may match. */
const UNIT_AFTER: Array<[RegExp, Family]> = [
  [/^\s*(?:ms|milliseconds?)\b/i, 'ms'],
  [/^\s*(?:bpm|beats)\b/i, 'bpm'],
  [/^\s*(?:%|percent\b|per\s+cent\b)/i, 'percent'],
  [/^\s*steps\b/i, 'count'],
  [/^\s*(?:points?\b|pts\b|\/\s*100\b|out\s+of\s+100\b)/i, 'score'],
];

/**
 * What may sit between a count and its noun: "5 of 6 nights", "5 out of 6 nights", "20 of
 * October's 28 nights" (also "of the"/"of your"), and up to two
 * of a closed set of adjectives ("5 straight nights", "3 late nights"). A closed set keeps
 * "5 Friday nights", "6 a night" and "4 this time" from reading as counts.
 */
const COUNT_LEAD = String.raw`^\s*(?:(?:out\s+)?of\s+(?:(?:the|your|(?:January|February|March|April|May|June|July|August|September|October|November|December)['’]s)\s+)?\d+\s+)?(?:(?:straight|consecutive|full|good|great|solid|restful|better|short|shorter|long|longer|late|later|early|earlier|separate|different|whole|total)\s+){0,2}`;
/** Count units after a number, recognised only with exactNumbers so chat and digest checks are unchanged. */
const COUNT_UNIT_AFTER: Array<[RegExp, Family]> = [
  [new RegExp(String.raw`${COUNT_LEAD}-?\s*nights?\b`, 'i'), 'nights'],
  [new RegExp(String.raw`${COUNT_LEAD}-?\s*days?\b`, 'i'), 'days'],
  [new RegExp(String.raw`${COUNT_LEAD}times?\b`, 'i'), 'times'],
];
/** The unit lookup under exactNumbers: the chat units first, then the counts. */
const EXACT_UNIT_AFTER: Array<[RegExp, Family]> = [...UNIT_AFTER, ...COUNT_UNIT_AFTER];
const COUNT_FAMILIES: ReadonlySet<Family> = new Set<Family>(['nights', 'days', 'times']);
const isCountFamily = (f: Family | undefined): f is CountFamily => f !== undefined && COUNT_FAMILIES.has(f);

const NUM = String.raw`(\d+(?:\.\d+)?)`;
const HOURS = String.raw`(?:hours?|hrs?|h)`;
const MINUTES = String.raw`(?:minutes?|mins?|m)`;

// A range is scanned first, so "7-9 hours" stays two durations; after it, a hyphen between a
// number and its unit ("an 8-hour goal", "a 20-minute walk") still makes a duration, never a bare
// number free to match any small value on the sheet.
const RANGE_RE = new RegExp(String.raw`${NUM}\s*(?:-|–|—|to)\s*${NUM}\s*(${HOURS}|${MINUTES})\b`, 'gi');
const HOURS_MINUTES_RE = new RegExp(String.raw`(\d+)\s*-?\s*${HOURS}\s*(?:and\s*)?(\d+)\s*-?\s*${MINUTES}\b`, 'gi');
const HOURS_RE = new RegExp(String.raw`${NUM}\s*-?\s*${HOURS}\b`, 'gi');
const MINUTES_RE = new RegExp(String.raw`${NUM}\s*-?\s*${MINUTES}\b`, 'gi');
const CLOCK_DURATION_RE = /\b(\d{1,2}):([0-5]\d)\b/g;
const PLAIN_RE = /\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?/g;

// ---- number words -------------------------------------------------------

const ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
/** Unit or metric words that turn a preceding number word into a number. */
const UNIT_OR_METRIC_WORDS = String.raw`hours?|hrs?|minutes?|mins?|ms|milliseconds?|bpm|beats|percent|per\s+cent|points?|pts|steps|hrv|recovery|sleep|resting\s+heart`;

const WORD_NUMBER_RE = new RegExp(
  String.raw`\b(?:(${TENS.join('|')})(?:[-\s]+(${ONES.slice(1, 10).join('|')}))?|(${ONES.join('|')})|(a))(?:\s+(hundred|thousand))?(?=\s+(?:${UNIT_OR_METRIC_WORDS})\b)`,
  'gi',
);

/**
 * Under exactNumbers every number word is a checked number, whatever follows it (fail-safe beats
 * prose: "Two things stood out" is rejected). Only "a"/"an" on their own and "one of" ("one of
 * your best weeks") stay prose; "a"/"an" before a scale is 1 ("a hundred"). A tens word that
 * leads an ordinal left as prose ("your twenty-third week") stays prose with it.
 */
const ORDINAL_ONES = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth'];
const ORDINAL_TEENS = ['tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth'];
const ANY_NUMBER_WORD_RE = new RegExp(
  String.raw`\b(?:(${TENS.join('|')})(?![-\s]+(?:${ORDINAL_ONES.join('|')})\b)(?:[-\s]+(${ONES.slice(1, 10).join('|')}))?|(${ONES.map((w) => (w === 'one' ? String.raw`one(?!\s+of\b)` : w)).join('|')})|(an?)(?=\s+(?:hundred|thousand)\b))(?:\s+(hundred|thousand))?\b`,
  'gi',
);
/** Count words with no digit form, read before ANY_NUMBER_WORD_RE so their "a" is taken with them. */
const COUNT_WORDS: Array<[RegExp, string]> = [
  [/\bonce\b/gi, '1 time'],
  [/\btwice\b/gi, '2 times'],
  [/\bthrice\b/gi, '3 times'],
  [/\b(?:an?\s+)?dozen\b/gi, '12'],
  [/\ba\s+(?:couple|pair)(?:\s+of)?\b/gi, '2'],
  [/\ba\s+single\b/gi, '1'],
  [/\ba\s+(?:full\s+|whole\s+)?week\s+straight\b/gi, '7 nights'],
  [/\ba\s+(?:full\s+|whole\s+)?fortnight\s+straight\b/gi, '14 nights'],
];
/** Ordinal words first..thirty-first, read before ANY_NUMBER_WORD_RE so "twenty-first" is not taken as "twenty". */
const ORDINAL_WORD_RE = new RegExp(
  String.raw`\b(?:(thirty)[-\s]+(first)|(?:(twenty)[-\s]+)?(${ORDINAL_ONES.join('|')})|(${ORDINAL_TEENS.join('|')})|(twentieth|thirtieth))\b`,
  'gi',
);
/** A numeric ordinal's suffix: "6th" → "6", so "your 6th straight night" is a count of 6. */
const NUMERIC_ORDINAL_RE = /\b(\d{1,2})(?:st|nd|rd|th)\b/gi;

/** Whether a count noun phrase follows, as the count check reads it ("straight night", "nights on goal"). */
const beforeCountNoun = (rest: string) => COUNT_UNIT_AFTER.some(([re]) => re.test(rest));

/**
 * An ordinal before a count noun is a count: "your fifth straight night" → "your 5 straight night",
 * "6th night" → "6 night", "twenty-first night" → "21 night". Any other ordinal is left as written
 * and stays prose ("a third of your nights", "your 3rd best month", "9th October", "Oct 9th").
 */
function ordinalsToDigits(text: string): string {
  return text
    .replace(ORDINAL_WORD_RE, (match: string, thirty?: string, thirtyOne?: string, twenty?: string, one?: string, teen?: string, round?: string, offset?: number) => {
      if (!beforeCountNoun(text.slice(offset! + match.length))) return match;
      if (thirty !== undefined && thirtyOne !== undefined) return '31';
      if (one !== undefined) return String((twenty !== undefined ? 20 : 0) + ORDINAL_ONES.indexOf(one.toLowerCase()) + 1);
      if (teen !== undefined) return String(10 + ORDINAL_TEENS.indexOf(teen.toLowerCase()));
      return round!.toLowerCase() === 'twentieth' ? '20' : '30';
    })
    .replace(NUMERIC_ORDINAL_RE, (match: string, digits: string, offset: number, all: string) =>
      beforeCountNoun(all.slice(offset + match.length)) ? digits : match,
    );
}
/** A scale with no number word before it: "a perfect hundred", "the hundred mark". */
const BARE_SCALE: Array<[RegExp, string]> = [
  [/\bhundred\b/gi, '100'],
  [/\bthousand\b/gi, '1000'],
];

/** Every number word read as digits, for exactNumbers. */
function allWordsToDigits(text: string): string {
  const counted = ordinalsToDigits(COUNT_WORDS.reduce((t, [re, digits]) => t.replace(re, digits), text));
  return BARE_SCALE.reduce((t, [re, digits]) => t.replace(re, digits), wordsToDigits(counted, ANY_NUMBER_WORD_RE));
}

/** "seven hours" → "7 hours", "nine thousand steps" → "9000 steps"; number words elsewhere are left alone. */
function wordsToDigits(text: string, re: RegExp = WORD_NUMBER_RE): string {
  return text.replace(re, (match, tens?: string, unit?: string, ones?: string, a?: string, scale?: string) => {
    if (a !== undefined && scale === undefined) return match;
    let n = a !== undefined ? 1 : tens !== undefined ? 20 + 10 * TENS.indexOf(tens.toLowerCase()) : ONES.indexOf(ones!.toLowerCase());
    if (unit !== undefined) n += ONES.indexOf(unit.toLowerCase());
    if (scale !== undefined) n *= scale.toLowerCase() === 'hundred' ? 100 : 1000;
    return String(n);
  });
}

// ---- extraction ---------------------------------------------------------

interface Scanned {
  start: number;
  token: NumberToken;
  /** For a plain number: the unit written right after it, if any. */
  unit?: Family;
}

/** Every number in `input` with its adjacent unit, in order, outside the exempt shapes. */
function scanNumbers(input: string, exact = false): Scanned[] {
  const text = exact ? allWordsToDigits(input) : wordsToDigits(input);
  const masked = new Array<boolean>(text.length).fill(false);
  const free = (s: number, e: number) => masked.slice(s, e).every((m) => !m);
  const mask = (s: number, e: number) => masked.fill(true, s, e);
  for (const re of exact ? EXACT_EXEMPT_PATTERNS : EXEMPT_PATTERNS) for (const m of text.matchAll(re)) mask(m.index!, m.index! + m[0].length);

  const unitsAfter = exact ? EXACT_UNIT_AFTER : UNIT_AFTER;
  const found: Scanned[] = [];
  const scan = (re: RegExp, toTokens: (m: RegExpMatchArray) => NumberToken[]) => {
    for (const m of text.matchAll(re)) {
      const s = m.index!;
      const e = s + m[0].length;
      if (!free(s, e)) continue;
      mask(s, e);
      const hedged = HEDGE_RE.test(text.slice(0, s));
      toTokens(m).forEach((token, i) => {
        const item: Scanned = { start: s + i, token: hedged ? { ...token, hedged: true } : token };
        if (token.kind === 'plain') {
          const after = text.slice(e);
          const unit = unitsAfter.find(([re]) => re.test(after));
          if (unit) item.unit = unit[1];
        }
        found.push(item);
      });
    }
  };
  const isHours = (unit: string) => /^h/i.test(unit);
  const minutes = (n: number): NumberToken => ({ kind: 'duration', minutes: Math.round(n * 1000) / 1000 });

  scan(RANGE_RE, (m) => {
    const factor = isHours(m[3]!) ? 60 : 1;
    return [minutes(Number(m[1]) * factor), minutes(Number(m[2]) * factor)];
  });
  scan(HOURS_MINUTES_RE, (m) => [minutes(Number(m[1]) * 60 + Number(m[2]))]);
  scan(HOURS_RE, (m) => [minutes(Number(m[1]) * 60)]);
  scan(MINUTES_RE, (m) => [minutes(Number(m[1]))]);
  scan(CLOCK_DURATION_RE, (m) => [minutes(Number(m[1]) * 60 + Number(m[2]))]);
  scan(PLAIN_RE, (m) => [{ kind: 'plain', value: Number(m[0].replace(/,/g, '')) }]);

  return found.sort((a, b) => a.start - b.start);
}

/** Every number, duration and h:mm in `text`, in order, outside the exempt shapes. Signs are ignored. */
export function extractNumbers(text: string): NumberToken[] {
  return scanNumbers(text).map((s) => s.token);
}

// ---- the allowed values -------------------------------------------------

/** Where a value may be used, beyond its unit family. */
interface Scope {
  /** The metric the value belongs to; undefined for values tied to none (missing-data notes). */
  metric: Metric | undefined;
  /** A score driver's points: also the score it moves must be named ("HRV took 9 points off recovery"). */
  drives?: Metric;
  /** A score driver's key ('circadian_consistency'): its own words name it too (DRIVER_MENTION). */
  driver?: string;
  /** A memory note's number: only in a sentence naming no metric ("you run 5 times a week"). */
  unnamedOnly?: true;
}

interface Allowed extends Scope {
  value: number;
  family: Family;
}

const METRIC_OF_ID_HEAD: Record<string, Metric> = {
  recovery: 'recovery',
  sleep_score: 'sleep_score',
  hrv: 'hrv',
  rhr: 'rhr',
  sleep: 'sleep',
  steps: 'steps',
};

/** Each score driver (scoring/types.ts factor keys, lower-cased in 'factor.*' ids): its metric and the score it moves. */
const DRIVERS: Record<string, { metric: Metric; drives: Metric }> = {
  hrv: { metric: 'hrv', drives: 'recovery' },
  rhr: { metric: 'rhr', drives: 'recovery' },
  sleep_debt: { metric: 'sleep', drives: 'recovery' },
  sleep_duration: { metric: 'sleep', drives: 'sleep_score' },
  sleep_efficiency: { metric: 'sleep', drives: 'sleep_score' },
  circadian_consistency: { metric: 'sleep', drives: 'sleep_score' },
};

/**
 * How a sentence may name each score driver besides its metric word, by driver key: "Irregular
 * bedtimes cost your sleep score 4 points" names the circadian driver. The eval's namesDrivers
 * check (evals/coach/qualityCheck.ts) reads the same map.
 */
export const DRIVER_MENTION: Record<string, RegExp> = {
  hrv: /\bhrv\b|heart rate variability/i,
  rhr: /\bresting\s+(?:hr|heart)|\brhr\b/i,
  sleep_debt: /\bsleep\b|\bslept\b|\bnights?\b/i,
  sleep_duration: /\bsleep\b|\bslept\b|\bnights?\b/i,
  sleep_efficiency: /\bsleep\b|\brestless\b|\befficien/i,
  circadian_consistency: /\bbedtimes?\b|\bconsisten|\bschedule\b|\broutine\b/i,
};

/** A bare "score": the driver already fixes which score it is ("HRV took 9 points off your score"). */
const SCORE_WORD_RE = /\bscores?\b/i;

/**
 * 'hrv.today' → hrv; 'habit.caffeine.hrv.lag2' → the habit's factor (hrv, rhr, sleep_*);
 * 'factor.hrv' → hrv, moving recovery. An unknown driver counts only where no metric is named.
 */
function scopeOf(fact: Fact): Scope {
  const [head, second, factor] = fact.id.split('.');
  if (head === 'habit') {
    if (factor === 'hrv' || factor === 'rhr') return { metric: factor };
    return { metric: factor?.startsWith('sleep') ? 'sleep' : undefined };
  }
  if (head === 'factor') {
    const driver = second === undefined ? undefined : DRIVERS[second];
    return driver && second !== undefined
      ? { metric: driver.metric, drives: driver.drives, driver: second }
      : { metric: undefined, unnamedOnly: true };
  }
  return { metric: head === undefined ? undefined : METRIC_OF_ID_HEAD[head] };
}

/** A sheet note's scope: the nights-recorded note is sleep's; a memory note counts only where no metric is named. */
function noteScope(note: string): Scope {
  if (note.startsWith(SLEEP_NIGHTS_NOTE_PREFIX)) return { metric: 'sleep' };
  if (note.startsWith(MEMORY_NOTE_PREFIX)) return { metric: undefined, unnamedOnly: true };
  return { metric: undefined };
}

function noteValues(text: string, scope: Scope): Allowed[] {
  return scanNumbers(text).map((s) =>
    s.token.kind === 'duration'
      ? { ...scope, value: s.token.minutes, family: 'duration' }
      : { ...scope, value: s.token.value, family: s.unit ?? 'none' },
  );
}

// Sheets are treated as immutable once built, so the allowed values are computed once per sheet.
const allowedCache = new WeakMap<FactSheet, Allowed[]>();

/** Built from structured fact data, never from the rendered text, so id and label digits stay out. */
function allowedFor(sheet: FactSheet): Allowed[] {
  const cached = allowedCache.get(sheet);
  if (cached) return cached;
  const allowed: Allowed[] = [];
  for (const f of sheet.facts) {
    const family = FAMILY_OF_UNIT[f.unit];
    const scope = scopeOf(f);
    const diff = comparisonDiff(f);
    for (const value of [f.value, f.usual, diff]) {
      if (value !== undefined) allowed.push({ ...scope, value: Math.abs(value), family });
    }
    if (f.note) allowed.push(...noteValues(f.note, scope));
  }
  for (const note of sheet.notes) allowed.push(...noteValues(note, noteScope(note)));
  allowedCache.set(sheet, allowed);
  return allowed;
}

const PLAIN_FAMILIES: Family[] = ['ms', 'bpm', 'percent', 'count', 'score', 'none'];

/** Unit families that belong to one metric, so a value in them can only be that metric's. */
const SINGLE_OWNER: Partial<Record<Family, Metric>> = { duration: 'sleep', ms: 'hrv', bpm: 'rhr', count: 'steps' };
/** A named metric may borrow a single-owner family from these metrics only. */
const RELATED: Partial<Record<Metric, Metric[]>> = { sleep_score: ['sleep'] };

/**
 * The values a number may match. Its unit family always limits them (a
 * duration, "62 ms", "61 bpm", "8%", "9,645 steps", "6.3 points"; a bare number
 * is any non-duration family). When the sentence names one metric, only that
 * metric's values and metric-less ones (missing-data notes) count, so
 * "Your HRV is 61" cannot borrow resting HR's 61 and "Your recovery dropped 8%"
 * cannot borrow the HRV trend's 8%. A score driver's points count only when
 * the sentence names the driver (its metric or its own words, DRIVER_MENTION)
 * and the score it moves (that score, or a bare "score"); memory-note numbers
 * never count here.
 *
 * One exception: a number whose unit family belongs to a single metric
 * (durations: sleep, ms: HRV, bpm: resting HR, steps: steps) may match that
 * owner's values when the named metric is related to it and has none of its
 * own in the family. Today that is the sleep score and sleep durations, so
 * "Your sleep score was 36, ... your average dipped to 6h 53m" passes while
 * "Your recovery is 61 bpm" does not. Percent and points are shared by several
 * metrics and never fall back.
 */
function candidatesFor(s: Scanned, allowed: Allowed[], named: ReadonlySet<Metric>, sentence: string): Allowed[] {
  const { token } = s;
  const families = token.kind === 'duration' ? ['duration'] : s.unit ? [s.unit] : PLAIN_FAMILIES;
  const inFamily = allowed.filter((a) => families.includes(a.family));
  // A sentence naming no metric is judged by unit family alone.
  if (named.size === 0) return inFamily;
  // With one or more named metrics (two is the norm in a summary: "A short night (6h 48m) pulled
  // your HRV down to 41"), a number may match only the named metrics' values and metric-less ones.
  const scope = new Set(named);
  const unit: Family | undefined = token.kind === 'duration' ? 'duration' : s.unit;
  const owner = unit === undefined ? undefined : SINGLE_OWNER[unit];
  if (owner !== undefined) {
    const borrows = [...named].some((m) => (RELATED[m] ?? []).includes(owner) && !inFamily.some((a) => a.metric === m));
    if (borrows) scope.add(owner);
  }
  // "sleep score" names the score, not a sleep driver (as in namedMetrics).
  const driverText = sentence.replace(/\bsleep\s+scores?\b/gi, ' ');
  const driverNamed = (a: Allowed) =>
    (a.metric !== undefined && scope.has(a.metric)) || (a.driver !== undefined && (DRIVER_MENTION[a.driver]?.test(driverText) ?? false));
  // A bare "score" stands for the driver's own score, unless the sentence names the other one.
  const otherScore = (m: Metric): Metric => (m === 'recovery' ? 'sleep_score' : 'recovery');
  const scoreNamed = (a: Allowed) =>
    a.drives !== undefined && (named.has(a.drives) || (SCORE_WORD_RE.test(sentence) && !named.has(otherScore(a.drives))));
  return inFamily.filter((a) => {
    if (a.unnamedOnly) return false;
    if (a.drives !== undefined) return driverNamed(a) && scoreNamed(a);
    return !a.metric || scope.has(a.metric);
  });
}

function isKnown(s: Scanned, allowed: Allowed[], named: ReadonlySet<Metric>, sentence: string): boolean {
  const { token } = s;
  const candidates = candidatesFor(s, allowed, named, sentence);
  // A hedged approximation ("about 7 hours" for 6h 48m) may be within 10% of a value.
  const hedge = (a: number) => (token.hedged ? Math.abs(a) * HEDGE_TOLERANCE : 0);
  if (token.kind === 'duration') {
    return candidates.some(({ value: a }) => Math.abs(token.minutes - a) <= Math.max(1, a * 0.01, hedge(a)));
  }
  const tolerance = (a: number) => Math.max(Number.isInteger(token.value) ? 1 : Math.max(0.05, Math.abs(a) * 0.01), hedge(a));
  return candidates.some(({ value: a }) => Math.abs(token.value - a) <= tolerance(a));
}

/**
 * exactNumbers candidates (spec 2026-10-04 §2). A duration or a number with a non-count unit is
 * scoped as in chat. A number with a count unit ("5 nights", "a 4-night streak") matches only that
 * family. A bare number matches only steps' counts, scoped by the sentence's metrics: a night, day
 * or time count needs its noun right after the number (COUNT_UNIT_AFTER), never elsewhere in the
 * sentence, so "Your steps averaged 31 a day" cannot borrow 31 days logged.
 */
function exactCandidates(s: Scanned, allowed: Allowed[], named: ReadonlySet<Metric>, sentence: string): Allowed[] {
  if (s.unit !== undefined && isCountFamily(s.unit)) return allowed.filter((a) => !a.unnamedOnly && a.family === s.unit);
  if (s.token.kind === 'duration' || s.unit !== undefined) return candidatesFor(s, allowed, named, sentence);
  return candidatesFor({ ...s, unit: 'count' }, allowed, named, sentence);
}

/** Every integer equals a sheet value exactly, with no hedge tolerance; durations keep ±1 minute. */
function isKnownExact(s: Scanned, allowed: Allowed[], named: ReadonlySet<Metric>, sentence: string): boolean {
  const candidates = exactCandidates(s, allowed, named, sentence);
  const { token } = s;
  if (token.kind === 'duration') return candidates.some((a) => Math.abs(token.minutes - a.value) <= 1);
  return candidates.some((a) => a.value === token.value);
}

const WEEKDAY = String.raw`(?:mon|tues|wednes|thurs|fri|satur|sun)day`;
/** "night" as a time or window, or in a suggestion, rather than the night's sleep. */
const NIGHT_NOT_SLEEP_RE = new RegExp(
  [
    String.raw`\b(?:last|past|this|that|each|every|per|tomorrow|the\s+other|at)\s+(?:\d+\s+)?nights?\b`,
    String.raw`\b(?:on\s+)?${WEEKDAY}\s+nights?\b`,
    String.raw`\b\d+[-\s]nights?\b`,
    String.raw`\bnights?\s+(?:ago|before)\b`,
    String.raw`\b(?:early|earlier)\s+night\b`,
  ].join('|'),
  'g',
);

/** The metrics a sentence names (the eval's attribution check reads it too, so the two always agree). */
export function namedMetrics(sentence: string): Set<Metric> {
  let s = sentence.toLowerCase();
  const found = new Set<Metric>();
  const take = (re: RegExp, metric: Metric) => {
    if (re.test(s)) {
      found.add(metric);
      s = s.replace(re, ' ');
    }
  };
  take(/\bsleep\s+scores?\b/g, 'sleep_score');
  take(/\bhrv\b|\bheart\s+rate\s+variability\b/g, 'hrv');
  take(/\brhr\b|\bresting\s+(?:hr|heart(?:\s+rate)?)\b/g, 'rhr');
  take(/\brecovery\b/g, 'recovery');
  // "night" names sleep ("A short night (6h 48m) pulled your HRV down to 41"), except as a time or
  // window ("last night", "past 7 nights", "30-night") or a suggestion ("an early night").
  s = s.replace(NIGHT_NOT_SLEEP_RE, ' ');
  take(/\b(?:sleep|sleeping|slept|asleep|nights?)\b/g, 'sleep');
  take(/\bsteps\b/g, 'steps');
  return found;
}

// ---- general-route allowance --------------------------------------------

/** A sentence stating a number ABOUT the user: never a general-knowledge figure. */
const USER_CLAIM_RE =
  /\b(you|you've|you're)\s+(slept|got|had|walked|logged|averaged|scored|hit|reached|were|are at)\b|\byour\s+(recovery|sleep|hrv|heart|resting|rhr|steps?|scores?|readings?|average|numbers?|data|bedtime|night|week|month)\b/i;
/** A time word that ties a number to the user's own days. */
const USER_TIME_RE = /\b(last\s+night|tonight|today|yesterday|this\s+(morning|week|month)|last\s+week)\b/i;
/** Scores only the user has: any number near them is the user's. */
const USER_SCORE_RE = /\b(recovery|sleep\s+scores?)\b/i;
const YOU_WORDS = new Set(['you', "you've", "you're", 'your', 'yours', "you'd", "you'll", 'yourself']);
/** How many words apart "you"/"your" and a number may be for the number to be about the user. */
const YOU_NUMBER_WORDS = 4;

function youNearNumber(text: string): boolean {
  const words = text.replace(/[‘’]/g, "'").split(/\s+/);
  const you: number[] = [];
  const numbers: number[] = [];
  words.forEach((w, i) => {
    if (YOU_WORDS.has(w.toLowerCase().replace(/[^a-z']/g, ''))) you.push(i);
    if (/\d/.test(w)) numbers.push(i);
  });
  return you.some((y) => numbers.some((n) => Math.abs(y - n) <= YOU_NUMBER_WORDS));
}

function isAboutUser(sentence: string): boolean {
  const text = wordsToDigits(sentence);
  return USER_CLAIM_RE.test(text) || USER_TIME_RE.test(text) || USER_SCORE_RE.test(text) || youNearNumber(text);
}

// ---- topics and verdict -------------------------------------------------

const DIAGNOSIS_RE =
  /\bdiagnos\w*|\b(you\s+(may|might|could|probably|likely)?\s*have|sounds?\s+like|signs?\s+of|symptoms?\s+of|consistent\s+with)\s+(an?\s+)?(sleep\s+apnea|apnoea|apnea|insomnia|depression|anxiety|diabetes|hypertension|arrhythmia|afib|atrial\s+fibrillation|thyroid|anemia|heart\s+disease|(a\s+)?(disorder|condition|disease|infection))\b/i;

const SUPPLEMENT_RE =
  /\b(supplements?|melatonin|magnesium|ashwagandha|valerian|l-?theanine|glycine|cbd|zinc|vitamin\s+[a-z0-9]+|creatine|5-?htp|tryptophan|gaba)\b/i;

export function isDisallowedTopic(sentence: string): boolean {
  return classifyCrisis(sentence).categories.includes('medication') || DIAGNOSIS_RE.test(sentence) || SUPPLEMENT_RE.test(sentence);
}

export type SentenceVerdict = { ok: true } | { ok: false; reason: 'unknown_number' | 'disallowed_topic' };

export interface ValidateOptions {
  /** Recaps only (spec 2026-10-04 §2). Off: chat and digest behaviour exactly as before. */
  exactNumbers?: boolean;
}

export function validateSentence(sentence: string, sheet: FactSheet, options: ValidateOptions = {}): SentenceVerdict {
  if (isDisallowedTopic(sentence)) return { ok: false, reason: 'disallowed_topic' };
  const exact = options.exactNumbers === true;
  const scanned = scanNumbers(sentence, exact);
  if (scanned.length === 0) return { ok: true };
  const allowed = allowedFor(sheet);
  const named = namedMetrics(sentence);
  const known = (s: Scanned) => (exact ? isKnownExact(s, allowed, named, sentence) : isKnown(s, allowed, named, sentence));
  if (scanned.every(known)) return { ok: true };
  // General knowledge ("most adults need 7–9 hours") only on the general route, and never about the user.
  if (!exact && sheet.route === 'general' && !isAboutUser(sentence)) return { ok: true };
  return { ok: false, reason: 'unknown_number' };
}

// ---- card ---------------------------------------------------------------

export const MAX_TILES = 4;
export const MAX_RANKED = 5;
const MAX_HEADLINE_CHARS = 120;
const MAX_LABEL_CHARS = 32;
const MAX_TIP_CHARS = 200;

/**
 * What a card's numbers come from, per route: the window its sheet covers.
 * Set by the app, never the model, which made up vague ones ("Wellness App
 * Data", "Sleep tracking data").
 */
export const CARD_SOURCE: Record<SheetRoute, string> = {
  today: 'Today',
  sleep: 'Last night and your past 7 nights',
  trends: 'Your last 30 days',
  general: 'Your profile',
  recap: 'Your recap',
};

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** A short model-written string that passes sentence validation, else null. */
function cleanText(value: unknown, max: number, sheet: FactSheet): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (text.length === 0 || text.length > max) return null;
  return validateSentence(text, sheet).ok ? text : null;
}

function labelFor(value: unknown, fact: Fact): string {
  if (typeof value !== 'string') return fact.label;
  const label = value.replace(/\s+/g, ' ').trim();
  return label.length > 0 && label.length <= MAX_LABEL_CHARS && !/\d/.test(label) ? label : fact.label;
}

function rows(raw: unknown, max: number, facts: Map<string, Fact>): CardItem[] {
  if (!Array.isArray(raw)) return [];
  const out: CardItem[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!isObject(item) || typeof item.fact !== 'string') continue;
    const fact = facts.get(item.fact);
    if (!fact || seen.has(fact.id)) continue;
    seen.add(fact.id);
    const row: CardItem = { factId: fact.id, label: labelFor(item.label, fact), display: fact.display, value: fact.value };
    if (fact.usual !== undefined) row.usual = fact.usual;
    const status = statusOf(fact);
    if (status) row.status = status;
    const delta = deltaDisplayOf(fact);
    if (delta) row.deltaDisplay = delta;
    out.push(row);
    if (out.length === max) break;
  }
  return out;
}

/**
 * Schema-checks the model's card and fills every value from the fact sheet;
 * the source label comes from the route (CARD_SOURCE).
 * Unknown fact ids are dropped; a card without a valid headline or without any
 * valid tile/ranked row is dropped (null) and the talk is shown alone.
 */
export function resolveCard(raw: RawCard | undefined, sheet: FactSheet): AnswerCard | null {
  if (!isObject(raw)) return null;
  const headline = cleanText(raw.headline, MAX_HEADLINE_CHARS, sheet);
  if (headline === null) return null;
  const facts = new Map(sheet.facts.map((f) => [f.id, f]));
  const tiles = rows(raw.tiles, MAX_TILES, facts);
  const ranked = tiles.length > 0 ? [] : rows(raw.ranked, MAX_RANKED, facts);
  if (tiles.length === 0 && ranked.length === 0) return null;

  // Any model-written source is ignored (R18).
  const card: AnswerCard = { headline, source: CARD_SOURCE[sheet.route] };
  if (tiles.length > 0) card.tiles = tiles;
  else card.ranked = ranked;
  const tip = cleanText(raw.tip, MAX_TIP_CHARS, sheet);
  if (tip !== null) card.tip = tip;
  return card;
}
