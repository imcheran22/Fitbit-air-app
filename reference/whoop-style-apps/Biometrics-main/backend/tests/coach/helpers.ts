import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight, localCivilDate } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import type { CoachClock, TimerHandle } from '../../src/coach/clock';
import type { CoachEvent, CoachTelemetry } from '../../src/coach/telemetry';
import { createUser } from '../scoring/dbHelpers';

export { createUser };

/** Manual clock: timers fire only when a test calls advance(), so nothing ever sleeps. */
export class FakeClock implements CoachClock {
  private t = Date.now();
  private timers: Array<{ due: number; fn: () => void; cancelled: boolean }> = [];

  now(): number {
    return this.t;
  }

  setTimer(fn: () => void, ms: number): TimerHandle {
    const timer = { due: this.t + ms, fn, cancelled: false };
    this.timers.push(timer);
    return {
      cancel: () => {
        timer.cancelled = true;
      },
    };
  }

  get pendingTimers(): number {
    return this.timers.filter((x) => !x.cancelled).length;
  }

  advance(ms: number): void {
    this.t += ms;
    for (const timer of this.timers) {
      if (!timer.cancelled && timer.due <= this.t) {
        timer.cancelled = true;
        timer.fn();
      }
    }
  }
}

export class RecordingTelemetry implements CoachTelemetry {
  events: CoachEvent[] = [];
  emit(event: CoachEvent): void {
    this.events.push(event);
  }
  named(name: CoachEvent['name']): CoachEvent[] {
    return this.events.filter((e) => e.name === name);
  }
}

/** A provider step that never settles: models a hung provider call. */
export const hang = () => new Promise<never>(() => {});

export const todayUtc = () => localCivilDate(new Date(), 'UTC');
export const daysAgo = (n: number) => shiftDate(todayUtc(), -n);

const RECOVERY_FACTORS = [
  { factor: 'HRV', z: 1, weight: 0.45, contribution: 0.45, points: 6, imputed: false, excluded: false },
  { factor: 'RHR', z: -0.5, weight: 0.35, contribution: 0.175, points: 2.33, imputed: false, excluded: false },
  { factor: 'SLEEP_DEBT', z: 0.5, weight: 0.2, contribution: -0.1, points: -1.33, imputed: false, excluded: false },
];

export async function putScore(
  userId: string,
  date: string,
  score: number | null,
  type: 'RECOVERY' | 'SLEEP' = 'RECOVERY',
) {
  return prisma.dailyScore.create({
    data: {
      userId,
      date: civilDateToUtcMidnight(date),
      type,
      algorithmVersion: 'v1',
      score,
      confidenceLevel: score === null ? 'LOW' : 'HIGH',
      factors: (type === 'RECOVERY' ? RECOVERY_FACTORS : []) as any,
    },
  });
}

/** Flushes pending microtasks/timers-as-macrotasks so "no further call" assertions are meaningful. */
export const settle = () => new Promise<void>((r) => setImmediate(r));
