// One recap job (spec 2026-10-04 §2): build a due period, record a thin one as SKIPPED, re-check a
// SKIPPED or unopened one for late data during the 3 days after it ended, and announce a first
// build with the id-only push. Idempotent per (user, kind, periodStart): the unique key and
// conditional updates make a racing duplicate a no-op.

import type { Prisma } from '@prisma/client';
import { isDeepStrictEqual } from 'util';
import { civilDateToUtcMidnight, localCivilDateOrUtc } from '../biometrics/civilDate';
import { buildRecapFactSheet } from '../coach/answer/facts';
import { summaryEngineDeps } from '../coach/answer/today';
import { CoachClock, systemClock } from '../coach/clock';
import { getCoachProvider, getHostedProvider, getPushSender, isCoachEnabled } from '../coach/config';
import { hasCurrentConsent } from '../coach/consent';
import type { EngineSelection } from '../coach/engine';
import { resolvePersona } from '../coach/personas';
import { PushSender, sendRecapPush } from '../coach/push';
import { CoachEventAttributes, CoachEventName, CoachTelemetry, LoggerCoachTelemetry } from '../coach/telemetry';
import { prisma } from '../db/client';
import { shiftDate } from '../scoring/dates';
import { resolveSleepGoalMinutes } from '../users/goals';
import { hasNewerInputs, loadRecapData, recapDataRange, scoresCaughtUp } from './data';
import { daysSinceEnd, inLateWindow, isDue, periodEndOf, periodLabel } from './periods';
import { computeRecapStats, isEligible } from './stats';
import { RecapText, writeRecapText } from './text';
import type { RecapJobData, RecapStats } from './types';

export type RecapOutcome =
  | 'built'
  | 'skipped'
  | 'rebuilt'
  | 'unchanged'
  | 'waiting_for_scores'
  | 'still_thin'
  | 'final'
  | 'not_due'
  | 'exists'
  | 'no_user';

export interface RecapDeps {
  pushSender: PushSender;
  telemetry: CoachTelemetry;
  /** The user's engine, as the daily one-liner chooses it (summaryEngineDeps). */
  selectProvider: (userId: string) => Promise<EngineSelection>;
  clock?: CoachClock;
  now?: () => Date;
  budgetMs?: number;
}

/**
 * The input mark trails the check by this much, so a sync still committing while the job read the
 * data (its syncedAt stamped before the commit) is looked at again on the next hour.
 */
const INPUT_MARK_MARGIN_MS = 5 * 60_000;

export function defaultRecapDeps(): RecapDeps {
  const telemetry = new LoggerCoachTelemetry();
  const engine = summaryEngineDeps({ getProvider: getCoachProvider, getHostedProvider, clock: systemClock, telemetry });
  return { pushSender: getPushSender(), telemetry, selectProvider: engine.selectProvider! };
}

interface Ctx {
  job: RecapJobData;
  deps: RecapDeps;
  now: Date;
  user: { timezone: string; sleepGoalMinutes: number; coachPersonaId: string | null };
}

const asJson = (stats: RecapStats) => stats as unknown as Prisma.InputJsonValue;
/** Once through JSON, so what is compared and stored is what Postgres hands back. */
const plain = (stats: RecapStats): RecapStats => JSON.parse(JSON.stringify(stats)) as RecapStats;
const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === 'P2002';
/** Inputs stamped before this were counted (a build) or compared (a check that changed nothing). */
const inputMark = (ctx: Ctx) => new Date(ctx.now.getTime() - INPUT_MARK_MARGIN_MS);

function emit(ctx: Ctx, name: CoachEventName, attributes: CoachEventAttributes = {}): void {
  ctx.deps.telemetry.emit({
    name,
    userId: ctx.job.userId,
    personaId: resolvePersona(ctx.user.coachPersonaId).id,
    attributes: { kind: ctx.job.kind, periodStart: ctx.job.periodStart, ...attributes },
  });
}

async function statsFor(ctx: Ctx, goal: number): Promise<RecapStats> {
  const { userId, kind, periodStart } = ctx.job;
  const range = await recapDataRange(userId, kind, periodStart);
  return plain(computeRecapStats(kind, periodStart, await loadRecapData(userId, ctx.user.timezone, range.from, range.to), goal));
}

/** The SKIPPED recount: the period's own nights only, without the history the full stats need. */
async function nightsIn(ctx: Ctx): Promise<number> {
  const { userId, kind, periodStart } = ctx.job;
  const data = await loadRecapData(userId, ctx.user.timezone, periodStart, periodEndOf(kind, periodStart));
  return computeRecapStats(kind, periodStart, data, resolveSleepGoalMinutes(ctx.user.sleepGoalMinutes)).nightsWithData;
}

async function textFor(ctx: Ctx, stats: RecapStats, goal: number) {
  const persona = resolvePersona(ctx.user.coachPersonaId);
  // Coach off, no current (local) consent or a reactive-only persona: no AI call (spec §2). The
  // hosted engine also needs its own consent; selectProvider (selectEngine) checks that.
  const aiAllowed = isCoachEnabled() && persona.proactivity !== 'reactive-only' && (await hasCurrentConsent(ctx.job.userId, 'local'));
  const text: RecapText = await writeRecapText(
    {
      userId: ctx.job.userId,
      kind: ctx.job.kind,
      stats,
      sheet: buildRecapFactSheet(ctx.job.kind, stats, goal),
      persona,
      periodLabel: periodLabel(ctx.job.kind, ctx.job.periodStart),
      aiAllowed,
    },
    {
      selectProvider: ctx.deps.selectProvider,
      ...(ctx.deps.clock ? { clock: ctx.deps.clock } : {}),
      ...(ctx.deps.budgetMs !== undefined ? { budgetMs: ctx.deps.budgetMs } : {}),
    },
  );
  return { line: text.line, lineSource: text.lineSource, story: text.story, storySource: text.storySource, personaId: persona.id };
}

/**
 * First build only (a rebuild never calls this). pushedAt is set only once the send went through
 * (or nothing was due: setting off, no device, the old digest's week); a failure is logged, leaves
 * pushedAt null and is not retried, since a partly delivered send could otherwise push twice.
 */
async function announce(ctx: Ctx, recapId: string): Promise<void> {
  const { userId, kind, periodStart } = ctx.job;
  try {
    // Backstop for a failed launch backfill: the old digest announced that week. It keyed its row by
    // the local week of its Monday 08:00 UTC run: the next Monday, or this one for zones at UTC−9
    // and further west, where that run fell on the Sunday.
    const digest =
      kind === 'WEEK' &&
      (await prisma.coachDigest.findFirst({
        where: { userId, weekStart: { in: [civilDateToUtcMidnight(periodStart), civilDateToUtcMidnight(shiftDate(periodStart, 7))] } },
        select: { id: true },
      }));
    if (!digest) {
      const devices = await sendRecapPush(ctx.deps.pushSender, userId, kind, recapId);
      emit(ctx, 'recap.push_sent', { devices });
    }
    await prisma.recap.updateMany({ where: { id: recapId, pushedAt: null }, data: { pushedAt: ctx.now } });
  } catch (err) {
    // Logged, never failing the recap (spec §2).
    emit(ctx, 'recap.push_failed', { error: err instanceof Error ? err.name : 'unknown' });
  }
}

async function createRecap(ctx: Ctx): Promise<RecapOutcome> {
  const { userId, kind, periodStart, noPush } = ctx.job;
  const goal = resolveSleepGoalMinutes(ctx.user.sleepGoalMinutes);
  const stats = await statsFor(ctx, goal);
  const base = {
    userId,
    kind,
    periodStart: civilDateToUtcMidnight(periodStart),
    periodEnd: civilDateToUtcMidnight(periodEndOf(kind, periodStart)),
    sleepGoalMinutes: goal,
    builtAt: ctx.now,
    inputsCheckedAt: inputMark(ctx),
  };
  try {
    if (!isEligible(kind, stats)) {
      await prisma.recap.create({ data: { ...base, status: 'SKIPPED' } });
      emit(ctx, 'recap.skipped', { nights: stats.nightsWithData });
      return 'skipped';
    }
    const text = await textFor(ctx, stats, goal);
    const row = await prisma.recap.create({
      data: { ...base, status: 'BUILT', stats: asJson(stats), ...text, pushedAt: noPush ? ctx.now : null },
    });
    emit(ctx, 'recap.built', { lineSource: text.lineSource, storySource: text.storySource ?? 'none' });
    if (!noPush) await announce(ctx, row.id);
    return 'built';
  } catch (err) {
    if (isUniqueViolation(err)) return 'exists';
    throw err;
  }
}

async function markChecked(ctx: Ctx, id: string): Promise<void> {
  await prisma.recap.updateMany({ where: { id }, data: { inputsCheckedAt: inputMark(ctx) } });
}

async function recheckSkipped(ctx: Ctx, row: { id: string; since: Date }): Promise<RecapOutcome> {
  const { userId, kind, periodStart } = ctx.job;
  if (!(await hasNewerInputs(userId, periodStart, periodEndOf(kind, periodStart), row.since))) return 'still_thin';
  if (!isEligible(kind, { nightsWithData: await nightsIn(ctx) })) {
    await markChecked(ctx, row.id);
    return 'still_thin';
  }
  const goal = resolveSleepGoalMinutes(ctx.user.sleepGoalMinutes);
  const stats = await statsFor(ctx, goal);
  const text = await textFor(ctx, stats, goal);
  // Its first build: the current goal becomes the snapshot. Only while still SKIPPED, so one racing run wins.
  const built = await prisma.recap.updateMany({
    where: { id: row.id, status: 'SKIPPED' },
    data: {
      status: 'BUILT',
      stats: asJson(stats),
      sleepGoalMinutes: goal,
      builtAt: ctx.now,
      inputsCheckedAt: inputMark(ctx),
      ...text,
      pushedAt: ctx.job.noPush ? ctx.now : null,
    },
  });
  if (built.count === 0) return 'exists';
  emit(ctx, 'recap.built', { lineSource: text.lineSource, storySource: text.storySource ?? 'none', late: true });
  if (!ctx.job.noPush) await announce(ctx, row.id);
  return 'built';
}

async function recheckBuilt(ctx: Ctx, row: { id: string; since: Date; sleepGoalMinutes: number; stats: Prisma.JsonValue }): Promise<RecapOutcome> {
  const { userId, kind, periodStart } = ctx.job;
  const to = periodEndOf(kind, periodStart);
  // Timestamps are only a cheap first filter: a resync bumps syncedAt with unchanged values. The
  // mark moves past inputs already compared, so an unchanged resync costs one recompute, not one an hour.
  if (!(await hasNewerInputs(userId, periodStart, to, row.since))) return 'unchanged';
  if (!(await scoresCaughtUp(userId, periodStart, to))) return 'waiting_for_scores';
  // The goal snapshot never changes (spec §1): late data is counted against the goal the recap was built with.
  const stats = await statsFor(ctx, row.sleepGoalMinutes);
  if (isDeepStrictEqual(stats, row.stats) || !isEligible(kind, stats)) {
    await markChecked(ctx, row.id);
    return 'unchanged';
  }
  const text = await textFor(ctx, stats, row.sleepGoalMinutes);
  const updated = await prisma.recap.updateMany({
    where: { id: row.id, openedAt: null, rebuiltAt: null },
    data: { stats: asJson(stats), ...text, rebuiltAt: ctx.now },
  });
  if (updated.count === 0) return 'final';
  emit(ctx, 'recap.rebuilt', { lineSource: text.lineSource });
  return 'rebuilt';
}

export async function runRecapJob(job: RecapJobData, deps: RecapDeps): Promise<RecapOutcome> {
  const now = (deps.now ?? (() => new Date()))();
  const user = await prisma.user.findUnique({ where: { id: job.userId }, select: { timezone: true, sleepGoalMinutes: true, coachPersonaId: true } });
  if (!user) return 'no_user';
  const ctx: Ctx = { job, deps, now, user };
  const today = localCivilDateOrUtc(now, user.timezone);
  const row = await prisma.recap.findUnique({
    where: { userId_kind_periodStart: { userId: job.userId, kind: job.kind, periodStart: civilDateToUtcMidnight(job.periodStart) } },
    select: { id: true, status: true, builtAt: true, inputsCheckedAt: true, sleepGoalMinutes: true, stats: true, openedAt: true, rebuiltAt: true },
  });

  if (!row) {
    // A stale sweep job must not build early or late; the launch backfill may build any finished period.
    const allowed = job.noPush ? daysSinceEnd(job.kind, job.periodStart, today) >= 1 : isDue(job.kind, job.periodStart, now, user.timezone);
    return allowed ? createRecap(ctx) : 'not_due';
  }
  if (!inLateWindow(job.kind, job.periodStart, today)) return 'final';
  const since = row.inputsCheckedAt ?? row.builtAt;
  if (row.status === 'SKIPPED') return recheckSkipped(ctx, { id: row.id, since });
  if (row.openedAt !== null || row.rebuiltAt !== null) return 'final';
  return recheckBuilt(ctx, { ...row, since });
}
