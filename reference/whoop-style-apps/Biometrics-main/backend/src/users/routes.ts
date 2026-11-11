import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { isValidTimeZone } from '../biometrics/civilDate';
import { recomputeAllSleepRollups } from '../biometrics/repository';
import { enqueueScoreCompute } from '../scoring/queue';
import { prisma } from '../db/client';
import { deleteUserAccount } from './deletion';
import { NOTIFICATION_SELECT, parseNotificationSettingsPatch } from './notifications';

export const usersRouter = Router();

/**
 * The client reports its IANA zone (Intl.DateTimeFormat().resolvedOptions()
 * .timeZone) at connect time, again on launch when it changes, and via a
 * Settings override. The zone decides which local civil date each sleep
 * session's end instant belongs to, so a change re-derives the SLEEP rollups.
 */
usersRouter.put('/me/timezone', requireAuth, async (req: AuthedRequest, res) => {
  const timezone: unknown = req.body?.timezone;
  if (!isValidTimeZone(timezone)) {
    res.status(400).json({ error: 'timezone must be a valid IANA time zone name, e.g. "America/Los_Angeles"' });
    return;
  }

  const userId = req.userId!;
  const result = await prisma.user.updateMany({ where: { id: userId }, data: { timezone } });
  if (result.count === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Rebuilt even when the zone is unchanged: rollups are derived so this is
  // cheap and idempotent, and it means a request that saved the zone but
  // failed mid-recompute is repaired by simply retrying the same PUT, instead
  // of the retry being a no-op that leaves rollups keyed under the old zone.
  const rekeyed = await recomputeAllSleepRollups(userId);

  // Scores are derived from the rollups that just moved, so they are stale the
  // moment the zone changes. Enqueued, not computed inline: a long history must
  // not make this request slow, and a failure here must not fail a time zone
  // change the user already made (the nightly sweep is the backstop).
  for (const date of rekeyed) {
    await enqueueScoreCompute(userId, date).catch((err) =>
      console.error(`Failed to enqueue a score recompute for ${date} after a time zone change`, err),
    );
  }

  res.json({ timezone });
});

usersRouter.get('/me/notifications', requireAuth, async (req: AuthedRequest, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: NOTIFICATION_SELECT });
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json(user);
});

/** Partial: any of NOTIFICATION_KEYS with boolean values. Anything else is 400 invalid_settings. */
usersRouter.put('/me/notifications', requireAuth, async (req: AuthedRequest, res) => {
  const patch = parseNotificationSettingsPatch(req.body);
  if (!patch) {
    res.status(400).json({ error: 'invalid_settings' });
    return;
  }
  const result = await prisma.user.updateMany({ where: { id: req.userId! }, data: patch });
  if (result.count === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.userId! }, select: NOTIFICATION_SELECT });
  res.json(user);
});

/**
 * In-app account deletion (App Store requirement). Irreversible, so the body
 * must be exactly { "confirm": "DELETE" }: a bare DELETE (a retried request, a
 * misrouted client) deletes nothing. Everything the user owns goes, and their
 * tokens stop working (see requireAuth and deleteUserAccount).
 */
usersRouter.delete('/me', requireAuth, async (req: AuthedRequest, res) => {
  if (req.body?.confirm !== 'DELETE') {
    res.status(400).json({ error: 'Send {"confirm":"DELETE"} to delete your account' });
    return;
  }
  await deleteUserAccount(req.userId!);
  res.status(204).send();
});
