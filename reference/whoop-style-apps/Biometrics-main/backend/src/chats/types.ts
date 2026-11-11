// Chat DTOs (spec 2026-10-07 social §8). Mirrored exactly by mobile/src/api/chats.ts.

import type { AchievementFamily, CheckInMood, MessageKind, StickerKind } from '@prisma/client';
import type { PersonDTO } from '../buddies/people';

/**
 * A quoted item's snapshot as stored in Message.card, built by the server (cards.ts). Never sent as is: a badge or
 * recap card names its author (and a recap its recapId) so each read can re-check that the number is still shared
 * (gateCard); those ids never reach the client.
 */
export type StoredCard =
  // `about`: whose check-in — mine shared with "+" (sender), or theirs replied to from their story (recipient; no mood
  // when it was locked for me).
  | { type: 'checkin'; about: 'sender' | 'recipient'; localDate: string; mood: CheckInMood | null }
  | { type: 'badge'; authorId: string; family: AchievementFamily; level: number }
  | { type: 'recap'; authorId: string; refId: string; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string }
  | { type: 'goodnight'; onTime: boolean }
  | { type: 'note'; text: string }
  | { type: 'camp_note'; text: string };

/**
 * A card as the client sees it. `available` is false only for a badge whose author no longer shares streaks or a recap
 * its author unshared: then it keeps its type and family or period, never the level or the line ("No longer shared").
 * Check-in, goodnight and note cards hold no number and are always available.
 */
export type CardDTO =
  | { type: 'checkin'; available: true; about: 'sender' | 'recipient'; localDate: string; mood: CheckInMood | null }
  | { type: 'badge'; available: true; family: AchievementFamily; level: number }
  | { type: 'badge'; available: false; family: AchievementFamily }
  | { type: 'recap'; available: true; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string; line: string }
  | { type: 'recap'; available: false; recapKind: 'WEEK' | 'MONTH'; periodStart: string; periodEnd: string }
  | { type: 'goodnight'; available: true; onTime: boolean }
  | { type: 'note'; available: true; text: string }
  | { type: 'camp_note'; available: true; text: string };

export type CardType = CardDTO['type'];
export const CARD_TYPES: readonly CardType[] = ['checkin', 'badge', 'recap', 'goodnight', 'note', 'camp_note'];

/** The message a reply quotes: one line of it, or `gone` once it was unsent. */
export type ReplyPreviewDTO =
  | { id: string; gone: true }
  | { id: string; gone: false; mine: boolean; kind: MessageKind; text: string | null; sticker: StickerKind | null; cardType: CardType | null };

export interface ReactionDTO { kind: StickerKind; mine: boolean }

export interface MessageDTO {
  id: string;
  mine: boolean;
  kind: MessageKind;
  /** TEXT's text, or a CARD's reply. User free text. */
  text: string | null;
  sticker: StickerKind | null;
  card: CardDTO | null;
  replyTo: ReplyPreviewDTO | null;
  reactions: ReactionDTO[];
  createdAt: string;
}

export interface ThreadDTO {
  buddy: PersonDTO;
  /** Oldest first: one page. */
  messages: MessageDTO[];
  /** The cursor for the page before this one, or null at the start of the conversation. */
  nextBefore: string | null;
  /**
   * "Seen": the time of the thread's newest live message when it is mine and the buddy has read up to it; only while
   * both have read receipts on, else null. Never the buddy's read time itself (that would reveal when they open it).
   */
  seenAt: string | null;
  /** When the buddy was last active (within 24 h); only while both show activity status. */
  activeAt: string | null;
}

/** A stored card's type, or null for anything this server never writes. */
export function cardTypeOf(card: unknown): CardType | null {
  const type = (card as { type?: unknown } | null)?.type;
  return (CARD_TYPES as readonly unknown[]).includes(type) ? (type as CardType) : null;
}
