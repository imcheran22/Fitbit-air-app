// Recap endpoints (spec 2026-10-04 §2). Not gated on the coach. GET is a pure read; the app marks
// a recap opened with its own POST once the recap is really on screen.

import { Router } from 'express';
import { AuthedRequest, requireAuth } from '../auth/middleware';
import { UUID_RE } from '../coach/push';
import { prisma } from '../db/client';
import { toRecapDTO, toRecapSummaryDTO } from './dto';

export const DEFAULT_RECAP_LIMIT = 20;
export const MAX_RECAP_LIMIT = 50;

function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return DEFAULT_RECAP_LIMIT;
  if (typeof raw !== 'string' || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return n >= 1 && n <= MAX_RECAP_LIMIT ? n : null;
}

/** The user's own BUILT recap; another user's id, a SKIPPED row or a malformed id is "not found". */
function ownBuilt(userId: string, id: string | undefined) {
  if (!id || !UUID_RE.test(id)) return Promise.resolve(null);
  return prisma.recap.findFirst({ where: { id, userId, status: 'BUILT' } });
}

export const recapRouter = Router();

recapRouter.get('/me/recaps', requireAuth, async (req: AuthedRequest, res) => {
  const kind = req.query.kind;
  if (kind !== undefined && kind !== 'WEEK' && kind !== 'MONTH') {
    res.status(400).json({ error: 'invalid_query' });
    return;
  }
  const limit = parseLimit(req.query.limit);
  if (limit === null) {
    res.status(400).json({ error: 'invalid_query' });
    return;
  }
  const rows = await prisma.recap.findMany({
    where: { userId: req.userId!, status: 'BUILT', ...(kind ? { kind } : {}) },
    // Newest period first; on a shared end date (a month ending on a Sunday) the month comes first.
    orderBy: [{ periodEnd: 'desc' }, { kind: 'desc' }],
    take: limit,
  });
  res.set('Cache-Control', 'private, no-store');
  res.json({ recaps: rows.map(toRecapSummaryDTO) });
});

recapRouter.get('/me/recaps/:id', requireAuth, async (req: AuthedRequest, res) => {
  const row = await ownBuilt(req.userId!, req.params.id as string);
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  res.set('Cache-Control', 'private, no-store');
  res.json(toRecapDTO(row));
});

recapRouter.post('/me/recaps/:id/opened', requireAuth, async (req: AuthedRequest, res) => {
  const row = await ownBuilt(req.userId!, req.params.id as string);
  if (!row) {
    res.status(404).json({ error: 'not_found' });
    return;
  }
  await prisma.recap.updateMany({ where: { id: row.id, openedAt: null }, data: { openedAt: new Date() } });
  res.status(204).end();
});
