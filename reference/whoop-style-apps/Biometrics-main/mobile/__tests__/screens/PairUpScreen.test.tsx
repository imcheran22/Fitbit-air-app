import React from 'react';
import { AppState, Share } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { confirmMoodNotice, createCode, fetchCode, fetchIdentity, redeemCode, sendBuddyRequest } from '../../src/api/buddies';
import { refreshBuddies } from '../../src/lib/buddiesStore';
import { offerPushAfterPairing } from '../../src/lib/buddyPushOffer';
import { PairUpScreen } from '../../src/screens/PairUpScreen';
import { PersonKip } from '../../src/components/kip/PersonKip';
import { resetMyKipColour, setMyKipColour } from '../../src/lib/kip/myKipColour';

jest.mock('../../src/api/buddies', () => ({
  ...jest.requireActual('../../src/api/buddies'),
  fetchIdentity: jest.fn(),
  fetchCode: jest.fn(),
  createCode: jest.fn(),
  redeemCode: jest.fn(),
  sendBuddyRequest: jest.fn(),
  confirmMoodNotice: jest.fn(),
}));
jest.mock('../../src/lib/buddiesStore', () => ({ refreshBuddies: jest.fn() }));
// Never settles: the pairing must navigate without waiting on the push offer.
jest.mock('../../src/lib/buddyPushOffer', () => ({ offerPushAfterPairing: jest.fn(() => new Promise(() => undefined)) }));
const mockReplace = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ replace: mockReplace, navigate: jest.fn() }) }));

const READY = { handle: 'me', displayName: 'Me', displayNamePrefill: '', moodNoticeSeen: true };
const CODE = { code: 'ABCD2345', expiresAt: new Date(Date.now() + 3 * 3600_000).toISOString() };

beforeEach(() => {
  jest.clearAllMocks();
  (fetchIdentity as jest.Mock).mockResolvedValue(READY);
  (fetchCode as jest.Mock).mockResolvedValue(null);
  (createCode as jest.Mock).mockResolvedValue(CODE);
  (confirmMoodNotice as jest.Mock).mockResolvedValue(undefined);
});

it('asks for a handle first when there is none', async () => {
  (fetchIdentity as jest.Mock).mockResolvedValue({ ...READY, handle: null });
  render(<PairUpScreen />);
  expect(await screen.findByTestId('handle-setup')).toBeTruthy();
});

it('shows the mood notice before the first pairing action, then makes the code and shares it', async () => {
  (fetchIdentity as jest.Mock).mockResolvedValue({ ...READY, moodNoticeSeen: false });
  const share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  render(<PairUpScreen />);
  fireEvent.press(await screen.findByTestId('pair-share-or-create'));
  expect(await screen.findByTestId('mood-notice')).toBeTruthy();
  expect(createCode).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-confirm')));
  await waitFor(() => expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('ABCD2345') }));
  expect(screen.getByTestId('pair-code')).toHaveTextContent('ABCD2345');
  expect(screen.getByTestId('pair-code-expiry')).toHaveTextContent(/Expires in (2|3) h/);
});

it('holds a redeem behind the mood notice until it is confirmed', async () => {
  (fetchIdentity as jest.Mock).mockResolvedValue({ ...READY, moodNoticeSeen: false });
  (redeemCode as jest.Mock).mockResolvedValue({ buddyId: 'b1' });
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-code-input'), 'ABCD2345');
  fireEvent.press(screen.getByTestId('pair-redeem'));
  expect(await screen.findByTestId('mood-notice')).toBeTruthy();
  expect(redeemCode).not.toHaveBeenCalled();
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-confirm')));
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'b1' }));
  expect(redeemCode).toHaveBeenCalledTimes(1);
});

it("redeems a friend's code and opens their week", async () => {
  (redeemCode as jest.Mock).mockResolvedValue({ buddyId: 'b1' });
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-code-input'), 'abcd-2345');
  await act(async () => fireEvent.press(screen.getByTestId('pair-redeem')));
  expect(redeemCode).toHaveBeenCalledWith('abcd-2345');
  expect(refreshBuddies).toHaveBeenCalled();
  expect(mockReplace).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'b1' });
});

it('redeems once on a double tap in one frame, and frees the button after a failure', async () => {
  let fail: (e: unknown) => void = () => undefined;
  (redeemCode as jest.Mock).mockImplementation(() => new Promise((_, reject) => (fail = reject)));
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-code-input'), 'ABCD2345');
  const button = screen.getByTestId('pair-redeem');
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  expect(redeemCode).toHaveBeenCalledTimes(1);
  await act(async () => fail(Object.assign(new Error('x'), { status: 400, code: 'code_invalid' })));
  (redeemCode as jest.Mock).mockResolvedValue({ buddyId: 'b2' });
  await act(async () => fireEvent.press(screen.getByTestId('pair-redeem')));
  expect(redeemCode).toHaveBeenCalledTimes(2);
  expect(mockReplace).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'b2' });
});

it('sends a request once on a double tap in one frame', async () => {
  let done: () => void = () => undefined;
  (sendBuddyRequest as jest.Mock).mockImplementation(() => new Promise<void>((resolve) => (done = resolve)));
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-handle-input'), 'sam');
  const button = screen.getByTestId('pair-request');
  act(() => {
    fireEvent.press(button);
    fireEvent.press(button);
  });
  expect(sendBuddyRequest).toHaveBeenCalledTimes(1);
  await act(async () => done());
  expect(screen.getByTestId('pair-message')).toHaveTextContent('Request sent to @sam.');
});

it('says an invalid code plainly, and confirms a sent request the same way whatever happened to it', async () => {
  (redeemCode as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { status: 400, code: 'code_invalid' }));
  (sendBuddyRequest as jest.Mock).mockResolvedValue(undefined);
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-code-input'), 'nope');
  await act(async () => fireEvent.press(screen.getByTestId('pair-redeem')));
  expect(screen.getByTestId('pair-message')).toHaveTextContent("That code didn't work. Check it and try again.");
  expect(refreshBuddies).not.toHaveBeenCalled();
  fireEvent.changeText(screen.getByTestId('pair-handle-input'), '@Sam_R');
  await act(async () => fireEvent.press(screen.getByTestId('pair-request')));
  expect(sendBuddyRequest).toHaveBeenCalledWith('@Sam_R');
  expect(screen.getByTestId('pair-message')).toHaveTextContent('Request sent to @sam_r.');
  expect(refreshBuddies).toHaveBeenCalledTimes(1);
});

it('offers buddy notifications after a successful redeem only, without holding up the navigation', async () => {
  (redeemCode as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { status: 400, code: 'code_invalid' }));
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-code-input'), 'ABCD2345');
  await act(async () => fireEvent.press(screen.getByTestId('pair-redeem')));
  expect(offerPushAfterPairing).not.toHaveBeenCalled();
  (redeemCode as jest.Mock).mockResolvedValueOnce({ buddyId: 'b1' });
  await act(async () => fireEvent.press(screen.getByTestId('pair-redeem')));
  expect(mockReplace).toHaveBeenCalledWith('BuddyWeek', { buddyId: 'b1' });
  expect(offerPushAfterPairing).toHaveBeenCalledTimes(1);
  // The pending offer doesn't hold the buttons either.
  expect(screen.getByTestId('pair-redeem').props.accessibilityState?.disabled).toBeFalsy();
});

it('a sent request never offers notifications (it pairs no one here)', async () => {
  (sendBuddyRequest as jest.Mock).mockResolvedValue(undefined);
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-handle-input'), 'sam');
  await act(async () => fireEvent.press(screen.getByTestId('pair-request')));
  expect(offerPushAfterPairing).not.toHaveBeenCalled();
});

describe('you as your KIP', () => {
  afterEach(() => resetMyKipColour());

  it("draws you in your colour and says buddies see your KIP's mood", async () => {
    setMyKipColour('lemon');
    render(<PairUpScreen />);
    expect(await screen.findByText("Buddies always see your KIP's mood. Your numbers stay private unless you share them in Profile.")).toBeTruthy();
    expect(screen.UNSAFE_getByType(PersonKip).props).toMatchObject({ colour: 'lemon', size: 72 });
  });
});

describe('your code', () => {
  const T0 = Date.parse('2026-10-07T12:00:00Z');
  let clock = T0;
  let share: jest.SpyInstance;
  beforeEach(() => {
    clock = T0;
    jest.spyOn(Date, 'now').mockImplementation(() => clock);
    share = jest.spyOn(Share, 'share').mockResolvedValue({ action: 'sharedAction' } as never);
  });
  afterEach(() => jest.restoreAllMocks());

  it('decides reuse by the clock at the tap, not the last render: an expired code makes a new one', async () => {
    (fetchCode as jest.Mock).mockResolvedValue({ code: 'OLDC0DE1', expiresAt: new Date(T0 + 10_000).toISOString() });
    (createCode as jest.Mock).mockResolvedValue({ code: 'NEWC0DE2', expiresAt: new Date(T0 + 24 * 3600_000).toISOString() });
    render(<PairUpScreen />);
    expect(await screen.findByTestId('pair-code')).toHaveTextContent('OLDC0DE1');
    clock = T0 + 20_000;
    await act(async () => fireEvent.press(screen.getByTestId('pair-share-or-create')));
    expect(createCode).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledWith({ message: expect.stringContaining('NEWC0DE2') });
  });

  it('a reused code is shared with the time it has left, never a fixed 24 hours', async () => {
    (fetchCode as jest.Mock).mockResolvedValue({ code: 'OLDC0DE1', expiresAt: new Date(T0 + 3 * 3600_000).toISOString() });
    render(<PairUpScreen />);
    expect(await screen.findByTestId('pair-code')).toHaveTextContent('OLDC0DE1');
    await act(async () => fireEvent.press(screen.getByTestId('pair-share-or-create')));
    expect(createCode).not.toHaveBeenCalled();
    const message = share.mock.calls[0]![0].message as string;
    expect(message).toContain('OLDC0DE1');
    expect(message).not.toMatch(/24 hours/);
    expect(message).toContain('Expires in 3 h');
  });

  it('back in the foreground, the countdown catches up at once', async () => {
    let onAppState: ((s: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      onAppState = fn;
      return { remove: jest.fn() };
    }) as never);
    (fetchCode as jest.Mock).mockResolvedValue({ code: 'OLDC0DE1', expiresAt: new Date(T0 + 3 * 3600_000).toISOString() });
    render(<PairUpScreen />);
    expect(await screen.findByTestId('pair-code-expiry')).toHaveTextContent('Expires in 3 h');
    clock = T0 + 3600_000;
    act(() => onAppState!('active'));
    expect(screen.getByTestId('pair-code-expiry')).toHaveTextContent('Expires in 2 h');
  });

  it('a slow first read never replaces a code made since', async () => {
    let finishFetch!: (c: unknown) => void;
    (fetchCode as jest.Mock).mockReturnValue(new Promise((r) => (finishFetch = r)));
    (createCode as jest.Mock).mockResolvedValue({ code: 'NEWC0DE2', expiresAt: new Date(T0 + 24 * 3600_000).toISOString() });
    render(<PairUpScreen />);
    const shareButton = await screen.findByTestId('pair-share-or-create');
    await act(async () => fireEvent.press(shareButton));
    expect(screen.getByTestId('pair-code')).toHaveTextContent('NEWC0DE2');
    await act(async () => finishFetch({ code: 'OLDC0DE1', expiresAt: new Date(T0 + 3600_000).toISOString() }));
    expect(screen.getByTestId('pair-code')).toHaveTextContent('NEWC0DE2');
  });
});

it('leaving while a redeem is in flight never navigates from the old screen', async () => {
  let finish!: (v: unknown) => void;
  (redeemCode as jest.Mock).mockReturnValue(new Promise((r) => (finish = r)));
  const view = render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-code-input'), 'ABCD2345');
  fireEvent.press(screen.getByTestId('pair-redeem'));
  view.unmount();
  await act(async () => finish({ buddyId: 'b1' }));
  expect(mockReplace).not.toHaveBeenCalled();
  // The pairing itself went through: the shared list still refreshes.
  expect(refreshBuddies).toHaveBeenCalledTimes(1);
});

it('"Not now" on the mood notice leaves the button usable, and the next tap asks again', async () => {
  (fetchIdentity as jest.Mock).mockResolvedValue({ ...READY, moodNoticeSeen: false });
  render(<PairUpScreen />);
  fireEvent.press(await screen.findByTestId('pair-share-or-create'));
  expect(await screen.findByTestId('mood-notice')).toBeTruthy();
  await act(async () => fireEvent.press(screen.getByTestId('mood-notice-cancel')));
  expect(screen.queryByTestId('mood-notice')).toBeNull();
  expect(createCode).not.toHaveBeenCalled();
  expect(screen.getByTestId('pair-share-or-create').props.accessibilityState?.disabled).toBeFalsy();
  fireEvent.press(screen.getByTestId('pair-share-or-create'));
  expect(await screen.findByTestId('mood-notice')).toBeTruthy();
});

it('shows a rate limit through the shared copy without retrying', async () => {
  (sendBuddyRequest as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { status: 429, code: 'rate_limited' }));
  render(<PairUpScreen />);
  fireEvent.changeText(await screen.findByTestId('pair-handle-input'), 'sam');
  await act(async () => fireEvent.press(screen.getByTestId('pair-request')));
  expect(screen.getByTestId('pair-message')).toHaveTextContent('Too many tries. Please try again later.');
  expect(sendBuddyRequest).toHaveBeenCalledTimes(1);
});
