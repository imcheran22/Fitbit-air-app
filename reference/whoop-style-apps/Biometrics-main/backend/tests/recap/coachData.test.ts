import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { deleteUserCoachData } from '../../src/coach/retention';
import { createUser } from '../coach/helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

let saved: string | undefined;
beforeEach(() => {
  saved = process.env.COACH_ENABLED;
  delete process.env.COACH_ENABLED; // the coach is off for every test here
});
afterEach(() => {
  if (saved === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = saved;
});

const day = (d: string) => new Date(`${d}T00:00:00Z`);

describe('push tokens are app-level', () => {
  it('registers and deletes a token with the coach off', async () => {
    const user = await createUser();
    const token = `tok-${user.id}`;
    const server = await testServer(createApp());
    const headers = await authHeaderFor(user.id);
    expect((await request(server).post('/me/push-token').set(headers).send({ token, platform: 'ios' })).status).toBe(204);
    expect(await prisma.pushToken.count({ where: { userId: user.id } })).toBe(1);
    expect((await request(server).delete('/me/push-token').set(headers).send({ token })).status).toBe(204);
    expect(await prisma.pushToken.count({ where: { userId: user.id } })).toBe(0);
  });
});

describe('deleteUserCoachData and recaps', () => {
  it('keeps push tokens and numbers, removes stories and turns AI lines into template lines', async () => {
    const user = await createUser();
    await prisma.pushToken.create({ data: { userId: user.id, token: `tok2-${user.id}`, platform: 'ios' } });
    const stats = { nightsWithData: 6, nightsOnGoal: 5, avgSleepMinutes: 478, comparison: { avgSleepDelta: 28 } };
    const ai = await prisma.recap.create({
      data: { userId: user.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'BUILT', stats, sleepGoalMinutes: 480, line: 'An AI line.', lineSource: 'AI', story: 'An AI story.', storySource: 'AI' },
    });
    const template = await prisma.recap.create({
      data: { userId: user.id, kind: 'MONTH', periodStart: day('2026-09-01'), periodEnd: day('2026-09-30'), status: 'BUILT', stats: { nightsWithData: 9, nightsOnGoal: 3 }, sleepGoalMinutes: 480, line: 'You reached your sleep goal on 3 of 9 nights this month.', lineSource: 'TEMPLATE' },
    });
    const bystander = await createUser();
    const other = await prisma.recap.create({
      data: { userId: bystander.id, kind: 'WEEK', periodStart: day('2026-09-28'), periodEnd: day('2026-10-04'), status: 'BUILT', stats, sleepGoalMinutes: 480, line: 'Theirs.', lineSource: 'AI', story: 'Theirs.', storySource: 'AI' },
    });

    const summary = await deleteUserCoachData(user.id);

    expect(summary).toEqual({ messages: 0, conversations: 0, memories: 0, digests: 0, daySummaries: 0, consents: 0, recapTexts: 1 });
    expect(await prisma.pushToken.count({ where: { userId: user.id } })).toBe(1);
    expect(await prisma.recap.findUniqueOrThrow({ where: { id: ai.id } })).toMatchObject({
      line: 'You slept 7h 58m a night on average, 28m more than last week.', lineSource: 'TEMPLATE', story: null, storySource: null, stats,
    });
    expect(await prisma.recap.findUniqueOrThrow({ where: { id: template.id } })).toMatchObject({ line: template.line, lineSource: 'TEMPLATE' });
    expect(await prisma.recap.findUniqueOrThrow({ where: { id: other.id } })).toMatchObject({ lineSource: 'AI', story: 'Theirs.' });
    expect((await deleteUserCoachData(user.id)).recapTexts).toBe(0);
  });
});
