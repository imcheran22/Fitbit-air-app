import * as Notifications from 'expo-notifications';
import { WIND_DOWN_KIND, installNotificationHandler } from '../../src/notifications/handler';
import { getSocialState, refreshSocial } from '../../src/lib/socialStore';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getLastNotificationResponseAsync: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(),
}));
jest.mock('../../src/navigation/navigationRef', () => ({ navigationRef: { isReady: jest.fn(), navigate: jest.fn() } }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(() => Promise.resolve()), getSocialState: jest.fn() }));

const N = Notifications as jest.Mocked<typeof Notifications>;
const notification = (data: Record<string, unknown>) => ({ request: { content: { data } } }) as never;
const UUID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const handle = () => {
  installNotificationHandler();
  return N.setNotificationHandler.mock.calls[0]![0]!.handleNotification;
};

beforeEach(() => {
  jest.clearAllMocks();
  (getSocialState as jest.Mock).mockReturnValue({ status: 'ready' });
});

it('a buddy push in the foreground refreshes Social, and is still shown', async () => {
  const handler = handle();
  for (const kind of ['buddy_sticker', 'buddy_request', 'buddy_paired', 'buddy_badge']) {
    expect(await handler(notification({ kind, refId: UUID }))).toMatchObject({ shouldShowBanner: true });
  }
  expect(refreshSocial).toHaveBeenCalledTimes(4);
});

it('other pushes, a malformed buddy push, and a store that has not loaded (signed out) refresh nothing', async () => {
  const handler = handle();
  await handler(notification({ kind: WIND_DOWN_KIND }));
  await handler(notification({ kind: 'recap', recapId: UUID }));
  await handler(notification({ kind: 'buddy_sticker', refId: 'not-a-uuid' }));
  (getSocialState as jest.Mock).mockReturnValue({ status: 'idle' });
  expect(await handler(notification({ kind: 'buddy_sticker', refId: UUID }))).toMatchObject({ shouldShowBanner: true });
  expect(refreshSocial).not.toHaveBeenCalled();
});
