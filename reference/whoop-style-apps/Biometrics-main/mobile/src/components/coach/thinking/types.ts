import type { CharacterId } from '../../characters/types';
import type { ThinkingStep } from '../../../lib/useCoachConversation';

/** What every thinking style is given. `paused` already includes Reduce Motion. */
export interface ThinkingStyleProps {
  characterId: CharacterId;
  steps: ThinkingStep[];
  paused: boolean;
}
