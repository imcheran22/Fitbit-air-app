// Chats routes (spec 2026-10-07 social §8.5). Every /me/chats/:buddyId… route answers not_buddies (403) for a
// non-buddy, a malformed id, oneself or across a block — never a bare 404 (a bare 404 means an older server). GETs are
// never cached. Logs carry ids and event names only; no body is ever logged.

import { Router } from 'express';
import { requireAuth } from '../auth/middleware';
import { BuddyError, buddyRoute } from '../buddies/errors';
import { requireBuddyId } from '../buddies/relations';
import { listChats } from './inbox';
import { clearReaction, listThread, markRead, sendMessage, setReaction, unsendMessage } from './messages';
import { clearStatusNote, getNotes, shareStatusNote } from './notes';
import { getChatSettings, parseChatSettingsPatch, touchPresence, updateChatSettings } from './presence';
import { fileReport } from './reports';

export const chatsRouter = Router();

chatsRouter.post('/me/chats/:buddyId/messages', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  res.status(201).json({ message: await sendMessage(req.userId!, buddyId, req.body, new Date()) });
}));

chatsRouter.get('/me/chats/settings', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getChatSettings(req.userId!));
}));

chatsRouter.put('/me/chats/settings', requireAuth, buddyRoute(async (req, res) => {
  const patch = parseChatSettingsPatch(req.body);
  if (!patch) throw new BuddyError('invalid_settings');
  res.set('Cache-Control', 'private, no-store');
  res.json(await updateChatSettings(req.userId!, patch));
}));

// Never rate-limited: at most one write a minute per user (touchPresence).
chatsRouter.post('/me/presence', requireAuth, buddyRoute(async (req, res) => {
  await touchPresence(req.userId!, new Date());
  res.status(204).end();
}));

chatsRouter.get('/me/chats/:buddyId/messages', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  res.set('Cache-Control', 'private, no-store');
  res.json(await listThread(req.userId!, buddyId, req.query.before, new Date()));
}));

chatsRouter.post('/me/chats/:buddyId/read', requireAuth, buddyRoute(async (req, res) => {
  await markRead(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), new Date());
  res.status(204).end();
}));

// Never rate-limited (a delete never fails closed).
chatsRouter.delete('/me/chats/:buddyId/messages/:messageId', requireAuth, buddyRoute(async (req, res) => {
  await unsendMessage(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), String(req.params.messageId), new Date());
  res.status(204).end();
}));

chatsRouter.put('/me/chats/:buddyId/messages/:messageId/reaction', requireAuth, buddyRoute(async (req, res) => {
  const buddyId = requireBuddyId(String(req.params.buddyId), req.userId!);
  res.json(await setReaction(req.userId!, buddyId, String(req.params.messageId), (req.body as { kind?: unknown } | undefined)?.kind, new Date()));
}));

// Never rate-limited (a delete never fails closed).
chatsRouter.delete('/me/chats/:buddyId/messages/:messageId/reaction', requireAuth, buddyRoute(async (req, res) => {
  await clearReaction(req.userId!, requireBuddyId(String(req.params.buddyId), req.userId!), String(req.params.messageId));
  res.status(204).end();
}));

// The inbox: no buddy in the path, so there is no one to refuse; the list itself holds current buddies only.
chatsRouter.get('/me/chats', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await listChats(req.userId!, req.query.cursor, new Date()));
}));

// Chats notes: my own and my current buddies' only, so there is no buddy in the path to refuse.
chatsRouter.get('/me/notes', requireAuth, buddyRoute(async (req, res) => {
  res.set('Cache-Control', 'private, no-store');
  res.json(await getNotes(req.userId!, new Date()));
}));

chatsRouter.put('/me/notes', requireAuth, buddyRoute(async (req, res) => {
  res.json({ note: await shareStatusNote(req.userId!, (req.body as { text?: unknown } | undefined)?.text, new Date()) });
}));

// Never rate-limited: removing your own note must work even while the limiter is down.
chatsRouter.delete('/me/notes', requireAuth, buddyRoute(async (req, res) => {
  await clearStatusNote(req.userId!);
  res.status(204).end();
}));

// Reports: write-only (no route reads them) and never told to the reported person. The target names no buddy in the
// path, so anything the reporter cannot see now is report_target_gone (the same answer for a stranger's item).
chatsRouter.post('/me/reports', requireAuth, buddyRoute(async (req, res) => {
  await fileReport(req.userId!, req.body, new Date());
  res.status(204).end();
}));
