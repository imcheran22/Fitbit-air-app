// The social sweep (S2, S3), on the existing hourly recap-sweep tick (sync/worker.ts): deletes camp notes and Chats
// notes past their expiry (reads already hide them; this removes the free text itself), week-highlight caches more than
// HIGHLIGHTS_RETENTION_WEEKS old (only the latest final week is ever served), and reports older than
// REPORT_RETENTION_DAYS. Returns counts only.

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { REPORT_RETENTION_DAYS } from '../chats/reports';
import { prisma } from '../db/client';
import { shiftDate } from '../scoring/dates';

export const HIGHLIGHTS_RETENTION_WEEKS = 4;
const DAY_MS = 24 * 60 * 60 * 1000;

export async function runSocialSweep(now: Date): Promise<{ notes: number; highlights: number; statusNotes: number; reports: number }> {
  const notes = await prisma.campNote.deleteMany({ where: { expiresAt: { lte: now } } });
  const statusNotes = await prisma.statusNote.deleteMany({ where: { expiresAt: { lte: now } } });
  const reports = await prisma.report.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - REPORT_RETENTION_DAYS * DAY_MS) } } });
  const cutoff = civilDateToUtcMidnight(shiftDate(now.toISOString().slice(0, 10), -7 * HIGHLIGHTS_RETENTION_WEEKS));
  const highlights = await prisma.weeklyHighlights.deleteMany({ where: { weekStart: { lt: cutoff } } });
  return { notes: notes.count, highlights: highlights.count, statusNotes: statusNotes.count, reports: reports.count };
}
