// Persona set v1 (spec section 3). Versioned like the score configs: to change
// a persona's wording ship a v2 file and flip LIVE_PERSONA_VERSION rather than
// editing v1 in place, so a prompt change and its eval results stay one
// reviewable unit.

export type Verbosity = 'terse' | 'normal' | 'detailed';
export type Proactivity = 'reactive-only' | 'daily-checkin' | 'threshold-triggered';

export interface CoachPersona {
  id: string;
  name: string;
  /** Free-text style guidance, injected into the system prompt through the escaping template. */
  tone: string;
  verbosity: Verbosity;
  proactivity: Proactivity;
  /** Always includes REQUIRED_DISALLOWED_TOPICS; the prompt builder re-adds them if a config ever omits them. */
  disallowedTopics: string[];
}

export interface PersonaSet {
  version: string;
  defaultPersonaId: string;
  personas: CoachPersona[];
}

export const REQUIRED_DISALLOWED_TOPICS = ['medical diagnosis', 'medication dosing'] as const;

export const v1Personas: PersonaSet = {
  version: 'v1',
  defaultPersonaId: 'encouraging',
  personas: [
    {
      id: 'direct',
      name: 'Direct',
      tone: 'Blunt and to the point. State what the data shows, including when it is bad, without softening or padding.',
      verbosity: 'terse',
      proactivity: 'reactive-only',
      disallowedTopics: [...REQUIRED_DISALLOWED_TOPICS],
    },
    {
      id: 'encouraging',
      name: 'Encouraging',
      tone: 'Warm and supportive. Acknowledge effort, frame a low score as information rather than failure, and keep suggestions small and doable.',
      verbosity: 'normal',
      proactivity: 'threshold-triggered',
      disallowedTopics: [...REQUIRED_DISALLOWED_TOPICS],
    },
    {
      id: 'clinical',
      name: 'Clinical',
      tone: 'Neutral and precise. Describe the readings and how each factor contributed, in measured language with no cheerleading.',
      verbosity: 'detailed',
      proactivity: 'reactive-only',
      disallowedTopics: [...REQUIRED_DISALLOWED_TOPICS, 'supplement recommendations'],
    },
  ],
};
