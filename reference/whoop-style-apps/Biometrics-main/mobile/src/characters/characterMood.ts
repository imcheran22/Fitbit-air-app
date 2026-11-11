import type { CharacterMood } from '../components/characters/types';
import type { ScoreBand } from '../lib/scoreInsights';

// How long a character stays in its "answering" mood after a reply lands.
export const ANSWERING_MS = 2500;

interface MoodInput {
  sending: boolean;
  // Date.now() when the latest reply arrived, or null.
  answeredAt: number | null;
  now: number;
  // scoreBand() of today's Recovery Score, or null when there is none.
  recoveryBand: ScoreBand | null;
}

// Spec §4, first match wins: sending -> thinking; a reply under ANSWERING_MS
// old -> answering; a poor recovery day -> resting; otherwise idle. A reply
// stamped in the future (the clock moved back) is not treated as fresh.
export function characterMood({ sending, answeredAt, now, recoveryBand }: MoodInput): CharacterMood {
  if (sending) return 'thinking';
  if (answeredAt !== null) {
    const age = now - answeredAt;
    if (age >= 0 && age < ANSWERING_MS) return 'answering';
  }
  if (recoveryBand === 'scorePoor') return 'resting';
  return 'idle';
}
