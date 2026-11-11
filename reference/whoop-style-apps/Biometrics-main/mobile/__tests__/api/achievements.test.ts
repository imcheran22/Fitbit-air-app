import { apiFetch } from '../../src/api/client';
import { fetchAchievements, markCelebrated } from '../../src/api/achievements';

jest.mock('../../src/api/client');
const api = apiFetch as jest.Mock;

beforeEach(() => api.mockReset());

it('reads the badges, tolerating a missing uncelebrated list', async () => {
  api.mockResolvedValue({ since: '2026-10-01', families: [] });
  expect(await fetchAchievements()).toEqual({ since: '2026-10-01', families: [], uncelebrated: [] });
  expect(api).toHaveBeenLastCalledWith('/me/achievements');
});

it('reads a 404 (a backend older than badges) as null, and rethrows any other failure', async () => {
  api.mockRejectedValue(Object.assign(new Error('nope'), { status: 404 }));
  expect(await fetchAchievements()).toBeNull();
  api.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
  await expect(fetchAchievements()).rejects.toThrow('boom');
});

it('drops families and new levels this app does not know (a newer backend)', async () => {
  const known = { family: 'SLEEP_GOAL', kind: 'streak', level: 0, thresholds: [3, 7, 14, 30, 100], levels: [], current: 0, best: 0, nextThreshold: 3 };
  api.mockResolvedValue({
    since: '2026-10-01',
    families: [known, { ...known, family: 'MEDITATION' }],
    uncelebrated: [
      { id: 'a1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' },
      { id: 'a2', family: 'MEDITATION', level: 1, value: 3, earnedOn: '2026-10-03' },
    ],
  });
  expect(await fetchAchievements()).toEqual({
    since: '2026-10-01',
    families: [known],
    uncelebrated: [{ id: 'a1', family: 'SLEEP_GOAL', level: 1, value: 3, earnedOn: '2026-10-03' }],
  });
});

it('throws on a body that is not badges', async () => {
  api.mockResolvedValue({ status: 'CONNECTED' });
  await expect(fetchAchievements()).rejects.toThrow('bad_achievements');
});

it('marks levels celebrated with their ids', async () => {
  api.mockResolvedValue({ celebrated: 2 });
  await markCelebrated(['a1', 'a2']);
  expect(api).toHaveBeenLastCalledWith('/me/achievements/celebrated', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids: ['a1', 'a2'] }),
  });
});
