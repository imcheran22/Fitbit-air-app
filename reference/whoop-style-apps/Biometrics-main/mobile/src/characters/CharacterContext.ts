import { createContext, useContext } from 'react';
import type { CoachStatusDTO } from '../api/coach';
import type { ScoreBand } from '../lib/scoreInsights';
import type { CharacterId } from '../components/characters/types';
import type { ThinkingAttachmentId, ThinkingTextId } from '../components/characters/thinking';

export interface CharacterContextValue {
  characterId: CharacterId;
  personaChosen: boolean;
  /** null = not known (yet) or the request failed; treated like a disabled coach, as before. */
  status: CoachStatusDTO | null;
  /** A status request has settled, successfully or not. */
  statusLoaded: boolean;
  /** scoreBand() of today's recovery score; null when there is none or it failed to load. */
  recoveryBand: ScoreBand | null;
  /** What the coach shows while it works on an answer; the defaults until known and when signed out. */
  thinkingAttachment: ThinkingAttachmentId;
  thinkingText: ThinkingTextId;
  refreshStatus(): Promise<void>;
  /** Optimistic: switches at once, reverts and rethrows if the save fails. */
  chooseCharacter(id: CharacterId): Promise<void>;
  /** Optimistic like chooseCharacter. Only the settings given are sent and changed. */
  chooseThinking(body: { attachment?: ThinkingAttachmentId; text?: ThinkingTextId }): Promise<void>;
}

export const CharacterContext = createContext<CharacterContextValue | null>(null);

// For components that also render outside the provider (tests, the dev gallery).
export function useCharacterOptional(): CharacterContextValue | null {
  return useContext(CharacterContext);
}

export function useCharacter(): CharacterContextValue {
  const value = useContext(CharacterContext);
  if (!value) throw new Error('useCharacter must be used inside CharacterProvider');
  return value;
}
