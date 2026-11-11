// Writes a generated DemoHistory as raw input rows, exactly the shapes the sync
// worker would have written. Never writes derived tables (scores, features,
// correlations): those come from running the real pipelines afterwards.
import { civilDateToUtcMidnight } from '../biometrics/civilDate';
import { prisma } from '../db/client';
import type { DemoHistory } from './generate';

export async function writeDemoHistory(userId: string, h: DemoHistory): Promise<void> {
  const records = [
    ...h.hrv.map((p) => ({ metricType: 'HRV' as const, ...p })),
    ...h.rhr.map((p) => ({ metricType: 'RESTING_HR' as const, ...p })),
    ...h.steps.map((p) => ({ metricType: 'STEPS' as const, ...p })),
    ...h.sleep.map((p) => ({ metricType: 'SLEEP' as const, ...p })),
  ];
  await prisma.$transaction([
    prisma.biometricRecord.createMany({
      data: records.map((r) => ({ userId, metricType: r.metricType, value: r.value, recordedAt: civilDateToUtcMidnight(r.date) })),
    }),
    prisma.sleepSession.createMany({
      data: h.sessions.map((s) => ({ userId, ...s, startUtcOffsetSeconds: 0, endUtcOffsetSeconds: 0 })),
    }),
    prisma.habitLog.createMany({
      data: h.habitLogs.map((l) => ({
        userId,
        habitType: l.habitType,
        value: l.value,
        unit: l.unit,
        habitDay: civilDateToUtcMidnight(l.habitDay),
        loggedAt: new Date(`${l.habitDay}T20:00:00Z`),
      })),
    }),
    prisma.habitCheckIn.createMany({
      data: h.checkInDays.map((d) => ({ userId, habitDay: civilDateToUtcMidnight(d) })),
    }),
  ]);
}
