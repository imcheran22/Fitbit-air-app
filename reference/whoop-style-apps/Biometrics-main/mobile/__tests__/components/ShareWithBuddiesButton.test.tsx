import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { fetchRecapShared, shareRecap, unshareRecap } from '../../src/api/social';
import { useBuddies } from '../../src/lib/buddiesStore';
import { refreshSocial } from '../../src/lib/socialStore';
import { ShareWithBuddiesButton } from '../../src/components/recap/ShareWithBuddiesButton';

jest.mock('../../src/api/social', () => ({
  fetchRecapShared: jest.fn(),
  shareRecap: jest.fn().mockResolvedValue({ shared: true }),
  unshareRecap: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../src/lib/buddiesStore', () => ({ useBuddies: jest.fn() }));
jest.mock('../../src/lib/socialStore', () => ({ refreshSocial: jest.fn() }));
const withBuddies = (n: number) => (useBuddies as jest.Mock).mockReturnValue({ status: 'ready', page: { buddies: Array.from({ length: n }, (_, i) => ({ id: `b${i}` })), nextCursor: null, incomingRequests: 0, outgoingRequests: 0 } });
const LINE = 'You slept 7h 12m a night on average.';
beforeEach(() => {
  jest.clearAllMocks();
  (fetchRecapShared as jest.Mock).mockResolvedValue(false);
  (shareRecap as jest.Mock).mockResolvedValue({ shared: true });
  (unshareRecap as jest.Mock).mockResolvedValue(undefined);
});

it('is hidden without buddies, without a line, or on an older server', async () => {
  withBuddies(0);
  const { unmount } = render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  await act(async () => undefined);
  expect(screen.queryByTestId('recap-share-buddies')).toBeNull();
  unmount();
  withBuddies(2);
  const second = render(<ShareWithBuddiesButton recapId="r1" line="" />);
  await act(async () => undefined);
  expect(screen.queryByTestId('recap-share-buddies')).toBeNull();
  second.unmount();
  const third = render(<ShareWithBuddiesButton recapId="r1" line={'  \n '} />);
  await act(async () => undefined);
  expect(screen.queryByTestId('recap-share-buddies')).toBeNull();
  third.unmount();
  (fetchRecapShared as jest.Mock).mockResolvedValue(null);
  render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  await act(async () => undefined);
  expect(screen.queryByTestId('recap-share-buddies')).toBeNull();
});

it('stays hidden while the shared state loads and when its fetch fails (never guesses "not shared")', async () => {
  withBuddies(2);
  let fail: (e: Error) => void = () => undefined;
  (fetchRecapShared as jest.Mock).mockReturnValue(new Promise((_res, rej) => { fail = rej; }));
  render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  expect(screen.queryByTestId('recap-share-buddies')).toBeNull();
  await act(async () => fail(new Error('offline')));
  expect(screen.queryByTestId('recap-share-buddies')).toBeNull();
  expect(screen.queryByText('Share with buddies')).toBeNull();
  expect(shareRecap).not.toHaveBeenCalled();
});

it('previews the exact line before sharing; Cancel shares nothing', async () => {
  withBuddies(2);
  render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  fireEvent.press(await screen.findByTestId('recap-share-buddies'));
  expect(shareRecap).not.toHaveBeenCalled();
  expect(screen.getByTestId('recap-share-buddies-sheet')).toBeTruthy();
  expect(screen.getByTestId('recap-share-buddies-preview')).toHaveTextContent(`Your buddies will see: ${LINE}`);
  fireEvent.press(screen.getByTestId('recap-share-buddies-cancel'));
  expect(shareRecap).not.toHaveBeenCalled();
  expect(screen.queryByTestId('recap-share-buddies-sheet')).toBeNull();
  expect(screen.getByTestId('recap-share-buddies')).toHaveTextContent('Share with buddies');
});

it('shares once on a double tap of Share, then undoes', async () => {
  withBuddies(2);
  render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  fireEvent.press(await screen.findByTestId('recap-share-buddies'));
  await act(async () => {
    fireEvent.press(screen.getByTestId('recap-share-buddies-confirm'));
    fireEvent.press(screen.getByTestId('recap-share-buddies-confirm'));
  });
  expect(shareRecap).toHaveBeenCalledTimes(1);
  expect(shareRecap).toHaveBeenCalledWith('r1', LINE);
  expect(refreshSocial).toHaveBeenCalledTimes(1);
  expect(screen.getByTestId('recap-share-buddies')).toHaveTextContent(/Shared with buddies · Undo/);
  await act(async () => fireEvent.press(screen.getByTestId('recap-share-buddies')));
  expect(unshareRecap).toHaveBeenCalledWith('r1');
  expect(refreshSocial).toHaveBeenCalledTimes(2);
  expect(screen.getByTestId('recap-share-buddies')).toHaveTextContent('Share with buddies');
});

it('starts from the server: an already shared recap offers Undo', async () => {
  withBuddies(1);
  (fetchRecapShared as jest.Mock).mockResolvedValue(true);
  render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  expect(await screen.findByText(/Shared with buddies · Undo/)).toBeTruthy();
  expect(fetchRecapShared).toHaveBeenCalledWith('r1');
});

it('a failed share shows the buddy error and stays unshared', async () => {
  withBuddies(1);
  (shareRecap as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: 'recap_not_found' }));
  render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  fireEvent.press(await screen.findByTestId('recap-share-buddies'));
  await act(async () => fireEvent.press(screen.getByTestId('recap-share-buddies-confirm')));
  expect(screen.getByTestId('recap-share-buddies-message')).toHaveTextContent("That recap can't be shared.");
  expect(screen.getByTestId('recap-share-buddies')).toHaveTextContent('Share with buddies');
  expect(refreshSocial).not.toHaveBeenCalled();
});

it('previews and sends the trimmed line; reopening the sheet clears a stale error', async () => {
  withBuddies(1);
  (shareRecap as jest.Mock).mockRejectedValueOnce(Object.assign(new Error('x'), { code: 'recap_not_found' }));
  render(<ShareWithBuddiesButton recapId="r1" line={`  ${LINE}\n`} />);
  fireEvent.press(await screen.findByTestId('recap-share-buddies'));
  // Raw children, not the whitespace-normalizing matcher: the preview itself must be the trimmed line.
  expect(screen.getByTestId('recap-share-buddies-preview').props.children).toBe(`Your buddies will see: ${LINE}`);
  await act(async () => fireEvent.press(screen.getByTestId('recap-share-buddies-confirm')));
  expect(shareRecap).toHaveBeenLastCalledWith('r1', LINE);
  expect(screen.getByTestId('recap-share-buddies-message')).toBeTruthy();
  fireEvent.press(screen.getByTestId('recap-share-buddies'));
  expect(screen.queryByTestId('recap-share-buddies-message')).toBeNull();
  await act(async () => fireEvent.press(screen.getByTestId('recap-share-buddies-confirm')));
  expect(shareRecap).toHaveBeenCalledTimes(2);
  expect(shareRecap).toHaveBeenLastCalledWith('r1', LINE);
  expect(screen.getByTestId('recap-share-buddies')).toHaveTextContent(/Shared with buddies · Undo/);
});

it('a failed unshare shows the buddy error and stays shared', async () => {
  withBuddies(1);
  (fetchRecapShared as jest.Mock).mockResolvedValue(true);
  (unshareRecap as jest.Mock).mockRejectedValue(Object.assign(new Error('x'), { code: 'recap_not_found' }));
  render(<ShareWithBuddiesButton recapId="r1" line={LINE} />);
  const button = await screen.findByTestId('recap-share-buddies');
  await act(async () => fireEvent.press(button));
  expect(unshareRecap).toHaveBeenCalledWith('r1');
  expect(screen.getByTestId('recap-share-buddies-message')).toHaveTextContent("That recap can't be shared.");
  expect(screen.getByTestId('recap-share-buddies')).toHaveTextContent(/Shared with buddies · Undo/);
  expect(refreshSocial).not.toHaveBeenCalled();
});
