import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { NotificationsSection } from '../../src/components/notifications-section';
import { enablePush, getPushState } from '../../src/lib/pushRegistration';
import { fetchNotificationSettings, saveNotificationSettings } from '../../src/api/notifications';
import { fetchBuddyPage } from '../../src/api/buddies';
import { refreshBuddies, resetBuddies } from '../../src/lib/buddiesStore';

jest.mock('../../src/lib/pushRegistration');
jest.mock('../../src/api/notifications');
jest.mock('../../src/api/buddies', () => ({ fetchBuddyPage: jest.fn() }));
let mockChats: boolean | null = true;
jest.mock('../../src/lib/socialStore', () => ({ useChatsAvailable: () => mockChats }));

const SETTINGS = {
  recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true, notifyDirectMessages: true, showMessagePreviews: false,
};

beforeEach(async () => {
  jest.clearAllMocks();
  resetBuddies();
  mockChats = true;
  (getPushState as jest.Mock).mockResolvedValue({ status: 'on' });
  (enablePush as jest.Mock).mockResolvedValue({ status: 'on' });
  (fetchNotificationSettings as jest.Mock).mockResolvedValue(SETTINGS);
  (saveNotificationSettings as jest.Mock).mockImplementation(async (patch: object) => ({ ...SETTINGS, ...patch }));
  (fetchBuddyPage as jest.Mock).mockResolvedValue({ buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 });
  await refreshBuddies();
});

it('adds Messages (on) and Message previews (off) on a server with chats', async () => {
  render(<NotificationsSection />);
  expect((await screen.findByTestId('chat-messages-toggle')).props.value).toBe(true);
  expect(screen.getByTestId('chat-previews-toggle').props.value).toBe(false);
  await act(async () => fireEvent(screen.getByTestId('chat-previews-toggle'), 'valueChange', true));
  expect(saveNotificationSettings).toHaveBeenCalledWith({ showMessagePreviews: true });
});

it('Messages saves notifyDirectMessages and Message previews saves showMessagePreviews', async () => {
  render(<NotificationsSection />);
  const messages = await screen.findByTestId('chat-messages-toggle');
  await act(async () => fireEvent(messages, 'valueChange', false));
  expect(saveNotificationSettings).toHaveBeenLastCalledWith({ notifyDirectMessages: false });
  expect(screen.getByTestId('chat-messages-toggle').props.value).toBe(false);
  await act(async () => fireEvent(screen.getByTestId('chat-previews-toggle'), 'valueChange', true));
  expect(saveNotificationSettings).toHaveBeenLastCalledWith({ showMessagePreviews: true });
  expect(saveNotificationSettings).toHaveBeenCalledTimes(2);
});

it('leaves them out on a server without chats', async () => {
  mockChats = false;
  render(<NotificationsSection />);
  expect(await screen.findByTestId('buddy-stickers-toggle')).toBeTruthy();
  expect(screen.queryByTestId('chat-messages-toggle')).toBeNull();
});

// Final review: the two message rows wear a chat icon; the buddy rows keep the people icon.
it('the message rows wear a chat icon', async () => {
  render(<NotificationsSection />);
  await screen.findByTestId('chat-messages-toggle');
  const iconOf = (id: string) => screen.getByTestId(`${id}-row`).findAll((n) => typeof n.props.name === 'string' && /-outline$/.test(n.props.name))[0]?.props.name;
  expect([iconOf('chat-messages'), iconOf('chat-previews')]).toEqual(['chatbubble-outline', 'chatbubble-outline']);
  expect(iconOf('buddy-stickers')).toBe('people-outline');
});
