import { apiFetch } from '../../src/api/client';
import {
  clearReaction, clearStatusNote, fetchChatSettings, fetchChats, fetchNotes, fetchThread, fileReport, markChatRead, pingPresence,
  saveChatSettings, saveStatusNote, sendCard, sendStickerMessage, sendText, setReaction, unsendMessage,
} from '../../src/api/chats';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const bare404 = () => Object.assign(new Error('nope'), { status: 404 });

beforeEach(() => api.mockReset());

it('reads the inbox, a thread, notes and settings; a bare 404 (an older server) is null, anything else throws', async () => {
  for (const [call, path] of [
    [() => fetchChats(), '/me/chats'],
    [() => fetchChats('c/1'), '/me/chats?cursor=c%2F1'],
    [() => fetchThread('b/1'), '/me/chats/b%2F1/messages'],
    [() => fetchThread('b1', 'x y'), '/me/chats/b1/messages?before=x%20y'],
    [() => fetchNotes(), '/me/notes'],
    [() => fetchChatSettings(), '/me/chats/settings'],
  ] as const) {
    api.mockResolvedValueOnce({ ok: 1 });
    expect(await call()).toEqual({ ok: 1 });
    expect(api).toHaveBeenLastCalledWith(path);
    api.mockRejectedValueOnce(bare404());
    expect(await call()).toBeNull();
    api.mockRejectedValueOnce(Object.assign(new Error('forbidden'), { status: 403, code: 'not_buddies' }));
    await expect(call()).rejects.toThrow('forbidden');
  }
});

it('a coded 404 is a real answer from a chats server, never "older server"', async () => {
  api.mockRejectedValueOnce(Object.assign(new Error('gone'), { status: 404, code: 'message_gone' }));
  await expect(fetchThread('b1')).rejects.toThrow('gone');
});

it('sends text, stickers and cards with JSON bodies, a reply id only when there is one', async () => {
  api.mockResolvedValue({ message: {} });
  await sendText('b1', 'hi');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'TEXT', text: 'hi' }) });
  await sendText('b1', 'oh no', 'm1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'TEXT', text: 'oh no', replyToMessageId: 'm1' }) });
  await sendStickerMessage('b1', 'CHEER');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'STICKER', sticker: 'CHEER' }) });
  await sendCard('b1', { type: 'story_frame', at: '2026-10-07T16:00:00.000Z' }, 'same');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', {
    method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'CARD', card: { type: 'story_frame', at: '2026-10-07T16:00:00.000Z' }, text: 'same' }),
  });
  await sendCard('b1', { type: 'my_checkin' });
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'CARD', card: { type: 'my_checkin' } }) });
  await sendCard('b1', { type: 'my_checkin' }, ' \n ');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'CARD', card: { type: 'my_checkin' } }) });
});

it('unsends, reacts, reads, shares notes, reports and saves settings on the right paths', async () => {
  api.mockResolvedValue(undefined);
  await unsendMessage('b1', 'm/1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages/m%2F1', expect.objectContaining({ method: 'DELETE' }));
  await setReaction('b1', 'm1', 'HEART');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages/m1/reaction', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ kind: 'HEART' }) });
  await clearReaction('b1', 'm1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/messages/m1/reaction', expect.objectContaining({ method: 'DELETE' }));
  await markChatRead('b1');
  expect(api).toHaveBeenLastCalledWith('/me/chats/b1/read', expect.objectContaining({ method: 'POST' }));
  await saveStatusNote('early night');
  expect(api).toHaveBeenLastCalledWith('/me/notes', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ text: 'early night' }) });
  await clearStatusNote();
  expect(api).toHaveBeenLastCalledWith('/me/notes', expect.objectContaining({ method: 'DELETE' }));
  await fileReport('message', 'm1', 'spam');
  expect(api).toHaveBeenLastCalledWith('/me/reports', { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ targetType: 'message', targetId: 'm1', reason: 'spam' }) });
  await saveChatSettings({ readReceipts: false });
  expect(api).toHaveBeenLastCalledWith('/me/chats/settings', { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ readReceipts: false }) });
});

it('pings presence and never throws', async () => {
  api.mockResolvedValueOnce(undefined);
  await pingPresence();
  expect(api).toHaveBeenLastCalledWith('/me/presence', expect.objectContaining({ method: 'POST' }));
  api.mockRejectedValueOnce(new Error('offline'));
  await expect(pingPresence()).resolves.toBeUndefined();
});
