import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import { prisma } from '../db/client';
import { catchUpState, enqueueCatchUp } from './catchUp';

// The app's view of syncing with Google Health: ask for a catch-up, and poll
// whether it is still running and when the last one finished.
export const syncRouter = Router();

// A request this soon after a finished sync does not queue another: repeated
// taps must not hammer Google.
const RECENT_SYNC_MS = 30_000;

async function connectionFor(userId: string) {
  return prisma.healthConnection.findUnique({ where: { userId }, select: { status: true, lastSyncedAt: true } });
}

syncRouter.post('/me/sync', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const conn = await connectionFor(userId);
  if (!conn) {
    res.status(409).json({ error: 'not_connected' });
    return;
  }
  const lastSyncedAt = conn.lastSyncedAt?.toISOString() ?? null;
  const state = await catchUpState(userId, conn.lastSyncedAt);
  if (state !== 'syncing' && conn.lastSyncedAt && Date.now() - conn.lastSyncedAt.getTime() < RECENT_SYNC_MS) {
    res.json({ state: 'idle', lastSyncedAt });
    return;
  }
  await enqueueCatchUp(userId);
  res.status(202).json({ state: 'syncing', lastSyncedAt });
});

syncRouter.get('/me/sync', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const conn = await connectionFor(userId);
  res.json({
    state: conn ? await catchUpState(userId, conn.lastSyncedAt) : 'idle',
    lastSyncedAt: conn?.lastSyncedAt?.toISOString() ?? null,
    connection: conn?.status ?? 'NOT_CONNECTED',
  });
});
