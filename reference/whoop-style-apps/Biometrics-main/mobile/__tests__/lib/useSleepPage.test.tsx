import { act, renderHook, waitFor } from '@testing-library/react-native';
import { fetchScoreDetail } from '../../src/api/scores';
import { fetchSleep, fetchSleepGoal, fetchSleepNight, fetchSleepRegularity } from '../../src/api/sleep';
import { readWindDown } from '../../src/lib/windDown';
import { anchorFor, monthSpan, resolveNight, useSleepPage, windowRange } from '../../src/lib/useSleepPage';
import { GOAL, REGULARITY, REMINDER, TODAY, makeDetail, makeNight, makeScore, makeWindow } from '../../jest-mocks/sleepPageFixture';

jest.mock('../../src/api/sleep', () => ({ fetchSleep: jest.fn(), fetchSleepNight: jest.fn(), fetchSleepRegularity: jest.fn(), fetchSleepGoal: jest.fn() }));
jest.mock('../../src/api/scores', () => ({ fetchScoreDetail: jest.fn() }));
jest.mock('../../src/lib/windDown', () => ({ readWindDown: jest.fn() }));
// The device clock says Thu 8 Oct 2026.
jest.mock('../../src/lib/heatmap', () => ({ ...jest.requireActual('../../src/lib/heatmap'), todayCivil: () => '2026-10-08' }));
let mockDataVersion = 0;
jest.mock('../../src/sync/SyncProvider', () => ({ useSync: () => ({ dataVersion: mockDataVersion, state: 'idle' }) }));
// Runs the focus callback once on mount (a screen that mounts focused) and keeps it for a refocus.
let mockFocusCallback: (() => void) | null = null;
jest.mock('@react-navigation/native', () => {
  const R = jest.requireActual('react');
  return { useFocusEffect: (cb: () => void) => { mockFocusCallback = cb; R.useEffect(cb, []); } };
});

const sleepFetch = fetchSleep as jest.Mock;
const nightFetch = fetchSleepNight as jest.Mock;
const scoreFetch = fetchScoreDetail as jest.Mock;
const regularityFetch = fetchSleepRegularity as jest.Mock;
const goalFetch = fetchSleepGoal as jest.Mock;
const reminderRead = readWindDown as jest.Mock;
const flush = () => act(async () => {});
const refocus = () => act(() => { mockFocusCallback?.(); });
const notFound = () => Object.assign(new Error('not found'), { status: 404 });
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDataVersion = 0;
  mockFocusCallback = null;
  sleepFetch.mockResolvedValue(makeWindow());
  nightFetch.mockImplementation((d: string) => Promise.resolve(makeDetail(d)));
  scoreFetch.mockImplementation((d: string) => Promise.resolve(makeScore(d)));
  regularityFetch.mockResolvedValue(REGULARITY);
  goalFetch.mockResolvedValue(GOAL);
  reminderRead.mockResolvedValue(REMINDER);
});

describe('pure rules (spec §3.0)', () => {
  it('D is the param clamped to today, else the newest night in the last 7, else today', () => {
    expect(resolveNight('2026-10-05', TODAY, null)).toBe('2026-10-05');
    expect(resolveNight('2026-10-20', TODAY, null)).toBe(TODAY);
    expect(resolveNight(undefined, TODAY, makeWindow().nights)).toBe(TODAY);
    expect(resolveNight(undefined, TODAY, makeWindow().nights.filter((n) => n.date !== TODAY))).toBe('2026-10-07');
    expect(resolveNight(undefined, TODAY, [makeNight('2026-09-20')])).toBe(TODAY);
    expect(resolveNight(undefined, TODAY, null)).toBeNull();
  });
  it('a nap-only date is never the default night', () => {
    expect(resolveNight(undefined, TODAY, [makeNight('2026-10-07'), makeNight(TODAY, { mainIsNap: true })])).toBe('2026-10-07');
  });
  it('anchors on today for the last 7 nights, else on the night itself', () => {
    expect(anchorFor('2026-10-02', TODAY)).toBe(TODAY);
    expect(anchorFor('2026-10-01', TODAY)).toBe('2026-10-01');
  });
  it('the window covers the whole anchor month and two weeks before it, never past today', () => {
    expect(windowRange(TODAY, TODAY)).toEqual({ from: '2026-09-18', to: TODAY });
    expect(windowRange('2026-10-28', '2026-10-28')).toEqual({ from: '2026-09-18', to: '2026-10-28' });
    expect(windowRange('2026-09-10', TODAY)).toEqual({ from: '2026-08-19', to: '2026-09-30' });
  });
  it('the window is the same for every anchor in one month (final review I-3)', () => {
    for (const a of ['2026-09-01', '2026-09-07', '2026-09-13', '2026-09-30']) {
      expect(windowRange(a, TODAY)).toEqual({ from: '2026-08-19', to: '2026-09-30' });
    }
    // An old night early in this month shares the current week's window.
    expect(windowRange('2026-10-01', TODAY)).toEqual(windowRange(TODAY, TODAY));
  });
  it('month spans', () => {
    expect(monthSpan('2026-10', TODAY)).toEqual({ from: '2026-10-01', to: TODAY });
    expect(monthSpan('2026-02', TODAY)).toEqual({ from: '2026-02-01', to: '2026-02-28' });
  });
});

describe('useSleepPage', () => {
  it('loads the page-scoped sections once and the night for the param, with no double fetch on the mount focus', async () => {
    const { result } = renderHook(() => useSleepPage('2026-10-05'));
    expect(result.current.date).toBe('2026-10-05');
    expect(result.current.anchor).toBe(TODAY);
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    expect(sleepFetch).toHaveBeenCalledTimes(1);
    expect(sleepFetch).toHaveBeenCalledWith('2026-09-18', TODAY);
    expect(scoreFetch).toHaveBeenCalledWith('2026-10-05', 'SLEEP');
    expect(nightFetch).toHaveBeenCalledWith('2026-10-05');
    expect(regularityFetch).toHaveBeenCalledWith(7);
    expect(goalFetch).toHaveBeenCalledTimes(1);
    expect(reminderRead).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(result.current.reminder).toEqual(REMINDER));
  });

  it('with no param, D waits for the nights and is then the newest night', async () => {
    sleepFetch.mockResolvedValue(makeWindow({ nights: makeWindow().nights.filter((n) => n.date !== TODAY) }));
    const { result } = renderHook(() => useSleepPage());
    expect(result.current.date).toBeNull();
    expect(nightFetch).not.toHaveBeenCalled();
    await waitFor(() => expect(result.current.date).toBe('2026-10-07'));
    await waitFor(() => expect(nightFetch).toHaveBeenCalledWith('2026-10-07'));
  });

  it('with no param and a failed nights load, D falls back to today', async () => {
    sleepFetch.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useSleepPage());
    await waitFor(() => expect(result.current.date).toBe(TODAY));
  });

  it('clamps a future param to today', async () => {
    const { result } = renderHook(() => useSleepPage('2026-11-01'));
    expect(result.current.date).toBe(TODAY);
    await flush();
  });

  it('anchors an old night on itself and fetches its own weeks', async () => {
    const { result } = renderHook(() => useSleepPage('2026-09-10'));
    expect(result.current.anchor).toBe('2026-09-10');
    await flush();
    expect(sleepFetch).toHaveBeenCalledWith('2026-08-19', '2026-09-30');
  });

  it('reads a 404 night as no night while the score may still be there', async () => {
    nightFetch.mockRejectedValue(notFound());
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    const night = result.current.night;
    if (night.status !== 'ready') throw new Error('not ready');
    expect(night.data.night).toBeNull();
    expect(night.data.score?.score.score).toBe(78);
  });

  it('a score 404 is no score (fetchScoreDetail already returns null)', async () => {
    scoreFetch.mockResolvedValue(null);
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    expect(result.current.night.status === 'ready' && result.current.night.data.score).toBeNull();
  });

  it('switching nights fetches the new one; a revisited night comes from the cache', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: TODAY } });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    rerender({ d: '2026-10-05' });
    await waitFor(() => expect(nightFetch).toHaveBeenCalledWith('2026-10-05'));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    rerender({ d: TODAY });
    expect(result.current.night.status).toBe('ready');
    expect(nightFetch).toHaveBeenCalledTimes(2);
    // The page-scoped window is not refetched by a tap inside the week.
    expect(sleepFetch).toHaveBeenCalledTimes(1);
  });

  it('only the latest night request lands', async () => {
    const slow = deferred<ReturnType<typeof makeDetail>>();
    nightFetch.mockImplementationOnce(() => slow.promise);
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: '2026-10-04' } });
    rerender({ d: '2026-10-05' });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    await act(async () => { slow.resolve(makeDetail('2026-10-04')); });
    const night = result.current.night;
    expect(night.status === 'ready' && night.data.night?.date).toBe('2026-10-05');
  });

  it('a failed night shows the error, and reloadNight fetches again', async () => {
    scoreFetch.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('error'));
    act(() => result.current.reloadNight());
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    expect(scoreFetch).toHaveBeenCalledTimes(2);
  });

  it('a sync refreshes quietly: the shown night stays ready while it refetches, and the cache is cleared', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: '2026-10-05' } });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    rerender({ d: TODAY });
    await waitFor(() => expect(nightFetch).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    const pending = deferred<ReturnType<typeof makeDetail>>();
    nightFetch.mockImplementationOnce(() => pending.promise);
    mockDataVersion = 1;
    rerender({ d: TODAY });
    expect(result.current.night.status).toBe('ready');
    expect(result.current.window.phase).toBe('ready');
    await act(async () => { pending.resolve(makeDetail(TODAY)); });
    expect(nightFetch).toHaveBeenCalledTimes(3);
    await waitFor(() => expect(sleepFetch).toHaveBeenCalledTimes(2));
    // The cache was cleared: going back to the 5th fetches it again.
    rerender({ d: '2026-10-05' });
    await waitFor(() => expect(nightFetch).toHaveBeenCalledTimes(4));
  });

  it('a failed quiet refresh keeps the night on screen', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: TODAY } });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    scoreFetch.mockRejectedValueOnce(new Error('offline'));
    mockDataVersion = 1;
    rerender({ d: TODAY });
    await flush();
    expect(result.current.night.status).toBe('ready');
  });

  it("a refocus on today's week refreshes everything quietly", async () => {
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    refocus();
    expect(result.current.night.status).toBe('ready');
    await flush();
    expect(sleepFetch).toHaveBeenCalledTimes(2);
    expect(regularityFetch).toHaveBeenCalledTimes(2);
    expect(goalFetch).toHaveBeenCalledTimes(2);
    expect(reminderRead).toHaveBeenCalledTimes(2);
    expect(nightFetch).toHaveBeenCalledTimes(2);
    expect(result.current.window.phase).toBe('ready');
  });

  it('a refocus on an old night only re-reads the goal and the reminder', async () => {
    const { result } = renderHook(() => useSleepPage('2026-09-10'));
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    refocus();
    await flush();
    expect(goalFetch).toHaveBeenCalledTimes(2);
    expect(reminderRead).toHaveBeenCalledTimes(2);
    expect(sleepFetch).toHaveBeenCalledTimes(1);
    expect(nightFetch).toHaveBeenCalledTimes(1);
  });

  it("takes today from the server once it answers, and refetches the window for the server's week", async () => {
    sleepFetch.mockResolvedValue(makeWindow({ today: '2026-10-09' }));
    const { result } = renderHook(() => useSleepPage());
    await waitFor(() => expect(result.current.today).toBe('2026-10-09'));
    await waitFor(() => expect(sleepFetch).toHaveBeenLastCalledWith('2026-09-18', '2026-10-09'));
    expect(result.current.anchor).toBe('2026-10-09');
  });

  it("the server's today refetches the window quietly: the page never goes back to loading (ruling F16)", async () => {
    const second = deferred<ReturnType<typeof makeWindow>>();
    sleepFetch.mockResolvedValueOnce(makeWindow({ today: '2026-10-09' })).mockImplementationOnce(() => second.promise);
    const seen: { window: string; date: string | null; night: string }[] = [];
    const { result } = renderHook(() => {
      const page = useSleepPage();
      seen.push({ window: page.window.phase, date: page.date, night: page.night.status });
      return page;
    });
    await waitFor(() => expect(sleepFetch).toHaveBeenLastCalledWith('2026-09-18', '2026-10-09'));
    await flush();
    // The refetch for the server's week is still in flight; the device-week nights stay on screen.
    expect(result.current.window.phase).toBe('ready');
    expect(result.current.date).toBe(TODAY);
    await act(async () => { second.resolve(makeWindow({ today: '2026-10-09' })); });
    expect(sleepFetch).toHaveBeenCalledTimes(2);
    expect(result.current.window.phase).toBe('ready');
    const firstReady = seen.findIndex((s) => s.window === 'ready');
    expect(firstReady).toBeGreaterThanOrEqual(0);
    expect(seen.slice(firstReady).every((s) => s.window === 'ready' && s.date !== null)).toBe(true);
    const firstNight = seen.findIndex((s) => s.night === 'ready');
    expect(seen.slice(firstNight).every((s) => s.night === 'ready')).toBe(true);
  });

  it("a failed refetch for the server's week keeps the nights on screen (ruling F16)", async () => {
    sleepFetch.mockResolvedValueOnce(makeWindow({ today: '2026-10-09' })).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSleepPage());
    await waitFor(() => expect(sleepFetch).toHaveBeenCalledTimes(2));
    await flush();
    expect(result.current.window.phase).toBe('ready');
    expect(result.current.date).toBe(TODAY);
  });

  it("with a date param, the server's today also refetches the window quietly (Task 3 I-2)", async () => {
    const second = deferred<ReturnType<typeof makeWindow>>();
    sleepFetch.mockResolvedValueOnce(makeWindow({ today: '2026-10-09' })).mockImplementationOnce(() => second.promise);
    const seen: string[] = [];
    const { result } = renderHook(() => {
      const page = useSleepPage('2026-10-09');
      seen.push(page.window.phase);
      return page;
    });
    // The device guess clamps the param to 8 Oct; the server's today moves the week to end on the 9th.
    expect(sleepFetch).toHaveBeenCalledWith('2026-09-18', TODAY);
    await waitFor(() => expect(sleepFetch).toHaveBeenLastCalledWith('2026-09-18', '2026-10-09'));
    await flush();
    expect(result.current.window.phase).toBe('ready');
    expect(result.current.date).toBe('2026-10-09');
    await act(async () => { second.resolve(makeWindow({ today: '2026-10-09' })); });
    const firstReady = seen.indexOf('ready');
    expect(firstReady).toBeGreaterThanOrEqual(0);
    expect(seen.slice(firstReady).every((p) => p === 'ready')).toBe(true);
  });

  it('a tap to another old night in the same month keeps the window: no loading, no refetch (final review I-3)', async () => {
    const seen: string[] = [];
    const { result, rerender } = renderHook(({ d }: { d: string }) => {
      const page = useSleepPage(d);
      seen.push(page.window.phase);
      return page;
    }, { initialProps: { d: '2026-09-10' } });
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    seen.length = 0;
    rerender({ d: '2026-09-07' });
    await flush();
    expect(result.current.anchor).toBe('2026-09-07');
    expect(seen.every((p) => p === 'ready')).toBe(true);
    expect(sleepFetch).toHaveBeenCalledTimes(1);
  });

  it('a new date param is a different page: an old night shows the window loading', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: TODAY } });
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    rerender({ d: '2026-09-10' });
    expect(result.current.window.phase).toBe('loading');
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
  });

  it('an old-week cross-month tap keeps the window ready while the new month loads', async () => {
    // 3 Sep's week includes 31 Aug. That week's nights are already in the September fetch.
    const pending = deferred<ReturnType<typeof makeWindow>>();
    sleepFetch.mockImplementation((from: string) => (from === '2026-08-19' ? Promise.resolve(makeWindow()) : pending.promise));
    const seen: string[] = [];
    const { result, rerender } = renderHook(({ d }: { d: string }) => {
      const page = useSleepPage(d);
      seen.push(page.window.phase);
      return page;
    }, { initialProps: { d: '2026-09-03' } });
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    seen.length = 0;
    rerender({ d: '2026-08-31' });
    expect(result.current.anchor).toBe('2026-08-31');
    expect(result.current.window.phase).toBe('ready');
    expect(seen.every((p) => p === 'ready')).toBe(true);
    expect(sleepFetch).toHaveBeenCalledWith('2026-07-19', '2026-08-31');
    await act(async () => { pending.resolve(makeWindow({ nights: [makeNight('2026-08-31')] })); });
    expect(result.current.window.phase).toBe('ready');
    expect(result.current.window.phase === 'ready' && result.current.window.data.nights.map((n) => n.date)).toEqual(['2026-08-31']);
  });

  it('during a quiet refetch, a month the shown nights do not cover is loading, never ready and empty', async () => {
    const second = deferred<ReturnType<typeof makeWindow>>();
    sleepFetch.mockResolvedValueOnce(makeWindow({ today: '2026-11-01' })).mockImplementationOnce(() => second.promise);
    const { result } = renderHook(() => useSleepPage());
    await waitFor(() => expect(sleepFetch).toHaveBeenLastCalledWith('2026-10-19', '2026-11-01'));
    await flush();
    expect(result.current.window.phase).toBe('ready');
    expect(result.current.month('2026-11').status).toBe('loading');
    await act(async () => { second.resolve(makeWindow({ today: '2026-11-01', nights: [makeNight('2026-11-01')] })); });
    expect(result.current.month('2026-11')).toEqual({ status: 'ready', nights: [makeNight('2026-11-01')] });
  });

  it('a failed quiet refetch leaves a newly covered month in error, not loading, and its retry refetches the window', async () => {
    sleepFetch.mockResolvedValueOnce(makeWindow({ today: '2026-11-01' })).mockRejectedValueOnce(new Error('offline'));
    const { result } = renderHook(() => useSleepPage());
    await waitFor(() => expect(sleepFetch).toHaveBeenLastCalledWith('2026-10-19', '2026-11-01'));
    await flush();
    // The old nights stay on screen, but they never covered November and no month cache holds it.
    expect(result.current.window.phase).toBe('ready');
    expect(result.current.month('2026-11').status).toBe('error');
    sleepFetch.mockResolvedValueOnce(makeWindow({ today: '2026-11-01', nights: [makeNight('2026-11-01')] }));
    act(() => { result.current.retryMonth('2026-11'); });
    expect(sleepFetch).toHaveBeenCalledTimes(3);
    expect(sleepFetch).toHaveBeenLastCalledWith('2026-10-19', '2026-11-01');
    await waitFor(() => expect(result.current.month('2026-11')).toEqual({ status: 'ready', nights: [makeNight('2026-11-01')] }));
  });

  it('a sync refetches a paged-to month quietly: it stays ready and takes the new nights (Task 3 I-1)', async () => {
    const september = (nights: string[]) => makeWindow({ nights: nights.map((d) => makeNight(d)) });
    sleepFetch.mockImplementation((from: string) => Promise.resolve(from === '2026-09-01' ? september(['2026-09-12']) : makeWindow()));
    const { result, rerender } = renderHook((_: { v: number }) => useSleepPage(TODAY), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    act(() => result.current.loadMonth('2026-09'));
    await waitFor(() => expect(result.current.month('2026-09').status).toBe('ready'));
    const pending = deferred<ReturnType<typeof makeWindow>>();
    sleepFetch.mockImplementation((from: string) => (from === '2026-09-01' ? pending.promise : Promise.resolve(makeWindow())));
    mockDataVersion = 1;
    rerender({ v: 1 });
    await flush();
    expect(sleepFetch.mock.calls.filter(([from]) => from === '2026-09-01')).toHaveLength(2);
    expect(result.current.month('2026-09').nights?.map((n) => n.date)).toEqual(['2026-09-12']);
    await act(async () => { pending.resolve(september(['2026-09-12', '2026-09-13'])); });
    expect(result.current.month('2026-09').nights?.map((n) => n.date)).toEqual(['2026-09-12', '2026-09-13']);
  });

  it('a failed month refetch after a sync keeps the month on screen', async () => {
    sleepFetch.mockImplementation((from: string) => Promise.resolve(from === '2026-09-01' ? makeWindow({ nights: [makeNight('2026-09-12')] }) : makeWindow()));
    const { result, rerender } = renderHook((_: { v: number }) => useSleepPage(TODAY), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    act(() => result.current.loadMonth('2026-09'));
    await waitFor(() => expect(result.current.month('2026-09').status).toBe('ready'));
    sleepFetch.mockImplementation((from: string) => (from === '2026-09-01' ? Promise.reject(new Error('offline')) : Promise.resolve(makeWindow())));
    mockDataVersion = 1;
    rerender({ v: 1 });
    await flush();
    expect(result.current.month('2026-09')).toEqual({ status: 'ready', nights: [makeNight('2026-09-12')] });
  });

  it('a month answer started before a sync never lands; the refetch after it does', async () => {
    const before = deferred<ReturnType<typeof makeWindow>>();
    const after = deferred<ReturnType<typeof makeWindow>>();
    const { result, rerender } = renderHook((_: { v: number }) => useSleepPage(TODAY), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    sleepFetch.mockImplementationOnce(() => before.promise);
    act(() => result.current.loadMonth('2026-09'));
    sleepFetch.mockImplementation((from: string) => (from === '2026-09-01' ? after.promise : Promise.resolve(makeWindow())));
    mockDataVersion = 1;
    rerender({ v: 1 });
    await flush();
    expect(sleepFetch.mock.calls.filter(([from]) => from === '2026-09-01')).toHaveLength(2);
    await act(async () => { before.resolve(makeWindow({ nights: [makeNight('2026-09-20')] })); });
    expect(result.current.month('2026-09').status).toBe('loading');
    await act(async () => { after.resolve(makeWindow({ nights: [makeNight('2026-09-12')] })); });
    expect(result.current.month('2026-09').nights?.map((n) => n.date)).toEqual(['2026-09-12']);
  });

  it('reloadNight and retryMonth keep their identity across renders', async () => {
    const { result, rerender } = renderHook(({ d }: { d: string }) => useSleepPage(d), { initialProps: { d: TODAY } });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    const { reloadNight, retryMonth } = result.current;
    rerender({ d: '2026-10-05' });
    await waitFor(() => expect(result.current.night.status).toBe('ready'));
    expect(result.current.reloadNight).toBe(reloadNight);
    expect(result.current.retryMonth).toBe(retryMonth);
  });

  it("a sync that lands last night moves a page opened without a param onto it", async () => {
    sleepFetch.mockResolvedValue(makeWindow({ nights: makeWindow().nights.filter((n) => n.date !== TODAY) }));
    const { result, rerender } = renderHook((_: { v: number }) => useSleepPage(), { initialProps: { v: 0 } });
    await waitFor(() => expect(result.current.date).toBe('2026-10-07'));
    sleepFetch.mockResolvedValue(makeWindow());
    mockDataVersion = 1;
    rerender({ v: 1 });
    await waitFor(() => expect(result.current.date).toBe(TODAY));
  });

  it('serves the anchor month from the window and fetches other months once', async () => {
    const { result } = renderHook(() => useSleepPage(TODAY));
    await waitFor(() => expect(result.current.window.phase).toBe('ready'));
    const oct = result.current.month('2026-10');
    expect(oct.status).toBe('ready');
    expect(oct.nights?.map((n) => n.date)).toEqual(['2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-07', TODAY]);
    act(() => result.current.loadMonth('2026-10'));
    expect(sleepFetch).toHaveBeenCalledTimes(1);

    sleepFetch.mockResolvedValueOnce(makeWindow({ nights: [makeNight('2026-09-12')] }));
    act(() => result.current.loadMonth('2026-09'));
    act(() => result.current.loadMonth('2026-09'));
    expect(sleepFetch).toHaveBeenCalledTimes(2);
    expect(sleepFetch).toHaveBeenLastCalledWith('2026-09-01', '2026-09-30');
    await waitFor(() => expect(result.current.month('2026-09').status).toBe('ready'));
    expect(result.current.month('2026-09').nights?.map((n) => n.date)).toEqual(['2026-09-12']);

    sleepFetch.mockRejectedValueOnce(new Error('offline'));
    act(() => result.current.loadMonth('2026-08'));
    await waitFor(() => expect(result.current.month('2026-08').status).toBe('error'));
    act(() => result.current.retryMonth('2026-08'));
    await waitFor(() => expect(result.current.month('2026-08').status).toBe('ready'));
  });
});
