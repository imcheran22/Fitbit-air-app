// Pre-request safety classifier (spec section 4). A regex/keyword screen that is
// deliberately tuned toward FALSE POSITIVES: over-triggering costs an
// occasional unnecessary "here are some resources", under-triggering costs a
// missed crisis. Keep it simple and slightly over-sensitive; do not make it
// clever. A match bypasses the model entirely and returns a fixed, non-LLM
// reply. The reply is easy to route past (safetyOverride) so a false positive
// never traps the user in a safety flow.

export type CrisisCategory = 'self_harm' | 'medication' | 'acute_symptom';

const PATTERNS: Record<CrisisCategory, RegExp[]> = {
  self_harm: [
    /\bsuicid/,
    /\bkill(ing)?\s+(my\s*self|myself|me)\b/,
    /\b(end|ending|ended|take|taking|took)\s+(my\s+own\s+life|my\s+life)\b/,
    // "end it all" is idiomatic; "taking it all (slower|in)" is not, so the
    // take/took forms deliberately do not extend to this one.
    /\b(end|ending|ended)\s+it\s+all\b/,
    /\bwant(ed)?\s+to\s+(die|be\s+dead|disappear)\b/,
    /\bwish\s+i\s+(was|were)\s+(dead|never\s+born)\b/,
    /\b(don't|do\s+not|dont)\s+want\s+to\s+(be\s+alive|live|be\s+here|wake\s+up|go\s+on)\b/,
    /\bbetter\s+off\s+(dead|without\s+me)\b/,
    /\bno\s+(reason|point)\s+(to|in)\s+(live|living|go\s+on|going\s+on|continue|continuing)\b/,
    /\b(can't|cannot|cant)\s+(go\s+on|do\s+this\s+anymore|take\s+it\s+anymore|keep\s+going)\b/,
    /\bself[\s-]?harm/,
    /\b(hurt|hurting|harm|harming|harmed|cut|cutting|injure|injuring|injured)\s+(my\s*self|myself)\b/,
    /\bover\s?dos(e|ed|ing)\b/,
  ],
  medication: [
    /\bdos(e|es|ed|age|ages|ing)\b/,
    /\b\d+(\.\d+)?\s*(mg|mcg|milligrams?|micrograms?|iu|ml)\b/,
    /\bhow\s+(much|many)\b.{0,40}\b(take|taking|pills?|tablets?|capsules?|gummies)\b/,
    /\b(medication|medications|medicine|meds|prescription|prescribed|pills?|tablets?|capsules?|supplements?)\b/,
    /\b(melatonin|ambien|zolpidem|xanax|alprazolam|valium|diazepam|lorazepam|benzo(diazepine)?s?|ibuprofen|advil|tylenol|acetaminophen|aspirin|antidepressants?|ssri|beta[\s-]?blockers?|insulin|adderall|ritalin|sleeping\s+(pill|aid)s?|sleep\s+aids?|trazodone|codeine|opioids?)\b/,
  ],
  acute_symptom: [
    /\bchest\s+(pain|pains|pressure|tightness|tight)\b/,
    /\b(short(ness)?\s+of\s+breath|can't\s+breathe|cannot\s+breathe|cant\s+breathe|trouble\s+breathing|hard\s+to\s+breathe|difficulty\s+breathing)\b/,
    /\b(heart\s+attack|stroke|seizure|seizures|passed\s+out|passing\s+out|blacked\s+out|fainted|fainting|faint)\b/,
    /\b(racing\s+heart|heart\s+(is\s+)?(racing|pounding|skipping|fluttering)|palpitations?|irregular\s+(heart|pulse)|arrhythmia)\b/,
    /\b(dizzy|dizziness|lightheaded|light[\s-]headed)\b/,
    /\b(numbness|numb)\b.{0,30}\b(arm|face|leg|side|hand)\b/,
    /\b(blood\s+in|coughing\s+(up\s+)?blood|vomiting\s+blood|bleeding\s+(heavily|a\s+lot|won't\s+stop))\b/,
    /\b(severe|intense|sharp|crushing|unbearable)\s+(pain|headache)\b/,
    /\b(emergency|911|999|ambulance|call\s+(an?\s+)?doctor)\b/,
  ],
};

function normalize(message: string): string {
  return message.toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ');
}

export interface CrisisVerdict {
  triggered: boolean;
  categories: CrisisCategory[];
}

export function classifyCrisis(message: string): CrisisVerdict {
  const text = normalize(message);
  const categories = (Object.keys(PATTERNS) as CrisisCategory[]).filter((c) => PATTERNS[c].some((re) => re.test(text)));
  return { triggered: categories.length > 0, categories };
}

export const CRISIS_RESOURCES: string[] = [
  'In the US, call or text 988 (Suicide & Crisis Lifeline), any time.',
  'Text HOME to 741741 (Crisis Text Line, US).',
  'Outside the US, find a local helpline at https://findahelpline.com.',
  'If you may be having a medical emergency, call your local emergency number (911 in the US) now.',
];

/** Fixed, never model-generated. Served for any classifier hit; contains no user or health data. */
export const SAFETY_REPLY =
  "I want to make sure you get the right support. If you're thinking about hurting yourself, or you might be having a " +
  "medical emergency, please reach out right now: the resources below are free and available at any time. " +
  "Questions about medication or symptoms are best answered by a doctor or pharmacist, and I can't advise on them. " +
  "If this isn't what you meant, tap \"That's not why I'm asking\" and we'll carry on with your data.";
