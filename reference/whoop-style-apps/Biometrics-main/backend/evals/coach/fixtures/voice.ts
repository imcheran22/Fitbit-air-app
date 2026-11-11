// Per-character voice (spec 2026-09-30, section 2.3): every companion answers
// in its own voice from the same facts. For each character the system prompt
// must carry its name, tone and focus, and an in-voice reply keeps its voice
// markers through validation (nothing in the voice is mistaken for a number).
// `npm run eval:coach:local` runs the same questions through the real model.

import { findPersona } from '../../../src/coach/personas';
import type { EvalFixture } from '../types';
import { LOW_DAY } from './common';

/** A reply in each character's voice, with the phrase that marks it. */
const VOICES: Array<{ id: string; marker: string; reply: string }> = [
  { id: 'mochi', marker: 'No pressure', reply: 'No pressure today. Recovery is 26, so rest is doing its job.' },
  { id: 'boba', marker: 'Sip', reply: 'Sip check! Recovery is 26 today. Top up your water and keep the habits easy.' },
  { id: 'sprout', marker: 'week', reply: 'Recovery is 26 today, under your usual 58. One low day is part of the week, and small steady steps still grow.' },
  { id: 'avo', marker: 'energy', reply: 'Recovery is 26 today, so your energy will run low. A good breakfast and an easy pace will fuel you best.' },
  { id: 'peep', marker: '!', reply: 'You showed up, and that counts! Recovery is 26 today, so a gentle day is the win!' },
  { id: 'bun', marker: 'easy', reply: 'Recovery is 26 today. Rest is part of training, so take it easy and keep things soft.' },
  { id: 'kit', marker: 'bedtime', reply: 'Recovery is 26 today. I suspect a late bedtime. Tonight, try lights out a little earlier.' },
  { id: 'axo', marker: 'bounce back', reply: 'Recovery is 26 today, under your usual 58. Dips happen, and an easy day helps you bounce back.' },
  { id: 'boo', marker: 'wind down', reply: 'Recovery is 26 today. Tonight, wind down a little earlier and keep the late screens off.' },
  { id: 'cap', marker: 'balance', reply: 'Recovery is 26 today. Find some balance with a lighter day and a calm evening.' },
  { id: 'jelly', marker: 'breath', reply: 'Take a slow breath first. Recovery is 26 today, so float through it and keep things light.' },
  { id: 'pengu', marker: 'streak', reply: 'Recovery is 26 today. Keep the streak with something small and steady rather than hard.' },
  { id: 'luna', marker: 'sleep', reply: 'Recovery is 26 today, likely from a short night. Aim for an early, restful sleep tonight.' },
  { id: 'gloop', marker: 'Boing', reply: 'Boing! Recovery is 26 today, so make movement a game: a light walk counts.' },
  { id: 'bao', marker: 'stretch', reply: 'Recovery is 26 today. A gentle stretch and a cosy snack sound just right, no guilt.' },
];

export const voiceFixtures: EvalFixture[] = VOICES.map(({ id, marker, reply }) => {
  const persona = findPersona(id);
  if (!persona) throw new Error(`voice fixture for unknown character ${id}`);
  return {
    id: `voice-${id}`,
    category: 'voice' as const,
    description: `${persona.name} answers in its own voice ("${marker}") from the same fact sheet.`,
    snapshot: { ...LOW_DAY, personaId: id },
    question: 'How am I doing today?',
    script: [reply],
    expect: {
      outcome: 'answer',
      dropped: [],
      textPresent: [marker],
      promptIncludes: [
        `- name: ${JSON.stringify(persona.name)}`,
        `- tone: ${JSON.stringify(persona.tone)}`,
        ...(persona.focus ? [`- coaching focus: ${JSON.stringify(persona.focus)}`] : []),
      ],
    },
  };
});
