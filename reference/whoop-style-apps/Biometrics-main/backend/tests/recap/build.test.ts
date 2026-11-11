import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { COACH_CONSENT_VERSION, COACH_HOSTED_CONSENT_VERSION } from '../../src/coach/consent';
import { ScriptedStreamProvider } from '../../src/coach/model/provider';
import * as personas from '../../src/coach/personas';
import type { GenericPushPayload, PushSender, PushTarget } from '../../src/coach/push';
import { RecapDeps, runRecapJob } from '../../src/recap/build';
import * as recapData from '../../src/recap/data';
import type { RecapJobData, RecapStats } from '../../src/recap/types';
import { FakeClock, RecordingTelemetry, createUser } from '../coach/helpers';
import { seedNight, seedNights } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COACH_ENABLED;
  delete process.env.COACH_ENABLED;
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
  jest.restoreAllMocks();
});

class RecordingSender implements PushSender {
  calls: Array<{ targets: PushTarget[]; payload: GenericPushPayload }> = [];
  async send(targets: PushTarget[], payload: GenericPushPayload) {
    this.calls.push({ targets, payload });
  }
}

const WEEK = '2026-09-28'; // Mon 28 Sep – Sun 4 Oct
const at = (iso: string) => new Date(iso);
const MON_9 = at('2026-10-05T09:00:00Z');
const day = civilDateToUtcMidnight;

function setup(provider?: ScriptedStreamProvider) {
  const sender = new RecordingSender();
  const selectProvider = jest.fn(async () => {
    if (!provider) throw new Error('no model call expected');
    return { requested: 'local' as const, provider, servedBy: () => 'local' as const };
  });
  const deps: RecapDeps = { pushSender: sender, telemetry: new RecordingTelemetry(), clock: new FakeClock(), selectProvider };
  return { sender, selectProvider, deps };
}
class FailingSender implements PushSender {
  calls = 0;
  async send(): Promise<void> {
    this.calls += 1;
    throw new Error('expo refused');
  }
}

const run = (deps: RecapDeps, userId: string, now: Date, over: Partial<RecapJobData> = {}) =>
  runRecapJob({ userId, kind: 'WEEK', periodStart: WEEK, ...over }, { ...deps, now: () => now });

/** A UTC user with a device and the given nights (null = none), each scored. */
async function weekUser(minutes: Array<number | null> = [480, 500, null, 490, 420, 485, 495]) {
  const user = await createUser();
  await prisma.pushToken.create({ data: { userId: user.id, token: `ExponentPushToken[${randomUUID()}]`, platform: 'ios' } });
  await seedNights(user.id, WEEK, minutes, (i) => ({ recovery: 60 + i, sleepScore: 70 + i }));
  return user;
}
const recapOf = (userId: string, kind: 'WEEK' | 'MONTH' = 'WEEK', start = WEEK) =>
  prisma.recap.findUnique({ where: { userId_kind_periodStart: { userId, kind, periodStart: day(start) } } });
const statsOf = async (userId: string) => (await recapOf(userId))!.stats as unknown as RecapStats;

describe('first build', () => {
  it('builds an eligible week with the goal snapshot and a template line (coach off), and pushes once with id-only data', async () => {
    const user = await weekUser();
    const { sender, selectProvider, deps } = setup();
    expect(await run(deps, user.id, MON_9)).toBe('built');
    const row = await recapOf(user.id);
    expect(row).toMatchObject({ status: 'BUILT', sleepGoalMinutes: 480, lineSource: 'TEMPLATE', story: null, storySource: null, personaId: 'mochi', builtAt: MON_9, pushedAt: MON_9 });
    expect(row!.stats).toMatchObject({ nightsWithData: 6, nightsOnGoal: 5 });
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0]!.payload).toMatchObject({ kind: 'weekly_digest', data: { kind: 'recap', recapId: row!.id } });
    expect(selectProvider).not.toHaveBeenCalled();
  });

  it('records a thin week as SKIPPED: no stats, no text, no push', async () => {
    const user = await weekUser([480, 490, null, null, null, null, null]);
    const { sender, deps } = setup();
    expect(await run(deps, user.id, MON_9)).toBe('skipped');
    expect(await recapOf(user.id)).toMatchObject({ status: 'SKIPPED', stats: null, line: null, pushedAt: null });
    expect(sender.calls).toHaveLength(0);
  });

  it('does not build before the period is due or after its window', async () => {
    const user = await weekUser();
    const { deps } = setup();
    expect(await run(deps, user.id, at('2026-10-05T07:59:00Z'))).toBe('not_due');
    expect(await run(deps, user.id, at('2026-10-12T09:00:00Z'))).toBe('not_due');
    expect(await recapOf(user.id)).toBeNull();
  });

  it('a rerun neither duplicates the recap nor pushes again', async () => {
    const user = await weekUser();
    const { sender, deps } = setup();
    await run(deps, user.id, MON_9);
    expect(await run(deps, user.id, MON_9)).toBe('unchanged');
    expect(await prisma.recap.count({ where: { userId: user.id } })).toBe(1);
    expect(sender.calls).toHaveLength(1);
  });

  it('writes the line and story with the user engine when the coach is on and consented', async () => {
    process.env.COACH_ENABLED = 'true';
    const user = await weekUser();
    await prisma.coachConsent.create({ data: { userId: user.id, version: COACH_CONSENT_VERSION } });
    const line = 'You slept 7h 58m a night and hit your goal on 5 nights.';
    const story = 'You hit your goal on 5 nights this week. Keep the same wind-down next week.';
    const { sender, deps } = setup(new ScriptedStreamProvider([line, story]));
    await run(deps, user.id, MON_9);
    expect(await recapOf(user.id)).toMatchObject({ line, lineSource: 'AI', story, storySource: 'AI' });
    expect(sender.calls).toHaveLength(1);
  });

  it('makes no AI call without consent or for a reactive-only persona: template line, no story', async () => {
    process.env.COACH_ENABLED = 'true';
    const noConsent = await weekUser();
    const a = setup();
    await run(a.deps, noConsent.id, MON_9);
    expect(await recapOf(noConsent.id)).toMatchObject({ lineSource: 'TEMPLATE', story: null });
    expect(a.selectProvider).not.toHaveBeenCalled();

    const reactive = await weekUser();
    await prisma.coachConsent.create({ data: { userId: reactive.id, version: COACH_CONSENT_VERSION } });
    const base = personas.resolvePersona(null);
    jest.spyOn(personas, 'resolvePersona').mockReturnValue({ ...base, proactivity: 'reactive-only' });
    const b = setup();
    await run(b.deps, reactive.id, MON_9);
    expect(await recapOf(reactive.id)).toMatchObject({ lineSource: 'TEMPLATE', story: null });
    expect(b.selectProvider).not.toHaveBeenCalled();
  });

  it('announces a month with the monthly kind', async () => {
    const user = await createUser();
    await prisma.pushToken.create({ data: { userId: user.id, token: `ExponentPushToken[${randomUUID()}]`, platform: 'ios' } });
    await seedNights(user.id, '2026-09-10', [480, 480, 480, 480, 480, 480, 480, 480]);
    const { sender, deps } = setup();
    expect(await run(deps, user.id, at('2026-10-01T09:00:00Z'), { kind: 'MONTH', periodStart: '2026-09-01' })).toBe('built');
    expect(sender.calls[0]!.payload.kind).toBe('monthly_recap');
  });

  it('builds but does not push with the recap setting off', async () => {
    const user = await weekUser();
    await prisma.user.update({ where: { id: user.id }, data: { recapPushEnabled: false } });
    const { sender, deps } = setup();
    await run(deps, user.id, MON_9);
    expect(await recapOf(user.id)).toMatchObject({ status: 'BUILT', pushedAt: MON_9 });
    expect(sender.calls).toHaveLength(0);
  });

  it('a backfill job builds an older finished week without pushing', async () => {
    const user = await createUser();
    await prisma.pushToken.create({ data: { userId: user.id, token: `ExponentPushToken[${randomUUID()}]`, platform: 'ios' } });
    await seedNights(user.id, '2026-09-14', [480, 480, 480, 480]);
    const { sender, deps } = setup();
    expect(await run(deps, user.id, MON_9, { periodStart: '2026-09-14' })).toBe('not_due');
    expect(await run(deps, user.id, MON_9, { periodStart: '2026-09-14', noPush: true })).toBe('built');
    expect(await recapOf(user.id, 'WEEK', '2026-09-14')).toMatchObject({ status: 'BUILT', pushedAt: MON_9 });
    expect(sender.calls).toHaveLength(0);
  });

  it('never pushes for a week the old weekly digest already announced', async () => {
    const user = await weekUser();
    // The digest ran on the Monday after the week and keyed its row by that Monday.
    await prisma.coachDigest.create({ data: { userId: user.id, text: 'old digest', personaId: 'mochi', weekStart: day('2026-10-05') } });
    const { sender, deps } = setup();
    expect(await run(deps, user.id, MON_9)).toBe('built');
    expect(sender.calls).toHaveLength(0);
    expect(await recapOf(user.id)).toMatchObject({ pushedAt: MON_9 });
  });
});

describe('late data (one rebuild, within 3 days, before opening)', () => {
  const oct2 = day('2026-10-02');

  it('a resync with unchanged values neither rebuilds nor spends the rebuild', async () => {
    const user = await weekUser();
    const { deps } = setup();
    await run(deps, user.id, MON_9);
    const before = await recapOf(user.id);
    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP' }, data: { syncedAt: at('2026-10-05T12:00:00Z') } });
    await prisma.dailyScore.updateMany({ where: { userId: user.id }, data: { updatedAt: at('2026-10-05T12:30:00Z') } });
    expect(await run(deps, user.id, at('2026-10-05T13:00:00Z'))).toBe('unchanged');
    expect(await recapOf(user.id)).toMatchObject({ rebuiltAt: null, stats: before!.stats, line: before!.line });
  });

  it('a real sleep change waits for its score, then rebuilds once without pushing again', async () => {
    const user = await weekUser();
    const { sender, deps } = setup();
    await run(deps, user.id, MON_9);
    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP', recordedAt: oct2 }, data: { value: 500, syncedAt: at('2026-10-06T08:00:00Z') } });
    expect(await run(deps, user.id, at('2026-10-06T09:00:00Z'))).toBe('waiting_for_scores');
    await prisma.dailyScore.updateMany({ where: { userId: user.id, date: oct2 }, data: { updatedAt: at('2026-10-06T08:30:00Z') } });
    expect(await run(deps, user.id, at('2026-10-06T10:00:00Z'))).toBe('rebuilt');
    expect(await recapOf(user.id)).toMatchObject({ rebuiltAt: at('2026-10-06T10:00:00Z'), pushedAt: MON_9 });
    expect((await statsOf(user.id)).nightsOnGoal).toBe(6);
    expect(sender.calls).toHaveLength(1);

    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP', recordedAt: oct2 }, data: { value: 400, syncedAt: at('2026-10-06T11:00:00Z') } });
    await prisma.dailyScore.updateMany({ where: { userId: user.id, date: oct2 }, data: { updatedAt: at('2026-10-06T11:30:00Z') } });
    expect(await run(deps, user.id, at('2026-10-06T12:00:00Z'))).toBe('final');
    expect((await statsOf(user.id)).nightsOnGoal).toBe(6);
  });

  it('a steps change, or a score change alone, also rebuilds', async () => {
    const stepsUser = await weekUser();
    const a = setup();
    await run(a.deps, stepsUser.id, MON_9);
    await prisma.biometricRecord.create({ data: { userId: stepsUser.id, metricType: 'STEPS', value: 9000, recordedAt: day('2026-10-01'), syncedAt: at('2026-10-06T08:00:00Z') } });
    expect(await run(a.deps, stepsUser.id, at('2026-10-06T09:00:00Z'))).toBe('rebuilt');
    expect((await statsOf(stepsUser.id)).steps).toEqual({ total: 9000, dailyAverage: 9000 });

    const scoreUser = await weekUser();
    const b = setup();
    await run(b.deps, scoreUser.id, MON_9);
    await prisma.dailyScore.updateMany({ where: { userId: scoreUser.id, date: day('2026-10-01'), type: 'RECOVERY' }, data: { score: 99, updatedAt: at('2026-10-06T08:00:00Z') } });
    expect(await run(b.deps, scoreUser.id, at('2026-10-06T09:00:00Z'))).toBe('rebuilt');
    expect((await statsOf(scoreUser.id)).bestRecovery).toEqual({ date: '2026-10-01', score: 99 });
  });

  it('never changes after it was opened, nor after the 3-day window', async () => {
    const opened = await weekUser();
    const a = setup();
    await run(a.deps, opened.id, MON_9);
    await prisma.recap.updateMany({ where: { userId: opened.id }, data: { openedAt: at('2026-10-05T10:00:00Z') } });
    await prisma.biometricRecord.updateMany({ where: { userId: opened.id, metricType: 'SLEEP', recordedAt: oct2 }, data: { value: 500, syncedAt: at('2026-10-06T08:00:00Z') } });
    await prisma.dailyScore.updateMany({ where: { userId: opened.id }, data: { updatedAt: at('2026-10-06T08:30:00Z') } });
    expect(await run(a.deps, opened.id, at('2026-10-06T09:00:00Z'))).toBe('final');

    const late = await weekUser();
    const b = setup();
    await run(b.deps, late.id, MON_9);
    await prisma.biometricRecord.updateMany({ where: { userId: late.id, metricType: 'SLEEP', recordedAt: oct2 }, data: { value: 500, syncedAt: at('2026-10-08T08:00:00Z') } });
    await prisma.dailyScore.updateMany({ where: { userId: late.id }, data: { updatedAt: at('2026-10-08T08:30:00Z') } });
    expect(await run(b.deps, late.id, at('2026-10-08T09:00:00Z'))).toBe('final');
    expect(await recapOf(late.id)).toMatchObject({ rebuiltAt: null });
  });

  it('rebuilds against the stored goal snapshot, not a goal changed since (Review Focus 3)', async () => {
    const user = await weekUser();
    const { deps } = setup();
    await run(deps, user.id, MON_9);
    await prisma.user.update({ where: { id: user.id }, data: { sleepGoalMinutes: 420 } });
    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP', recordedAt: oct2 }, data: { value: 470, syncedAt: at('2026-10-06T08:00:00Z') } });
    await prisma.dailyScore.updateMany({ where: { userId: user.id, date: oct2 }, data: { updatedAt: at('2026-10-06T08:30:00Z') } });
    expect(await run(deps, user.id, at('2026-10-06T09:00:00Z'))).toBe('rebuilt');
    expect(await recapOf(user.id)).toMatchObject({ sleepGoalMinutes: 480 });
    expect((await statsOf(user.id)).nightsOnGoal).toBe(5); // 470 < 480; it would be 6 against 420
  });
});

describe('SKIPPED periods', () => {
  it('a SKIPPED week that becomes eligible inside 3 days is built and pushed once', async () => {
    const user = await weekUser([480, 490, null, null, null, null, null]);
    const { sender, deps } = setup();
    await run(deps, user.id, MON_9);
    await seedNight(user.id, '2026-10-04', { minutes: 470, syncedAt: at('2026-10-06T07:00:00Z') });
    expect(await run(deps, user.id, at('2026-10-06T09:00:00Z'))).toBe('built');
    expect(await recapOf(user.id)).toMatchObject({ status: 'BUILT', builtAt: at('2026-10-06T09:00:00Z'), pushedAt: at('2026-10-06T09:00:00Z') });
    expect(sender.calls).toHaveLength(1);
    expect(await run(deps, user.id, at('2026-10-06T10:00:00Z'))).toBe('unchanged');
    expect(sender.calls).toHaveLength(1);
  });

  it('stays SKIPPED while still thin, and is final after the 3 days', async () => {
    const user = await weekUser([480, 490, null, null, null, null, null]);
    const { deps } = setup();
    await run(deps, user.id, MON_9);
    expect(await run(deps, user.id, at('2026-10-06T09:00:00Z'))).toBe('still_thin');
    await seedNight(user.id, '2026-10-04', { minutes: 470, syncedAt: at('2026-10-08T07:00:00Z') });
    expect(await run(deps, user.id, at('2026-10-08T09:00:00Z'))).toBe('final');
    expect(await recapOf(user.id)).toMatchObject({ status: 'SKIPPED' });
  });
});

describe('controller rulings', () => {
  it('makes no AI call with the coach off, a stale consent or only a hosted consent (each gate alone)', async () => {
    const consented = await weekUser();
    await prisma.coachConsent.create({ data: { userId: consented.id, version: COACH_CONSENT_VERSION } });
    const off = setup();
    await run(off.deps, consented.id, MON_9); // COACH_ENABLED unset
    expect(await recapOf(consented.id)).toMatchObject({ lineSource: 'TEMPLATE', story: null });
    expect(off.selectProvider).not.toHaveBeenCalled();

    process.env.COACH_ENABLED = 'true';
    const stale = await weekUser();
    await prisma.coachConsent.create({ data: { userId: stale.id, version: '1' } });
    const a = setup();
    await run(a.deps, stale.id, MON_9);
    expect(await recapOf(stale.id)).toMatchObject({ lineSource: 'TEMPLATE', story: null });
    expect(a.selectProvider).not.toHaveBeenCalled();

    const hostedOnly = await weekUser();
    await prisma.coachConsent.create({ data: { userId: hostedOnly.id, version: COACH_HOSTED_CONSENT_VERSION, scope: 'HOSTED' } });
    const b = setup();
    await run(b.deps, hostedOnly.id, MON_9);
    expect(await recapOf(hostedOnly.id)).toMatchObject({ lineSource: 'TEMPLATE', story: null });
    expect(b.selectProvider).not.toHaveBeenCalled();
  });

  it('never pushes for a week a far-west digest keyed by the Sunday-local Monday (Honolulu, S4)', async () => {
    const user = await createUser({ timezone: 'Pacific/Honolulu' });
    await prisma.pushToken.create({ data: { userId: user.id, token: `ExponentPushToken[${randomUUID()}]`, platform: 'ios' } });
    await seedNights(user.id, WEEK, [480, 500, null, 490, 420, 485, 495], (i) => ({ recovery: 60 + i, sleepScore: 70 + i }));
    // Mon 08:00 UTC is still Sunday in Honolulu, so the old digest keyed the week by its own Monday.
    await prisma.coachDigest.create({ data: { userId: user.id, text: 'old digest', personaId: 'mochi', weekStart: day(WEEK) } });
    const { sender, deps } = setup();
    const due = at('2026-10-05T19:00:00Z'); // 09:00 Monday in Honolulu
    expect(await run(deps, user.id, due)).toBe('built');
    expect(sender.calls).toHaveLength(0);
    expect(await recapOf(user.id)).toMatchObject({ status: 'BUILT', pushedAt: due });
  });

  it('a failed push is logged, never fails the recap, leaves pushedAt null and is not retried', async () => {
    const user = await weekUser();
    const sender = new FailingSender();
    const telemetry = new RecordingTelemetry();
    const deps: RecapDeps = { pushSender: sender, telemetry, clock: new FakeClock(), selectProvider: jest.fn() };
    expect(await run(deps, user.id, MON_9)).toBe('built');
    expect(await recapOf(user.id)).toMatchObject({ status: 'BUILT', pushedAt: null });
    expect(telemetry.named('recap.push_failed')).toHaveLength(1);
    expect(telemetry.named('recap.push_sent')).toHaveLength(0);
    expect(await run(deps, user.id, at('2026-10-05T10:00:00Z'))).toBe('unchanged');
    expect(sender.calls).toBe(1);
  });

  it('after an equal recompute, later hours skip the reload until an input is stamped again (T5 carry)', async () => {
    const user = await weekUser();
    const { sender, deps } = setup();
    await run(deps, user.id, MON_9);
    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP' }, data: { syncedAt: at('2026-10-05T12:00:00Z') } });
    await prisma.dailyScore.updateMany({ where: { userId: user.id }, data: { updatedAt: at('2026-10-05T12:30:00Z') } });
    expect(await run(deps, user.id, at('2026-10-05T13:00:00Z'))).toBe('unchanged');

    const load = jest.spyOn(recapData, 'loadRecapData');
    expect(await run(deps, user.id, at('2026-10-05T14:00:00Z'))).toBe('unchanged');
    expect(await run(deps, user.id, at('2026-10-05T15:00:00Z'))).toBe('unchanged');
    expect(load).not.toHaveBeenCalled();

    await prisma.biometricRecord.updateMany({ where: { userId: user.id, metricType: 'SLEEP', recordedAt: day('2026-10-02') }, data: { value: 500, syncedAt: at('2026-10-05T15:10:00Z') } });
    await prisma.dailyScore.updateMany({ where: { userId: user.id, date: day('2026-10-02') }, data: { updatedAt: at('2026-10-05T15:20:00Z') } });
    expect(await run(deps, user.id, at('2026-10-05T16:00:00Z'))).toBe('rebuilt');
    expect(load).toHaveBeenCalled();
    expect((await statsOf(user.id)).nightsOnGoal).toBe(6);
    expect(sender.calls).toHaveLength(1);
  });

  it('a SKIPPED week with no newer inputs is not reloaded', async () => {
    const user = await weekUser([480, 490, null, null, null, null, null]);
    const { deps } = setup();
    await run(deps, user.id, MON_9);
    const load = jest.spyOn(recapData, 'loadRecapData');
    expect(await run(deps, user.id, at('2026-10-06T09:00:00Z'))).toBe('still_thin');
    expect(load).not.toHaveBeenCalled();
  });
});
