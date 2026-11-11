import { useEffect, useState } from 'react';

// A shared ~60ms tick for frame-based pixel animation (frame swaps are discrete,
// so this doesn't need the UI thread). One interval serves every subscribed
// sprite; it only runs while at least one unpaused sprite is mounted.
// Paused → frozen at 0.
const listeners = new Set<(t: number) => void>();
let timer: ReturnType<typeof setInterval> | null = null;
const start = Date.now();

export function useSpriteClock(paused: boolean): number {
  const [t, setT] = useState(0);
  useEffect(() => {
    if (paused) {
      setT(0);
      return;
    }
    listeners.add(setT);
    if (!timer) {
      timer = setInterval(() => {
        const now = Date.now() - start;
        listeners.forEach((l) => l(now));
      }, 60);
    }
    return () => {
      listeners.delete(setT);
      if (!listeners.size && timer) {
        clearInterval(timer);
        timer = null;
      }
    };
  }, [paused]);
  return t;
}
