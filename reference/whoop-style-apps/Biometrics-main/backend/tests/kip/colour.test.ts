import { prisma } from '../../src/db/client';
import { connection } from '../../src/sync/queue';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { kipColourOf, KIP_COLOUR_NAMES } from '../../src/kip/colours';
import { api, buddyUser, pairUp } from '../buddies/helpers';

jest.mock('../../src/health/client');

beforeAll(() => migrateTestDb());
afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

it('lists the 10 v1 colours, coral first, and reads anything else as coral', () => {
  expect(KIP_COLOUR_NAMES).toEqual(['coral', 'cobalt', 'ink', 'lemon', 'lilac', 'lime', 'mint', 'sky', 'slate', 'snow']);
  expect(kipColourOf('mint')).toBe('mint');
  expect(kipColourOf('purple')).toBe('coral');
  expect(kipColourOf(null)).toBe('coral');
  expect(kipColourOf(undefined)).toBe('coral');
});

it('a new user is coral, and GET /me/buddies/me says so', async () => {
  const user = await buddyUser();
  const res = await (await api()).get('/me/buddies/me').set(await authHeaderFor(user.id));
  expect(res.status).toBe(200);
  expect(res.body.kipColour).toBe('coral');
});

it('PUT /me/kip-colour saves a palette colour and the identity read returns it', async () => {
  const user = await buddyUser();
  const headers = await authHeaderFor(user.id);
  const put = await (await api()).put('/me/kip-colour').set(headers).send({ colour: 'cobalt' });
  expect([put.status, put.body]).toEqual([200, { kipColour: 'cobalt' }]);
  const me = await (await api()).get('/me/buddies/me').set(headers);
  expect(me.body.kipColour).toBe('cobalt');
});

it('PUT /me/kip-colour rejects a name outside the palette and leaves the colour alone', async () => {
  const user = await buddyUser();
  const headers = await authHeaderFor(user.id);
  for (const colour of ['purple', '#FB7185', '', 3, null]) {
    const res = await (await api()).put('/me/kip-colour').set(headers).send({ colour });
    expect([res.status, res.body]).toEqual([400, { error: 'invalid_colour' }]);
  }
  expect((await prisma.user.findUnique({ where: { id: user.id } }))!.kipColour).toBe('coral');
});

it('PUT /me/kip-colour needs a session', async () => {
  const res = await (await api()).put('/me/kip-colour').send({ colour: 'mint' });
  expect(res.status).toBe(401);
});

it("a buddy's row and an incoming request carry the person's colour", async () => {
  const me = await buddyUser();
  const buddy = await buddyUser();
  await prisma.user.update({ where: { id: buddy.id }, data: { kipColour: 'lime' } });
  await pairUp(me.id, buddy.id);
  const list = await (await api()).get('/me/buddies').set(await authHeaderFor(me.id));
  expect(list.body.buddies[0]).toMatchObject({ id: buddy.id, kipColour: 'lime' });

  const stranger = await buddyUser();
  await prisma.user.update({ where: { id: stranger.id }, data: { kipColour: 'snow' } });
  await (await api()).post('/me/buddies/requests').set(await authHeaderFor(stranger.id)).send({ handle: me.handle });
  const requests = await (await api()).get('/me/buddies/requests').set(await authHeaderFor(me.id));
  expect(requests.body.incoming[0].from).toMatchObject({ id: stranger.id, kipColour: 'snow' });
});

it('a stored value outside the palette reads back as coral', async () => {
  const me = await buddyUser();
  const buddy = await buddyUser();
  await prisma.user.update({ where: { id: buddy.id }, data: { kipColour: 'teal' } });
  await pairUp(me.id, buddy.id);
  const list = await (await api()).get('/me/buddies').set(await authHeaderFor(me.id));
  expect(list.body.buddies[0].kipColour).toBe('coral');
});
