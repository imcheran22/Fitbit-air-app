import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { useCharacterMood } from '../../src/characters/useCharacterMood';
import { ANSWERING_MS } from '../../src/characters/characterMood';
import type { ScoreBand } from '../../src/lib/scoreInsights';
import { withCharacter } from '../../jest-mocks/characterContext';

function withBand(recoveryBand: ScoreBand | null) {
  return ({ children }: { children: React.ReactNode }) => withCharacter(<>{children}</>, { recoveryBand });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useCharacterMood', () => {
  it('is idle outside a CharacterProvider (no recovery band)', () => {
    const { result } = renderHook(() => useCharacterMood({ sending: false, answeredAt: null }));

    expect(result.current).toBe('idle');
  });

  it("rests on a poor recovery day from the provider's band", () => {
    const { result } = renderHook(() => useCharacterMood({ sending: false, answeredAt: null }), { wrapper: withBand('scorePoor') });

    expect(result.current).toBe('resting');
  });

  it('thinks while sending', () => {
    const { result } = renderHook(() => useCharacterMood({ sending: true, answeredAt: null }), { wrapper: withBand('scorePoor') });

    expect(result.current).toBe('thinking');
  });

  it('answers for ANSWERING_MS after a reply, then falls back on its own', () => {
    const answeredAt = Date.now();
    const { result } = renderHook(() => useCharacterMood({ sending: false, answeredAt }), { wrapper: withBand('scorePoor') });
    expect(result.current).toBe('answering');

    act(() => jest.advanceTimersByTime(ANSWERING_MS - 1));
    expect(result.current).toBe('answering');

    act(() => jest.advanceTimersByTime(1));
    expect(result.current).toBe('resting');
  });

  it('still falls back when its timer fires a little early against Date.now()', () => {
    const answeredAt = Date.now();
    const { result } = renderHook(() => useCharacterMood({ sending: false, answeredAt }), { wrapper: withBand('scorePoor') });
    expect(result.current).toBe('answering');

    // Wind the wall clock back 1 ms so the scheduled timer fires while
    // Date.now() still says the reply is fresh (RN timers and Date.now() are
    // different clocks).
    jest.setSystemTime(Date.now() - 1);
    act(() => jest.advanceTimersByTime(ANSWERING_MS));
    expect(result.current).toBe('answering');

    act(() => jest.advanceTimersByTime(5));
    expect(result.current).toBe('resting');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('does not schedule anything for a reply that is already old', () => {
    const answeredAt = Date.now() - ANSWERING_MS - 10;
    const { result } = renderHook(() => useCharacterMood({ sending: false, answeredAt }));

    expect(result.current).toBe('idle');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('clears its timer on unmount (a reply that lands just before leaving the screen)', () => {
    const answeredAt = Date.now();
    const { unmount } = renderHook(() => useCharacterMood({ sending: false, answeredAt }));
    expect(jest.getTimerCount()).toBe(1);

    unmount();

    expect(jest.getTimerCount()).toBe(0);
  });
});
