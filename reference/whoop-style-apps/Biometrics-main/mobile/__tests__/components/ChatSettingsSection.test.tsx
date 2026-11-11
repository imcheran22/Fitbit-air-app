import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchChatSettings, saveChatSettings } from '../../src/api/chats';
import { fetchBuddyPage } from '../../src/api/buddies';
import { refreshBuddies, resetBuddies } from '../../src/lib/buddiesStore';
import { ChatSettingsSection } from '../../src/components/chats/ChatSettingsSection';

jest.mock('../../src/api/chats', () => ({ fetchChatSettings: jest.fn(), saveChatSettings: jest.fn() }));
jest.mock('../../src/api/buddies', () => ({ fetchBuddyPage: jest.fn() }));
const PAGE = { buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 };

beforeEach(async () => {
  jest.clearAllMocks();
  resetBuddies();
  (fetchBuddyPage as jest.Mock).mockResolvedValue(PAGE);
  await refreshBuddies();
});

it('shows both switches as the server has them and saves each on its own; a failure keeps the saved value', async () => {
  (fetchChatSettings as jest.Mock).mockResolvedValue({ readReceipts: true, activityStatus: true });
  (saveChatSettings as jest.Mock).mockResolvedValueOnce({ readReceipts: false, activityStatus: true }).mockRejectedValueOnce(new Error('offline'));
  render(<ChatSettingsSection />);
  const receipts = await screen.findByTestId('chat-read-receipts-toggle');
  expect(receipts.props.value).toBe(true);
  await act(async () => fireEvent(receipts, 'valueChange', false));
  expect(saveChatSettings).toHaveBeenCalledWith({ readReceipts: false });
  expect(screen.getByTestId('chat-read-receipts-toggle').props.value).toBe(false);
  await act(async () => fireEvent(screen.getByTestId('chat-activity-toggle'), 'valueChange', false));
  expect(screen.getByTestId('chat-activity-toggle').props.value).toBe(true);
  expect(screen.getByTestId('chat-settings-message')).toHaveTextContent('Your chat setting could not be saved. Please try again.');
});

it('each switch saves its own field: activity status sends activityStatus, read receipts sends readReceipts', async () => {
  (fetchChatSettings as jest.Mock).mockResolvedValue({ readReceipts: true, activityStatus: true });
  (saveChatSettings as jest.Mock)
    .mockResolvedValueOnce({ readReceipts: true, activityStatus: false })
    .mockResolvedValueOnce({ readReceipts: false, activityStatus: false });
  render(<ChatSettingsSection />);
  const activity = await screen.findByTestId('chat-activity-toggle');
  await act(async () => fireEvent(activity, 'valueChange', false));
  expect(saveChatSettings).toHaveBeenLastCalledWith({ activityStatus: false });
  expect(screen.getByTestId('chat-activity-toggle').props.value).toBe(false);
  expect(screen.getByTestId('chat-read-receipts-toggle').props.value).toBe(true);
  await act(async () => fireEvent(screen.getByTestId('chat-read-receipts-toggle'), 'valueChange', false));
  expect(saveChatSettings).toHaveBeenLastCalledWith({ readReceipts: false });
  expect(screen.getByTestId('chat-read-receipts-toggle').props.value).toBe(false);
  expect(screen.queryByTestId('chat-settings-message')).toBeNull();
});

it('is hidden on a server without chats', async () => {
  (fetchChatSettings as jest.Mock).mockResolvedValue(null);
  render(<ChatSettingsSection />);
  await act(async () => undefined);
  expect(screen.queryByTestId('chat-settings')).toBeNull();
});

// Final review M7: a failed read (offline) offers a retry instead of hiding the group for the whole visit.
it('a failed read says so with Try again, which reads again', async () => {
  (fetchChatSettings as jest.Mock).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce({ readReceipts: true, activityStatus: false });
  render(<ChatSettingsSection />);
  expect(await screen.findByTestId('chat-settings-load-error')).toHaveTextContent("Your chat settings couldn't be loaded.");
  expect(screen.queryByTestId('chat-read-receipts-toggle')).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId('chat-settings-retry')));
  expect(fetchChatSettings).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('chat-activity-toggle').props.value).toBe(false);
  expect(screen.queryByTestId('chat-settings-load-error')).toBeNull();
});
