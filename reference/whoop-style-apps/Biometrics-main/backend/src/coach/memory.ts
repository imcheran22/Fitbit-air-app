// Coach memory (spec sections 5 and 6). An ALLOWLIST, not a free-text store:
//
//   * The only way a row is created is a proposal that passes
//     validateMemoryInput(): a category from the closed enum, a value of at most
//     140 characters, and a value the health-fact classifier does not block.
//     Anything that fits no category simply has nowhere to go, so a health fact
//     stated in chat is never persisted however it is phrased.
//   * A new row is PENDING. It becomes CONFIRMED when the user's NEXT message
//     does not correct or dismiss THAT entry (guardrails/memoryFeedback.ts), and
//     is deleted when it does (the reply then says so). Users can edit or delete any row at any time.
//   * Only CONFIRMED rows are surfaced into a prompt, capped at the newest
//     MAX_PROMPT_MEMORIES.
//
// Nothing here logs a value. Callers emit ids and counts only.

import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { classifyHealthFact } from './guardrails/healthFact';
import { classifyMemoryFeedback } from './guardrails/memoryFeedback';

export const MEMORY_CATEGORIES = ['TRAINING_GOAL', 'SCHEDULE', 'PREFERENCE'] as const;
export type MemoryCategory = (typeof MEMORY_CATEGORIES)[number];
export const MAX_MEMORY_VALUE_CHARS = 140;
/** "What I know about you" prompt block cap: the N most recent confirmed entries. */
export const MAX_PROMPT_MEMORIES = 10;
/** Bounds stored memory per user (an allowlist should also be a small list). */
export const MAX_MEMORY_ENTRIES_PER_USER = 50;
/** A model may not spray proposals in one turn. */
export const MAX_PROPOSALS_PER_TURN = 3;

export type MemoryRejection = 'invalid_category' | 'invalid_value' | 'value_too_long' | 'health_content';

export type MemoryValueResult = { ok: true; value: string } | { ok: false; reason: Exclude<MemoryRejection, 'invalid_category'> };
export type MemoryInputResult =
  | { ok: true; category: MemoryCategory; value: string }
  | { ok: false; reason: MemoryRejection };

const isCategory = (v: unknown): v is MemoryCategory => typeof v === 'string' && (MEMORY_CATEGORIES as readonly string[]).includes(v);

/** Control characters and runs of whitespace collapse to single spaces; the ends are trimmed. */
function normalizeValue(value: string): string {
  return value.replace(/\p{Cc}+/gu, ' ').replace(/\s+/g, ' ').trim();
}

/** Value-only validation, shared by proposals and by the user's own edits (PATCH). */
export function validateMemoryValue(input: unknown): MemoryValueResult {
  if (typeof input !== 'string') return { ok: false, reason: 'invalid_value' };
  const value = normalizeValue(input);
  if (value.length === 0) return { ok: false, reason: 'invalid_value' };
  if (value.length > MAX_MEMORY_VALUE_CHARS) return { ok: false, reason: 'value_too_long' };
  if (classifyHealthFact(value).blocked) return { ok: false, reason: 'health_content' };
  return { ok: true, value };
}

/** The proposeMemory gate: closed category enum first, then the value checks. */
export function validateMemoryInput(input: unknown): MemoryInputResult {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return { ok: false, reason: 'invalid_category' };
  const { category, value } = input as Record<string, unknown>;
  if (!isCategory(category)) return { ok: false, reason: 'invalid_category' };
  const checked = validateMemoryValue(value);
  return checked.ok ? { ok: true, category, value: checked.value } : checked;
}

export interface MemoryDTO {
  id: string;
  category: MemoryCategory;
  value: string;
  status: 'PENDING' | 'CONFIRMED';
  createdAt: string;
}

interface MemoryRow {
  id: string;
  category: MemoryCategory;
  value: string;
  status: 'PENDING' | 'CONFIRMED';
  createdAt: Date;
}

export const toMemoryDTO = (row: MemoryRow): MemoryDTO => ({
  id: row.id,
  category: row.category,
  value: row.value,
  status: row.status,
  createdAt: row.createdAt.toISOString(),
});

export interface MemoryProposal {
  category: MemoryCategory;
  value: string;
}

/**
 * Persists validated proposals as PENDING. Re-validates (defence in depth: the
 * store is the last gate whoever calls it), skips a duplicate of an existing
 * entry, and stops at the per-user cap. Returns only the rows created now.
 * Pass a transaction client as `db` to write the proposals atomically with the
 * reply that shows them.
 */
export async function createPendingMemories(
  userId: string,
  proposals: MemoryProposal[],
  conversationId: string | null = null,
  db: Prisma.TransactionClient = prisma,
): Promise<MemoryDTO[]> {
  const created: MemoryDTO[] = [];
  if (proposals.length === 0) return created;
  const existing = await db.coachMemory.findMany({ where: { userId }, select: { category: true, value: true } });
  const seen = new Set(existing.map((e) => `${e.category}|${e.value.toLowerCase()}`));
  let total = existing.length;
  for (const proposal of proposals) {
    const checked = validateMemoryInput(proposal);
    if (!checked.ok) continue;
    const key = `${checked.category}|${checked.value.toLowerCase()}`;
    if (seen.has(key) || total >= MAX_MEMORY_ENTRIES_PER_USER) continue;
    // ON CONFLICT DO NOTHING on the (userId, category, value) unique index:
    // another turn proposed the same fact between the read above and this
    // write, so there is nothing to add. Skipping in SQL (rather than catching
    // P2002) keeps a surrounding transaction usable, since Postgres aborts a
    // transaction on any failed statement.
    const [row] = await db.coachMemory.createManyAndReturn({
      data: [{ userId, category: checked.category, value: checked.value, status: 'PENDING', conversationId }],
      skipDuplicates: true,
    });
    if (row === undefined) continue;
    seen.add(key);
    total++;
    created.push(toMemoryDTO(row));
  }
  return created;
}

export interface MemoryResolution {
  confirmed: number;
  dismissed: number;
}

/**
 * Applies the user's NEXT message to their PENDING entries, each judged on its
 * own: an entry the message explicitly dismisses or corrects (about that fact)
 * is deleted, every other one becomes CONFIRMED. Every PENDING row at this point
 * was proposed on an earlier turn, because this turn's proposals are only
 * written after the reply is validated. `dismissed` counts rows actually
 * deleted (reported in coach.memory_resolved; the entry also leaves the Coach memory list).
 */
export async function resolvePendingMemories(
  userId: string,
  message: string,
  conversationId: string | null,
): Promise<MemoryResolution> {
  // A proposal belongs to the conversation it was made in. Resolving across all
  // of a user's conversations meant a message in one settled -- confirmed or
  // silently deleted -- proposals the user had never been shown in that thread.
  // A brand-new conversation has nothing of its own pending yet, so it settles
  // nothing.
  if (conversationId === null) return { confirmed: 0, dismissed: 0 };
  const pending = await prisma.coachMemory.findMany({
    where: { userId, status: 'PENDING', conversationId },
    select: { id: true, value: true },
  });
  if (pending.length === 0) return { confirmed: 0, dismissed: 0 };
  const dismissIds: string[] = [];
  const confirmIds: string[] = [];
  for (const p of pending) (classifyMemoryFeedback(message, p.value) === 'dismiss' ? dismissIds : confirmIds).push(p.id);

  let confirmed = 0;
  let dismissed = 0;
  if (confirmIds.length > 0) {
    const r = await prisma.coachMemory.updateMany({
      where: { id: { in: confirmIds }, status: 'PENDING' },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    confirmed = r.count;
  }
  if (dismissIds.length > 0) {
    const r = await prisma.coachMemory.deleteMany({ where: { id: { in: dismissIds }, status: 'PENDING' } });
    dismissed = r.count;
  }
  return { confirmed, dismissed };
}

/** The newest confirmed entries only, for the "what I know about you" prompt block. */
export async function loadConfirmedMemories(userId: string, limit = MAX_PROMPT_MEMORIES): Promise<MemoryProposal[]> {
  const rows = await prisma.coachMemory.findMany({
    where: { userId, status: 'CONFIRMED' },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: limit,
    select: { category: true, value: true },
  });
  return rows.map((r) => ({ category: r.category, value: r.value }));
}
