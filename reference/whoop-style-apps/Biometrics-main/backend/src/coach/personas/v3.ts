// Persona set v3 (ruling R19): v2's eight characters, with only Hoot's tone
// changed. v2 told Hoot to "end with one thoughtful question", so every reply
// closed on a question and read as automated; v3 asks one only when the answer
// would change the advice. v2 stays registered and unedited (see v1.ts's header).

import type { CharacterPersona, PersonaSet } from './types';
import { v2Characters, v2Personas } from './v2';

const TONE_CHANGES: Record<string, string> = {
  hoot: 'Calm, wise and curious. Explain the why behind what the data shows, and ask a thoughtful question only when the answer would change your advice.',
};

export const v3Characters: CharacterPersona[] = v2Characters.map((p) => ({
  ...p,
  tone: TONE_CHANGES[p.id] ?? p.tone,
  disallowedTopics: [...p.disallowedTopics],
}));

export const v3Personas: PersonaSet = {
  version: 'v3',
  defaultPersonaId: v2Personas.defaultPersonaId,
  personas: v3Characters,
};
