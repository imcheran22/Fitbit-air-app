import { apiFetch } from './client';
import { buddyErrorCode, type Person, type StickerKind } from './buddies';
import type { AchievementFamily } from './achievements';
import type { CheckInMood } from './social';

// Chats client (spec 2026-10-07 social §8). Types mirror backend/src/chats/{types,inbox,notes,presence}.ts exactly. Only
// a BARE 404 (no error code) means the backend predates chats (S1/S2): those reads answer null and the app hides the
// feature. Every chat error carries { error: code } (not_buddies is a 403). Message and note text is a buddy's free
// text: shown in Chats only, never logged.

export type MessageKind = 'TEXT' | 'STICKER' | 'CARD';
/**
 * A quoted item as the server serves it now. `available` is false only for a badge whose author no longer shares
 * streaks or a recap its author unshared: it keeps its family or period but never the level or the line ("No longer
 * shared"). The others hold no number and are always available.
 */
export type Card =
  // `about`: whose check-in — the sender's (shared with "+") or the recipient's (a story reply; no mood when it was locked).
  | { type: 'checkin'; available: true; about: 'sender' | 'recipient'; localDate: string; mood: CheckInMood | null }
  | { type: 'badge'; available: true; family: AchievementFamily; level: number }
  | { type: 'badge'; available: false; family: AchievementFamily }
  | { type: 'recap'; available: true; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string }
  | { type: 'recap'; available: false; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string }
  | { type: 'goodnight'; available: true; onTime: boolean }
  | { type: 'note'; available: true; text: string }
  | { type: 'camp_note'; available: true; text: string };
export type CardType = Card['type'];
/** The message a reply quotes: one line of it, or `gone` once it was unsent (an unsent message itself is never sent). */
export type ReplyPreview =
  | { id: string; gone: true }
  | { id: string; gone: false; mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null };
export interface Reaction { kind: StickerKind; mine: boolean }
export interface Message {
  id: string;
  mine: boolean;
  kind: MessageKind;
  /** TEXT's text, or a CARD's reply. User free text. */
  text: string | null;
  sticker: StickerKind | null;
  card: Card | null;
  replyTo: ReplyPreview | null;
  reactions: Reaction[];
  createdAt: string;
}
export interface Thread {
  buddy: Person;
  /** Oldest first: one page. */
  messages: Message[];
  /** The cursor (opaque) for the page before this one, or null at the start of the conversation. */
  nextBefore: string | null;
  /**
   * The time of the thread's newest live message when it is mine and the buddy has read up to it; only while both
   * have read receipts on. Never the buddy's read time itself.
   */
  seenAt: string | null;
  /** Their last activity within 24 h; only while both show activity status. */
  activeAt: string | null;
}
/** A row's newest live message: text is one line (at most 80 code points); a card is named by its type only. */
export interface LastMessage { mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null; at: string }
export interface ChatRow { buddy: Person; lastMessage: LastMessage; unread: number; activeAt: string | null }
/** Newest live message first; `nextCursor` is opaque. `requests` counts incoming buddy requests. */
export interface ChatsPage { chats: ChatRow[]; nextCursor: string | null; requests: number }
export interface StatusNote { text: string; createdAt: string; expiresAt: string }
export interface BuddyNote extends StatusNote { person: Person }
export interface Notes { mine: StatusNote | null; buddies: BuddyNote[] }
/** What a card quotes; the server builds the snapshot. */
export type CardRequest = { type: 'my_checkin' } | { type: 'story_frame'; at: string } | { type: 'note' } | { type: 'camp_note' };
/** A quote staged in the thread's composer (a route param): sent as a CARD with the next text. */
export interface ChatQuote { request: CardRequest; label: string }
export interface ChatSettings { readReceipts: boolean; activityStatus: boolean }
/** A note's report target id is its author's id. */
export type ReportTargetType = 'message' | 'status_note' | 'camp_note';
export type ReportReason = 'spam' | 'harassment' | 'other';

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const isBare404 = (error: unknown) => (error as { status?: number } | null)?.status === 404 && buddyErrorCode(error) === null;
const id = (s: string) => encodeURIComponent(s);
const messagesPath = (buddyId: string) => `/me/chats/${id(buddyId)}/messages`;

/** null only for a bare 404: a backend older than chats. */
async function orNull<T>(request: Promise<T>): Promise<T | null> {
  try {
    return await request;
  } catch (error) {
    if (isBare404(error)) return null;
    throw error;
  }
}

export const fetchChats = (cursor?: string | null) => orNull(apiFetch<ChatsPage>(cursor ? `/me/chats?cursor=${id(cursor)}` : '/me/chats'));
export const fetchThread = (buddyId: string, before?: string | null) =>
  orNull(apiFetch<Thread>(before ? `${messagesPath(buddyId)}?before=${id(before)}` : messagesPath(buddyId)));
export const fetchNotes = () => orNull(apiFetch<Notes>('/me/notes'));
export const fetchChatSettings = () => orNull(apiFetch<ChatSettings>('/me/chats/settings'));

const reply = (replyToMessageId?: string | null) => (replyToMessageId ? { replyToMessageId } : {});
export const sendText = (buddyId: string, text: string, replyToMessageId?: string | null) =>
  apiFetch<{ message: Message }>(messagesPath(buddyId), send('POST', { kind: 'TEXT', text, ...reply(replyToMessageId) }));
export const sendStickerMessage = (buddyId: string, sticker: StickerKind, replyToMessageId?: string | null) =>
  apiFetch<{ message: Message }>(messagesPath(buddyId), send('POST', { kind: 'STICKER', sticker, ...reply(replyToMessageId) }));
/** A blank or whitespace-only text is left out (the server refuses one, so the card goes without a reply). */
export const sendCard = (buddyId: string, card: CardRequest, text?: string, replyToMessageId?: string | null) =>
  apiFetch<{ message: Message }>(messagesPath(buddyId), send('POST', { kind: 'CARD', card, ...(text?.trim() ? { text } : {}), ...reply(replyToMessageId) }));

// The writes below answer 204.
export async function unsendMessage(buddyId: string, messageId: string): Promise<void> {
  await apiFetch<void>(`${messagesPath(buddyId)}/${id(messageId)}`, send('DELETE'));
}
export const setReaction = (buddyId: string, messageId: string, kind: StickerKind) =>
  apiFetch<{ reactions: Reaction[] }>(`${messagesPath(buddyId)}/${id(messageId)}/reaction`, send('PUT', { kind }));
export async function clearReaction(buddyId: string, messageId: string): Promise<void> {
  await apiFetch<void>(`${messagesPath(buddyId)}/${id(messageId)}/reaction`, send('DELETE'));
}
export async function markChatRead(buddyId: string): Promise<void> {
  await apiFetch<void>(`/me/chats/${id(buddyId)}/read`, send('POST'));
}
export const saveStatusNote = (text: string) => apiFetch<{ note: StatusNote }>('/me/notes', send('PUT', { text }));
export async function clearStatusNote(): Promise<void> {
  await apiFetch<void>('/me/notes', send('DELETE'));
}
export async function fileReport(targetType: ReportTargetType, targetId: string, reason: ReportReason): Promise<void> {
  await apiFetch<void>('/me/reports', send('POST', { targetType, targetId, reason }));
}
export const saveChatSettings = (patch: Partial<ChatSettings>) => apiFetch<ChatSettings>('/me/chats/settings', send('PUT', patch));

/** "I'm here" for activity status, on start and each return to the foreground. Best effort: never throws. */
export async function pingPresence(): Promise<void> {
  try {
    await apiFetch<void>('/me/presence', send('POST'));
  } catch {
    // An older server (404) or offline: nothing to show anyway.
  }
}
