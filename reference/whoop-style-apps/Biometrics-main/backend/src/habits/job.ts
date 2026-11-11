import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client';
import { analyzeUser } from './analysis';
import type { HypothesisResult } from './engine';
import { HabitCorrelationStatus, nextLifecycleState } from './lifecycle';

/** ISO-8601 week key ("2026-W38"): one run per user per week. */
export function isoWeekKey(date: Date): string {
  // Thursday of this week decides which ISO year the week belongs to.
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((d.getTime() - yearStart) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export interface HabitRunOutcome {
  /** True when this run key had already been applied, so nothing was written. */
  skipped: boolean;
  tested: number;
  passed: number;
}

const keyOf = (habitType: string, factor: string, lagDays: number) => `${habitType}|${factor}|${lagDays}`;

function statColumns(h: HypothesisResult) {
  return {
    r: h.r,
    pValue: h.pValue,
    qValue: h.qValue,
    effectSizePercent: h.effectSizePercent,
    comparisonPercent: h.comparisonPercent,
    sampleSize: h.sampleSize,
    direction: h.direction,
    series: h.series as unknown as Prisma.InputJsonValue,
  };
}

/**
 * The weekly run for one user: test every (habit, factor, lag), then apply the
 * persistence rule to the stored rows. Nothing is surfaced by this function;
 * a pass only advances a row toward CONFIRMED.
 *
 * Idempotent per `runKey` (the ISO week by default): every row this run writes
 * is stamped with the key, and a later run finding that stamp does nothing.
 * Without that, a BullMQ retry or a doubled schedule would count one week as
 * two consecutive passes and confirm a pattern on a single week's evidence.
 * All writes go in one transaction, so a crash cannot leave a half-applied run
 * that the stamp would then wrongly treat as complete.
 */
export async function runHabitCorrelations(
  userId: string,
  { now = new Date(), runKey = isoWeekKey(now) }: { now?: Date; runKey?: string } = {},
): Promise<HabitRunOutcome> {
  const existing = await prisma.habitCorrelation.findMany({ where: { userId } });
  if (existing.some((row) => row.lastRunKey === runKey)) return { skipped: true, tested: 0, passed: 0 };

  const { hypotheses } = await analyzeUser(userId, now);
  const byKey = new Map(hypotheses.map((h) => [keyOf(h.habitType, h.factor, h.lagDays), h]));
  const rowKeys = new Set(existing.map((r) => keyOf(r.habitType, r.factor, r.lagDays)));

  const writes: Prisma.PrismaPromise<unknown>[] = [];

  for (const row of existing) {
    const hypothesis = byKey.get(keyOf(row.habitType, row.factor, row.lagDays));
    // Untested this run (gate not met, no data) counts as a miss, not as "no information".
    const next = nextLifecycleState(
      { status: row.status as HabitCorrelationStatus, consecutivePasses: row.consecutivePasses, consecutiveMisses: row.consecutiveMisses },
      hypothesis?.passes ?? false,
    )!;
    // updateMany, not update, so the run key can sit in the WHERE clause: the
    // read-then-check above is not atomic, and two runs racing for the same
    // week (a BullMQ retry, a doubled schedule) both passed it. Whichever
    // commits first stamps runKey; the other matches nothing and advances no
    // counter, instead of turning one week into two consecutive passes.
    writes.push(
      prisma.habitCorrelation.updateMany({
        where: { id: row.id, lastRunKey: { not: runKey } },
        data: { ...next, lastEvaluatedAt: now, lastRunKey: runKey, ...(hypothesis ? statColumns(hypothesis) : {}) },
      }),
    );
  }

  for (const h of hypotheses) {
    if (!h.passes || rowKeys.has(keyOf(h.habitType, h.factor, h.lagDays))) continue;
    const first = nextLifecycleState(null, true)!;
    writes.push(
      prisma.habitCorrelation.create({
        data: {
          userId,
          habitType: h.habitType,
          factor: h.factor,
          lagDays: h.lagDays,
          ...first,
          lastEvaluatedAt: now,
          lastRunKey: runKey,
          ...statColumns(h),
        },
      }),
    );
  }

  if (writes.length > 0) {
    try {
      await prisma.$transaction(writes);
    } catch (err) {
      // The (userId, habitType, factor, lagDays) unique constraint is the same
      // guard for the create path: a concurrent run that got there first owns
      // the row, and this run has nothing to add.
      if ((err as { code?: string } | null)?.code !== 'P2002') throw err;
      return { skipped: true, tested: 0, passed: 0 };
    }
  }
  return { skipped: false, tested: hypotheses.length, passed: hypotheses.filter((h) => h.passes).length };
}
