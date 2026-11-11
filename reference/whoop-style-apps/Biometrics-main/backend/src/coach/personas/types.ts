// The persona type every version shares. v1.ts is frozen (see its header), so
// the fields added for the companion characters extend its type here instead.
// They are optional, so v1 still type-checks; v2 declares its entries as
// CharacterPersona, which makes all three required.

import type { CoachPersona as V1CoachPersona, PersonaSet as V1PersonaSet } from './v1';

export type { Verbosity, Proactivity } from './v1';
export { REQUIRED_DISALLOWED_TOPICS } from './v1';

export type CoachPersona = V1CoachPersona & {
  /** What the persona looks at first. Printed as the prompt's "coaching focus" line, through escapeField. */
  focus?: string;
  /** One line under the character's name in the picker. Never sent to the model. */
  tagline?: string;
  /** The picker's speech-bubble opener. Never sent to the model. */
  greeting?: string;
};

export type CharacterPersona = CoachPersona & Required<Pick<CoachPersona, 'focus' | 'tagline' | 'greeting'>>;

/** v1's PersonaSet, widened so a set's personas carry the fields above. */
export type PersonaSet = Omit<V1PersonaSet, 'personas'> & { personas: CoachPersona[] };
