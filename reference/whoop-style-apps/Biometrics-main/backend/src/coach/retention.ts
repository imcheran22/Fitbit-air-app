// Coach data retention and deletion (spec section 5).
//
//   * runCoachRetention(): a daily scheduled job that hard-deletes coach chat
//     transcripts older than 90 days, then any conversation that retention left
//     empty. It does not depend on COACH_ENABLED: turning the coach off must
//     never stop old transcripts from expiring.
//   * deleteUserCoachData(): removes EVERYTHING the coach holds for one user
//     (transcripts, conversations, memory, digests, day summaries, consent rows
//     and the coach-written recap text: stories removed, AI lines replaced by
//     template lines; the numbers stay). Push tokens are app-level and stay.
//     Account deletion (src/users/deletion.ts) deletes the same Coach* tables as
//     part of its own single transaction, walking the shared USER_OWNED_MODELS
//     list; this function remains for removing coach data on its own.
//
// Telemetry carries counts only.

import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import type { CoachTelemetry } from './telemetry';
import { buildRecapFactSheet } from './answer/facts';
import { templateLine } from '../recap/templates';
import type { RecapStats } from '../recap/types';

export const TRANSCRIPT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionSummary {
  messagesDeleted: number;
  conversationsDeleted: number;
  cutoff: Date;
}

/**
 * Deletes messages STRICTLY older than the retention window: a message exactly
 * `retentionDays` old is kept, one a millisecond older is deleted. Then deletes
 * conversations that are now empty AND stale (their last activity is also past
 * the cutoff), so a conversation being created right now is never touched.
 */
export async function runCoachRetention({
  now = new Date(),
  retentionDays = TRANSCRIPT_RETENTION_DAYS,
  telemetry,
}: { now?: Date; retentionDays?: number; telemetry?: CoachTelemetry } = {}): Promise<RetentionSummary> {
  const cutoff = new Date(now.getTime() - retentionDays * DAY_MS);
  const messages = await prisma.coachMessage.deleteMany({ where: { createdAt: { lt: cutoff } } });
  const conversations = await prisma.coachConversation.deleteMany({
    where: { lastMessageAt: { lt: cutoff }, messages: { none: {} } },
  });
  telemetry?.emit({
    name: 'coach.retention_run',
    userId: 'system',
    personaId: 'none',
    attributes: { messagesDeleted: messages.count, conversationsDeleted: conversations.count, retentionDays },
  });
  return { messagesDeleted: messages.count, conversationsDeleted: conversations.count, cutoff };
}

export interface UserDataDeletionSummary {
  messages: number;
  conversations: number;
  memories: number;
  digests: number;
  daySummaries: number;
  consents: number;
  /** Recaps whose coach-written text was cleared. */
  recapTexts: number;
}

/** Hard-deletes all coach data for a user, atomically. Idempotent: a second call deletes nothing. */
export async function deleteUserCoachData(userId: string, telemetry?: CoachTelemetry): Promise<UserDataDeletionSummary> {
  const summary = await prisma.$transaction(async (tx) => {
    // Messages first: they reference both the conversation and the user.
    const messages = await tx.coachMessage.deleteMany({ where: { userId } });
    const conversations = await tx.coachConversation.deleteMany({ where: { userId } });
    const memories = await tx.coachMemory.deleteMany({ where: { userId } });
    const digests = await tx.coachDigest.deleteMany({ where: { userId } });
    const daySummaries = await tx.coachDaySummary.deleteMany({ where: { userId } });
    const consents = await tx.coachConsent.deleteMany({ where: { userId } });
    // Recap numbers are not coach data; the coach's words are (spec 2026-10-04 §2). No model call.
    const recaps = await tx.recap.findMany({
      where: { userId, OR: [{ story: { not: null } }, { lineSource: 'AI' }] },
      select: { id: true, kind: true, stats: true, sleepGoalMinutes: true, lineSource: true },
    });
    for (const r of recaps) {
      const data: Prisma.RecapUpdateInput = { story: null, storySource: null };
      if (r.lineSource === 'AI' && r.stats !== null) {
        const stats = r.stats as unknown as RecapStats;
        data.line = templateLine(r.kind, stats, buildRecapFactSheet(r.kind, stats, r.sleepGoalMinutes));
        data.lineSource = 'TEMPLATE';
      }
      await tx.recap.update({ where: { id: r.id }, data });
    }
    return {
      messages: messages.count,
      conversations: conversations.count,
      memories: memories.count,
      digests: digests.count,
      daySummaries: daySummaries.count,
      consents: consents.count,
      recapTexts: recaps.length,
    };
  });
  telemetry?.emit({ name: 'coach.user_data_deleted', userId, personaId: 'none', attributes: { ...summary } });
  return summary;
}
