import { apiFetch } from '../../src/api/client';
import { fetchRecap, fetchRecaps, markRecapOpened } from '../../src/api/recaps';
import { fetchNotificationSettings, saveNotificationSettings } from '../../src/api/notifications';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;
// The server defaults: everything on except message previews.
const DEFAULTS = {
  recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true,
  notifyDirectMessages: true, showMessagePreviews: false,
};

beforeEach(() => api.mockReset());

it('lists recaps with optional kind and limit, tolerating an unexpected body', async () => {
  api.mockResolvedValue({ recaps: [{ id: 'r1' }] });
  expect(await fetchRecaps()).toEqual([{ id: 'r1' }]);
  expect(api).toHaveBeenLastCalledWith('/me/recaps');
  await fetchRecaps({ kind: 'WEEK', limit: 1 });
  expect(api).toHaveBeenLastCalledWith('/me/recaps?kind=WEEK&limit=1');
  api.mockResolvedValue([]);
  expect(await fetchRecaps()).toEqual([]);
});

it('reads a 404 from an older server as no recaps, and rethrows any other failure', async () => {
  api.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchRecaps()).toEqual([]);
  api.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
  await expect(fetchRecaps()).rejects.toThrow('boom');
});

it('reads one recap and marks it opened with its own POST', async () => {
  api.mockResolvedValue({ id: 'r1' });
  await fetchRecap('r1');
  expect(api).toHaveBeenLastCalledWith('/me/recaps/r1');
  api.mockResolvedValue(undefined);
  await markRecapOpened('r1');
  expect(api).toHaveBeenLastCalledWith('/me/recaps/r1/opened', { method: 'POST' });
});

it('reads and saves the notification settings', async () => {
  api.mockResolvedValue({ recapPushEnabled: true });
  expect(await fetchNotificationSettings()).toEqual(DEFAULTS);
  expect(api).toHaveBeenLastCalledWith('/me/notifications');
  await saveNotificationSettings({ recapPushEnabled: false });
  expect(api).toHaveBeenLastCalledWith('/me/notifications', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ recapPushEnabled: false }),
  });
});

it('defaults the recap push to on when an older server has no settings (404), and rethrows any other failure', async () => {
  api.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchNotificationSettings()).toEqual(DEFAULTS);
  api.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
  await expect(fetchNotificationSettings()).rejects.toThrow('boom');
});

it('defaults the recap push to on when the body has no boolean for it', async () => {
  for (const body of [undefined, {}, { recapPushEnabled: 'false' }, { recapPushEnabled: null }]) {
    api.mockResolvedValue(body);
    expect(await fetchNotificationSettings()).toEqual(DEFAULTS);
  }
  api.mockResolvedValue({ recapPushEnabled: false, extra: 1 });
  expect(await fetchNotificationSettings()).toEqual({ ...DEFAULTS, recapPushEnabled: false });
  api.mockResolvedValue({ ...DEFAULTS, notifyBuddyRequests: false, notifyBuddyBadges: 'no' });
  expect(await fetchNotificationSettings()).toEqual({ ...DEFAULTS, notifyBuddyRequests: false });
});

it('fills a key a save response does not carry with the server default', async () => {
  api.mockResolvedValue({ recapPushEnabled: false });
  expect(await saveNotificationSettings({ recapPushEnabled: false })).toEqual({ ...DEFAULTS, recapPushEnabled: false });
});
