// Quality checks for the owner's bar: an answer should be "informative,
// personable, not automated". The runtime validator only keeps answers honest
// (every number grounded, no disallowed topic); these eval-only checks look at
// whether an answer is any good, following the prompt's "How to answer well"
// block (answer/prompt.ts). Calibrated on the real phase-1 transcripts (task
// B13 fix wave, section 6.4), which tests/coach/evals.test.ts keeps as cases:
//
//   answersFirst    the first shown sentence answers the question: it names one
//                   of the words the fixture says the answer is about, and it is
//                   not a compliment or filler opener ("Great question about
//                   your recovery!", "Thanks for asking").
//   namesDrivers    every score driver on the fact sheet ([factor.*]) is named,
//                   not just one.
//   nextStep        at least one sentence is a concrete step: an imperative,
//                   also after a leading clause ("To help your body bounce
//                   back, try ..."), or a suggestion phrase ("it is best to").
//                   It is "in words": a number in it must be on the fact sheet
//                   ("cut back on alcohol, which lowers your next-day HRV by
//                   17%" is fine), never a new one ("aim for 9 hours").
//                   "Keep in mind ...", "take a look at your trends" and
//                   "remember that ..." are not steps.
//   noStockCheckIn  no generic check-in question ("Have you noticed any
//                   stressors...?", "Do you feel ...?", "How are you doing?")
//                   and no offer of something the app cannot do ("Would you
//                   like to look at ...?", "Would you prefer a guided
//                   relaxation session?"). A specific question back is fine,
//                   including a feeling question anchored on a concrete event
//                   ("Do you feel any soreness from Saturday's long run?").
//                   The runtime drops these too (answer/checkIn.ts), so the
//                   check is the backstop.
//
// Like the direction check, these are deliberately simple lexicon checks, not
// a judge model: scripted fixtures opt in, and `npm run eval:coach:local`
// reports them on real replies for a human to read.

import { isStockCheckIn } from '../../src/coach/answer/checkIn';
import type { Fact, FactSheet } from '../../src/coach/answer/facts';
import { DRIVER_MENTION, extractNumbers, validateSentence } from '../../src/coach/answer/validate';

export interface QualityExpectation {
  /** The first shown sentence must contain one of these words or phrases (case-insensitive, whole words). */
  answersFirst?: string[];
  /** Every [factor.*] driver on the fact sheet must be named somewhere in the reply. */
  namesDrivers?: boolean;
  /** Some sentence must be a concrete next step written in words. */
  nextStep?: boolean;
  /** No generic check-in question and no offer the app cannot fulfil. */
  noStockCheckIn?: boolean;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const wordRe = (w: string) => new RegExp(String.raw`\b${escapeRe(w)}\b`, 'i');

// ---- answersFirst ---------------------------------------------------------

/** A compliment or filler opening the reply instead of the answer. */
const FILLER_OPENER =
  /^\s*(?:(?:that'?s|what|such)\s+)?(?:an?\s+)?(?:great|good|excellent|fantastic|interesting|nice|lovely|smart|fair)\s+(?:question|ask|point)\b|^\s*thanks?(?:\s+you)?(?:\s+so\s+much)?\s+for\s+(?:asking|the\s+question|reaching\s+out|checking\s+in)\b|^\s*(?:i'?m|i\s+am)\s+(?:happy|glad)\s+(?:to\s+help|you\s+asked)\b|^\s*(?:happy|glad)\s+to\s+help\b|^\s*let(?:'s|\s+us)\s+(?:take\s+a\s+look|dive\s+in|have\s+a\s+look|look\s+at)\b/i;

// ---- namesDrivers ---------------------------------------------------------

/** "Resting HR effect on the recovery score" -> "Resting HR". */
const driverName = (fact: Fact) => fact.label.replace(/\s+effect on the .*$/i, '');

// ---- nextStep -------------------------------------------------------------

/** A leading clause before the step: "To help your body bounce back, ", "If you can, ", "Since it is low, ". */
const LEADING_CLAUSE = /^(?:to|if|since|because|when|given|for|with|after|before|while|as|so|then|maybe|perhaps|for\s+now|today|tonight|this\s+evening)\b[^,;:]*[,;:]\s*/i;
const IMPERATIVE =
  /^(?:try|aim|keep|take|plan|consider|swap|skip|start|stick|save|ease|go|get|head|wind|make|give|choose|stay|hold|protect|focus|prioriti[sz]e|add|cut|move|build|book|set|leave|treat|limit|reduce|avoid|swap|let\s+(?:today|tonight|this))\b/i;
const STEP_PHRASE =
  /\b(?:you\s+could|you\s+might|it\s+may\s+help\s+to|it\s+might\s+help\s+to|try\s+to|aim\s+to|it(?:'s|\s+is)\s+(?:best|worth|a\s+good\s+idea)\s+to|a\s+good\s+(?:idea|move|step)\s+(?:is|would\s+be)\s+to|worth\s+(?:trying|keeping|making))\b/i;
/** Advice-shaped phrases that are not a step: a reminder or a pointer at the app. */
const NOT_A_STEP =
  /\b(?:keep|bear)\s+in\s+mind\b|\bremember\s+that\b|\bnote\s+that\b|\b(?:take|have)\s+a\s+(?:look|peek)\b|\b(?:look|check)\s+(?:at|out)\s+(?:your|the)\s+(?:trends?|data|charts?|app|history|numbers)\b/i;

/**
 * A concrete step: an imperative (also after a leading clause) or a suggestion
 * phrase, that is not a reminder or a pointer at the app. Its numbers must be
 * on the sheet; with no sheet, any number (other than a time or date) disqualifies it.
 */
export function isNextStep(sentence: string, sheet?: FactSheet): boolean {
  const s = sentence.trim();
  if (NOT_A_STEP.test(s)) return false;
  const clause = s.replace(LEADING_CLAUSE, '');
  if (!IMPERATIVE.test(s) && !IMPERATIVE.test(clause) && !STEP_PHRASE.test(s)) return false;
  if (extractNumbers(s).length === 0) return true;
  // Grounded numbers only, judged as a claim about the user (never the general-knowledge allowance).
  return sheet !== undefined && validateSentence(s, { ...sheet, route: sheet.route === 'general' ? 'today' : sheet.route }).ok;
}

// ---- noStockCheckIn -------------------------------------------------------

// The test lives with the runtime (answer/checkIn.ts), which drops a closing stock
// question; the eval flags any that still reach the user with the same test.
export { isStockCheckIn };

// ---- all together ---------------------------------------------------------

/** Problems with a reply against the quality bar; [] when it meets every check asked for. */
export function checkQuality(sentences: readonly string[], sheet: FactSheet, want: QualityExpectation): string[] {
  const problems: string[] = [];
  const text = sentences.join(' ');
  if (want.answersFirst) {
    const first = sentences[0] ?? '';
    if (FILLER_OPENER.test(first)) {
      problems.push(`the first sentence does not answer the question: it opens with filler: ${JSON.stringify(first)}`);
    } else if (!want.answersFirst.some((w) => wordRe(w).test(first))) {
      problems.push(`the first sentence does not answer the question (expected one of ${want.answersFirst.map((w) => `"${w}"`).join(', ')}): ${JSON.stringify(first)}`);
    }
  }
  if (want.namesDrivers) {
    const drivers = sheet.facts.filter((f) => f.id.startsWith('factor.'));
    if (drivers.length === 0) problems.push('the fact sheet has no score drivers to name');
    for (const d of drivers) {
      const key = d.id.slice('factor.'.length);
      const mention = DRIVER_MENTION[key] ?? wordRe(driverName(d));
      if (!mention.test(text)) problems.push(`the reply does not name the driver ${driverName(d)}`);
    }
  }
  if (want.nextStep && !sentences.some((s) => isNextStep(s, sheet))) problems.push('the reply offers no concrete next step in words');
  if (want.noStockCheckIn) {
    for (const s of sentences.filter(isStockCheckIn)) problems.push(`the reply asks a stock check-in question: ${JSON.stringify(s)}`);
  }
  return problems;
}
