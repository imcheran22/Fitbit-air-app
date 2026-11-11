import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';

export const SYNCED = new Date('2026-10-05T06:00:00Z');
export const SCORED = new Date('2026-10-05T06:30:00Z');

export interface NightSeed {
  minutes: number;
  /** Local "HH:MM" bedtime at offset 0; 12:00 or later is the evening before. Default 22:30. */
  bedtime?: string;
  sleepScore?: number;
  recovery?: number;
  steps?: number;
  syncedAt?: Date;
  scoredAt?: Date;
}

/** One night ending on `date` (a UTC user): SLEEP rollup, main session, optional scores and steps. */
export async function seedNight(userId: string, date: string, seed: NightSeed): Promise<void> {
  const recordedAt = civilDateToUtcMidnight(date);
  const syncedAt = seed.syncedAt ?? SYNCED;
  const updatedAt = seed.scoredAt ?? SCORED;
  await prisma.biometricRecord.create({ data: { userId, metricType: 'SLEEP', value: seed.minutes, recordedAt, syncedAt } });
  const [h, m] = (seed.bedtime ?? '22:30').split(':').map(Number) as [number, number];
  const start = new Date(civilDateToUtcMidnight(h >= 12 ? shiftDate(date, -1) : date).getTime() + (h * 60 + m) * 60_000);
  await prisma.sleepSession.create({
    data: { userId, startTime: start, endTime: new Date(start.getTime() + (seed.minutes + 30) * 60_000), minutesAsleep: seed.minutes, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 },
  });
  const score = (type: 'SLEEP' | 'RECOVERY', value: number) =>
    prisma.dailyScore.create({ data: { userId, date: recordedAt, type, algorithmVersion: 'v-test', score: value, confidenceLevel: 'HIGH', factors: [], updatedAt } });
  if (seed.sleepScore !== undefined) await score('SLEEP', seed.sleepScore);
  if (seed.recovery !== undefined) await score('RECOVERY', seed.recovery);
  if (seed.steps !== undefined) await prisma.biometricRecord.create({ data: { userId, metricType: 'STEPS', value: seed.steps, recordedAt, syncedAt } });
}

/** Consecutive nights from `from`; null skips that date. */
export async function seedNights(userId: string, from: string, minutes: Array<number | null>, extra: (i: number) => Partial<NightSeed> = () => ({})): Promise<void> {
  for (const [i, value] of minutes.entries()) {
    if (value !== null) await seedNight(userId, shiftDate(from, i), { minutes: value, ...extra(i) });
  }
}
