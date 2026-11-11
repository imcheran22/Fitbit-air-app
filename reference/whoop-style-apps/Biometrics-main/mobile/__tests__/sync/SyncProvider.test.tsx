import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { SyncProvider, useSync, POLL_MS } from '../../src/sync/SyncProvider';
import { requestSync, fetchSyncStatus } from '../../src/api/sync';
import { ApiError } from '../../src/api/client';
import { useToast } from '../../src/components/ui/toast';

jest.mock('../../src/api/sync', () => ({ requestSync: jest.fn(), fetchSyncStatus: jest.fn() }));
jest.mock('../../src/components/ui/toast', () => ({ useToast: jest.fn() }));

const show = jest.fn();
let appStateListener: ((s: string) => void) | undefined;
let ctx: ReturnType<typeof useSync>;
function Capture() {
  ctx = useSync();
  return <Text testID="v">{`${ctx.state}|${ctx.dataVersion}|${ctx.connection}`}</Text>;
}

const OLD = new Date(Date.now() - 60 * 60_000).toISOString();
const NEW = new Date().toISOString();
const status = (over: object) => ({ state: 'idle', lastSyncedAt: OLD, connection: 'CONNECTED', ...over });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (useToast as jest.Mock).mockReturnValue({ show });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
    appStateListener = cb as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  (requestSync as jest.Mock).mockResolvedValue({ state: 'syncing', lastSyncedAt: OLD });
});
afterEach(() => jest.useRealTimers());

async function flushPolls(times: number) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS);
    });
  }
}

it('syncs on launch when the last sync is over 15 minutes old, then reloads data and confirms', async () => {
  (fetchSyncStatus as jest.Mock)
    .mockResolvedValueOnce(status({})) // the launch check
    .mockResolvedValueOnce(status({ state: 'syncing' })) // first poll
    .mockResolvedValue(status({ lastSyncedAt: NEW }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);

  await flushPolls(3);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent('idle|1|CONNECTED'));
  expect(requestSync).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledWith('Synced with Google Health', 'success');
});

it('does not sync on launch when the last sync is recent', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValue(status({ lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString() }));
  render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(2);
  expect(requestSync).not.toHaveBeenCalled();
});

it('checks again when the app returns to the foreground', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({ lastSyncedAt: NEW })).mockResolvedValue(status({}));
  render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);
  expect(requestSync).not.toHaveBeenCalled();

  await act(async () => appStateListener?.('active'));
  await flushPolls(2);
  expect(requestSync).toHaveBeenCalledTimes(1);
});

it('follows a sync that is already running when the app opens', async () => {
  (fetchSyncStatus as jest.Mock)
    .mockResolvedValueOnce(status({ state: 'syncing', lastSyncedAt: new Date().toISOString() }))
    .mockResolvedValue(status({ lastSyncedAt: new Date(Date.now() + 1000).toISOString() }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(3);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/^idle\|1\|/));
});

it('says disconnected, not synced, when Google revoked access during the sync', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({})).mockResolvedValue(status({ connection: 'DISCONNECTED' }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(3);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent('idle|0|DISCONNECTED'));
  expect(show).toHaveBeenCalledWith('Google Health is disconnected', 'error');
});

it('fails with an error toast on a server error, without signing anyone out', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({}));
  (requestSync as jest.Mock).mockRejectedValue(new ApiError(503, 'down'));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/^failed\|0\|/));
  expect(show).toHaveBeenCalledWith("Couldn't sync with Google Health", 'error');
});

it('gives up after 60 seconds of syncing', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({})).mockResolvedValue(status({ state: 'syncing' }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(45);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/^failed\|/));
});

it('marks not connected on a 409', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValue(status({}));
  (requestSync as jest.Mock).mockRejectedValue(new ApiError(409, 'no', 'not_connected'));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/NOT_CONNECTED$/));
});

it('gives "Already up to date" for a manual sync that found nothing new, and never runs two syncs at once', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValue(status({ lastSyncedAt: NEW }));
  (requestSync as jest.Mock).mockResolvedValue({ state: 'idle', lastSyncedAt: NEW });
  render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);

  await act(async () => {
    void ctx.syncNow('manual');
    void ctx.syncNow('manual');
  });
  await flushPolls(1);
  expect(requestSync).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledWith('Already up to date', 'success');
});

it('is a harmless default outside the provider', () => {
  const { getByTestId } = render(<Capture />);
  expect(getByTestId('v')).toHaveTextContent('unknown|0|null');
});
