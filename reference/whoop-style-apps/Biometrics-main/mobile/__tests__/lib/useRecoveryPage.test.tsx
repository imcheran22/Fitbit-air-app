import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fetchRecoveryMonth, fetchRecoveryPage, type RecoveryPageDTO } from '../../src/api/recovery';
import { useRecoveryPage } from '../../src/lib/useRecoveryPage';

jest.mock('../../src/api/recovery', () => ({ fetchRecoveryPage: jest.fn(), fetchRecoveryMonth: jest.fn() }));
// Mutable so a test can simulate a finished sync (bump it, then rerender).
let mockDataVersion = 0;
jest.mock('../../src/sync/SyncProvider', () => ({ useSync: () => ({ dataVersion: mockDataVersion }) }));

// Runs the focus callback once on mount, like a screen that mounts focused, and keeps the
// latest callback so a test can simulate the screen regaining focus.
let mockFocusCallback: (() => void) | null = null;
jest.mock('@react-navigation/native', () => {
  const R = jest.requireActual('react');
  return {
    useFocusEffect: (cb: () => void) => {
      mockFocusCallback = cb;
      R.useEffect(cb, []);
    },
  };
});
const refocus = () => act(() => { mockFocusCallback?.(); });

const pageFetch = fetchRecoveryPage as jest.Mock;
const monthFetch = fetchRecoveryMonth as jest.Mock;

const MONTH = { month: '2026-10', days: [{ date: '2026-10-08', score: 68 }], average: 68, counts: { excellent: 0, good: 1, fair: 0, low: 0 } };
const PAGE = { date: '2026-10-08', isToday: true, state: 'READY', month: MONTH } as unknown as RecoveryPageDTO;
const SEPT = { month: '2026-09', days: [], average: null, counts: { excellent: 0, good: 0, fair: 0, low: 0 } };

beforeEach(() => {
  pageFetch.mockReset();
  monthFetch.mockReset();
  mockFocusCallback = null;
  mockDataVersion = 0;
});

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}
const flush = () => act(async () => {});

describe('useRecoveryPage', () => {
  it('starts loading, then is ready with the page for today', async () => {
    pageFetch.mockResolvedValue(PAGE);
    const { result } = renderHook(() => useRecoveryPage());
    expect(result.current.state).toBe('loading');
    expect(result.current.page).toBeNull();
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.page).toBe(PAGE);
    expect(result.current.errorKind).toBeNull();
    expect(pageFetch).toHaveBeenCalledWith('today');
  });

  it('fetches a past day by its date', async () => {
    pageFetch.mockResolvedValue(PAGE);
    const { result } = renderHook(() => useRecoveryPage('2026-10-02'));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(pageFetch).toHaveBeenCalledWith('2026-10-02');
  });

  it('fetches today once on mount, and again only when the screen regains focus', async () => {
    pageFetch.mockResolvedValue(PAGE);
    const { result } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(pageFetch).toHaveBeenCalledTimes(1);
    refocus();
    await waitFor(() => expect(pageFetch).toHaveBeenCalledTimes(2));
    expect(result.current.state).toBe('ready');
  });

  it('refetches on focus when an explicit date turns out to be today (Home passes a date)', async () => {
    pageFetch.mockResolvedValue(PAGE);
    const { result } = renderHook(() => useRecoveryPage('2026-10-08'));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(pageFetch).toHaveBeenCalledTimes(1);
    refocus();
    await waitFor(() => expect(pageFetch).toHaveBeenCalledTimes(2));
    expect(pageFetch).toHaveBeenLastCalledWith('2026-10-08');
  });

  it('does not refetch a past day on focus', async () => {
    pageFetch.mockResolvedValue({ ...PAGE, date: '2026-10-02', isToday: false });
    const { result } = renderHook(() => useRecoveryPage('2026-10-02'));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    refocus();
    expect(pageFetch).toHaveBeenCalledTimes(1);
  });

  it('a rejection is an error of kind other; a 400 is a future day', async () => {
    pageFetch.mockRejectedValue(new Error('boom'));
    const other = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(other.result.current.state).toBe('error'));
    expect(other.result.current.errorKind).toBe('other');

    pageFetch.mockRejectedValue({ status: 400 });
    const future = renderHook(() => useRecoveryPage('2026-12-01'));
    await waitFor(() => expect(future.result.current.state).toBe('error'));
    expect(future.result.current.errorKind).toBe('future');
  });

  it("the bundle's month is ready straight away, with no month fetch", async () => {
    pageFetch.mockResolvedValue(PAGE);
    const { result } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(result.current.month('2026-10')).toEqual({ status: 'ready', data: MONTH });
    expect(monthFetch).not.toHaveBeenCalled();
  });

  it('loadMonth fetches a month once and caches it', async () => {
    pageFetch.mockResolvedValue(PAGE);
    monthFetch.mockResolvedValue({ month: SEPT, bands: { excellent: 75, good: 55, fair: 40 } });
    const { result } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    act(() => result.current.loadMonth('2026-09'));
    expect(result.current.month('2026-09')).toEqual({ status: 'loading' });
    await waitFor(() => expect(result.current.month('2026-09')).toEqual({ status: 'ready', data: SEPT }));
    act(() => result.current.loadMonth('2026-09'));
    expect(monthFetch).toHaveBeenCalledTimes(1);
    expect(monthFetch).toHaveBeenCalledWith('2026-09');
  });

  it('a failed month load is an error', async () => {
    pageFetch.mockResolvedValue(PAGE);
    monthFetch.mockRejectedValue(new Error('boom'));
    const { result } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    act(() => result.current.loadMonth('2026-09'));
    await waitFor(() => expect(result.current.month('2026-09')).toEqual({ status: 'error' }));
  });

  it('a sync refetches quietly: the page stays ready throughout, never loading', async () => {
    const fresh = { ...PAGE, updatedAt: 'later' } as RecoveryPageDTO;
    pageFetch.mockResolvedValueOnce(PAGE).mockResolvedValueOnce(fresh);
    const states: string[] = [];
    const { result, rerender } = renderHook(() => {
      const r = useRecoveryPage();
      states.push(r.state);
      return r;
    });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    states.length = 0;
    mockDataVersion = 1;
    rerender({});
    await waitFor(() => expect(result.current.page).toBe(fresh));
    expect(pageFetch).toHaveBeenCalledTimes(2);
    expect(states.length).toBeGreaterThan(0);
    expect(states.every((s) => s === 'ready')).toBe(true);
  });

  it('a failed refresh after a sync keeps the page', async () => {
    pageFetch.mockResolvedValueOnce(PAGE).mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    mockDataVersion = 1;
    rerender({});
    await waitFor(() => expect(pageFetch).toHaveBeenCalledTimes(2));
    await flush();
    expect(result.current.state).toBe('ready');
    expect(result.current.page).toBe(PAGE);
    expect(result.current.errorKind).toBeNull();
  });

  it('only the latest request lands: an older response arriving late is dropped, month included', async () => {
    const older = deferred<RecoveryPageDTO>();
    const newer = deferred<RecoveryPageDTO>();
    const OLD = { ...PAGE, updatedAt: 'old', month: { ...MONTH, month: '2026-08' } } as RecoveryPageDTO;
    const NEW = { ...PAGE, updatedAt: 'new' } as RecoveryPageDTO;
    pageFetch.mockResolvedValueOnce(PAGE).mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const { result, rerender } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    refocus(); // quiet focus refresh starts (older)
    mockDataVersion = 1;
    rerender({}); // the sync refresh starts after it (newer)
    expect(pageFetch).toHaveBeenCalledTimes(3);
    await act(async () => { newer.resolve(NEW); });
    await act(async () => { older.resolve(OLD); });
    expect(result.current.page).toBe(NEW);
    expect(result.current.month('2026-08')).toEqual({ status: 'loading' });
  });

  it('a new date shows loading until its page arrives, never the old page', async () => {
    const next = deferred<RecoveryPageDTO>();
    const OTHER = { ...PAGE, date: '2026-10-01', isToday: false } as RecoveryPageDTO;
    pageFetch.mockResolvedValueOnce(PAGE).mockReturnValueOnce(next.promise);
    const { result, rerender } = renderHook(({ d }: { d: string }) => useRecoveryPage(d), { initialProps: { d: '2026-10-02' } });
    await waitFor(() => expect(result.current.state).toBe('ready'));
    rerender({ d: '2026-10-01' });
    expect(result.current.state).toBe('loading');
    expect(result.current.page).toBeNull();
    await act(async () => { next.resolve(OTHER); });
    expect(result.current.state).toBe('ready');
    expect(result.current.page).toBe(OTHER);
  });

  it('reload after an error shows loading, then ready', async () => {
    const retry = deferred<RecoveryPageDTO>();
    pageFetch.mockRejectedValueOnce(new Error('boom')).mockReturnValueOnce(retry.promise);
    const { result } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('error'));
    act(() => result.current.reload());
    expect(result.current.state).toBe('loading');
    await act(async () => { retry.resolve(PAGE); });
    expect(result.current.state).toBe('ready');
  });

  it('loadMonth keeps its identity as the month cache changes', async () => {
    pageFetch.mockResolvedValue(PAGE);
    monthFetch.mockResolvedValue({ month: SEPT, bands: { excellent: 75, good: 55, fair: 40 } });
    const { result } = renderHook(() => useRecoveryPage());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    const first = result.current.loadMonth;
    act(() => result.current.loadMonth('2026-09'));
    await waitFor(() => expect(result.current.month('2026-09').status).toBe('ready'));
    expect(result.current.loadMonth).toBe(first);
  });

  it('reload refetches', async () => {
    pageFetch.mockResolvedValue(PAGE);
    const { result } = renderHook(() => useRecoveryPage('2026-10-02'));
    await waitFor(() => expect(result.current.state).toBe('ready'));
    act(() => result.current.reload());
    await waitFor(() => expect(result.current.state).toBe('ready'));
    expect(pageFetch).toHaveBeenCalledTimes(2);
  });
});
