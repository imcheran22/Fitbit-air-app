// Stock closing questions (final review I4): a generic check-in ("Have you
// noticed any stressors...?", "Do you feel tired or drained?", "How are you
// doing?") or an offer of something the coach cannot do ("Would you like to
// review...?", "Would you prefer a guided relaxation session?"). They read as
// automated. The prompt asks the model to end on its suggestion; the pipeline
// drops a matching sentence once another sentence has been shown, and the
// eval's quality check (evals/coach/qualityCheck.ts) flags them with this same
// test.
//
// A specific question back is fine: "Is your long run still on for this
// weekend?" matches nothing, and a feeling question anchored on a concrete
// event ("Do you feel any soreness from Saturday's long run?") is not a
// check-in. Offers are never excused by an anchor.

/** Generic check-ins about how they feel or what they noticed: excused when anchored on a concrete event. */
const CHECK_IN = new RegExp(
  [
    String.raw`\bhow\s+(?:are|have)\s+you\s+(?:been\s+)?(?:feeling|doing)\b`,
    String.raw`\bhave\s+you\s+noticed\b`,
    String.raw`\bdo\s+you\s+feel\b`,
    String.raw`\bare\s+you\s+feeling\b`,
  ].join('|'),
  'i',
);

/** Check-ins with nothing to anchor, and offers of things the app cannot do. */
const ALWAYS_STOCK = new RegExp(
  [
    String.raw`\bhow(?:'s|\s+is|\s+has)\s+(?:your\s+)?(?:day|week|everything|life)\b`,
    String.raw`\bhow\s+has\s+(?:the|this)\s+week\s+(?:been|felt)\b`,
    String.raw`\bhow\s+are\s+things\b`,
    String.raw`\banything\s+(?:new|changed|different)\b`,
    String.raw`\bany\s+(?:recent\s+)?changes?\s+(?:in|to)\s+your\b`,
    String.raw`\bfeeling\s+stressed\b`,
    String.raw`\bwhat\s+did\s+your\s+(?:evening|day)\s+look\s+like\b`,
    // App-action offers and choices: the coach cannot run a session, a review or a plan for them.
    String.raw`\bwould\s+you\s+like\s+(?:me\s+)?to\b`,
    String.raw`\bwould\s+you\s+prefer\b`,
    String.raw`\bdo\s+you\s+want\s+(?:me\s+)?to\b`,
    String.raw`\bshall\s+(?:i|we)\b`,
    String.raw`\bwant\s+me\s+to\b`,
  ].join('|'),
  'i',
);

/** A concrete event a feeling question can be about: a named day or a specific session. */
const ANCHOR = /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day(?:'s)?\b|\b(?:run|ride|race|swim|hike|climb|match|game|marathon|intervals|lifting\s+session|leg\s+day)\b/i;

/** Whether a sentence is a stock closing question (only questions are judged). */
export function isStockCheckIn(sentence: string): boolean {
  const s = sentence.trim();
  if (!s.endsWith('?')) return false;
  return ALWAYS_STOCK.test(s) || (CHECK_IN.test(s) && !ANCHOR.test(s));
}
