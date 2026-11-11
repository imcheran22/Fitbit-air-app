import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { civilDateToUtcMidnight } from '../../src/biometrics/civilDate';
import { shiftDate } from '../../src/scoring/dates';
import { api, buddyUser } from '../buddies/helpers';
import { shareRecap } from '../../src/social/recapShares';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const LINE = 'You slept 7h 12m a night on average.';

async function recap(userId: string, opts: { status?: 'BUILT' | 'SKIPPED'; start?: string; line?: string | null } = {}) {
  const start = opts.start ?? '2026-09-28';
  return prisma.recap.create({
    data: {
      userId, kind: 'WEEK', periodStart: civilDateToUtcMidnight(start), periodEnd: civilDateToUtcMidnight(shiftDate(start, 6)),
      status: opts.status ?? 'BUILT', sleepGoalMinutes: 480,
      line: opts.line === undefined ? LINE : opts.line, lineSource: 'TEMPLATE',
    },
  });
}

it('shares only your own built recap with a line, idempotently, reports it, and unshares', async () => {
  const me = await buddyUser();
  const other = await buddyUser();
  const mine = await recap(me.id);
  const theirs = await recap(other.id);
  const skipped = await recap(me.id, { status: 'SKIPPED', start: '2026-09-21' });
  const noLine = await recap(me.id, { start: '2026-09-14', line: null });
  const blank = await recap(me.id, { start: '2026-09-07', line: '   ' });
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  const before = await agent.get(`/me/social/recap-shares/${mine.id}`).set(headers);
  expect([before.status, before.body, before.headers['cache-control']]).toEqual([200, { shared: false }, 'private, no-store']);
  expect((await agent.post('/me/social/recap-shares').set(headers).send({ recapId: mine.id, line: LINE })).body).toEqual({ shared: true });
  expect((await agent.post('/me/social/recap-shares').set(headers).send({ recapId: mine.id, line: LINE })).body).toEqual({ shared: true });
  expect(await prisma.recapShare.count({ where: { sharerId: me.id } })).toBe(1);
  // The line is snapshotted at share time (a later rewrite never reaches buddies); a re-share keeps the first one.
  await prisma.recap.update({ where: { id: mine.id }, data: { line: 'Rewritten later' } });
  expect((await agent.post('/me/social/recap-shares').set(headers).send({ recapId: mine.id, line: 'Rewritten later' })).body).toEqual({ shared: true });
  expect((await prisma.recapShare.findFirstOrThrow({ where: { sharerId: me.id }, select: { line: true } })).line)
    .toBe(LINE);
  expect((await agent.get(`/me/social/recap-shares/${mine.id}`).set(headers)).body).toEqual({ shared: true });
  // The share is consent for the line exactly as previewed; a recap without a line has nothing to share.
  for (const id of [theirs.id, skipped.id, noLine.id, blank.id, 'not-a-uuid']) {
    const res = await agent.post('/me/social/recap-shares').set(headers).send({ recapId: id, line: LINE });
    expect([res.status, res.body]).toEqual([404, { error: 'recap_not_found' }]);
  }
  expect((await agent.get('/me/social/recap-shares/not-a-uuid').set(headers)).body).toEqual({ shared: false });
  expect((await agent.get(`/me/social/recap-shares/${theirs.id}`).set(headers)).body).toEqual({ shared: false });
  expect((await agent.delete(`/me/social/recap-shares/${mine.id}`).set(headers)).status).toBe(204);
  expect(await prisma.recapShare.count({ where: { sharerId: me.id } })).toBe(0);
  expect((await agent.get(`/me/social/recap-shares/${mine.id}`).set(headers)).body).toEqual({ shared: false });
});

it('refuses a line that differs from the one previewed, storing nothing; a match is stored trimmed', async () => {
  const me = await buddyUser();
  const mine = await recap(me.id);
  const agent = await api();
  const headers = await authHeaderFor(me.id);
  // A late rebuild rewrote the line after the preview: the share is refused, never published with the new text.
  for (const line of ['You slept 6h 02m a night on average.', '', '   ', 42, null]) {
    const res = await agent.post('/me/social/recap-shares').set(headers).send({ recapId: mine.id, line });
    expect([res.status, res.body]).toEqual([404, { error: 'recap_not_found' }]);
  }
  const missing = await agent.post('/me/social/recap-shares').set(headers).send({ recapId: mine.id });
  expect([missing.status, missing.body]).toEqual([404, { error: 'recap_not_found' }]);
  await expect(shareRecap(me.id, mine.id, 'Something else', new Date())).rejects.toMatchObject({ code: 'recap_not_found' });
  expect(await prisma.recapShare.count({ where: { sharerId: me.id } })).toBe(0);
  // Whitespace around either side is not a different line; the stored snapshot is trimmed.
  await prisma.recap.update({ where: { id: mine.id }, data: { line: `  ${LINE}\n` } });
  expect((await agent.post('/me/social/recap-shares').set(headers).send({ recapId: mine.id, line: ` \n${LINE}  ` })).body).toEqual({ shared: true });
  expect((await prisma.recapShare.findFirstOrThrow({ where: { sharerId: me.id }, select: { line: true } })).line).toBe(LINE);
});
