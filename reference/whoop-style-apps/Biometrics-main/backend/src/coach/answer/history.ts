// Text stored before the coach redesign (spec 2026-09-30, section 5). Older
// builds appended the disclaimer to every reply and digest, and a fixed memory
// note to some replies, and stored them that way. Rows are left as they are;
// these helpers take the additions off when a stored text is shown again or
// replayed to the model as history. Nothing new is ever stored with them:
// the app shows the disclaimer once, as a page footnote, and memory proposals
// travel as their own event. The one live use is the JSON message response
// for old app builds, which have no footnote (R46): the disclaimer is appended
// to that response only.

export const LEGACY_DISCLAIMER = 'This is a comparison against your own recent readings, not a medical assessment.';

export const LEGACY_REPLY_NOTES = [
  "I'll remember that — let me know if that's not right.",
  "Okay — I've removed that from what I remember.",
] as const;

/** A stored reply or digest without what older builds appended to it. */
export function cleanLegacyText(text: string): string {
  let t = text.trimEnd();
  if (t.endsWith(LEGACY_DISCLAIMER)) t = t.slice(0, -LEGACY_DISCLAIMER.length);
  for (const note of LEGACY_REPLY_NOTES) t = t.split(note).join('');
  return t.replace(/\n{3,}/g, '\n\n').trim();
}
