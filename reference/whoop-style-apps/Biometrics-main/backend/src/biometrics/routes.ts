import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { getBiometricsForUser } from './repository';
import { getActivityForUser, getSleepForUser, isCivilDate, parseActivityRange } from './activity';
import { getSleepNight } from './sleepNight';
import { getSleepRegularity, parseRegularityDays } from './regularity';
import { localCivilDateOrUtc } from './civilDate';
import { getSleepGoal, parseSleepGoalPatch, updateSleepGoal } from '../users/goals';
import { enqueueScoreCompute } from '../scoring/queue';
import { prisma } from '../db/client';

export const biometricsRouter = Router();

biometricsRouter.get('/me/biometrics', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await getBiometricsForUser(req.userId!));
});

/**
 * Daily steps for the activity heat map over a bounded civil-date range
 * (?from=YYYY-MM-DD&to=YYYY-MM-DD, both inclusive). Bounded because a year of
 * history is too much to pull through the unbounded /me/biometrics.
 */
biometricsRouter.get('/me/activity', requireAuth, async (req: AuthedRequest, res) => {
  const range = parseActivityRange(req.query.from, req.query.to);
  if ('error' in range) {
    res.status(400).json({ error: range.error });
    return;
  }
  res.json(await getActivityForUser(req.userId!, range));
});

/**
 * Nightly sleep for the Sleep page of the activity heat map, over the same
 * bounded civil-date range as /me/activity: minutes asleep, time in bed,
 * bedtime and wake time, and that day's Sleep Score.
 */
biometricsRouter.get('/me/sleep', requireAuth, async (req: AuthedRequest, res) => {
  const range = parseActivityRange(req.query.from, req.query.to);
  if ('error' in range) {
    res.status(400).json({ error: range.error });
    return;
  }
  res.json(await getSleepForUser(req.userId!, range));
});

/**
 * One night in full for the night screen (:date is the night-END civil date):
 * the main session's times, stage timeline and totals, the naps, that day's
 * Sleep Score and the usual main-session minutes asleep. 404 when no session ends that date.
 */
biometricsRouter.get('/me/sleep/night/:date', requireAuth, async (req: AuthedRequest, res) => {
  const { date } = req.params;
  if (!isCivilDate(date)) {
    res.status(400).json({ error: 'date must be a YYYY-MM-DD date' });
    return;
  }
  const night = await getSleepNight(req.userId!, date);
  if (!night) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.json(night);
});

/**
 * Bedtime and wake-time regularity over the last 7 or 30 nights (?days=7|30),
 * for the Sleep screen's regularity card.
 */
biometricsRouter.get('/me/sleep/regularity', requireAuth, async (req: AuthedRequest, res) => {
  const days = parseRegularityDays(req.query.days);
  if (!days) {
    res.status(400).json({ error: 'days must be 7 or 30' });
    return;
  }
  res.json(await getSleepRegularity(req.userId!, days));
});

biometricsRouter.get('/me/sleep/goal', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await getSleepGoal(req.userId!));
});

/**
 * Any subset of { sleepGoalMinutes, bedtimeGoal, wakeGoal }; returns the saved
 * goal. The sleep goal is a scoring input, so changing it rescores the user's
 * local today (only today: past scores keep the goal they were computed with).
 * Bedtime and wake goals are display/reminder settings and never rescore.
 */
biometricsRouter.put('/me/sleep/goal', requireAuth, async (req: AuthedRequest, res) => {
  const patch = parseSleepGoalPatch(req.body);
  if (!patch) {
    res.status(400).json({ error: 'invalid_goal' });
    return;
  }

  const userId = req.userId!;
  const before = await prisma.user.findUnique({ where: { id: userId }, select: { sleepGoalMinutes: true, timezone: true } });
  const saved = before ? await updateSleepGoal(userId, patch) : null;
  if (!before || !saved) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  // Enqueued, not computed inline, and with no debounce: the user is waiting on
  // the score they just changed, unlike a burst of webhooks. A failed enqueue
  // must not fail a goal the user already saved, so it is only logged. Nothing
  // backs it up: the nightly sweep rescores a day only when its inputs were
  // synced after its score or the scoring version changed, and a goal change is
  // neither, so today keeps the old goal until its next recompute (e.g. the
  // next sync that touches today).
  if (patch.sleepGoalMinutes !== undefined && patch.sleepGoalMinutes !== before.sleepGoalMinutes) {
    const today = localCivilDateOrUtc(new Date(), before.timezone);
    await enqueueScoreCompute(userId, today, { delayMs: 0 }).catch((err) =>
      console.error(`Failed to enqueue a score recompute for ${today} after a sleep goal change`, err),
    );
  }

  res.json(saved);
});

/**
 * Lets the client tell "connected", "needs reconnecting" and "never connected"
 * apart. Without it a disconnected user's dashboard just freezes on stale data
 * with no explanation, and a returning connected user has no route past the
 * connect screen.
 */
biometricsRouter.get('/me/connection', requireAuth, async (req: AuthedRequest, res) => {
  const conn = await prisma.healthConnection.findUnique({
    where: { userId: req.userId! },
    select: { status: true, lastSyncedAt: true },
  });

  if (!conn) {
    res.json({ status: 'NOT_CONNECTED', lastSyncedAt: null });
    return;
  }

  res.json({
    status: conn.status,
    lastSyncedAt: conn.lastSyncedAt ? conn.lastSyncedAt.toISOString() : null,
  });
});
