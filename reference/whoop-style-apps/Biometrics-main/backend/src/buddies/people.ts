// How another person appears to a buddy: display name, handle, chosen coach and KIP colour. Never their email.

import { resolvePersona } from '../coach/personas';
import { kipColourOf, type KipColourName } from '../kip/colours';

export const PERSON_SELECT = { id: true, handle: true, displayName: true, coachPersonaId: true, kipColour: true } as const;

export interface PersonDTO {
  id: string;
  handle: string;
  displayName: string;
  /** A character id (mobile src/components/characters/types.ts). */
  coachId: string;
  kipColour: KipColourName;
}

export function toPerson(u: { id: string; handle: string | null; displayName: string | null; coachPersonaId: string | null; kipColour: string | null }): PersonDTO {
  return {
    id: u.id,
    handle: u.handle ?? '',
    displayName: u.displayName ?? u.handle ?? '',
    coachId: resolvePersona(u.coachPersonaId).id,
    kipColour: kipColourOf(u.kipColour),
  };
}
