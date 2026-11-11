import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { NotificationsSection } from '../../src/components/notifications-section';
import { disablePush, enablePush, getPushState } from '../../src/lib/pushRegistration';
import { fetchNotificationSettings, saveNotificationSettings } from '../../src/api/notifications';

jest.mock('../../src/lib/pushRegistration');
jest.mock('../../src/api/notifications');

const state = getPushState as jest.Mock;
const enable = enablePush as jest.Mock;
const fetchSettings = fetchNotificationSettings as jest.Mock;
const save = saveNotificationSettings as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  state.mockResolvedValue({ status: 'off' });
  fetchSettings.mockResolvedValue({ recapPushEnabled: true });
  enable.mockResolvedValue({ status: 'on' });
  save.mockImplementation(async (patch: { recapPushEnabled: boolean }) => patch);
});

it('is hidden when this build or device cannot show notifications', async () => {
  state.mockResolvedValue({ status: 'unavailable', reason: 'no_project_id' });
  render(<NotificationsSection />);
  await waitFor(() => expect(state).toHaveBeenCalled());
  await waitFor(() => expect(fetchSettings).toHaveBeenCalled());
  // Let both reads settle, so a section that wrongly renders would be on screen by now.
  await act(async () => {});
  expect(screen.queryByTestId('recap-ready-row')).toBeNull();
});

it('shows the switch with no coach involved, off until this device is registered', async () => {
  render(<NotificationsSection />);
  expect(await screen.findByTestId('recap-ready-row')).toBeTruthy();
  expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(false);
});

it('turning it on registers this device first, then saves the setting', async () => {
  fetchSettings.mockResolvedValue({ recapPushEnabled: false });
  render(<NotificationsSection />);
  fireEvent(await screen.findByTestId('recap-ready-toggle'), 'valueChange', true);
  await waitFor(() => expect(save).toHaveBeenCalledWith({ recapPushEnabled: true }));
  expect(enable).toHaveBeenCalledTimes(1);
  expect(enable.mock.invocationCallOrder[0]).toBeLessThan(save.mock.invocationCallOrder[0]!);
  await waitFor(() => expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(true));
});

it('a denied permission saves nothing and explains; it is never re-prompted here', async () => {
  enable.mockResolvedValue({ status: 'denied' });
  render(<NotificationsSection />);
  fireEvent(await screen.findByTestId('recap-ready-toggle'), 'valueChange', true);
  expect(await screen.findByText('Notifications are blocked — enable them in system settings')).toBeTruthy();
  expect(save).not.toHaveBeenCalled();
  expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(false);
});

it('shows the blocked message on load when the system already denied notifications', async () => {
  state.mockResolvedValue({ status: 'denied' });
  render(<NotificationsSection />);
  expect(await screen.findByText('Notifications are blocked — enable them in system settings')).toBeTruthy();
  expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(false);
});

it('says notifications are unavailable, rather than vanishing, when turning on finds no push support', async () => {
  enable.mockResolvedValue({ status: 'unavailable', reason: 'simulator' });
  render(<NotificationsSection />);
  fireEvent(await screen.findByTestId('recap-ready-toggle'), 'valueChange', true);
  expect(await screen.findByText("Notifications aren't available in this build.")).toBeTruthy();
  expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

it('says so when registering this device failed, and saves nothing', async () => {
  enable.mockResolvedValue({ status: 'error', reason: 'offline' });
  render(<NotificationsSection />);
  fireEvent(await screen.findByTestId('recap-ready-toggle'), 'valueChange', true);
  expect(await screen.findByText("Couldn't turn on notifications. Try again.")).toBeTruthy();
  expect(screen.queryByText('Your recap setting could not be saved. Please try again.')).toBeNull();
  expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(false);
  expect(save).not.toHaveBeenCalled();
});

it('ignores a second flip while the first is still in flight', async () => {
  let finish!: (s: { status: 'on' }) => void;
  enable.mockReturnValue(new Promise((r) => (finish = r)));
  fetchSettings.mockResolvedValue({ recapPushEnabled: false });
  render(<NotificationsSection />);
  const toggle = await screen.findByTestId('recap-ready-toggle');
  fireEvent(toggle, 'valueChange', true);
  fireEvent(toggle, 'valueChange', true);
  await act(async () => finish({ status: 'on' }));
  await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
  expect(enable).toHaveBeenCalledTimes(1);
});

it('turning it off only saves the setting and keeps this device registered', async () => {
  state.mockResolvedValue({ status: 'on' });
  render(<NotificationsSection />);
  await waitFor(() => expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(true));
  fireEvent(screen.getByTestId('recap-ready-toggle'), 'valueChange', false);
  await waitFor(() => expect(save).toHaveBeenCalledWith({ recapPushEnabled: false }));
  expect(disablePush).not.toHaveBeenCalled();
});

it('a failed save says so and leaves the switch as it was', async () => {
  state.mockResolvedValue({ status: 'on' });
  save.mockRejectedValue(new Error('offline'));
  render(<NotificationsSection />);
  await waitFor(() => expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(true));
  fireEvent(screen.getByTestId('recap-ready-toggle'), 'valueChange', false);
  expect(await screen.findByText('Your recap setting could not be saved. Please try again.')).toBeTruthy();
  expect(screen.getByTestId('recap-ready-toggle').props.value).toBe(true);
});
