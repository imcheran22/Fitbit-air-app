// Badge endpoints (spec 2026-10-06 §5–6). The GET sets a new user's start date on the first load,
// evaluates inline at most once per 10 minutes (the marker holds the standings in between), then
// answers from the stored levels. Nothing is pushed.

import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../auth/middleware';
import { prisma } from '../db/client';
import { toAchievementsDTO } from './dto';
import { evaluateAchievements } from './evaluate';
import { evaluationVersion, markEvaluated, readEvaluated } from './marker';
import { ensureAchievementsStart } from './start';

export const MAX_CELEBRATED_IDS = 50;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const achievementsRouter = Router();

achievementsRouter.get('/me/achievements', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const now = new Date();
  const since = await ensureAchievementsStart(userId, now);
  if (!since) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  let standings = await readEvaluated(userId);
  if (!standings) {
    // Read the version before evaluating: a save during the evaluation makes this marker stale.
    const version = await evaluationVersion(userId);
    const results = (await evaluateAchievements(userId, now)) ?? [];
    standings = results.map(({ family, current, best }) => ({ family, current, best }));
    await markEvaluated(userId, version, standings);
  }
  const rows = await prisma.achievement.findMany({ where: { userId } });
  res.set('Cache-Control', 'private, no-store');
  res.json(toAchievementsDTO(since, standings, rows));
});

function parseIds(body: unknown): string[] | null {
  const ids = (body as { ids?: unknown } | null | undefined)?.ids;
  if (!Array.isArray(ids) || ids.length === 0 || ids.length > MAX_CELEBRATED_IDS) return null;
  return ids.every((id) => typeof id === 'string' && UUID_RE.test(id)) ? (ids as string[]) : null;
}

achievementsRouter.post('/me/achievements/celebrated', requireAuth, async (req: AuthedRequest, res) => {
  const ids = parseIds(req.body);
  if (!ids) {
    res.status(400).json({ error: 'invalid_ids' });
    return;
  }
  // Scoped to the caller's own rows: someone else's id, or an unknown one, changes nothing.
  const result = await prisma.achievement.updateMany({
    where: { id: { in: ids }, userId: req.userId!, celebratedAt: null },
    data: { celebratedAt: new Date() },
  });
  res.json({ celebrated: result.count });
});
