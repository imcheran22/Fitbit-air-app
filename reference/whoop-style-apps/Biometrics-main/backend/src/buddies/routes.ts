// Buddies endpoints (spec 2026-10-06 buddies). Specific /me/buddies/<word> paths are registered
// before /me/buddies/:buddyId. Logs carry ids and event names only.

import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { prisma } from '../db/client';
import { RATE_LIMITS } from '../lib/rateLimit';
import { listActivity, markActivitySeen } from './activity';
import { createCode, getActiveCode, redeemCode } from './codes';
import { BuddyError, UUID_RE, buddyRoute, limitOrThrow } from './errors';
import { getIdentity, isHandleAvailable, updateIdentity } from './handles';
import { checkDisplayName, checkHandle } from './identity';
import { listBuddies } from './list';
import { getProfileStats } from './profile';
import { blockBuddy, blockFromRequest, listBlocked, requireBuddyId, setMuted, unblock, unpair } from './relations';
import { acceptRequest, cancelRequest, declineRequest, listRequests, sendRequest } from './requests';
import { buddyScene } from './scene';
import { confirmMoodNotice, getSharing, parseSharingPatch, recordSharingConsent, updateSharing } from './sharing';
import { sendSticker } from './stickers';
import { buildBuddyWeek } from './view';

export const buddiesRouter = Router();

buddiesRouter.get('/me/buddies/me', requireAuth, buddyRoute(async (req, res) => {
  const [identity, stats] = await Promise.all([getIdentity(req.userId!), getProfileStats(req.userId!, new Date())]);
  if (!identity || !stats) throw new BuddyError('not_found');
  res.set('Cache-Control', 'private, no-store');
  res.json({ ...identity, ...stats });
}));

buddiesRouter.get('/me/handle/availability', requireAuth, buddyRoute(async (req, res) => {
  await limitOrThrow(RATE_LIMITS.handle, req.userId!);
  const check = checkHandle(req.query.handle);
  if (!check.ok) throw new BuddyError('invalid_handle', { problem: check.problem });
  const available = await isHandleAvailable(req.userId!, check.handle, new Date());
  res.set('Cache-Control', 'private, no-store');
  res.json({ handle: check.handle, available });
}));

buddiesRouter.put('/me/handle', requireAuth, buddyRoute(async (req, res) => {
  await limitOrThrow(RATE_LIMITS.handle, req.userId!);
  const body = (req.body ?? {}) as { handle?: unknown; displayName?: unknown };
  const patch: { handle?: string; displayName?: string } = {};
  if (body.handle !== undefined) {
    const check = checkHandle(body.handle);
    if (!check.ok) throw new BuddyError('invalid_handle', { problem: check.problem });
    patch.handle = check.handle;
  }
  if (body.displayName !== undefined) {
    const check = checkDisplayName(body.displayName);
    if (!check.ok) throw new BuddyError('invalid_display_name', { problem: check.problem });
    patch.displayName = check.displayName;
  }
  if (Object.keys(patch).length === 0) throw new BuddyError('setup_incomplete');
  const identity = await updateIdentity(req.userId!, patch, new Date());
  res.set('Cache-Control', 'private, no-store');
  res.json(identity);
}));

buddiesRouter.post('/me/buddies/mood-notice', requireAuth, buddyRoute(async (req, res) => {
  await confirmMoodNotice(req.userId!, new Date());
  res.json({ moodNoticeSeen: true });
}));

buddiesRouter.get('/me/buddies/sharing', requireAuth, buddyRoute(async (req, res) => {
  const sharing = await getSharing(req.userId!);
  if (!sharing) throw new BuddyError('not_found');
  res.set('Cache-Control', 'private, no-store');
  res.json(sharing);
}));

buddiesRouter.put('/me/buddies/sharing', requireAuth, buddyRoute(async (req, res) => {
  const patch = parseSharingPatch(req.body);
  if (!patch) throw new BuddyError('invalid_settings');
  res.json(await updateSharing(req.userId!, patch));
}));

buddiesRouter.post('/me/buddies/sharing/consent', requireAuth, buddyRoute(async (req, res) => {
  res.json(await recordSharingConsent(req.userId!, (req.body as { version?: unknown } | undefined)?.version, new Date()));
}));

buddiesRouter.get('/me/buddies/code', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json((await getActiveCode(req.userId!, new Date())) ?? { code: null });
}));

buddiesRouter.post('/me/buddies/code', requireAuth, buddyRoute(async (req, res) => {
  const made = await createCode(req.userId!, new Date());
  res.set('Cache-Control', 'private, no-store');
  res.json(made);
}));

buddiesRouter.post('/me/buddies/code/redeem', requireAuth, buddyRoute(async (req, res) => {
  res.json(await redeemCode(req.userId!, (req.body as { code?: unknown } | undefined)?.code, new Date()));
}));

buddiesRouter.get('/me/buddies/requests', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listRequests(req.userId!, new Date()));
}));

buddiesRouter.post('/me/buddies/requests', requireAuth, buddyRoute(async (req, res) => {
  await sendRequest(req.userId!, (req.body as { handle?: unknown } | undefined)?.handle, new Date());
  res.json({ ok: true });
}));

buddiesRouter.post('/me/buddies/requests/:id/accept', requireAuth, buddyRoute(async (req, res) => {
  const { buddyId } = await acceptRequest(req.userId!, String(req.params.id), new Date());
  res.json({ ok: true, buddyId });
}));

buddiesRouter.post('/me/buddies/requests/:id/decline', requireAuth, buddyRoute(async (req, res) => {
  await declineRequest(req.userId!, String(req.params.id), new Date());
  res.json({ ok: true });
}));

buddiesRouter.post('/me/buddies/requests/:id/cancel', requireAuth, buddyRoute(async (req, res) => {
  await cancelRequest(req.userId!, String(req.params.id), new Date());
  res.json({ ok: true });
}));

buddiesRouter.post('/me/buddies/requests/:id/block', requireAuth, buddyRoute(async (req, res) => {
  await blockFromRequest(req.userId!, String(req.params.id), new Date());
  res.json({ ok: true });
}));

buddiesRouter.get('/me/blocks', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json({ blocked: await listBlocked(req.userId!) });
}));

buddiesRouter.delete('/me/blocks/:userId', requireAuth, buddyRoute(async (req, res) => {
  const id = String(req.params.userId);
  if (UUID_RE.test(id)) await unblock(req.userId!, id);
  res.status(204).send();
}));

/** The buddy list. A bare 404 here is how the app knows the backend predates buddies. */
buddiesRouter.get('/me/buddies', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listBuddies(req.userId!, req.query.cursor, new Date()));
}));

/** Activity: stickers, requests, pairings and buddies' badges, built at read time. */
buddiesRouter.get('/me/buddies/activity', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listActivity(req.userId!, req.query.cursor, new Date()));
}));

buddiesRouter.post('/me/buddies/activity/seen', requireAuth, buddyRoute(async (req, res) => {
  res.json({ seen: await markActivitySeen(req.userId!, new Date()) });
}));

/** Home's scene: up to two buddies by latest check-in, the buddy count and incoming requests. */
buddiesRouter.get('/me/buddies/scene', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await buddyScene(req.userId!, new Date()));
}));

// ---- /me/buddies/:buddyId routes: keep these LAST. Any new GET /me/buddies/<word> route goes above,
// ---- or this param route captures it and answers not_buddies.

buddiesRouter.get('/me/buddies/:buddyId', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  const week = await buildBuddyWeek(req.userId!, buddyId, new Date());
  // Opening the week is seeing what they sent: clears the list's unseen-sticker flag.
  await prisma.sticker.updateMany({ where: { fromUserId: buddyId, toUserId: req.userId!, seenAt: null }, data: { seenAt: new Date() } });
  res.set('Cache-Control', 'private, no-store');
  res.json(week);
}));

buddiesRouter.delete('/me/buddies/:buddyId', requireAuth, buddyRoute(async (req, res) => {
  await unpair(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), new Date());
  res.status(204).send();
}));

buddiesRouter.post('/me/buddies/:buddyId/block', requireAuth, buddyRoute(async (req, res) => {
  await blockBuddy(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), new Date());
  res.json({ ok: true });
}));

buddiesRouter.put('/me/buddies/:buddyId/mute', requireAuth, buddyRoute(async (req, res) => {
  const raw = String(req.params.buddyId);
  const muted = (req.body as { muted?: unknown } | undefined)?.muted;
  // Unmuting never fails for a well-formed id (a stranger, oneself): nothing to undo is still a success.
  if (muted === false && UUID_RE.test(raw)) {
    res.json(await setMuted(req.userId!, raw, false));
    return;
  }
  const buddyId = requireBuddyId(raw, req.userId!);
  if (typeof muted !== 'boolean') throw new BuddyError('invalid_settings');
  res.json(await setMuted(req.userId!, buddyId, muted));
}));

buddiesRouter.post('/me/buddies/:buddyId/stickers', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  const { id } = await sendSticker(req.userId!, buddyId, (req.body as { kind?: unknown } | undefined)?.kind, new Date());
  res.status(201).json({ id });
}));
