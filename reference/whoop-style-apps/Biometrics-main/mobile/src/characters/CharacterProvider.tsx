import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { fetchCoachStatus, setCoachPersona, setCoachThinking, type CoachStatusDTO } from '../api/coach';
import { fetchScoresWithBands } from '../api/scores';
import { useOptionalAuth } from '../auth/AuthContext';
import {
  DEFAULT_THINKING_ATTACHMENT,
  DEFAULT_THINKING_TEXT,
  isThinkingAttachment,
  isThinkingText,
  type ThinkingAttachmentId,
  type ThinkingTextId,
} from '../components/characters/thinking';
import { DEFAULT_CHARACTER_ID, isCharacterId, type CharacterId } from '../components/characters/types';
import { scoreBand, type ScoreBand } from '../lib/scoreInsights';
import { CharacterContext, type CharacterContextValue } from './CharacterContext';
import {
  clearCachedCharacter,
  readCachedCharacter,
  readCachedThinking,
  writeCachedCharacter,
  writeCachedThinking,
  type CachedThinking,
} from './characterCache';

export { useCharacter, useCharacterOptional } from './CharacterContext';

type StatusSetter = (next: CoachStatusDTO | null) => void;

const DEFAULT_THINKING: CachedThinking = { attachment: DEFAULT_THINKING_ATTACHMENT, text: DEFAULT_THINKING_TEXT };

// Lets useCoachStatus() callers replace the shared status locally (e.g. right
// after revoking consent) without widening CharacterContextValue.
const StatusSetterContext = createContext<StatusSetter | null>(null);

export function useSetCoachStatus(): StatusSetter | null {
  return useContext(StatusSetterContext);
}

// 'pending' while the auth session is still loading on a cold start: the
// cached character stays up and nothing is fetched or cleared until it settles.
function accountKey(userId: string | null, isPending: boolean): string {
  if (userId !== null) return `user:${userId}`;
  return isPending ? 'pending' : 'signed-out';
}

// The user's character, the coach status and today's recovery band, for the
// whole app (spec §1). Owns the coach status, so useCoachStatus() reads it from
// here instead of fetching once per screen. Signed out, it is always Mochi with
// the default thinking settings, the cache is cleared and nothing is fetched.
export function CharacterProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const auth = useOptionalAuth();
  const userId = auth?.session?.userId ?? null;
  const account = accountKey(userId, auth?.isPending ?? false);

  const [characterId, setCharacterId] = useState<CharacterId>(DEFAULT_CHARACTER_ID);
  const [personaChosen, setPersonaChosen] = useState(false);
  const [status, setStatus] = useState<CoachStatusDTO | null>(null);
  const [statusLoaded, setStatusLoaded] = useState(false);
  const [recoveryBand, setRecoveryBand] = useState<ScoreBand | null>(null);
  const [thinkingAttachment, setThinkingAttachment] = useState<ThinkingAttachmentId>(DEFAULT_THINKING_ATTACHMENT);
  const [thinkingText, setThinkingText] = useState<ThinkingTextId>(DEFAULT_THINKING_TEXT);

  // Bumped on every account change and on unmount. A request that started
  // under an older epoch is dropped, so a reply for the previous account (or
  // one landing after sign-out or unmount) never reaches the screen.
  const epoch = useRef(0);
  const signedIn = useRef(false);
  // Set once the server has named this account's character, so the (slower)
  // cache read cannot put an older one back.
  const serverKnown = useRef(false);
  // A choice still waiting on PUT: a status fetch that started before it must
  // not undo it.
  const pendingChoice = useRef<CharacterId | null>(null);
  // Bumped on every choice. lastChoice is the choice now in effect (pending or
  // saved; a failed one hands back the one before it). A status fetch that
  // started before a newer choice may carry the server's pre-choice persona,
  // whichever order the replies land in, so that choice is laid over it.
  const choiceSeq = useRef(0);
  const lastChoice = useRef<{ seq: number; id: CharacterId } | null>(null);
  const latest = useRef({ characterId, personaChosen, status });
  latest.current = { characterId, personaChosen, status };

  // The thinking settings on screen, kept in step with the state synchronously
  // so a choice made before the next render still sees the one it replaces.
  const thinking = useRef<CachedThinking>(DEFAULT_THINKING);
  // Like serverKnown, for the thinking settings (or a choice of them).
  const thinkingKnown = useRef(false);
  // Thinking saves still in flight, and a counter bumped on every choice. A
  // status reply that may predate a choice leaves the settings as they are.
  const pendingThinking = useRef(0);
  const thinkingSeq = useRef(0);

  const showThinking = useCallback((next: CachedThinking) => {
    thinking.current = next;
    setThinkingAttachment(next.attachment);
    setThinkingText(next.text);
  }, []);

  const applyStatus = useCallback(
    (
      next: CoachStatusDTO | null,
      choice: CharacterId | null = pendingChoice.current,
      keepThinking: boolean = pendingThinking.current > 0,
    ) => {
      let merged = next && choice ? { ...next, personaId: choice, personaChosen: true } : next;
      // An empty personaId means the server did not say (a malformed status);
      // keep showing the cached character and thinking settings then.
      if (!merged || !merged.personaId) {
        setStatus(merged);
        return;
      }
      // The thinking settings to show: the status's, unless a choice may be
      // newer than it. Checked again here: a status set through
      // useSetCoachStatus may come from an older server without them.
      const shown: CachedThinking = keepThinking
        ? thinking.current
        : {
            attachment: isThinkingAttachment(merged.thinkingAttachment) ? merged.thinkingAttachment : DEFAULT_THINKING_ATTACHMENT,
            text: isThinkingText(merged.thinkingText) ? merged.thinkingText : DEFAULT_THINKING_TEXT,
          };
      merged = { ...merged, thinkingAttachment: shown.attachment, thinkingText: shown.text };
      setStatus(merged);
      // An unknown id is Mochi.
      const id = isCharacterId(merged.personaId) ? merged.personaId : DEFAULT_CHARACTER_ID;
      serverKnown.current = true;
      setCharacterId(id);
      setPersonaChosen(merged.personaChosen);
      void writeCachedCharacter(id);
      if (!keepThinking) {
        thinkingKnown.current = true;
        showThinking(shown);
        void writeCachedThinking(shown);
      }
    },
    [showThinking],
  );

  const refreshStatus = useCallback(async () => {
    if (!signedIn.current) return;
    const started = epoch.current;
    const seqAtStart = choiceSeq.current;
    // The server may answer this GET before it applies a PUT still in flight,
    // so a choice pending now can be missing from the reply too.
    const choicePendingAtStart = pendingChoice.current !== null;
    const thinkingSeqAtStart = thinkingSeq.current;
    const thinkingPendingAtStart = pendingThinking.current > 0;
    try {
      const next = await fetchCoachStatus();
      if (epoch.current !== started) return;
      // lastChoice is the choice in effect now: if the raced one failed it has
      // already been handed back, so the server's reply applies as sent.
      const mayBeStale = choicePendingAtStart || choiceSeq.current !== seqAtStart;
      const choice = mayBeStale ? (lastChoice.current?.id ?? null) : null;
      // Likewise for a thinking choice made or pending during the fetch.
      const keepThinking = thinkingPendingAtStart || pendingThinking.current > 0 || thinkingSeq.current !== thinkingSeqAtStart;
      applyStatus(next, choice ?? pendingChoice.current, keepThinking);
    } catch {
      if (epoch.current !== started) return;
      // Unknown, which every coach entry treats as disabled. The character
      // itself stays as it was (cached or last known).
      setStatus(null);
    }
    setStatusLoaded(true);
  }, [applyStatus]);

  const refreshRecovery = useCallback(async () => {
    if (!signedIn.current) return;
    const started = epoch.current;
    try {
      const { scores, bands } = await fetchScoresWithBands(1, 'RECOVERY');
      if (epoch.current !== started) return;
      const today = scores.find((s) => s.type === 'RECOVERY' && s.score !== null);
      setRecoveryBand(today && today.score !== null ? scoreBand(today.score, bands) : null);
    } catch {
      if (epoch.current === started) setRecoveryBand(null);
    }
  }, []);

  useEffect(() => {
    epoch.current += 1;
    const started = epoch.current;
    signedIn.current = account.startsWith('user:');
    serverKnown.current = false;
    pendingChoice.current = null;
    lastChoice.current = null;
    thinkingKnown.current = false;
    pendingThinking.current = 0;
    setStatus(null);
    setStatusLoaded(false);
    setRecoveryBand(null);

    if (account === 'signed-out') {
      // Signed-out screens always show Mochi with the default thinking
      // settings, and the next account must never see this one's.
      setCharacterId(DEFAULT_CHARACTER_ID);
      setPersonaChosen(false);
      showThinking(DEFAULT_THINKING);
      void clearCachedCharacter();
      return;
    }

    void readCachedCharacter().then((cached) => {
      // The cache validates too; checked again here because CharacterCanvas
      // has no fallback, so an unknown id must never reach it.
      if (isCharacterId(cached) && epoch.current === started && !serverKnown.current) setCharacterId(cached);
    });
    void readCachedThinking().then((cached) => {
      if (cached && epoch.current === started && !thinkingKnown.current) showThinking(cached);
    });
    if (signedIn.current) {
      void refreshStatus();
      void refreshRecovery();
    }
  }, [account, refreshStatus, refreshRecovery, showThinking]);

  // Today's recovery can change while the app is in the background (a sync,
  // or a new day), so it is read again whenever the app comes back.
  useEffect(() => {
    let previous = AppState.currentState;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active' && previous !== 'active') void refreshRecovery();
      previous = next;
    });
    return () => subscription.remove();
  }, [refreshRecovery]);

  useEffect(
    () => () => {
      epoch.current += 1;
    },
    [],
  );

  const chooseCharacter = useCallback(async (id: CharacterId) => {
    // Signed out (or still loading) there is no account to save to, and the
    // character must stay Mochi.
    if (!signedIn.current) return;
    if (!isCharacterId(id)) throw new Error(`Unknown character: ${String(id)}`);
    const started = epoch.current;
    const previous = latest.current;
    const previousChoice = lastChoice.current;
    choiceSeq.current += 1;
    const seq = choiceSeq.current;
    lastChoice.current = { seq, id };
    pendingChoice.current = id;
    setCharacterId(id);
    setPersonaChosen(true);
    setStatus((s) => (s ? { ...s, personaId: id, personaChosen: true } : s));
    void writeCachedCharacter(id);
    try {
      await setCoachPersona(id);
      if (epoch.current === started) serverKnown.current = true;
    } catch (error) {
      // Put the previous character back, unless the account changed or a
      // newer choice has since replaced this one.
      if (epoch.current === started && lastChoice.current?.seq === seq) {
        lastChoice.current = previousChoice;
        setCharacterId(previous.characterId);
        setPersonaChosen(previous.personaChosen);
        setStatus((s) => (s ? { ...s, personaId: previous.status?.personaId ?? s.personaId, personaChosen: previous.personaChosen } : s));
        void writeCachedCharacter(previous.characterId);
      }
      throw error;
    } finally {
      if (pendingChoice.current === id) pendingChoice.current = null;
    }
  }, []);

  const chooseThinking = useCallback(
    async (body: { attachment?: ThinkingAttachmentId; text?: ThinkingTextId }) => {
      // Signed out (or still loading) there is no account to save to, and the
      // settings must stay the defaults.
      if (!signedIn.current) return;
      if (body.attachment !== undefined && !isThinkingAttachment(body.attachment)) {
        throw new Error(`Unknown thinking attachment: ${String(body.attachment)}`);
      }
      if (body.text !== undefined && !isThinkingText(body.text)) throw new Error(`Unknown thinking text: ${String(body.text)}`);
      const started = epoch.current;
      const previous = thinking.current;
      const next: CachedThinking = { attachment: body.attachment ?? previous.attachment, text: body.text ?? previous.text };
      thinkingSeq.current += 1;
      const seq = thinkingSeq.current;
      pendingThinking.current += 1;
      thinkingKnown.current = true;
      showThinking(next);
      setStatus((s) => (s ? { ...s, thinkingAttachment: next.attachment, thinkingText: next.text } : s));
      void writeCachedThinking(next);
      try {
        await setCoachThinking(body);
      } catch (error) {
        // Put the previous settings back, unless the account changed or a
        // newer choice has since replaced this one.
        if (epoch.current === started && thinkingSeq.current === seq) {
          showThinking(previous);
          setStatus((s) => (s ? { ...s, thinkingAttachment: previous.attachment, thinkingText: previous.text } : s));
          void writeCachedThinking(previous);
        }
        throw error;
      } finally {
        // An account change has already reset the count.
        if (epoch.current === started) pendingThinking.current -= 1;
      }
    },
    [showThinking],
  );

  const value = useMemo<CharacterContextValue>(
    () => ({
      characterId,
      personaChosen,
      status,
      statusLoaded,
      recoveryBand,
      thinkingAttachment,
      thinkingText,
      refreshStatus,
      chooseCharacter,
      chooseThinking,
    }),
    [characterId, personaChosen, status, statusLoaded, recoveryBand, thinkingAttachment, thinkingText, refreshStatus, chooseCharacter, chooseThinking],
  );

  return (
    <CharacterContext.Provider value={value}>
      <StatusSetterContext.Provider value={applyStatus}>{children}</StatusSetterContext.Provider>
    </CharacterContext.Provider>
  );
}
