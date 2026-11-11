import { act, renderHook } from '@testing-library/react-native';
import { stepIndex, useSceneClock } from '../../src/components/social/CampScene';

const wait = (ms: number) => act(() => new Promise((r) => setTimeout(r, ms)));

it('runs the scene clock while the scene may move', async () => {
  const { result, unmount } = renderHook(() => useSceneClock(false));
  await wait(120);
  expect(result.current.value).toBeGreaterThan(0);
  unmount();
});

// The screen passes `still` for Reduce Motion and for the page being out of focus (CampfireScreen).
it('stops the clock at 0 when still (Reduce Motion, or out of focus), and restarts it after', async () => {
  const { result, rerender, unmount } = renderHook(({ still }: { still: boolean }) => useSceneClock(still), { initialProps: { still: true } });
  await wait(120);
  expect(result.current.value).toBe(0);
  rerender({ still: false });
  await wait(120);
  expect(result.current.value).toBeGreaterThan(0);
  // Losing focus (or turning Reduce Motion on) mid-run: back to the still first frame, and it stays there.
  rerender({ still: true });
  expect(result.current.value).toBe(0);
  await wait(120);
  expect(result.current.value).toBe(0);
  unmount();
});

it('cancels the clock on unmount', async () => {
  const { result, unmount } = renderHook(() => useSceneClock(false));
  await wait(60);
  const clock = result.current;
  unmount();
  const at = clock.value;
  await wait(120);
  expect(clock.value).toBe(at);
});

it('steps frames: frame 0 at the start, the delay shifts the phase, and the last frame is never past the end', () => {
  expect(stepIndex(0, 0.5, 2)).toBe(0);
  expect(stepIndex(0.25, 0.5, 2)).toBe(1);
  expect(stepIndex(0.5, 0.5, 2)).toBe(0);
  expect(stepIndex(0, 2.4, 14, 1.2)).toBe(7);
  expect(stepIndex(2.3999, 2.4, 14)).toBe(13);
});
