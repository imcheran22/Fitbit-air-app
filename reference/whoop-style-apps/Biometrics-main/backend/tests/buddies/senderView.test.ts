import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { setBuddyNotifyQueue } from '../../src/buddies/notifyQueue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { RecordingQueue, api, buddyUser } from './helpers';

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});
beforeEach(() => setBuddyNotifyQueue(new RecordingQueue()));
afterEach(() => setBuddyNotifyQueue(null));

const DAY = 86_400_000;

it('the sender view is identical across every §4 state until 14 days after sending, then gone', async () => {
  const s = await buddyUser();
  const t = await Promise.all(Array.from({ length: 8 }, () => buddyUser()));
  const agent = await api();
  const as = async (id: string) => authHeaderFor(id);
  const send = async (to: { handle: string | null }) => agent.post('/me/buddies/requests').set(await as(s.id)).send({ handle: to.handle });
  const requestId = async (to: string) => (await prisma.buddyRequest.findFirstOrThrow({ where: { fromUserId: s.id, toUserId: to }, orderBy: { createdAt: 'desc' } })).id;
  const responses: Array<[number, unknown]> = [];
  const record = async (p: ReturnType<typeof send>) => {
    const r = await p;
    responses.push([r.status, r.body]);
  };

  // Pending
  await record(send(t[0]!));
  // Declined
  await record(send(t[1]!));
  await agent.post(`/me/buddies/requests/${await requestId(t[1]!.id)}/decline`).set(await as(t[1]!.id));
  // Blocked by the target after sending
  await record(send(t[2]!));
  await agent.post(`/me/buddies/requests/${await requestId(t[2]!.id)}/block`).set(await as(t[2]!.id));
  // Swallowed after a decline (the sender withdrew the declined one, then asked again)
  await record(send(t[3]!));
  await agent.post(`/me/buddies/requests/${await requestId(t[3]!.id)}/decline`).set(await as(t[3]!.id));
  await agent.post(`/me/buddies/requests/${await requestId(t[3]!.id)}/cancel`).set(await as(s.id));
  await record(send(t[3]!));
  // Sent to someone who blocked you
  await record(send(t[4]!));
  await agent.post(`/me/buddies/requests/${await requestId(t[4]!.id)}/block`).set(await as(t[4]!.id));
  await agent.post(`/me/buddies/requests/${await requestId(t[4]!.id)}/cancel`).set(await as(s.id));
  await record(send(t[4]!));
  // Accepted
  await record(send(t[5]!));
  await agent.post(`/me/buddies/requests/${await requestId(t[5]!.id)}/accept`).set(await as(t[5]!.id));
  // Expired
  await record(send(t[6]!));
  await prisma.buddyRequest.updateMany({ where: { fromUserId: s.id, toUserId: t[6]!.id }, data: { createdAt: new Date(Date.now() - 15 * DAY) } });
  // Cancelled by the sender
  await record(send(t[7]!));
  await agent.post(`/me/buddies/requests/${await requestId(t[7]!.id)}/cancel`).set(await as(s.id));

  // Every send got the same answer.
  expect(new Set(responses.map((r) => JSON.stringify(r)))).toEqual(new Set([JSON.stringify([200, { ok: true }])]));

  const outgoing = (await agent.get('/me/buddies/requests').set(await as(s.id))).body.outgoing as Array<Record<string, unknown>>;
  expect(outgoing.map((o) => o.toHandle).sort()).toEqual([t[0], t[1], t[2], t[3], t[4]].map((u) => u!.handle).sort());
  // No field tells the five apart.
  expect(new Set(outgoing.map((o) => Object.keys(o).sort().join(',')))).toEqual(new Set(['createdAt,id,toHandle']));

  // The recipients: only the plain pending one shows anything.
  for (const [i, expected] of [[0, 1], [1, 0], [2, 0], [3, 0], [4, 0]] as const) {
    const incoming = (await agent.get('/me/buddies/requests').set(await as(t[i]!.id))).body.incoming;
    expect([i, incoming.length]).toEqual([i, expected]);
  }

  // 14 days after sending, all of them are gone for the sender.
  await prisma.buddyRequest.updateMany({ where: { fromUserId: s.id }, data: { createdAt: new Date(Date.now() - 14 * DAY - 1000) } });
  expect((await agent.get('/me/buddies/requests').set(await as(s.id))).body.outgoing).toEqual([]);
});
