// Reports (spec 2026-10-07 social §9): a message, a Chats note or a camp note the reporter can see right now. The row
// keeps the reporter, the reported person, the target (a message id, or for a note its author's id), the reason and
// an excerpt of the text at report time — so a report outlives the unsend, unpair or block ("Block too") that removes
// what it quotes — and is kept 90 days (social sweep); it goes with either account. One row per reporter and target:
// a second report updates it. Nothing reads reports through the API (no admin UI in this spec); the reported person is
// never told; nothing is logged, not even the reason. Anything the reporter cannot see now — their own item, an unsent
// message, an expired or cleared note, a stranger's or ex-buddy's item, a malformed id — is report_target_gone, the
// same answer whether or not the item exists. The excerpt is user free text: never logged, not even its length.

import type { ReportReason, ReportTarget } from '@prisma/client';
import { prisma } from '../db/client';
import { BuddyError, UUID_RE, isUniqueViolation, limitOrThrow } from '../buddies/errors';
import { findPair } from '../buddies/pairs';
import { RATE_LIMITS } from '../lib/rateLimit';
import { noteIsLive } from '../social/campNotes';
import { loadCircle } from '../social/circle';

export const REPORT_RETENTION_DAYS = 90;

const TARGETS: Readonly<Record<string, ReportTarget>> = { message: 'MESSAGE', status_note: 'STATUS_NOTE', camp_note: 'CAMP_NOTE' };
const REASONS: Readonly<Record<string, ReportReason>> = { spam: 'SPAM', harassment: 'HARASSMENT', other: 'OTHER' };
const own = <T>(table: Readonly<Record<string, T>>, key: unknown): T | undefined =>
  typeof key === 'string' && Object.prototype.hasOwnProperty.call(table, key) ? table[key] : undefined;

interface Target { reportedUserId: string; excerpt: string | null }

const gone = () => new BuddyError('report_target_gone');

/** An account deleted mid-call (no FK target, no row to update). */
function isGoneRace(err: unknown): boolean {
  const code = (err as { code?: unknown } | null)?.code;
  return code === 'P2003' || code === 'P2025';
}

async function resolveTarget(reporterId: string, type: ReportTarget, targetId: string, now: Date): Promise<Target> {
  if (type === 'MESSAGE') {
    // A current buddy's live message in our conversation. The excerpt is their own words only: a CARD's reply text,
    // never the quoted item (which may be the reporter's own note); a sticker or a bare card has none.
    const m = await prisma.message.findFirst({
      where: { id: targetId, deletedAt: null, senderId: { not: reporterId }, conversation: { OR: [{ userAId: reporterId }, { userBId: reporterId }] } },
      select: { senderId: true, text: true },
    });
    if (!m || !(await findPair(reporterId, m.senderId))) throw gone();
    return { reportedUserId: m.senderId, excerpt: m.text };
  }
  // A note's id is its author's: a current buddy, checked before the note so the answer never says whether one exists.
  if (targetId === reporterId || !(await findPair(reporterId, targetId))) throw gone();
  if (type === 'STATUS_NOTE') {
    const note = await prisma.statusNote.findFirst({ where: { authorId: targetId, expiresAt: { gt: now } }, select: { text: true } });
    if (!note) throw gone();
    return { reportedUserId: targetId, excerpt: note.text };
  }
  // A camp note is live by the same gate as "Who's here" (expiry, and its author's check-in clears it).
  const circle = await loadCircle(reporterId, now).catch((err: unknown) => {
    // The reporter's own account went mid-call.
    throw err instanceof BuddyError ? gone() : err;
  });
  const note = await prisma.campNote.findUnique({ where: { authorId: targetId }, select: { authorId: true, text: true, createdAt: true, expiresAt: true } });
  if (!circle.members.has(targetId) || !note || !noteIsLive(note, circle, now)) throw gone();
  return { reportedUserId: targetId, excerpt: note.text };
}

/**
 * Files (or refiles) a report. The type and reason are checked before the limiter (invalid_report), and so is the id's
 * shape (report_target_gone), so a malformed report never spends the bucket. A racing account deletion is a coded
 * refusal, never a 500.
 */
export async function fileReport(reporterId: string, body: unknown, now: Date): Promise<void> {
  const b = (body && typeof body === 'object' && !Array.isArray(body) ? body : {}) as Record<string, unknown>;
  const targetType = own(TARGETS, b.targetType);
  const reason = own(REASONS, b.reason);
  if (!targetType || !reason) throw new BuddyError('invalid_report');
  if (typeof b.targetId !== 'string' || !UUID_RE.test(b.targetId)) throw gone();
  const targetId = b.targetId;
  await limitOrThrow(RATE_LIMITS.report, reporterId);
  const { reportedUserId, excerpt } = await resolveTarget(reporterId, targetType, targetId, now);
  const write = () => prisma.report.upsert({
    where: { reporterId_targetType_targetId: { reporterId, targetType, targetId } },
    create: { reporterId, reportedUserId, targetType, targetId, reason, excerpt, createdAt: now },
    update: { reportedUserId, reason, excerpt, createdAt: now },
    select: { id: true },
  });
  try {
    try {
      await write();
    } catch (err) {
      // Two first reports at once: the loser's insert hits the unique row the winner just made; update it instead.
      if (!isUniqueViolation(err)) throw err;
      await write();
    }
  } catch (err) {
    if (isGoneRace(err)) throw gone();
    throw err;
  }
}
