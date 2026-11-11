// Shared user data for the fixtures. LOW_DAY is the spec's running example:
// a low-recovery morning after a short night.
//
// Its `today` fact sheet (usual = the 30 days ending yesterday):
//   [recovery.today]    Recovery today: 26 (usual 58, 32 lower than usual)
//   [sleep_score.today] Sleep score today: 70 (usual 80, 10 lower than usual)
//   [hrv.today]         HRV today: 41 ms (usual 52 ms, 11 ms lower than usual)
//   [rhr.today]         Resting heart rate today: 58 bpm (usual 55 bpm, 3 bpm higher than usual)
//   [sleep.total]       Sleep last night: 6h 48m (usual 7h 13m, 25m less than usual)
//   [steps.today]       Steps today so far: 2,950 (a partial day: the day is not over)
//   [factor.hrv] / [factor.rhr]  the two biggest drivers of today's recovery

import type { UserSnapshot } from '../types';

/** The same value on each of the `n` days before today (1..n days ago). */
export const pastDays = (n: number, value: number): Array<[number, number]> =>
  Array.from({ length: n }, (_, i) => [i + 1, value] as [number, number]);

export const LOW_DAY: UserSnapshot = {
  recovery: [[0, 26], ...pastDays(30, 58)],
  sleepScore: [[0, 70], ...pastDays(30, 80)],
  readings: {
    SLEEP: [[0, 408], ...pastDays(30, 433)],
    HRV: [[0, 41], ...pastDays(30, 52)],
    RESTING_HR: [[0, 58], ...pastDays(30, 55)],
    STEPS: [[0, 2950], ...pastDays(30, 8000)],
  },
};

/** A fenced card block, as the model writes it after the reply. */
export const cardBlock = (card: Record<string, unknown>) => `\n\`\`\`card\n${JSON.stringify(card)}\n\`\`\``;

/** A fenced memory block, as the model writes it after the reply. */
export const memoryBlock = (memory: Record<string, unknown>) => `\n\`\`\`memory\n${JSON.stringify(memory)}\n\`\`\``;
