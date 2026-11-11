import React from 'react';
import { Text } from 'react-native';
import { act, render, screen } from '@testing-library/react-native';
import { fetchSocialHome } from '../../src/api/social';
import { chatsBadgeCount, getSocialState, refreshSocial, resetSocial, useChatsAvailable, useSocialUnread, useSocialUnreadCount } from '../../src/lib/socialStore';

jest.mock('../../src/api/social', () => ({ fetchSocialHome: jest.fn() }));
const fetchHome = fetchSocialHome as jest.Mock;
const home = (requests: number, stickers: number, chats?: number) => ({ me: {}, camp: { checkedIn: 0, members: 1, faces: [] }, stories: [], highlights: null, timeline: [], unread: chats === undefined ? { requests, stickers } : { requests, stickers, chats } });
beforeEach(() => { fetchHome.mockReset(); resetSocial(); });

it('is unavailable on an older server, and keeps the last good home after an error', async () => {
  fetchHome.mockResolvedValueOnce(null);
  await refreshSocial();
  expect(getSocialState()).toEqual({ status: 'unavailable' });
  fetchHome.mockResolvedValueOnce(home(1, 0));
  await refreshSocial();
  expect(getSocialState()).toMatchObject({ status: 'ready' });
  fetchHome.mockRejectedValueOnce(new Error('offline'));
  await refreshSocial();
  expect(getSocialState()).toMatchObject({ status: 'ready' });
  resetSocial();
  fetchHome.mockRejectedValueOnce(new Error('offline'));
  await refreshSocial();
  expect(getSocialState()).toEqual({ status: 'error' });
});

it('the unread flag and count cover requests and unseen stickers', async () => {
  function Probe() { return <Text testID="dot">{`${String(useSocialUnread())}:${useSocialUnreadCount()}`}</Text>; }
  render(<Probe />);
  expect(screen.getByTestId('dot')).toHaveTextContent('false:0');
  fetchHome.mockResolvedValueOnce(home(1, 2));
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('true:3');
  fetchHome.mockResolvedValueOnce(home(0, 0));
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('false:0');
});

it('the unread count tolerates a home without unread, or with fields missing', async () => {
  function Probe() { return <Text testID="dot">{`${String(useSocialUnread())}:${useSocialUnreadCount()}`}</Text>; }
  render(<Probe />);
  fetchHome.mockResolvedValueOnce({ ...home(0, 0), unread: undefined });
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('false:0');
  fetchHome.mockResolvedValueOnce({ ...home(0, 0), unread: { stickers: 2 } });
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('true:2');
});

it('a failed refresh while unavailable stays unavailable (an older backend keeps Social hidden)', async () => {
  fetchHome.mockResolvedValueOnce(null);
  await refreshSocial();
  fetchHome.mockRejectedValueOnce(new Error('offline'));
  await refreshSocial();
  expect(getSocialState()).toEqual({ status: 'unavailable' });
});

it('a refresh during an in-flight load reloads once after it, and callers wait for that reload', async () => {
  let resolveFirst!: (h: unknown) => void;
  fetchHome.mockReturnValueOnce(new Promise((r) => { resolveFirst = r; })).mockResolvedValueOnce(home(2, 0));
  const first = refreshSocial();
  // Two calls while the first runs: one extra load, not two.
  const second = refreshSocial();
  const third = refreshSocial();
  resolveFirst(home(0, 0));
  await Promise.all([first, second, third]);
  expect(fetchHome).toHaveBeenCalledTimes(2);
  expect(getSocialState()).toEqual({ status: 'ready', home: home(2, 0) });
  // Settled: the next refresh starts a fresh single load.
  fetchHome.mockResolvedValueOnce(home(0, 0));
  await refreshSocial();
  expect(fetchHome).toHaveBeenCalledTimes(3);
});

it('a load that started before a reset never lands after it', async () => {
  let resolve!: (h: unknown) => void;
  fetchHome.mockReturnValue(new Promise((r) => { resolve = r; }));
  const pending = refreshSocial();
  resetSocial();
  resolve(home(1, 0));
  await pending;
  expect(getSocialState()).toEqual({ status: 'idle' });
});

it('a reset during an in-flight load drops the pending reload too', async () => {
  let resolve!: (h: unknown) => void;
  fetchHome.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  const pending = refreshSocial();
  void refreshSocial();
  resetSocial();
  resolve(home(1, 0));
  await pending;
  expect(fetchHome).toHaveBeenCalledTimes(1);
  expect(getSocialState()).toEqual({ status: 'idle' });
});

it('a stale load settling after a reset does not free the newer load (one load at a time)', async () => {
  let resolveStale!: (h: unknown) => void;
  let resolveNewer!: (h: unknown) => void;
  fetchHome
    .mockReturnValueOnce(new Promise((r) => { resolveStale = r; }))
    .mockReturnValueOnce(new Promise((r) => { resolveNewer = r; }))
    .mockResolvedValue(home(0, 0));
  const stale = refreshSocial();
  resetSocial();
  const newer = refreshSocial();
  resolveStale(home(1, 0));
  await stale;
  await Promise.resolve();
  // The newer load is still running: this joins it instead of starting a second one.
  void refreshSocial();
  expect(fetchHome).toHaveBeenCalledTimes(2);
  resolveNewer(home(0, 0));
  await newer;
});

it('counts unread chats in the dot, and knows whether the server has Chats', async () => {
  function Probe() { return <Text testID="dot">{`${useSocialUnreadCount()}:${String(useChatsAvailable())}`}</Text>; }
  render(<Probe />);
  expect(screen.getByTestId('dot')).toHaveTextContent('0:null');
  fetchHome.mockResolvedValueOnce(home(1, 0, 2));
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('3:true');
  fetchHome.mockResolvedValueOnce(home(1, 0)); // an S2 server: no chats
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('1:false');
  fetchHome.mockResolvedValueOnce(null);
  await act(() => refreshSocial());
  expect(screen.getByTestId('dot')).toHaveTextContent('0:false');
  expect(chatsBadgeCount({ requests: 2, stickers: 5, chats: 3 })).toBe(5);
  expect(chatsBadgeCount(undefined)).toBe(0);
});
