// Health / medical-fact classifier: the SECOND layer of the coach-memory
// allowlist (spec sections 5 and 6). The primary control is structural: memory
// can only be written through proposeMemory with a closed category enum, so a
// health fact has no category to land in. This classifier exists for a health
// fact DISGUISED as a goal or preference ("prefers a gentle plan because of my
// knee injury") and blocks it even inside an allowed category.
//
// Same style as crisis.ts: plain regexes over a normalized string, tuned
// deliberately toward FALSE POSITIVES. A blocked legitimate value costs the user
// a re-phrase; a missed health fact would be persisted into future prompts. It
// also runs the crisis classifier's medication / symptom / self-harm patterns
// over the value, so the two never drift apart on those topics.
//
// It returns category NAMES only, never the matched text.

import { classifyCrisis } from './crisis';

export type HealthFactCategory =
  | 'condition'
  | 'mental_health'
  | 'injury'
  | 'symptom'
  | 'reproductive'
  | 'body_measure'
  | 'care_provider'
  | 'crisis_overlap';

const PATTERNS: Record<Exclude<HealthFactCategory, 'crisis_overlap'>, RegExp[]> = {
  condition: [
    /\bdiagnos(ed|is|es|e)\b/,
    /\b(disease|disorder|syndrome|condition|chronic|illness|infection|virus|covid|cancer|tumou?rs?)\b/,
    /\b(diabet\w*|hypertens\w*|hypotens\w*|asthma\w*|arthritis|apn(o)?ea|insomnia|migraines?|epilep\w*|thyroid|anemi\w*|cholesterol|afib|arrhythmia)\b/,
    /\bblood\s+(pressure|sugar|glucose|test|work)\b/,
    /\bheart\s+(condition|disease|problem|problems|failure|murmur)\b/,
    /\bsuffer(s|ed|ing)?\b/,
  ],
  mental_health: [
    /\b(depress\w*|anxi\w*|adhd|bipolar|ptsd|panic|eating\s+disorder|anorexi\w*|bulimi\w*|trauma\w*)\b/,
    /\b(mental\s+health|self[\s-]?harm)\b/,
  ],
  injury: [
    /\b(injur\w*|sprain\w*|strain(ed)?|torn|fractur\w*|tendon\w*|tendin\w*|concussion|surgery|surgical|rehab\w*|physio\w*|herniat\w*|sciatica)\b/,
    /\bbroken\s+\w+/,
    /\brecover(ing|y)\s+from\b/,
  ],
  symptom: [/\b(pain\w*|ache|aches|aching|hurts?|hurting|sore|soreness|nausea|nauseous|fever|symptoms?|flare[\s-]?ups?)\b/],
  reproductive: [/\b(pregnan\w*|postpartum|menopaus\w*|fertility|miscarriage|menstrual|periods?\s+(are|is|were))\b/],
  body_measure: [/\b(bmi|body\s+fat|i\s+weigh|weighs|my\s+weight\s+is)\b/],
  care_provider: [
    /\b(doctors?|physicians?|therapists?|psychiatrists?|psychologists?|clinics?|hospital\w*|nurses?|prescri\w*|medicat\w*|meds|dosage|dose)\b/,
    /\b\d+(\.\d+)?\s*(mg|mcg|milligrams?|micrograms?|iu|ml)\b/,
  ],
};

function normalize(value: string): string {
  return value.toLowerCase().replace(/[‘’ʼ]/g, "'").replace(/\s+/g, ' ');
}

export interface HealthFactVerdict {
  blocked: boolean;
  categories: HealthFactCategory[];
}

export function classifyHealthFact(value: string): HealthFactVerdict {
  const text = normalize(value);
  const categories = (Object.keys(PATTERNS) as Array<keyof typeof PATTERNS>).filter((c) =>
    PATTERNS[c].some((re) => re.test(text)),
  ) as HealthFactCategory[];
  if (classifyCrisis(value).triggered) categories.push('crisis_overlap');
  return { blocked: categories.length > 0, categories };
}
