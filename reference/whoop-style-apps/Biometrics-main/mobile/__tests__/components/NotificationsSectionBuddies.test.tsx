import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NotificationsSection } from '../../src/components/notifications-section';
import { enablePush, getPushState } from '../../src/lib/pushRegistration';
import { fetchNotificationSettings, saveNotificationSettings } from '../../src/api/notifications';
import { fetchBuddyPage } from '../../src/api/buddies';
import { refreshBuddies, resetBuddies } from '../../src/lib/buddiesStore';

jest.mock('../../src/lib/pushRegistration');
jest.mock('../../src/api/notifications');
jest.mock('../../src/api/buddies', () => ({ fetchBuddyPage: jest.fn() }));

const ALL_ON = { recapPushEnabled: true, notifyBuddyStickers: true, notifyBuddyRequests: true, notifyBuddyBadges: true };
const PAGE = { buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 };

beforeEach(() => {
  jest.clearAllMocks();
  resetBuddies();
  (getPushState as jest.Mock).mockResolvedValue({ status: 'on' });
  (enablePush as jest.Mock).mockResolvedValue({ status: 'on' });
  (fetchNotificationSettings as jest.Mock).mockResolvedValue(ALL_ON);
  (saveNotificationSettings as jest.Mock).mockImplementation(async (patch: object) => ({ ...ALL_ON, ...patch }));
});

it('adds the three buddy switches when buddies exist, and saves each on its own', async () => {
  (fetchBuddyPage as jest.Mock).mockResolvedValue(PAGE);
  await refreshBuddies();
  render(<NotificationsSection />);
  expect(await screen.findByTestId('buddy-stickers-toggle')).toBeTruthy();
  expect(screen.getByTestId('buddy-requests-toggle')).toBeTruthy();
  await act(async () => fireEvent(screen.getByTestId('buddy-badges-toggle'), 'valueChange', false));
  expect(saveNotificationSettings).toHaveBeenCalledWith({ notifyBuddyBadges: false });
  await waitFor(() => expect(screen.getByTestId('buddy-badges-toggle').props.value).toBe(false));
  expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(true);
});

it('shows no buddy switches against a backend without buddies', async () => {
  (fetchBuddyPage as jest.Mock).mockResolvedValue(null);
  await refreshBuddies();
  render(<NotificationsSection />);
  expect(await screen.findByTestId('recap-ready-toggle')).toBeTruthy();
  expect(screen.queryByTestId('buddy-stickers-toggle')).toBeNull();
});

it('a double flip saves once; a failed save keeps the last saved value and explains', async () => {
  (fetchBuddyPage as jest.Mock).mockResolvedValue(PAGE);
  await refreshBuddies();
  let reject!: (e: unknown) => void;
  (saveNotificationSettings as jest.Mock).mockImplementation(() => new Promise((_, r) => { reject = r; }));
  render(<NotificationsSection />);
  const toggle = await screen.findByTestId('buddy-stickers-toggle');
  fireEvent(toggle, 'valueChange', false);
  fireEvent(toggle, 'valueChange', false);
  expect(saveNotificationSettings).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('buddy-stickers-toggle').props.disabled).toBe(true);
  await act(async () => reject(new Error('boom')));
  expect(screen.getByTestId('buddy-stickers-toggle').props.value).toBe(true);
  expect(screen.getByTestId('buddy-stickers-toggle').props.disabled).toBe(false);
  // Its own testID: a buddy save failure is not the recap's message.
  expect(screen.getByTestId('buddy-notify-message').props.children).toBe('Your notification setting could not be saved. Please try again.');
  expect(screen.queryByTestId('recap-ready-message')).toBeNull();
});

it('turning a buddy switch on registers this device first', async () => {
  (fetchBuddyPage as jest.Mock).mockResolvedValue(PAGE);
  await refreshBuddies();
  (fetchNotificationSettings as jest.Mock).mockResolvedValue({ ...ALL_ON, notifyBuddyRequests: false });
  render(<NotificationsSection />);
  const toggle = await screen.findByTestId('buddy-requests-toggle');
  expect(toggle.props.value).toBe(false);
  await act(async () => fireEvent(toggle, 'valueChange', true));
  expect(enablePush).toHaveBeenCalledTimes(1);
  expect(saveNotificationSettings).toHaveBeenCalledWith({ notifyBuddyRequests: true });
  await waitFor(() => expect(screen.getByTestId('buddy-requests-toggle').props.value).toBe(true));
});
