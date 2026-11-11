import { act, renderHook } from '@testing-library/react-native';
import { fetchBuddyPage } from '../../src/api/buddies';
import { getBuddiesState, refreshBuddies, resetBuddies, useBuddies } from '../../src/lib/buddiesStore';

jest.mock('../../src/api/buddies', () => ({ fetchBuddyPage: jest.fn() }));
const load = fetchBuddyPage as jest.Mock;
const PAGE = { buddies: [], nextCursor: null, incomingRequests: 0, outgoingRequests: 0 };

beforeEach(() => {
  load.mockReset();
  resetBuddies();
});

it('publishes the first page to hooks', async () => {
  load.mockResolvedValue(PAGE);
  const { result } = renderHook(() => useBuddies());
  await act(async () => {
    await refreshBuddies();
  });
  expect(load).toHaveBeenCalledTimes(1);
  expect(result.current).toEqual({ status: 'ready', page: PAGE });
});

it('a refresh during an in-flight load reloads once after it, and callers wait for that reload', async () => {
  const NEWER = { ...PAGE, incomingRequests: 1 };
  let resolveFirst!: (page: unknown) => void;
  load.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; })).mockResolvedValueOnce(NEWER);
  const first = refreshBuddies();
  // Two calls while the first runs (e.g. right after an accept): one extra load, not two.
  const second = refreshBuddies();
  const third = refreshBuddies();
  resolveFirst(PAGE);
  await Promise.all([first, second, third]);
  expect(load).toHaveBeenCalledTimes(2);
  expect(getBuddiesState()).toEqual({ status: 'ready', page: NEWER });
  // Settled: the next refresh starts a fresh single load.
  load.mockResolvedValueOnce(PAGE);
  await refreshBuddies();
  expect(load).toHaveBeenCalledTimes(3);
});

it('a bare 404 is unavailable; a failure keeps the last good page, or is an error', async () => {
  load.mockResolvedValueOnce(null);
  await refreshBuddies();
  expect(getBuddiesState()).toEqual({ status: 'unavailable' });
  load.mockResolvedValueOnce(PAGE);
  await refreshBuddies();
  load.mockRejectedValueOnce(new Error('offline'));
  await refreshBuddies();
  expect(getBuddiesState()).toEqual({ status: 'ready', page: PAGE });
  resetBuddies();
  load.mockRejectedValueOnce(new Error('offline'));
  await refreshBuddies();
  expect(getBuddiesState()).toEqual({ status: 'error' });
});

it('a load that started before a reset never lands after it', async () => {
  let resolve!: (page: unknown) => void;
  load.mockReturnValue(new Promise((r) => { resolve = r; }));
  const pending = refreshBuddies();
  resetBuddies();
  resolve(PAGE);
  await pending;
  expect(getBuddiesState()).toEqual({ status: 'idle' });
});

it('a reset during an in-flight load drops the pending reload too', async () => {
  let resolve!: (page: unknown) => void;
  load.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const pending = refreshBuddies();
  void refreshBuddies();
  resetBuddies();
  resolve(PAGE);
  await pending;
  expect(load).toHaveBeenCalledTimes(1);
  expect(getBuddiesState()).toEqual({ status: 'idle' });
});
