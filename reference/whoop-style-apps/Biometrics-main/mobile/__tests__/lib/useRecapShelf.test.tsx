import { act, renderHook } from '@testing-library/react-native';
import { fetchRecaps, type RecapSummary } from '../../src/api/recaps';
import { addDays, todayCivil } from '../../src/lib/heatmap';
import { useRecapShelf } from '../../src/lib/recap/useRecapShelf';
import { openRecap, resetUnwatchedRecap } from '../../src/lib/unwatchedRecap';

jest.mock('../../src/api/recaps', () => ({ fetchRecaps: jest.fn(), markRecapOpened: jest.fn(() => Promise.resolve()) }));

const TODAY = todayCivil();
const week = (id: string, endDaysAgo: number, openedAt: string | null = null): RecapSummary => ({
  id, kind: 'WEEK', periodStart: addDays(TODAY, -endDaysAgo - 6), periodEnd: addDays(TODAY, -endDaysAgo), line: 'A line.',
  personaId: 'mochi', builtAt: '2026-10-05T09:00:00.000Z', openedAt,
} as RecapSummary);

let focus: (() => void) | undefined;
const navigation = { addListener: (_event: 'focus', fn: () => void) => ((focus = fn), () => undefined) };

beforeEach(() => {
  jest.clearAllMocks();
  resetUnwatchedRecap();
  focus = undefined;
});

it('loads the shelf once and counts the unwatched recaps', async () => {
  (fetchRecaps as jest.Mock).mockResolvedValue([week('w2', 2), week('w1', 9), week('w0', 16, '2026-10-01T09:00:00.000Z')]);
  const { result } = renderHook(() => useRecapShelf(navigation));
  await act(async () => {});
  expect(fetchRecaps).toHaveBeenCalledTimes(1);
  expect(fetchRecaps).toHaveBeenCalledWith({ limit: 30 });
  expect(result.current.items).toHaveLength(3);
  expect(result.current.unwatchedCount).toBe(2);
  await act(async () => openRecap('w2'));
  expect(result.current.unwatchedCount).toBe(1);
});

it('reloads on focus, and keeps what it has when a reload fails', async () => {
  (fetchRecaps as jest.Mock).mockResolvedValueOnce([week('w2', 2)]).mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useRecapShelf(navigation));
  await act(async () => {});
  await act(async () => focus?.());
  expect(fetchRecaps).toHaveBeenCalledTimes(2);
  expect(result.current.recaps?.map((r) => r.id)).toEqual(['w2']);
});
