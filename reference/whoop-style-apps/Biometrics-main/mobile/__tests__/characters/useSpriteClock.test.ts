import { act, renderHook } from '@testing-library/react-native';
import { useSpriteClock } from '../../src/components/characters/useSpriteClock';

describe('useSpriteClock', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('runs no timer while paused, and stays at 0', () => {
    const { result } = renderHook(() => useSpriteClock(true));
    expect(jest.getTimerCount()).toBe(0);
    act(() => jest.advanceTimersByTime(500));
    expect(result.current).toBe(0);
  });

  it('shares one interval between sprites and stops it when the last one goes', () => {
    const a = renderHook(() => useSpriteClock(false));
    const b = renderHook(() => useSpriteClock(false));
    expect(jest.getTimerCount()).toBe(1);
    act(() => jest.advanceTimersByTime(600));
    expect(a.result.current).toBeGreaterThan(0);
    expect(b.result.current).toBe(a.result.current);
    a.unmount();
    expect(jest.getTimerCount()).toBe(1);
    b.unmount();
    expect(jest.getTimerCount()).toBe(0);
  });

  it('freezes at 0 and drops its timer when paused', () => {
    const { result, rerender } = renderHook(({ paused }: { paused: boolean }) => useSpriteClock(paused), {
      initialProps: { paused: false },
    });
    act(() => jest.advanceTimersByTime(600));
    expect(result.current).toBeGreaterThan(0);
    rerender({ paused: true });
    expect(result.current).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });
});
