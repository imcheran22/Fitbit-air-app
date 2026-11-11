import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { localCivilDate, civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import { getLiveConfig } from './configs';
import { isCivilDate, shiftDate } from './dates';
import { loadScoreDetail } from './detail';
import { BASELINE_METRICS, ScoreType, toBaselineDTOs, toDailyScoreDTO } from './dto';

export const scoresRouter = Router();

export const DEFAULT_SCORE_DAYS = 30;
export const MAX_SCORE_DAYS = 400;

function parseType(raw: unknown): ScoreType | null {
  return raw === 'RECOVERY' || raw === 'SLEEP' ? raw : null;
}

/** Newest first, over the last `days` local days (default 30, capped at 400). */
scoresRouter.get('/me/scores', requireAuth, async (req: AuthedRequest, res) => {
  let days = DEFAULT_SCORE_DAYS;
  if (req.query.days !== undefined) {
    days = Number(req.query.days);
    if (!Number.isInteger(days) || days < 1) {
      res.status(400).json({ error: 'days must be a positive integer' });
      return;
    }
    days = Math.min(days, MAX_SCORE_DAYS);
  }
  // Optional filter: absent means both score types.
  const type = req.query.type === undefined ? undefined : parseType(req.query.type);
  if (type === null) {
    res.status(400).json({ error: 'type must be RECOVERY or SLEEP' });
    return;
  }

  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { timezone: true } });
  // "Today" is the user's local day, so the window lines up with the civil
  // dates the scores are keyed on.
  const today = localCivilDate(new Date(), user?.timezone ?? 'UTC');
  const since = civilDateToUtcMidnight(shiftDate(today, -(days - 1)));

  const rows = await prisma.dailyScore.findMany({
    where: { userId: req.userId!, ...(type ? { type } : {}), date: { gte: since } },
    // Same-day rows: RECOVERY before SLEEP (enum declaration order).
    orderBy: [{ date: 'desc' }, { type: 'asc' }],
  });
  const snapshots = await prisma.baselineSnapshot.findMany({
    where: { userId: req.userId!, date: { gte: since }, metric: { in: BASELINE_METRICS } },
  });

  res.json({
    scores: rows.map((row) =>
      toDailyScoreDTO(
        row,
        snapshots.filter((s) => s.date.getTime() === row.date.getTime()),
      ),
    ),
    bands: getLiveConfig().scoreBands,
  });
});

scoresRouter.get('/me/scores/:date', requireAuth, async (req: AuthedRequest, res) => {
  const date = req.params.date;
  if (!isCivilDate(date)) {
    res.status(400).json({ error: 'date must be a valid YYYY-MM-DD' });
    return;
  }
  const type = req.query.type === undefined ? 'RECOVERY' : parseType(req.query.type);
  if (!type) {
    res.status(400).json({ error: 'type must be RECOVERY or SLEEP' });
    return;
  }

  const { row, snapshots, previous } = await loadScoreDetail(req.userId!, date, type);
  if (!row) {
    res.status(404).json({ error: `No ${type} score for ${date}` });
    return;
  }
  res.json({ score: toDailyScoreDTO(row, snapshots), baselines: toBaselineDTOs(snapshots, type), previous, bands: getLiveConfig().scoreBands });
});
