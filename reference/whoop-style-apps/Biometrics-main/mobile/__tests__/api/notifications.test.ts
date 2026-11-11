import { apiFetch } from '../../src/api/client';
import { fetchNotificationSettings, saveNotificationSettings } from '../../src/api/notifications';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;

beforeEach(() => api.mockReset());

it('defaults a missing key to the server default: message pushes on, previews off', async () => {
  api.mockResolvedValueOnce({ recapPushEnabled: false });
  expect(await fetchNotificationSettings()).toEqual({
    recapPushEnabled: false, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true,
    notifyDirectMessages: true, showMessagePreviews: false,
  });
  api.mockResolvedValueOnce({ showMessagePreviews: true, notifyDirectMessages: false });
  expect(await fetchNotificationSettings()).toMatchObject({ notifyDirectMessages: false, showMessagePreviews: true });
});

it('an older server (404) reads as every default; a save keeps the defaults for keys it does not echo', async () => {
  api.mockRejectedValueOnce(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchNotificationSettings()).toMatchObject({ recapPushEnabled: true, notifyDirectMessages: true, showMessagePreviews: false });
  api.mockResolvedValueOnce({ recapPushEnabled: true });
  expect(await saveNotificationSettings({ recapPushEnabled: true })).toMatchObject({ notifyDirectMessages: true, showMessagePreviews: false });
});
