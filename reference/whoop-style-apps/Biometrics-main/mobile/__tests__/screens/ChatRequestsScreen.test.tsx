import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react-native';
import { acceptRequest, blockFromRequest, cancelRequest, confirmMoodNotice, declineRequest, fetchIdentity, fetchRequests } from '../../src/api/buddies';
import { PersonKip } from '../../src/components/kip/PersonKip';
import { refreshBuddies } from '../../src/lib/buddiesStore';
import { offerPushAfterPairing } from '../../src/lib/buddyPushOffer';
import { refreshSocial } from '../../src/lib/socialStore';
import { ChatRequestsScreen } from '../../src/screens/ChatRequestsScreen';

let mockChats: boolean | null = true;
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn(), useChatsAvailable: () => mockChats }));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
jest.mock('../../src/lib/buddyPushOffer', () => ({ offerPushAfterPairing: jest.fn(() => new Promise(() => undefined)) }));
jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchIdentity: jest.fn(),
  fetchRequests: jest.fn(),
  acceptRequest: jest.fn(),
  declineRequest: jest.fn(),
  blockFromRequest: jest.fn(),
  cancelRequest: jest.fn(),
  confirmMoodNotice: jest.fn(),
}));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ ...jest.requireActual('@react-navigation/native'), useNavigation: () => ({ navigate: mockNavigate }) }));
const person = (id: string, name: string) => ({ id, handle: id, displayName: name, coachId: 'pengu' });

beforeEach(() => {
  jest.clearAllMocks();
  mockChats = true;
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'me', displayName: 'Me', displayNamePrefill: '', moodNoticeSeen: true });
  (fetchRequests as jest.Mock).mockResolvedValue({
    incoming: [{ id: 'r1', createdAt: '', from: person('u1', 'Ana') }, { id: 'r2', createdAt: '', from: person('u2', 'Ben') }],
    outgoing: [{ id: 'r3', createdAt: '', toHandle: 'cy' }],
  });
  (acceptRequest as jest.Mock).mockResolvedValue({ ok: true, buddyId: 'u1' });
});

it("answers requests in Chats: accept opens the new buddy's thread, decline is quiet, block asks first; mine read Pending", async () => {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
  render(<ChatRequestsScreen />);
  expect(await screen.findByTestId('request-in-r1')).toBeTruthy();
  expect(screen.getByTestId('request-out-r3')).toHaveTextContent(/Pending/);
  await act(async () => fireEvent.press(screen.getByTestId('request-accept-r1')));
  expect(mockNavigate).toHaveBeenCalledWith('ChatThread', { buddyId: 'u1' });
  expect(offerPushAfterPairing).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(screen.getByTestId('request-decline-r2')));
  expect(declineRequest).toHaveBeenCalledWith('r2');
  await act(async () => fireEvent.press(screen.getByTestId('request-block-r2')));
  await waitFor(() => expect(blockFromRequest).toHaveBeenCalledWith('r2'));
  await act(async () => fireEvent.press(screen.getByTestId('request-cancel-r3')));
  expect(cancelRequest).toHaveBeenCalledWith('r3');
  expect(refreshSocial).toHaveBeenCalled();
  alert.mockRestore();
});

it('draws whoever sent a request as their KIP in their colour', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue({ incoming: [{ id: 'r1', createdAt: '', from: { ...person('u1', 'Ana'), kipColour: 'lilac' } }], outgoing: [] });
  render(<ChatRequestsScreen />);
  const row = await screen.findByTestId('request-in-r1');
  expect(within(row).UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'lilac', size: 28 });
});

it('on a server without chats, accepting opens the buddy\'s week', async () => {
  mockChats = false;
  render(<ChatRequestsScreen />);
  const target = await screen.findByTestId('request-accept-r1');
  await act(async () => fireEvent.press(target));
  expect(mockNavigate).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'u1' });
});

const ONE_INCOMING = { incoming: [{ id: 'r1', createdAt: '', from: person('u1', 'Ana') }], outgoing: [] };

it('accepts once on a double tap and refreshes the shared lists after it', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  let release: (v: unknown) => void = () => undefined;
  (acceptRequest as jest.Mock).mockReturnValue(new Promise((r) => (release = r)));
  render(<ChatRequestsScreen />);
  const accept = await screen.findByTestId('request-accept-r1');
  act(() => {
    fireEvent.press(accept);
    fireEvent.press(accept);
  });
  expect(acceptRequest).toHaveBeenCalledTimes(1);
  await act(async () => release({ ok: true, buddyId: 'u1' }));
  expect(refreshBuddies).toHaveBeenCalled();
  expect(mockNavigate).toHaveBeenCalledWith('ChatThread', { buddyId: 'u1' });
});

it('holds accept behind the mood notice, and Not now leaves it free to try again', async () => {
  (fetchIdentity as jest.Mock).mockResolvedValue({ handle: 'me', displayName: 'Me', displayNamePrefill: '', moodNoticeSeen: false });
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  (confirmMoodNotice as jest.Mock).mockResolvedValue(undefined);
  render(<ChatRequestsScreen />);
  fireEvent.press(await screen.findByTestId('request-accept-r1'));
  expect(await screen.findByTestId('mood-notice')).toBeTruthy();
  expect(acceptRequest).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-cancel')));
  fireEvent.press(screen.getByTestId('request-accept-r1'));
  await act(async () => fireEvent.press(await screen.findByTestId('mood-notice-confirm')));
  await waitFor(() => expect(acceptRequest).toHaveBeenCalledTimes(1));
});

it('offers buddy notifications only after an accept that went through', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  (acceptRequest as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { status: 404, code: 'request_gone' }));
  render(<ChatRequestsScreen />);
  const accept = await screen.findByTestId('request-accept-r1');
  await act(async () => fireEvent.press(accept));
  expect(await screen.findByTestId('requests-message')).toBeTruthy();
  expect(offerPushAfterPairing).not.toHaveBeenCalled();
});

it('shows a neutral label for an outgoing request sent before handles were kept', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue({ incoming: [], outgoing: [{ id: 'r9', createdAt: '', toHandle: '' }] });
  render(<ChatRequestsScreen />);
  expect(await screen.findByTestId('request-out-r9')).toHaveTextContent(/^Pending request/);
});

it('leaves Block usable after the confirm is cancelled', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue(ONE_INCOMING);
  let choose: 'cancel' | 'destructive' = 'cancel';
  const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === choose)?.onPress?.());
  render(<ChatRequestsScreen />);
  const block = await screen.findByTestId('request-block-r1');
  await act(async () => fireEvent.press(block));
  expect(blockFromRequest).not.toHaveBeenCalled();
  choose = 'destructive';
  await act(async () => fireEvent.press(screen.getByTestId('request-block-r1')));
  await waitFor(() => expect(blockFromRequest).toHaveBeenCalledWith('r1'));
  alert.mockRestore();
});

it('shows the error for a failed answer and re-reads the requests', async () => {
  (fetchRequests as jest.Mock).mockResolvedValue({ incoming: [], outgoing: [{ id: 'r3', createdAt: '', toHandle: 'cy' }] });
  (cancelRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: 'not_found_or_answered' }));
  render(<ChatRequestsScreen />);
  await screen.findByTestId('request-out-r3');
  expect(fetchRequests).toHaveBeenCalledTimes(1);
  await act(async () => fireEvent.press(screen.getByTestId('request-cancel-r3')));
  expect(await screen.findByTestId('requests-message')).toBeTruthy();
  expect(fetchRequests).toHaveBeenCalledTimes(2);
});

it('titles the board with the pixel page title', async () => {
  render(<ChatRequestsScreen />);
  expect(await screen.findByRole('header', { name: 'Requests' })).toHaveTextContent('REQUESTS');
});
