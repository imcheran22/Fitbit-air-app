import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { CRISIS_RESOURCES } from '../../src/coach/guardrails/crisis';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { createUser } from './helpers';
import { testServer } from '../helpers/server';
import { LEGACY_DISCLAIMER, LEGACY_REPLY_NOTES } from '../../src/coach/answer/history';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});
afterAll(async () => {
  await prisma.$disconnect();
});

let savedFlag: string | undefined;
beforeEach(() => {
  savedFlag = process.env.COACH_ENABLED;
  process.env.COACH_ENABLED = 'true';
});
afterEach(() => {
  if (savedFlag === undefined) delete process.env.COACH_ENABLED;
  else process.env.COACH_ENABLED = savedFlag;
});

const T0 = new Date('2026-09-01T08:00:00.000Z').getTime();
const at = (minutes: number) => new Date(T0 + minutes * 60_000);

/** A conversation with a user question and an assistant reply, the reply at `minutes`. */
async function conversation(userId: string, minutes: number, question = `Question ${minutes}`) {
  const c = await prisma.coachConversation.create({ data: { userId, createdAt: at(minutes - 1), lastMessageAt: at(minutes) } });
  await prisma.coachMessage.create({ data: { conversationId: c.id, userId, role: 'USER', text: question, createdAt: at(minutes - 1) } });
  await prisma.coachMessage.create({
    data: { conversationId: c.id, userId, role: 'ASSISTANT', text: 'Answer.', source: 'MODEL', engine: 'LOCAL', createdAt: at(minutes) },
  });
  return c;
}

const list = async (userId: string, query = '') =>
  request(await testServer(createApp())).get(`/me/coach/conversations${query}`).set(await authHeaderFor(userId));

describe('GET /me/coach/conversations', () => {
  it('lists the user’s conversations newest first with title, lastMessageAt and messageCount', async () => {
    const user = await createUser();
    const other = await createUser();
    await conversation(user.id, 10, 'How did I sleep?');
    const newer = await conversation(user.id, 20, 'Why is my HRV low?');
    await prisma.coachMessage.create({
      data: { conversationId: newer.id, userId: user.id, role: 'USER', text: 'And today?', createdAt: at(21) },
    });
    await conversation(other.id, 30, 'Not yours');
    await prisma.coachConversation.create({ data: { userId: user.id, lastMessageAt: at(40) } }); // emptied by retention

    const res = await list(user.id);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      conversations: [
        { id: newer.id, title: 'Why is my HRV low?', lastMessageAt: at(20).toISOString(), messageCount: 3 },
        { id: expect.any(String), title: 'How did I sleep?', lastMessageAt: at(10).toISOString(), messageCount: 2 },
      ],
    });
  });

  it('titles a conversation with its first question, cut to 60 characters', async () => {
    const user = await createUser();
    const long = 'Why does my recovery drop every time I have a late dinner with friends on Fridays?';
    await conversation(user.id, 10, `  ${long}\n`);
    const [row] = (await list(user.id)).body.conversations;
    expect(row.title.length).toBeLessThanOrEqual(60);
    expect(row.title).toBe(`${long.slice(0, 59)}…`);
  });

  it('pages by ?before=<lastMessageAt>, 20 at a time', async () => {
    const user = await createUser();
    for (let i = 1; i <= 23; i++) await conversation(user.id, i * 10);

    const first = (await list(user.id)).body.conversations;
    expect(first).toHaveLength(20);
    expect(first[0].lastMessageAt).toBe(at(230).toISOString());

    const rest = (await list(user.id, `?before=${encodeURIComponent(first[19].lastMessageAt)}`)).body.conversations;
    expect(rest.map((c: { lastMessageAt: string }) => c.lastMessageAt)).toEqual([at(30), at(20), at(10)].map((d) => d.toISOString()));
  });

  it('400s a before that is not a date', async () => {
    const user = await createUser();
    const res = await list(user.id, '?before=yesterday');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'before must be an ISO date' });
  });

  it('is empty for a user with no conversations', async () => {
    const user = await createUser();
    expect((await list(user.id)).body).toEqual({ conversations: [] });
  });
});

describe('GET /me/coach/conversations/:id and /latest', () => {
  async function richConversation(userId: string) {
    const c = await prisma.coachConversation.create({ data: { userId, createdAt: at(0), lastMessageAt: at(9) } });
    const m = (data: object) => prisma.coachMessage.create({ data: { conversationId: c.id, userId, ...data } as never });
    const card = { headline: 'Recovery is low', tiles: [{ factId: 'recovery.today', label: 'Recovery', display: '26', value: 26 }], source: 'Today' };
    await m({ role: 'USER', text: 'How am I?', createdAt: at(1) });
    const answered = await m({ role: 'ASSISTANT', text: 'Recovery is 26.', source: 'MODEL', engine: 'HOSTED', card, createdAt: at(2) });
    await m({ role: 'USER', text: 'I run at 6am', createdAt: at(3) });
    const noted = await m({ role: 'ASSISTANT', text: 'Nice routine.', source: 'MODEL', engine: 'LOCAL', createdAt: at(4) });
    await m({ role: 'USER', text: 'tell me more', createdAt: at(5) });
    await m({ role: 'ASSISTANT', text: 'Half an', source: 'MODEL', engine: 'LOCAL', guardrailEvents: [{ type: 'stopped' }], createdAt: at(6) });
    await m({ role: 'USER', text: 'I feel hopeless', createdAt: at(7) });
    await m({ role: 'ASSISTANT', text: 'Support is available.', source: 'SAFETY', createdAt: at(8) });
    await m({ role: 'ASSISTANT', text: 'Old reply, before the redesign.', source: 'FALLBACK', guardrailEvents: [{ type: 'latency_budget_exceeded' }], createdAt: at(9) });
    const memory = await prisma.coachMemory.create({
      data: { userId, category: 'SCHEDULE', value: 'Runs at 6am', conversationId: c.id, messageId: noted.id },
    });
    await prisma.coachMemory.create({ data: { userId, category: 'PREFERENCE', value: 'Short answers', conversationId: c.id } }); // legacy: no message
    return { c, card, answered, noted, memory };
  }

  it('returns every message with card, engine, stopped, safety and its memory proposals', async () => {
    const user = await createUser();
    const { c, card, memory } = await richConversation(user.id);

    const res = await request(await testServer(createApp())).get(`/me/coach/conversations/${c.id}`).set(await authHeaderFor(user.id));

    expect(res.status).toBe(200);
    expect(res.body.conversationId).toBe(c.id);
    const msgs = res.body.messages;
    expect(Object.keys(msgs[0]).sort()).toEqual([
      'card', 'createdAt', 'engine', 'id', 'memoryProposals', 'role', 'safety', 'source', 'stopped', 'text',
    ]);
    expect(msgs.map((x: any) => [x.role, x.source, x.engine, x.stopped, x.card === null, x.safety === null, x.memoryProposals.length])).toEqual([
      ['user', null, null, false, true, true, 0],
      ['assistant', 'model', 'hosted', false, false, true, 0],
      ['user', null, null, false, true, true, 0],
      ['assistant', 'model', 'local', false, true, true, 1],
      ['user', null, null, false, true, true, 0],
      ['assistant', 'model', 'local', true, true, true, 0],
      ['user', null, null, false, true, true, 0],
      ['assistant', 'safety', null, false, true, false, 0],
      ['assistant', 'fallback', null, false, true, true, 0],
    ]);
    expect(msgs[1].card).toEqual(card);
    expect(msgs[3].memoryProposals).toEqual([
      { id: memory.id, category: 'SCHEDULE', value: 'Runs at 6am', status: 'PENDING', createdAt: memory.createdAt.toISOString() },
    ]);
    expect(msgs[7].safety).toEqual({ resources: CRISIS_RESOURCES });
  });

  it('/latest returns the same message shape', async () => {
    const user = await createUser();
    const { c } = await richConversation(user.id);
    const res = await request(await testServer(createApp())).get('/me/coach/conversations/latest').set(await authHeaderFor(user.id));
    expect(res.body.conversationId).toBe(c.id);
    expect(res.body.messages[3].memoryProposals).toHaveLength(1);
    expect(res.body.messages[5].stopped).toBe(true);
  });

  it("404s another user's conversation and an unknown id, without leaking memories", async () => {
    const owner = await createUser();
    const other = await createUser();
    const { c } = await richConversation(owner.id);
    const stolen = await request(await testServer(createApp())).get(`/me/coach/conversations/${c.id}`).set(await authHeaderFor(other.id));
    expect(stolen.status).toBe(404);
    expect(stolen.body).toEqual({ error: 'conversation_not_found' });
    expect((await request(await testServer(createApp())).get('/me/coach/conversations/nope').set(await authHeaderFor(other.id))).status).toBe(404);
  });

  it('serves pre-redesign replies without the disclaimer and memory note they were stored with', async () => {
    const user = await createUser();
    const c = await prisma.coachConversation.create({ data: { userId: user.id, lastMessageAt: at(2) } });
    await prisma.coachMessage.create({ data: { conversationId: c.id, userId: user.id, role: 'USER', text: 'I run at 6am', createdAt: at(1) } });
    await prisma.coachMessage.create({
      data: {
        conversationId: c.id,
        userId: user.id,
        role: 'ASSISTANT',
        text: `Nice routine.\n\n${LEGACY_REPLY_NOTES[0]}\n\n${LEGACY_DISCLAIMER}`,
        source: 'MODEL',
        createdAt: at(2),
      },
    });
    const res = await request(await testServer(createApp())).get(`/me/coach/conversations/${c.id}`).set(await authHeaderFor(user.id));
    expect(res.body.messages.map((m: { text: string }) => m.text)).toEqual(['I run at 6am', 'Nice routine.']);
  });
});
