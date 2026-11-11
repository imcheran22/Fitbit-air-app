import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SyncStatusLine } from '../../src/components/sync-status-line';
import { Button } from '../../src/components/ui/button';
import { useSync } from '../../src/sync/SyncProvider';

jest.mock('../../src/sync/SyncProvider', () => ({ useSync: jest.fn() }));
const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({ useNavigation: () => ({ navigate: mockNavigate }) }));

const syncNow = jest.fn();
const set = (over: object) =>
  (useSync as jest.Mock).mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow, ...over });

beforeEach(() => jest.clearAllMocks());

it('shows syncing progress', () => {
  set({ state: 'syncing' });
  const line = render(<SyncStatusLine />).getByTestId('sync-status-line');
  expect(line).toHaveTextContent('Syncing with Google Health…');
  expect(line).toBeDisabled();
  // Busy but readable: the loading dim is overridden.
  const classes = String(line.props.className).split(' ');
  expect(classes).toContain('opacity-100');
  expect(classes).not.toContain('opacity-50');
});

it('shows when it last synced, and syncs on tap', () => {
  set({ lastSyncedAt: new Date(Date.now() - 12 * 60_000).toISOString() });
  const { getByTestId } = render(<SyncStatusLine />);
  expect(getByTestId('sync-status-line')).toHaveTextContent('Synced 12 min ago');
  fireEvent.press(getByTestId('sync-status-line'));
  expect(syncNow).toHaveBeenCalledWith('manual');
});

it('invites a first sync when there has never been one', () => {
  set({ lastSyncedAt: null });
  expect(render(<SyncStatusLine />).getByTestId('sync-status-line')).toHaveTextContent('Not synced yet · Tap to sync');
});

it('offers a retry after a failure', () => {
  set({ state: 'failed' });
  const { getByTestId } = render(<SyncStatusLine />);
  expect(getByTestId('sync-status-line')).toHaveTextContent("Couldn't sync · Tap to retry");
  fireEvent.press(getByTestId('sync-status-line'));
  expect(syncNow).toHaveBeenCalledWith('manual');
});

it('offers to reconnect when Google Health is disconnected', () => {
  set({ connection: 'DISCONNECTED' });
  const { getByTestId } = render(<SyncStatusLine />);
  expect(getByTestId('sync-status-line')).toHaveTextContent('Google Health disconnected · Reconnect');
  fireEvent.press(getByTestId('sync-status-line'));
  expect(mockNavigate).toHaveBeenCalledWith('ConnectHealth');
  expect(syncNow).not.toHaveBeenCalled();
});

it('shows nothing when not connected or not yet known', () => {
  set({ connection: 'NOT_CONNECTED' });
  expect(render(<SyncStatusLine />).queryByTestId('sync-status-line')).toBeNull();
  set({ state: 'unknown', connection: null });
  expect(render(<SyncStatusLine />).queryByTestId('sync-status-line')).toBeNull();
});

it('reads light over the Home sky', () => {
  set({});
  render(<SyncStatusLine light />);
  const line = screen.UNSAFE_getAllByType(Button).find((b) => b.props.testID === 'sync-status-line')!;
  expect(line.props.textClassName).toBe('text-[#FFFFFF]');
});

it('reads its failure light over the Home sky too', () => {
  set({ state: 'failed' });
  render(<SyncStatusLine light />);
  const line = screen.UNSAFE_getAllByType(Button).find((b) => b.props.testID === 'sync-status-line')!;
  expect(line.props.textClassName).toBe('text-[#FFFFFF]');
});

it('keeps its muted text everywhere else', () => {
  set({});
  render(<SyncStatusLine />);
  const line = screen.UNSAFE_getAllByType(Button).find((b) => b.props.testID === 'sync-status-line')!;
  expect(line.props.textClassName).toBe('text-muted-foreground');
});
