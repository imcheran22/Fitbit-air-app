import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { testServer } from '../helpers/server';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { createUser } from '../coach/helpers';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const day = civilDateToUtcMidnight;
const server = async () => request(await testServer(createApp()));
const ids = (body: { recaps: Array<{ id: string }> }) => body.recaps.map((r) => r.id);

function recap(userId: string, kind: 'WEEK' | 'MONTH', start: string, end: string, over: Record<string, unknown> = {}) {
  return prisma.recap.create({
    data: {
      userId, kind, periodStart: day(start), periodEnd: day(end), status: 'BUILT', sleepGoalMinutes: 480,
      stats: { nightsWithData: 6 }, line: `Line ${start}`, lineSource: 'AI', personaId: 'luna', ...over,
    },
  });
}

describe('GET /me/recaps', () => {
  it('lists BUILT recaps newest first with summary fields only', async () => {
    const user = await createUser();
    const old = await recap(user.id, 'WEEK', '2026-09-21', '2026-09-27');
    const month = await recap(user.id, 'MONTH', '2026-09-01', '2026-09-30');
    const latest = await recap(user.id, 'WEEK', '2026-09-28', '2026-10-04');
    await prisma.recap.create({ data: { userId: user.id, kind: 'WEEK', periodStart: day('2026-09-14'), periodEnd: day('2026-09-20'), status: 'SKIPPED', sleepGoalMinutes: 480 } });
    await recap((await createUser()).id, 'WEEK', '2026-09-28', '2026-10-04');
    const res = await (await server()).get('/me/recaps').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(ids(res.body)).toEqual([latest.id, month.id, old.id]);
    expect(Object.keys(res.body.recaps[0]).sort()).toEqual(['builtAt', 'id', 'kind', 'line', 'openedAt', 'periodEnd', 'periodStart', 'personaId']);
    expect(res.body.recaps[0]).toMatchObject({ kind: 'WEEK', periodStart: '2026-09-28', periodEnd: '2026-10-04', line: 'Line 2026-09-28', openedAt: null });
  });

  it('filters by kind and limits, and rejects anything else', async () => {
    const user = await createUser();
    await recap(user.id, 'WEEK', '2026-09-21', '2026-09-27');
    const month = await recap(user.id, 'MONTH', '2026-09-01', '2026-09-30');
    const latest = await recap(user.id, 'WEEK', '2026-09-28', '2026-10-04');
    const headers = await authHeaderFor(user.id);
    expect(ids((await (await server()).get('/me/recaps?kind=MONTH').set(headers)).body)).toEqual([month.id]);
    expect(ids((await (await server()).get('/me/recaps?limit=1').set(headers)).body)).toEqual([latest.id]);
    for (const q of ['kind=YEAR', 'limit=0', 'limit=abc', 'limit=51']) {
      const res = await (await server()).get(`/me/recaps?${q}`).set(headers);
      expect([q, res.status, res.body]).toEqual([q, 400, { error: 'invalid_query' }]);
    }
  });
});

describe('GET /me/recaps/:id and POST /me/recaps/:id/opened', () => {
  it('returns the full recap as a pure read', async () => {
    const user = await createUser();
    const row = await recap(user.id, 'WEEK', '2026-09-28', '2026-10-04', { story: 'A story.', storySource: 'AI' });
    const res = await (await server()).get(`/me/recaps/${row.id}`).set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: row.id, stats: { nightsWithData: 6 }, sleepGoalMinutes: 480, lineSource: 'ai', story: 'A story.', rebuiltAt: null, openedAt: null });
    expect((await prisma.recap.findUniqueOrThrow({ where: { id: row.id } })).openedAt).toBeNull();
  });

  it("404s for another user's recap, a SKIPPED row and a malformed id", async () => {
    const user = await createUser();
    const theirs = await recap((await createUser()).id, 'WEEK', '2026-09-28', '2026-10-04');
    const skipped = await prisma.recap.create({ data: { userId: user.id, kind: 'MONTH', periodStart: day('2026-09-01'), periodEnd: day('2026-09-30'), status: 'SKIPPED', sleepGoalMinutes: 480 } });
    const headers = await authHeaderFor(user.id);
    for (const id of [theirs.id, skipped.id, 'not-a-uuid']) {
      expect((await (await server()).get(`/me/recaps/${id}`).set(headers)).status).toBe(404);
      expect((await (await server()).post(`/me/recaps/${id}/opened`).set(headers)).status).toBe(404);
    }
    expect((await prisma.recap.findUniqueOrThrow({ where: { id: theirs.id } })).openedAt).toBeNull();
  });

  it('marks it opened idempotently', async () => {
    const user = await createUser();
    const row = await recap(user.id, 'WEEK', '2026-09-28', '2026-10-04');
    const headers = await authHeaderFor(user.id);
    expect((await (await server()).post(`/me/recaps/${row.id}/opened`).set(headers)).status).toBe(204);
    const first = (await prisma.recap.findUniqueOrThrow({ where: { id: row.id } })).openedAt;
    expect(first).not.toBeNull();
    expect((await (await server()).post(`/me/recaps/${row.id}/opened`).set(headers)).status).toBe(204);
    expect((await prisma.recap.findUniqueOrThrow({ where: { id: row.id } })).openedAt).toEqual(first);
  });

  it('requires a session', async () => {
    expect((await (await server()).get('/me/recaps')).status).toBe(401);
    expect((await (await server()).get('/me/recaps/x')).status).toBe(401);
    expect((await (await server()).post('/me/recaps/x/opened')).status).toBe(401);
  });
});

describe('/me/notifications', () => {
  it('reads the default and saves a partial boolean patch', async () => {
    const user = await createUser();
    const headers = await authHeaderFor(user.id);
    expect((await (await server()).get('/me/notifications').set(headers)).body).toMatchObject({ recapPushEnabled: true });
    const res = await (await server()).put('/me/notifications').set(headers).send({ recapPushEnabled: false });
    expect(res.body).toMatchObject({ recapPushEnabled: false });
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).recapPushEnabled).toBe(false);
  });

  it('answers 400 invalid_settings for anything but a boolean recapPushEnabled', async () => {
    const user = await createUser();
    const headers = await authHeaderFor(user.id);
    for (const body of [{ recapPushEnabled: 'no' }, {}, { recapPushEnabled: true, extra: 1 }, [true]]) {
      const res = await (await server()).put('/me/notifications').set(headers).send(body as object);
      expect([res.status, res.body]).toEqual([400, { error: 'invalid_settings' }]);
    }
    expect((await (await server()).get('/me/notifications')).status).toBe(401);
  });
});

describe('GET /me/coach/digests/latest serves the weekly recap story in the same shape', () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.COACH_ENABLED;
    process.env.COACH_ENABLED = 'true';
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.COACH_ENABLED;
    else process.env.COACH_ENABLED = saved;
  });

  it('serves the latest BUILT WEEK recap story', async () => {
    const user = await createUser();
    await prisma.coachDigest.create({ data: { userId: user.id, text: 'legacy', personaId: 'mochi', weekStart: day('2026-09-28') } });
    const row = await recap(user.id, 'WEEK', '2026-09-28', '2026-10-04', { story: 'This week, from the recap.', storySource: 'AI', builtAt: new Date('2026-10-05T09:00:00Z') });
    const res = await (await server()).get('/me/coach/digests/latest').set(await authHeaderFor(user.id));
    expect(res.body).toEqual({ digest: { id: row.id, text: 'This week, from the recap.', createdAt: '2026-10-05T09:00:00.000Z' } });
  });

  it('falls back to the latest legacy digest when no recap has a story', async () => {
    const user = await createUser();
    const legacy = await prisma.coachDigest.create({ data: { userId: user.id, text: 'legacy', personaId: 'mochi', weekStart: day('2026-09-28') } });
    await recap(user.id, 'WEEK', '2026-09-28', '2026-10-04'); // template-only: no story
    const res = await (await server()).get('/me/coach/digests/latest').set(await authHeaderFor(user.id));
    expect(res.body).toEqual({ digest: { id: legacy.id, text: 'legacy', createdAt: legacy.createdAt.toISOString() } });
  });
});
