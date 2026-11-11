import { act, renderHook } from '@testing-library/react-native';
import { achievementsFixture } from '../../jest-mocks/achievementsFixture';
import { fetchAchievements, markCelebrated } from '../../src/api/achievements';
import {
  celebrate, getAchievementsSnapshot, pendingLevels, refreshAchievements, resetAchievements, useAchievements,
} from '../../src/lib/achievementsStore';
import { timezoneSynced } from '../../src/lib/timezone';

jest.mock('../../src/api/achievements');
jest.mock('../../src/lib/timezone', () => ({ timezoneSynced: jest.fn() }));
const synced = timezoneSynced as jest.Mock;
const load = fetchAchievements as jest.Mock;
const post = markCelebrated as jest.Mock;
// Lets the first load's (settled) wait for the time zone sync pass, so its fetch has started.
const flush = () => new Promise((r) => jest.requireActual('timers').setImmediate(r));
const UNCELEBRATED = [{ id: 'a1', family: 'SLEEP_GOAL' as const, level: 1, value: 3, earnedOn: '2026-10-03' }];

beforeEach(() => {
  jest.clearAllMocks();
  resetAchievements();
  post.mockResolvedValue(undefined);
  synced.mockResolvedValue(undefined);
});

it('loads the badges into one shared snapshot that screens subscribe to', async () => {
  load.mockResolvedValue(achievementsFixture());
  const { result } = renderHook(() => useAchievements());
  expect(result.current.state).toEqual({ status: 'idle' });
  await act(() => refreshAchievements());
  expect(result.current.state).toEqual({ status: 'ready', data: achievementsFixture() });
});

it('reads a 404 as unavailable and a first failure as an error', async () => {
  load.mockResolvedValue(null);
  await refreshAchievements();
  expect(getAchievementsSnapshot().state).toEqual({ status: 'unavailable' });
  resetAchievements();
  load.mockRejectedValue(new Error('offline'));
  await refreshAchievements();
  expect(getAchievementsSnapshot().state).toEqual({ status: 'error' });
});

it('keeps what it had when a later refresh fails', async () => {
  load.mockResolvedValue(achievementsFixture());
  await refreshAchievements();
  load.mockRejectedValue(new Error('offline'));
  await refreshAchievements();
  expect(getAchievementsSnapshot().state.status).toBe('ready');
});

it('shares one request between overlapping refreshes', async () => {
  let resolve!: (v: unknown) => void;
  load.mockReturnValue(new Promise((r) => { resolve = r; }));
  const a = refreshAchievements();
  const b = refreshAchievements();
  await flush();
  expect(load).toHaveBeenCalledTimes(1);
  resolve(achievementsFixture());
  await Promise.all([a, b]);
  expect(getAchievementsSnapshot().state.status).toBe('ready');
});

it('a fresh refresh during an older request runs one more request after it, and lands its data', async () => {
  let resolveOld!: (v: unknown) => void;
  load.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
  const after = achievementsFixture({}, { uncelebrated: UNCELEBRATED });
  load.mockResolvedValueOnce(after);
  const old = refreshAchievements();
  const fresh = refreshAchievements({ fresh: true });
  const fresh2 = refreshAchievements({ fresh: true });
  await flush();
  expect(load).toHaveBeenCalledTimes(1);
  resolveOld(achievementsFixture());
  await Promise.all([old, fresh, fresh2]);
  expect(load).toHaveBeenCalledTimes(2);
  expect(getAchievementsSnapshot().state).toEqual({ status: 'ready', data: after });
});

it('a fresh refresh with nothing in flight is a single request', async () => {
  load.mockResolvedValue(achievementsFixture());
  await refreshAchievements({ fresh: true });
  expect(load).toHaveBeenCalledTimes(1);
});

it('a reset drops a fresh re-run that was waiting', async () => {
  let resolveOld!: (v: unknown) => void;
  load.mockReturnValueOnce(new Promise((r) => { resolveOld = r; }));
  const old = refreshAchievements();
  const fresh = refreshAchievements({ fresh: true });
  await flush();
  resetAchievements();
  resolveOld(achievementsFixture());
  await Promise.all([old, fresh]);
  expect(load).toHaveBeenCalledTimes(1);
  expect(getAchievementsSnapshot().state).toEqual({ status: 'idle' });
});

it('celebrating nothing does not reach the server', async () => {
  await celebrate([]);
  expect(post).not.toHaveBeenCalled();
});

it('celebrating hides those levels at once and tells the server; a failed post still hides them this session', async () => {
  load.mockResolvedValue(achievementsFixture({}, { uncelebrated: UNCELEBRATED }));
  await refreshAchievements();
  expect(pendingLevels(getAchievementsSnapshot())).toEqual(UNCELEBRATED);
  post.mockRejectedValueOnce(new Error('offline'));
  await celebrate(['a1']);
  expect(post).toHaveBeenCalledWith(['a1']);
  expect(pendingLevels(getAchievementsSnapshot())).toEqual([]);
});

it('drops a refresh that was in flight when the store is reset (sign out)', async () => {
  let resolve!: (v: unknown) => void;
  load.mockReturnValue(new Promise((r) => { resolve = r; }));
  const run = refreshAchievements();
  await flush();
  resetAchievements();
  resolve(achievementsFixture());
  await run;
  expect(getAchievementsSnapshot().state).toEqual({ status: 'idle' });
});

describe('the first load waits for the time zone sync', () => {
  // A new user's start date is claimed on their first load in the server's copy of their zone.

  afterEach(() => jest.useRealTimers());

  it('fetches only once the sync has settled; later loads do not wait', async () => {
    let settle!: () => void;
    synced.mockReturnValue(new Promise<void>((r) => { settle = r; }));
    load.mockResolvedValue(achievementsFixture());
    const run = refreshAchievements();
    await flush();
    expect(load).not.toHaveBeenCalled();
    settle();
    await run;
    expect(load).toHaveBeenCalledTimes(1);
    synced.mockReturnValue(new Promise<void>(() => {}));
    await refreshAchievements();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('gives up waiting after 3 s and fetches anyway', async () => {
    jest.useFakeTimers();
    synced.mockReturnValue(new Promise<void>(() => {}));
    load.mockResolvedValue(achievementsFixture());
    const run = refreshAchievements();
    await flush();
    jest.advanceTimersByTime(2999);
    await flush();
    expect(load).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    await run;
    expect(load).toHaveBeenCalledTimes(1);
    expect(getAchievementsSnapshot().state.status).toBe('ready');
  });

  it('waits again after a reset (the next account)', async () => {
    load.mockResolvedValue(achievementsFixture());
    await refreshAchievements();
    resetAchievements();
    let settle!: () => void;
    synced.mockReturnValue(new Promise<void>((r) => { settle = r; }));
    const run = refreshAchievements();
    await flush();
    expect(load).toHaveBeenCalledTimes(1);
    settle();
    await run;
    expect(load).toHaveBeenCalledTimes(2);
  });
});
