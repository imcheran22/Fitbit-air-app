// CARD messages (spec 2026-10-07 social §8.2, §8.3): a quoted item. The app only names it; the SERVER builds the
// snapshot from what the sender can see right now, so a card never holds more than the recipient could already see:
// my own check-in today (the thread's "+", an explicit share of my mood: no lock applies), a frame of the recipient's
// story today exactly as getStory shows it to me (a check-in still locked for me has no mood; a badge frame exists
// only while its author shares streaks; a recap frame carries the line they shared; a goodnight keeps its on-time
// flag), or the recipient's live Chats note or camp note. Anything gone is card_unavailable; a stranger, oneself or a
// malformed id is not_buddies (checked before the item, so a refusal never says whether a stranger has one).
// A snapshot is not a licence to keep showing a number (spec §9): a badge card serves its level only while its author
// shares streaks NOW, a recap card its line only while the author still shares that recap (gateCard, at every read).
// Note text in a card is user free text: never logged.

import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError, UUID_RE } from '../buddies/errors';
import { findPair } from '../buddies/pairs';
import { SHARING_SELECT, effectiveSharing, type Sharing } from '../buddies/sharing';
import { noteIsLive } from '../social/campNotes';
import { getTodayCheckIn } from '../social/checkins';
import { loadCircle } from '../social/circle';
import { getStory } from '../social/stories';
import type { CardDTO, StoredCard } from './types';

export type CardRequest = { type: 'my_checkin' } | { type: 'story_frame'; at: string } | { type: 'note' } | { type: 'camp_note' };

/** The request's shape, or null (the caller answers invalid_message). Extra fields are ignored. */
export function parseCardRequest(raw: unknown): CardRequest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.type === 'my_checkin') return { type: 'my_checkin' };
  if (r.type === 'note') return { type: 'note' };
  if (r.type === 'camp_note') return { type: 'camp_note' };
  if (r.type === 'story_frame' && typeof r.at === 'string' && r.at.length <= 40) return { type: 'story_frame', at: r.at };
  return null;
}

/** A frame's time as the story spells it (toISOString), or null when `at` is not a time. */
function frameTime(at: string): string | null {
  const ms = Date.parse(at);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** The snapshot to store as Message.card (badge and recap name their author for gateCard; never sent as is). */
export async function buildCard(senderId: string, recipientId: string, req: CardRequest, now: Date): Promise<StoredCard> {
  if (recipientId === senderId || !UUID_RE.test(recipientId)) throw new BuddyError('not_buddies');
  switch (req.type) {
    case 'my_checkin': {
      // Only my own mood, but still only to a buddy (and a stranger learns nothing from the answer).
      if (!(await findPair(senderId, recipientId))) throw new BuddyError('not_buddies');
      const mine = await getTodayCheckIn(senderId, now);
      if (!mine) throw new BuddyError('card_unavailable');
      return { type: 'checkin', about: 'sender', localDate: mine.localDate, mood: mine.mood };
    }
    case 'story_frame': {
      // getStory answers not_buddies for anyone but a current buddy, and applies every gate a viewer gets.
      const story = await getStory(senderId, recipientId, now);
      const at = frameTime(req.at);
      const frame = at === null ? undefined : story.frames.find((f) => f.at === at);
      if (!frame) throw new BuddyError('card_unavailable');
      switch (frame.kind) {
        case 'checkin':
          return { type: 'checkin', about: 'recipient', localDate: story.localDate, mood: frame.locked ? null : frame.mood };
        case 'badge':
          return { type: 'badge', authorId: recipientId, family: frame.family, level: frame.level };
        case 'recap':
          return {
            type: 'recap', authorId: recipientId, refId: frame.recapId, recapKind: frame.recapKind,
            periodStart: frame.periodStart, periodEnd: frame.periodEnd, line: frame.line,
          };
        case 'goodnight':
          return { type: 'goodnight', onTime: frame.onTime };
      }
      throw new BuddyError('card_unavailable');
    }
    case 'note': {
      if (!(await findPair(senderId, recipientId))) throw new BuddyError('not_buddies');
      const note = await prisma.statusNote.findFirst({ where: { authorId: recipientId, expiresAt: { gt: now } }, select: { text: true } });
      if (!note) throw new BuddyError('card_unavailable');
      return { type: 'note', text: note.text };
    }
    case 'camp_note': {
      const circle = await loadCircle(senderId, now);
      if (!circle.members.has(recipientId)) throw new BuddyError('not_buddies');
      const note = await prisma.campNote.findUnique({ where: { authorId: recipientId }, select: { authorId: true, text: true, createdAt: true, expiresAt: true } });
      if (!note || !noteIsLive(note, circle, now)) throw new BuddyError('card_unavailable');
      return { type: 'camp_note', text: note.text };
    }
  }
}

/** What the read-time gate needs for a page of cards: each badge/recap author's sharing now, and the recaps still shared. */
export interface CardGate {
  sharing: Map<string, Sharing>;
  /** `${authorId}:${recapId}` for every RecapShare that still exists. */
  sharedRecaps: Set<string>;
}

const recapKey = (authorId: string, recapId: string) => `${authorId}:${recapId}`;

/** One users query and one RecapShare query for any number of stored cards (a thread page batches them). */
export async function loadCardGate(cards: readonly unknown[], db: Prisma.TransactionClient | PrismaClient = prisma): Promise<CardGate> {
  const authorIds = new Set<string>();
  const recaps: Array<{ sharerId: string; recapId: string }> = [];
  for (const raw of cards) {
    const card = raw as Record<string, unknown> | null;
    if (!card || (card.type !== 'badge' && card.type !== 'recap') || typeof card.authorId !== 'string') continue;
    authorIds.add(card.authorId);
    if (card.type === 'recap' && typeof card.refId === 'string') recaps.push({ sharerId: card.authorId, recapId: card.refId });
  }
  const [users, shares] = await Promise.all([
    authorIds.size === 0 ? [] : db.user.findMany({ where: { id: { in: [...authorIds] } }, select: { id: true, ...SHARING_SELECT } }),
    recaps.length === 0 ? [] : db.recapShare.findMany({ where: { OR: recaps }, select: { sharerId: true, recapId: true } }),
  ]);
  return {
    sharing: new Map(users.map((u) => [u.id, effectiveSharing(u)])),
    sharedRecaps: new Set(shares.map((s) => recapKey(s.sharerId, s.recapId))),
  };
}

/** A stored card as the client may see it now (never its authorId or refId); null for none or an unknown shape. */
export function gateCard(raw: unknown, gate: CardGate): CardDTO | null {
  const card = raw as StoredCard | null;
  switch (card?.type) {
    case 'checkin':
      return { type: 'checkin', available: true, about: card.about, localDate: card.localDate, mood: card.mood };
    case 'badge':
      return gate.sharing.get(card.authorId)?.streaks === true
        ? { type: 'badge', available: true, family: card.family, level: card.level }
        : { type: 'badge', available: false, family: card.family };
    case 'recap': {
      const period = { recapKind: card.recapKind, periodStart: card.periodStart, periodEnd: card.periodEnd };
      return gate.sharedRecaps.has(recapKey(card.authorId, card.refId))
        ? { type: 'recap', available: true, ...period, line: card.line }
        : { type: 'recap', available: false, ...period };
    }
    case 'goodnight':
      return { type: 'goodnight', available: true, onTime: card.onTime };
    case 'note':
      return { type: 'note', available: true, text: card.text };
    case 'camp_note':
      return { type: 'camp_note', available: true, text: card.text };
    default:
      return null;
  }
}
