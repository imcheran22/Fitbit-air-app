import type { Job } from 'bullmq';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { COACH_CONSENT_VERSION } from '../../src/coach/consent';
import { deleteUserCoachData, runCoachRetention, TRANSCRIPT_RETENTION_DAYS } from '../../src/coach/retention';
import {
  COACH_RETENTION_CRON,
  COACH_RETENTION_JOB,
  COACH_WEEKLY_DIGEST_JOB,
  retireWeeklyCoachDigest,
  scheduleDailyCoachRetention,
} from '../../src/coach/queue';
import { getCoachProvider, setCoachProvider } from '../../src/coach/config';
import { ScriptedStreamProvider } from '../../src/coach/model/provider';
import { processSyncJob } from '../../src/sync/worker';
import { RecordingTelemetry, createUser } from './helpers';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-09-20T12:00:00.000Z');
const ago = (ms: number) => new Date(NOW.getTime() - ms);

async function conversationWith(userId: string, messageAges: number[], lastMessageAt?: Date) {
  const newest = Math.min(...messageAges);
  const conversation = await prisma.coachConversation.create({
    data: { userId, createdAt: ago(Math.max(...messageAges)), lastMessageAt: lastMessageAt ?? ago(newest) },
  });
  const messages = [];
  for (const age of messageAges) {
    messages.push(
      await prisma.coachMessage.create({
        data: { conversationId: conversation.id, userId, role: 'USER', text: `msg-${age}`, createdAt: ago(age) },
      }),
    );
  }
  return { conversation, messages };
}

describe('90-day transcript retention', () => {
  it('has a 90-day window', () => {
    expect(TRANSCRIPT_RETENTION_DAYS).toBe(90);
  });

  it('keeps a message exactly 90 days old and deletes one a millisecond older (strictly-older boundary)', async () => {
    const user = await createUser();
    const { messages } = await conversationWith(user.id, [90 * DAY, 90 * DAY + 1, 89 * DAY, 200 * DAY, 1 * DAY]);

    const summary = await runCoachRetention({ now: NOW });

    expect(summary.cutoff.toISOString()).toBe(ago(90 * DAY).toISOString());
    const left = await prisma.coachMessage.findMany({ where: { userId: user.id }, select: { text: true } });
    expect(left.map((m) => m.text).sort()).toEqual([`msg-${1 * DAY}`, `msg-${89 * DAY}`, `msg-${90 * DAY}`].sort());
    expect(summary.messagesDeleted).toBeGreaterThanOrEqual(2);
    expect(messages).toHaveLength(5);
  });

  it('deletes a conversation left empty by retention, and keeps one that still has messages', async () => {
    const user = await createUser();
    const { conversation: allOld } = await conversationWith(user.id, [100 * DAY, 120 * DAY]);
    const { conversation: mixed } = await conversationWith(user.id, [100 * DAY, 5 * DAY]);

    const summary = await runCoachRetention({ now: NOW });

    expect(await prisma.coachConversation.findUnique({ where: { id: allOld.id } })).toBeNull();
    expect(await prisma.coachConversation.findUnique({ where: { id: mixed.id } })).not.toBeNull();
    expect(await prisma.coachMessage.count({ where: { conversationId: mixed.id } })).toBe(1);
    expect(summary.conversationsDeleted).toBeGreaterThanOrEqual(1);
  });

  it('never touches a fresh empty conversation (e.g. one being created right now)', async () => {
    const user = await createUser();
    const fresh = await prisma.coachConversation.create({ data: { userId: user.id, createdAt: ago(1000), lastMessageAt: ago(1000) } });
    await runCoachRetention({ now: NOW });
    expect(await prisma.coachConversation.findUnique({ where: { id: fresh.id } })).not.toBeNull();
  });

  it('is idempotent and reports counts only', async () => {
    const user = await createUser();
    await conversationWith(user.id, [100 * DAY]);
    const telemetry = new RecordingTelemetry();

    await runCoachRetention({ now: NOW, telemetry });
    const again = await runCoachRetention({ now: NOW, telemetry });

    expect(again.messagesDeleted).toBe(0);
    expect(await prisma.coachMessage.count({ where: { userId: user.id } })).toBe(0);
    const events = telemetry.named('coach.retention_run');
    expect(events).toHaveLength(2);
    expect(Object.keys(events[0]!.attributes).sort()).toEqual(['conversationsDeleted', 'messagesDeleted', 'retentionDays']);
    expect(JSON.stringify(events)).not.toContain('msg-');
  });

  it('runs regardless of COACH_ENABLED (turning the coach off must not stop expiry)', async () => {
    const saved = process.env.COACH_ENABLED;
    delete process.env.COACH_ENABLED;
    try {
      const user = await createUser();
      await conversationWith(user.id, [91 * DAY]);
      await runCoachRetention({ now: NOW });
      expect(await prisma.coachMessage.count({ where: { userId: user.id } })).toBe(0);
    } finally {
      if (saved !== undefined) process.env.COACH_ENABLED = saved;
    }
  });
});

describe('deleteUserCoachData', () => {
  async function seedAll(userId: string) {
    await conversationWith(userId, [1 * DAY, 2 * DAY]);
    await prisma.coachMemory.createMany({
      data: [
        { userId, category: 'PREFERENCE', value: 'Likes short answers' },
        { userId, category: 'SCHEDULE', value: 'Runs at 6am', status: 'CONFIRMED', confirmedAt: new Date() },
      ],
    });
    await prisma.coachDigest.create({ data: { userId, text: 'recap', personaId: 'encouraging', weekStart: new Date('2026-09-14T00:00:00Z') } });
    await prisma.coachDaySummary.create({
      data: { userId, date: new Date('2026-09-30T00:00:00Z'), text: 'Recovery 26.', spans: [], source: 'TEMPLATE' },
    });
    await prisma.coachConsent.create({ data: { userId, version: COACH_CONSENT_VERSION } });
    await prisma.pushToken.create({ data: { userId, token: `tok-${userId}`, platform: 'ios' } });
    await prisma.recap.create({
      data: {
        userId, kind: 'WEEK', periodStart: new Date('2026-09-21T00:00:00Z'), periodEnd: new Date('2026-09-27T00:00:00Z'),
        status: 'BUILT', stats: { nightsWithData: 6, nightsOnGoal: 5 }, sleepGoalMinutes: 480,
        line: 'An AI line.', lineSource: 'AI', story: 'An AI story.', storySource: 'AI',
      },
    });
  }
  const counts = async (userId: string) => ({
    messages: await prisma.coachMessage.count({ where: { userId } }),
    conversations: await prisma.coachConversation.count({ where: { userId } }),
    memories: await prisma.coachMemory.count({ where: { userId } }),
    digests: await prisma.coachDigest.count({ where: { userId } }),
    daySummaries: await prisma.coachDaySummary.count({ where: { userId } }),
    consents: await prisma.coachConsent.count({ where: { userId } }),
  });

  it('removes transcripts, conversations, memory, digests and consent rows - for that user only; keeps push tokens', async () => {
    const victim = await createUser();
    const bystander = await createUser();
    await seedAll(victim.id);
    await seedAll(bystander.id);
    const telemetry = new RecordingTelemetry();

    const summary = await deleteUserCoachData(victim.id, telemetry);

    expect(summary).toEqual({ messages: 2, conversations: 1, memories: 2, digests: 1, daySummaries: 1, consents: 1, recapTexts: 1 });
    expect(await prisma.pushToken.count({ where: { userId: victim.id } })).toBe(1);
    expect(await counts(victim.id)).toEqual({ messages: 0, conversations: 0, memories: 0, digests: 0, daySummaries: 0, consents: 0 });
    expect(await counts(bystander.id)).toEqual({ messages: 2, conversations: 1, memories: 2, digests: 1, daySummaries: 1, consents: 1 });
    // The user row itself is out of scope (account deletion is not built here).
    expect(await prisma.user.findUnique({ where: { id: victim.id } })).not.toBeNull();
    expect(telemetry.named('coach.user_data_deleted')[0]!.attributes).toEqual(summary);
  });

  it('is idempotent and safe for a user with no coach data', async () => {
    const user = await createUser();
    expect(await deleteUserCoachData(user.id)).toEqual({ messages: 0, conversations: 0, memories: 0, digests: 0, daySummaries: 0, consents: 0, recapTexts: 0 });
  });

  it('is atomic: a failure part-way rolls everything back', async () => {
    const user = await createUser();
    await seedAll(user.id);
    // Fail the LAST step inside the transaction (the recap lookup): every delete before it must roll back.
    const realTransaction = prisma.$transaction.bind(prisma) as (fn: (tx: any) => Promise<unknown>) => Promise<unknown>;
    const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(((fn: (tx: any) => Promise<unknown>) =>
      realTransaction((tx) =>
        fn(
          new Proxy(tx, {
            get: (target, key) =>
              key === 'recap'
                ? { findMany: async () => { throw new Error('boom'); } }
                : target[key as string],
          }),
        ),
      )) as any);
    try {
      await expect(deleteUserCoachData(user.id)).rejects.toThrow('boom');
    } finally {
      spy.mockRestore();
    }
    expect(await counts(user.id)).toEqual({ messages: 2, conversations: 1, memories: 2, digests: 1, daySummaries: 1, consents: 1 });
    expect(await prisma.recap.findFirstOrThrow({ where: { userId: user.id } })).toMatchObject({ lineSource: 'AI', story: 'An AI story.' });
  });
});

describe('scheduled job wiring', () => {
  it('registers the daily retention scheduler and removes the retired weekly digest scheduler', async () => {
    const calls: unknown[][] = [];
    const queue = {
      upsertJobScheduler: (async (...args: unknown[]) => void calls.push(['upsert', ...args])) as any,
      removeJobScheduler: (async (...args: unknown[]) => void calls.push(['remove', ...args])) as any,
    };
    await retireWeeklyCoachDigest(queue);
    await scheduleDailyCoachRetention(queue);
    expect(calls).toEqual([
      ['remove', COACH_WEEKLY_DIGEST_JOB],
      ['upsert', COACH_RETENTION_JOB, { pattern: COACH_RETENTION_CRON }, { name: COACH_RETENTION_JOB }],
    ]);
    expect(COACH_RETENTION_CRON).toBe('15 4 * * *');
  });

  describe('worker dispatch', () => {
    const job = (name: string) => ({ name, data: {} }) as unknown as Job;
    let savedFlag: string | undefined;
    let savedProvider: ReturnType<typeof getCoachProvider>;
    beforeEach(() => {
      savedFlag = process.env.COACH_ENABLED;
      savedProvider = getCoachProvider();
      jest.spyOn(console, 'info').mockImplementation(() => {});
    });
    afterEach(() => {
      if (savedFlag === undefined) delete process.env.COACH_ENABLED;
      else process.env.COACH_ENABLED = savedFlag;
      setCoachProvider(savedProvider);
      jest.restoreAllMocks();
    });

    it('a tick from the retired digest scheduler does nothing', async () => {
      process.env.COACH_ENABLED = 'true';
      const provider = new ScriptedStreamProvider([]);
      setCoachProvider(provider);
      await processSyncJob(job(COACH_WEEKLY_DIGEST_JOB));
      expect(provider.callCount).toBe(0);
    });

    it('the retention job deletes expired transcripts even with the flag off', async () => {
      delete process.env.COACH_ENABLED;
      const user = await createUser();
      const conversation = await prisma.coachConversation.create({
        data: { userId: user.id, lastMessageAt: new Date(Date.now() - 200 * DAY) },
      });
      await prisma.coachMessage.create({
        data: { conversationId: conversation.id, userId: user.id, role: 'USER', text: 'old', createdAt: new Date(Date.now() - 200 * DAY) },
      });

      await processSyncJob(job(COACH_RETENTION_JOB));

      expect(await prisma.coachMessage.count({ where: { userId: user.id } })).toBe(0);
      expect(await prisma.coachConversation.findUnique({ where: { id: conversation.id } })).toBeNull();
    });
  });
});
