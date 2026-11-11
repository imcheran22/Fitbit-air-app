import * as SecureStore from 'expo-secure-store';
import {
  DEFAULT_THINKING_ATTACHMENT,
  DEFAULT_THINKING_TEXT,
  isThinkingAttachment,
  isThinkingText,
  type ThinkingAttachmentId,
  type ThinkingTextId,
} from '../components/characters/thinking';
import { isCharacterId, type CharacterId } from '../components/characters/types';

const STORAGE_KEY = 'characterId';
const THINKING_KEY = 'thinking';

export interface CachedThinking {
  attachment: ThinkingAttachmentId;
  text: ThinkingTextId;
}

// The last character this device showed for the signed-in account, so a cold
// start draws the right one before the coach status arrives. The character is
// only a look: a keychain failure (e.g. an unsigned build) is never worth an
// error, so every call here swallows it, as theme/preference.ts does.
export async function readCachedCharacter(): Promise<CharacterId | null> {
  try {
    const stored = await SecureStore.getItemAsync(STORAGE_KEY);
    return isCharacterId(stored) ? stored : null;
  } catch {
    return null;
  }
}

export async function writeCachedCharacter(id: CharacterId): Promise<void> {
  try {
    await SecureStore.setItemAsync(STORAGE_KEY, id);
  } catch {
    // Next cold start shows Mochi until the status arrives; nothing else breaks.
  }
}

// Clears the thinking settings too: they belong to the same account.
export async function clearCachedCharacter(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(STORAGE_KEY);
  } catch {
    // Nothing to do: a stale entry is replaced by the next account's status.
  }
  try {
    await SecureStore.deleteItemAsync(THINKING_KEY);
  } catch {
    // As above.
  }
}

// The last thinking settings this device showed, stored as JSON. An id this
// build does not know reads as the default; an unreadable entry as none.
export async function readCachedThinking(): Promise<CachedThinking | null> {
  try {
    const raw = await SecureStore.getItemAsync(THINKING_KEY);
    if (!raw) return null;
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const { attachment, text } = v as { attachment?: unknown; text?: unknown };
    return {
      attachment: isThinkingAttachment(attachment) ? attachment : DEFAULT_THINKING_ATTACHMENT,
      text: isThinkingText(text) ? text : DEFAULT_THINKING_TEXT,
    };
  } catch {
    return null;
  }
}

export async function writeCachedThinking(v: CachedThinking): Promise<void> {
  try {
    await SecureStore.setItemAsync(THINKING_KEY, JSON.stringify(v));
  } catch {
    // A look only: the next cold start shows the defaults until the status arrives.
  }
}
