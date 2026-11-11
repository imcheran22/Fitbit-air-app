import type { CoachPersona, PersonaSet } from './types';
import { v1Personas } from './v1';
import { LEGACY_PERSONA_IDS, v2Personas } from './v2';
import { v3Personas } from './v3';
import { v4Personas } from './v4';

export type { CoachPersona, CharacterPersona, PersonaSet, Verbosity, Proactivity } from './types';
export { REQUIRED_DISALLOWED_TOPICS } from './types';
export { LEGACY_PERSONA_IDS } from './v2';

/** Every shipped version, by id. Add a new file and register it here; never edit an old one. */
export const PERSONA_SETS: Record<string, PersonaSet> = {
  [v1Personas.version]: v1Personas,
  [v2Personas.version]: v2Personas,
  [v3Personas.version]: v3Personas,
  [v4Personas.version]: v4Personas,
};

export const LIVE_PERSONA_VERSION = 'v4';

function liveSet(): PersonaSet {
  return PERSONA_SETS[LIVE_PERSONA_VERSION]!;
}

export const DEFAULT_PERSONA_ID = liveSet().defaultPersonaId;

export function listPersonas(): CoachPersona[] {
  return liveSet().personas;
}

/**
 * A retired v1 id becomes the character that replaced it; anything else is
 * returned as is. Own keys only, so "toString" or "__proto__" never match.
 */
export function canonicalPersonaId(id: string): string {
  return Object.hasOwn(LEGACY_PERSONA_IDS, id) ? LEGACY_PERSONA_IDS[id as keyof typeof LEGACY_PERSONA_IDS] : id;
}

export function findPersona(id: unknown): CoachPersona | undefined {
  if (typeof id !== 'string') return undefined;
  const canonical = canonicalPersonaId(id);
  return listPersonas().find((p) => p.id === canonical);
}

/**
 * The v3 characters v4 retired (hoot, pip, nimbus, …): v3's ids minus the live ones. Old builds still
 * offer them, and their Skip sends 'hoot' (ruling R23). v1 ids (encouraging, …) are not in it.
 */
export const RETIRED_CHARACTER_IDS: ReadonlySet<string> = new Set(
  PERSONA_SETS.v3!.personas.map((p) => p.id).filter((id) => !listPersonas().some((p) => p.id === id)),
);

export function isRetiredCharacterId(id: unknown): boolean {
  return typeof id === 'string' && RETIRED_CHARACTER_IDS.has(id);
}

/** A stored id that no longer exists (persona retired in a later version) falls back to the default. */
export function resolvePersona(id: string | null | undefined): CoachPersona {
  return findPersona(id) ?? findPersona(DEFAULT_PERSONA_ID)!;
}
