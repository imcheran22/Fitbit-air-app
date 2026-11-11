// "Share with buddies" on a recap (spec 2026-10-07 social §4.2): an explicit per-recap action by its owner. The
// story frame built from it shows the headline line as the owner previewed it (it may hold their own numbers — the
// explicit share is consent for that line), period and coach — never the stats JSON (plan ruling). A recap without
// a line has nothing to show, so it cannot be shared. The client sends the line it previewed; if the recap's line
// has changed since (e.g. a late rebuild), the share is refused rather than publishing a line the user never saw.

import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { BuddyError, UUID_RE } from '../buddies/errors';
import { todayFor } from './checkins';

export async function shareRecap(userId: string, recapId: unknown, previewed: unknown, now: Date): Promise<{ shared: true }> {
  if (typeof recapId !== 'string' || !UUID_RE.test(recapId)) throw new BuddyError('recap_not_found');
  if (typeof previewed !== 'string' || !previewed.trim()) throw new BuddyError('recap_not_found');
  const recap = await prisma.recap.findFirst({ where: { id: recapId, userId, status: 'BUILT' }, select: { id: true, line: true } });
  const line = recap?.line?.trim();
  // Consent covers only the previewed text: a mismatch stores nothing.
  if (!recap || !line || line !== previewed.trim()) throw new BuddyError('recap_not_found');
  const { today } = await todayFor(userId, now);
  // The line is snapshotted: data deletion or a late rebuild may rewrite Recap.line (possibly with numbers) after
  // the share, and buddies must only ever see what was previewed. A re-share keeps the first snapshot.
  await prisma.recapShare.createMany({
    data: [{ sharerId: userId, recapId, line, localDate: civilDateToUtcMidnight(today), createdAt: now }],
    skipDuplicates: true,
  });
  return { shared: true };
}

export async function unshareRecap(userId: string, recapId: string): Promise<void> {
  await prisma.recapShare.deleteMany({ where: { sharerId: userId, recapId } });
}

/** Whether this user currently shares this recap (the recap screen's button starts from it). */
export async function isRecapShared(userId: string, recapId: string): Promise<boolean> {
  if (!UUID_RE.test(recapId)) return false;
  return (await prisma.recapShare.count({ where: { sharerId: userId, recapId } })) > 0;
}
