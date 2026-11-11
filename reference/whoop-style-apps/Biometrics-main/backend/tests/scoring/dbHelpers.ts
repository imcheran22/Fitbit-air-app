import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';

export async function createUser(over: { timezone?: string; sleepGoalMinutes?: number } = {}) {
  return prisma.user.create({
    data: {
      email: `score-${randomUUID()}@example.com`,
      name: 'Test User',
      ...over,
    },
  });
}

// Deterministic pseudo-noise so a failing run reproduces.
export function wave(i: number, base: number, amp: number, phase = 0): number {
  return base + amp * Math.sin((i + phase) * 1.7);
}

/**
 * Seeds `days` consecutive days of HRV, RESTING_HR, SLEEP and STEPS starting at
 * `start`. Returns the last date seeded.
 */
export async function seedHistory(userId: string, start: string, days: number): Promise<string> {
  const data = [];
  for (let i = 0; i < days; i++) {
    const recordedAt = civilDateToUtcMidnight(shiftDate(start, i));
    data.push(
      { userId, metricType: 'HRV' as const, recordedAt, value: wave(i, 50, 4) },
      { userId, metricType: 'RESTING_HR' as const, recordedAt, value: wave(i, 55, 2, 1) },
      { userId, metricType: 'SLEEP' as const, recordedAt, value: wave(i, 450, 30, 2) },
      { userId, metricType: 'STEPS' as const, recordedAt, value: wave(i, 8000, 1500, 3) },
    );
  }
  await prisma.biometricRecord.createMany({ data, skipDuplicates: true });
  return shiftDate(start, days - 1);
}

export const day = (date: string) => civilDateToUtcMidnight(date);

/**
 * Seeds `days` SleepSession rows, one per night, so that night i ends on
 * start + i (UTC zone) -- the same civil dates seedHistory's SLEEP rollup uses.
 * Bedtime and time-asleep wobble deterministically so efficiency and circadian
 * consistency have a real spread.
 */
export async function seedSessions(userId: string, start: string, days: number): Promise<void> {
  const data = [];
  for (let i = 0; i < days; i++) {
    const noon = civilDateToUtcMidnight(shiftDate(start, i - 1)).getTime() + 12 * 3_600_000;
    const startTime = new Date(noon + (630 + 25 * Math.sin(i * 1.3)) * 60_000);
    data.push({
      userId,
      startTime,
      endTime: new Date(startTime.getTime() + 420 * 60_000),
      minutesAsleep: 385 + 15 * Math.sin(i * 0.9 + 1),
    });
  }
  await prisma.sleepSession.createMany({ data, skipDuplicates: true });
}
