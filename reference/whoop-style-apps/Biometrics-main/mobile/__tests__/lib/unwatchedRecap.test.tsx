import { act, renderHook } from '@testing-library/react-native';
import { AppState } from 'react-native';
import { fetchRecaps, markRecapOpened, type RecapSummary } from '../../src/api/recaps';
import {
  isRecapWatched,
  openRecap,
  recapDestination,
  refreshUnwatchedRecap,
  resetUnwatchedRecap,
  selectUnwatched,
  useUnwatchedRecap,
} from '../../src/lib/unwatchedRecap';

jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(), markRecapOpened: jest.fn() }));
const fetchMock = fetchRecaps as jest.Mock;
const openedMock = markRecapOpened as jest.Mock;

const summary = (over: Partial<RecapSummary> = {}): RecapSummary => ({
  id: 'w40', kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'A steady week.', personaId: 'mochi',
  builtAt: '2026-10-05T09:00:00.000Z', openedAt: null, ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  resetUnwatchedRecap();
  fetchMock.mockResolvedValue([summary()]);
  openedMock.mockResolvedValue(undefined);
});

describe('selectUnwatched (the newest weekly recap, while it is unopened)', () => {
  it('is the newest week when it has not been opened; a month never rings', () => {
    expect(selectUnwatched(summary(), new Set())?.id).toBe('w40');
    expect(selectUnwatched(summary({ id: 'sep', kind: 'MONTH' }), new Set())).toBeNull();
  });

  it('is nothing once it is opened, on the server or here', () => {
    expect(selectUnwatched(summary({ openedAt: '2026-10-05T10:00:00.000Z' }), new Set())).toBeNull();
    expect(selectUnwatched(summary(), new Set(['w40']))).toBeNull();
    expect(selectUnwatched(undefined, new Set())).toBeNull();
  });

  it('reads a recap as watched once opened on the server or in this session', () => {
    expect(isRecapWatched(summary(), new Set())).toBe(false);
    expect(isRecapWatched(summary({ openedAt: 'x' }), new Set())).toBe(true);
    expect(isRecapWatched(summary(), new Set(['w40']))).toBe(true);
  });
});

it('sends a week to the story viewer and a month to its recap screen', () => {
  expect(recapDestination({ id: 'w40', kind: 'WEEK' })).toEqual({ name: 'RecapStory', params: { id: 'w40' } });
  expect(recapDestination({ id: 'sep', kind: 'MONTH' })).toEqual({ name: 'Recap', params: { id: 'sep' } });
});

describe('useUnwatchedRecap (one store for the Home avatar, the tab bar and Profile)', () => {
  it('loads the newest recap once for every screen that shows it', async () => {
    const a = renderHook(() => useUnwatchedRecap());
    const b = renderHook(() => useUnwatchedRecap());
    await act(async () => {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // Weeks only: a month has its own push and shelf circle, never the ring.
    expect(fetchMock).toHaveBeenCalledWith({ kind: 'WEEK', limit: 1 });
    expect(a.result.current.recap?.id).toBe('w40');
    expect(b.result.current.recap?.id).toBe('w40');
  });

  it('clears everywhere the moment the recap is opened, and posts opened once', async () => {
    const a = renderHook(() => useUnwatchedRecap());
    const b = renderHook(() => useUnwatchedRecap());
    await act(async () => {});
    await act(async () => openRecap('w40'));
    expect(a.result.current.recap).toBeNull();
    expect(b.result.current.recap).toBeNull();
    expect(a.result.current.watched.has('w40')).toBe(true);
    expect(openedMock).toHaveBeenCalledTimes(1);
    expect(openedMock).toHaveBeenCalledWith('w40');
    // The story after the recap screen (or a second open) does not post again.
    await act(async () => openRecap('w40'));
    expect(openedMock).toHaveBeenCalledTimes(1);
    // A load that started before the open and lands after it does not bring the ring back.
    await act(async () => refreshUnwatchedRecap());
    expect(a.result.current.recap).toBeNull();
  });

  it('a failed post clears the ring for now but is tried again on the next open', async () => {
    openedMock.mockRejectedValueOnce(new Error('offline'));
    const a = renderHook(() => useUnwatchedRecap());
    await act(async () => {});
    await act(async () => openRecap('w40'));
    expect(a.result.current.recap).toBeNull();
    // Not remembered as opened, so the next open posts again.
    expect(a.result.current.watched.has('w40')).toBe(false);
    await act(async () => openRecap('w40'));
    expect(openedMock).toHaveBeenCalledTimes(2);
    expect(a.result.current.watched.has('w40')).toBe(true);
  });

  it('does not post for a recap the server already has as opened, but still clears its ring', async () => {
    const a = renderHook(() => useUnwatchedRecap());
    await act(async () => {});
    await act(async () => openRecap('w40', '2026-10-05T10:00:00.000Z'));
    expect(openedMock).not.toHaveBeenCalled();
    expect(a.result.current.recap).toBeNull();
    expect(a.result.current.watched.has('w40')).toBe(true);
  });

  it('shows nothing when the list fails to load or is empty', async () => {
    fetchMock.mockRejectedValue(new Error('500'));
    const a = renderHook(() => useUnwatchedRecap());
    await act(async () => {});
    expect(a.result.current.recap).toBeNull();
    fetchMock.mockResolvedValue([]);
    await act(async () => refreshUnwatchedRecap());
    expect(a.result.current.recap).toBeNull();
  });

  it('reloads on focus and when the app comes back to the foreground', async () => {
    const listeners: Record<string, () => void> = {};
    const navigation = { addListener: jest.fn((event: string, fn: () => void) => ((listeners[event] = fn), () => undefined)) };
    let onAppState: ((s: string) => void) | undefined;
    jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      onAppState = fn;
      return { remove: jest.fn() };
    }) as never);
    const a = renderHook(() => useUnwatchedRecap(navigation));
    await act(async () => {});
    expect(a.result.current.recap?.id).toBe('w40');
    fetchMock.mockResolvedValue([summary({ id: 'w41', personaId: 'luna' })]);
    await act(async () => listeners.focus!());
    expect(a.result.current.recap?.id).toBe('w41');
    fetchMock.mockResolvedValue([summary({ id: 'w41', openedAt: 'x' })]);
    await act(async () => onAppState!('active'));
    expect(a.result.current.recap).toBeNull();
    jest.restoreAllMocks();
  });

  it('forgets everything when the last screen using it goes (sign out), so another account starts clean', async () => {
    const a = renderHook(() => useUnwatchedRecap());
    await act(async () => {});
    await act(async () => openRecap('w40'));
    a.unmount();
    fetchMock.mockResolvedValue([summary()]);
    const b = renderHook(() => useUnwatchedRecap());
    await act(async () => {});
    expect(b.result.current.recap?.id).toBe('w40');
  });
});
