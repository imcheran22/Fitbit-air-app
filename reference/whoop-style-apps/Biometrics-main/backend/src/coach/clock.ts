// Injectable clock/timer so the latency budget is testable without sleeping.

export interface TimerHandle {
  cancel(): void;
}

export interface CoachClock {
  now(): number;
  setTimer(fn: () => void, ms: number): TimerHandle;
}

export const systemClock: CoachClock = {
  now: () => Date.now(),
  setTimer(fn, ms) {
    const t = setTimeout(fn, ms);
    return { cancel: () => clearTimeout(t) };
  },
};
