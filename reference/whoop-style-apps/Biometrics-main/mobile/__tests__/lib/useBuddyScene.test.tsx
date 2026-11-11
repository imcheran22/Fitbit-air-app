import { AppState } from 'react-native';
import { act, renderHook } from '@testing-library/react-native';
import { fetchBuddyScene, type BuddyRow, type BuddyScene } from '../../src/api/buddies';
import { useBuddyScene } from '../../src/lib/home/useBuddyScene';

jest.mock('../../src/api/buddies', () => ({ fetchBuddyScene: jest.fn() }));

const row = { id: 'b1', handle: 'ava', displayName: 'Ava', coachId: 'mochi', kipColour: 'mint', mood: 'good', moodLine: 'Feeling great', unseenSticker: false } as BuddyRow;
const scene = (total: number): BuddyScene => ({ buddies: [row], total, incomingRequests: 0 });

let focus: (() => void) | undefined;
const navigation = { addListener: (_event: 'focus', fn: () => void) => ((focus = fn), () => undefined) };

beforeEach(() => {
  jest.clearAllMocks();
  focus = undefined;
});

it('loads once on mount and again on focus', async () => {
  (fetchBuddyScene as jest.Mock).mockResolvedValueOnce(scene(1)).mockResolvedValueOnce(scene(2));
  const { result } = renderHook(() => useBuddyScene(navigation));
  expect(result.current).toBeNull();
  await act(async () => {});
  expect(fetchBuddyScene).toHaveBeenCalledTimes(1);
  expect(result.current).toEqual(scene(1));
  await act(async () => focus?.());
  expect(fetchBuddyScene).toHaveBeenCalledTimes(2);
  expect(result.current).toEqual(scene(2));
});

it('reloads when the app comes back to the foreground, and only the latest load lands', async () => {
  const handlers: Array<(state: string) => void> = [];
  const preset: unknown = AppState.addEventListener;
  const original = jest.isMockFunction(preset) ? preset.getMockImplementation() : undefined;
  const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation((_type, handler) => {
    handlers.push(handler as (state: string) => void);
    return { remove: jest.fn() } as never;
  });
  try {
    let slow!: (s: BuddyScene) => void;
    (fetchBuddyScene as jest.Mock)
      .mockResolvedValueOnce(scene(1))
      .mockReturnValueOnce(new Promise<BuddyScene>((resolve) => (slow = resolve)))
      .mockResolvedValueOnce(scene(3));
    const { result } = renderHook(() => useBuddyScene(navigation));
    await act(async () => {});
    await act(async () => handlers.forEach((h) => h('background')));
    expect(fetchBuddyScene).toHaveBeenCalledTimes(1);
    await act(async () => handlers.forEach((h) => h('active')));
    await act(async () => handlers.forEach((h) => h('active')));
    expect(fetchBuddyScene).toHaveBeenCalledTimes(3);
    expect(result.current).toEqual(scene(3));
    await act(async () => slow(scene(2)));
    expect(result.current).toEqual(scene(3));
  } finally {
    if (original) spy.mockImplementation(original);
    else spy.mockRestore();
  }
});

it('keeps the last scene when a reload fails', async () => {
  (fetchBuddyScene as jest.Mock).mockResolvedValueOnce(scene(1)).mockRejectedValueOnce(new Error('offline'));
  const { result } = renderHook(() => useBuddyScene(navigation));
  await act(async () => {});
  await act(async () => focus?.());
  expect(fetchBuddyScene).toHaveBeenCalledTimes(2);
  expect(result.current).toEqual(scene(1));
});

it('is null when the server has no scene', async () => {
  (fetchBuddyScene as jest.Mock).mockResolvedValueOnce(null);
  const { result } = renderHook(() => useBuddyScene(navigation));
  await act(async () => {});
  expect(fetchBuddyScene).toHaveBeenCalledTimes(1);
  expect(result.current).toBeNull();
});

it('never lets a slower earlier load overwrite a newer one', async () => {
  let first!: (s: BuddyScene) => void;
  (fetchBuddyScene as jest.Mock)
    .mockReturnValueOnce(new Promise<BuddyScene>((resolve) => (first = resolve)))
    .mockResolvedValueOnce(scene(2));
  const { result } = renderHook(() => useBuddyScene(navigation));
  await act(async () => focus?.());
  expect(result.current).toEqual(scene(2));
  await act(async () => first(scene(1)));
  expect(result.current).toEqual(scene(2));
});
