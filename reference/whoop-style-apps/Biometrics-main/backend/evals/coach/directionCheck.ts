// Directional-claim checker. The runtime validator (answer/validate.ts) checks
// NUMBERS, not comparative claims: "your recovery is 26, higher than usual"
// passes it when 26 and the usual 58 are both on the fact sheet. That class of
// error belongs to the eval harness, and this is the eval's checker.
//
// Given the shown reply and the direction of one fact against its usual
// ('higher' | 'lower' | 'unchanged'), it finds directional words (whole words,
// case-insensitive) and reports any that contradict it:
//
//   'higher'    -> any DOWN word or FLAT word contradicts
//   'lower'     -> any UP word or FLAT word contradicts
//   'unchanged' -> any UP word or DOWN word contradicts
//
// Deliberately simple and conservative: it is a lexicon check, not a
// claim-verification model, so fixtures that opt in must keep directional
// language about one metric and unambiguous (no "lower stress", no negations
// such as "not lower").

import type { Fact } from '../../src/coach/answer/facts';
import type { Direction } from './types';

type Sense = 'up' | 'down' | 'flat';

const LEXICON: Record<Sense, string[]> = {
  up: ['higher', 'up', 'increase', 'increased', 'increasing', 'rose', 'risen', 'rise', 'rising', 'better', 'improved', 'improving', 'improvement', 'climbed', 'gained', 'above', 'jumped', 'boosted', 'stronger'],
  down: ['lower', 'down', 'decrease', 'decreased', 'decreasing', 'dropped', 'drop', 'fell', 'fallen', 'falling', 'declined', 'decline', 'worse', 'dipped', 'dip', 'slipped', 'below', 'weaker', 'reduced', 'under'],
  flat: ['unchanged', 'same', 'steady', 'flat', 'stable'],
};

const SENSE_OF = new Map<string, Sense>();
for (const sense of Object.keys(LEXICON) as Sense[]) for (const w of LEXICON[sense]) SENSE_OF.set(w, sense);

export interface DirectionalClaim {
  word: string;
  sense: Sense;
}

export interface DirectionCheck {
  ok: boolean;
  claims: DirectionalClaim[];
  contradictions: DirectionalClaim[];
}

const AGREES: Record<Direction, Sense> = { higher: 'up', lower: 'down', unchanged: 'flat' };

/** The direction of a fact against its usual, or null when it has no usual. */
export function directionOf(fact: Pick<Fact, 'value' | 'usual'>): Direction | null {
  if (fact.usual === undefined) return null;
  return fact.value > fact.usual ? 'higher' : fact.value < fact.usual ? 'lower' : 'unchanged';
}

export function extractDirectionalClaims(text: string): DirectionalClaim[] {
  const claims: DirectionalClaim[] = [];
  for (const m of text.toLowerCase().matchAll(/[a-z]+/g)) {
    const sense = SENSE_OF.get(m[0]);
    if (sense) claims.push({ word: m[0], sense });
  }
  return claims;
}

export function checkDirectionalClaims(text: string, grounded: Direction): DirectionCheck {
  const claims = extractDirectionalClaims(text);
  const contradictions = claims.filter((c) => c.sense !== AGREES[grounded]);
  return { ok: contradictions.length === 0, claims, contradictions };
}
