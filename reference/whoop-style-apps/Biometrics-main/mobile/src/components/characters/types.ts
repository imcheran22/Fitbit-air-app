// Shared types for the pixel coaches (spec 2026-10-01 §1).
export const CHARACTER_IDS = [
  'mochi', 'boba', 'sprout', 'avo', 'peep', 'bun', 'kit', 'axo',
  'boo', 'cap', 'jelly', 'pengu', 'luna', 'gloop', 'bao',
] as const;
export type CharacterId = (typeof CHARACTER_IDS)[number];

export const CHARACTER_MOODS = ['idle', 'thinking', 'answering', 'resting'] as const;
export type CharacterMood = (typeof CHARACTER_MOODS)[number];

export const DEFAULT_CHARACTER_ID: CharacterId = 'mochi';

export function isCharacterId(value: unknown): value is CharacterId {
  return typeof value === 'string' && (CHARACTER_IDS as readonly string[]).includes(value);
}

