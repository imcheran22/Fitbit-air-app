import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor } from '../helpers/auth';
import { deleteUserSubscription } from '../../src/health/subscriber';
import { revokeHealthToken } from '../../src/health/oauth';
import { connection } from '../../src/sync/queue';
import { countOwnedRows, createUserWithEmail, seedAllOwnedRows, totalRows } from './ownedData';
import { testServer } from '../helpers/server';

// No real Google calls: the route reaches Google only through these two.
jest.mock('../../src/health/subscriber');
jest.mock('../../src/health/oauth');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

beforeEach(() => {
  (deleteUserSubscription as jest.Mock).mockReset().mockResolvedValue(undefined);
  (revokeHealthToken as jest.Mock).mockReset().mockResolvedValue(undefined);
});

afterAll(async () => {
  await prisma.$disconnect();
  await connection.quit();
});

const newUser = () => createUserWithEmail(`delme-${randomUUID()}@example.com`);

describe('DELETE /me', () => {
  it('deletes the account and all its data, answering 204', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id, { refreshToken: 'route-refresh-token', subscriptionId: 'route-sub' });
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp()))
      .delete('/me')
      .set(authHeader)
      .send({ confirm: 'DELETE' });

    expect(res.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(totalRows(await countOwnedRows(user.id))).toBe(0);
    expect(deleteUserSubscription).toHaveBeenCalledWith('route-sub');
    expect(revokeHealthToken).toHaveBeenCalledWith('route-refresh-token');
  });

  it("does not touch another user's account or data", async () => {
    const user = await newUser();
    const other = await newUser();
    await seedAllOwnedRows(other.id);
    const before = await countOwnedRows(other.id);
    const authHeader = await authHeaderFor(user.id);

    await request(await testServer(createApp())).delete('/me').set(authHeader).send({ confirm: 'DELETE' }).expect(204);

    expect(await prisma.user.findUnique({ where: { id: other.id } })).not.toBeNull();
    expect(await countOwnedRows(other.id)).toEqual(before);
  });

  it('succeeds for a user with no Google connection, without calling Google', async () => {
    const user = await newUser();
    const authHeader = await authHeaderFor(user.id);

    await request(await testServer(createApp())).delete('/me').set(authHeader).send({ confirm: 'DELETE' }).expect(204);

    expect(deleteUserSubscription).not.toHaveBeenCalled();
    expect(revokeHealthToken).not.toHaveBeenCalled();
  });

  it('still answers 204 and deletes locally when Google fails', async () => {
    const user = await newUser();
    await seedAllOwnedRows(user.id);
    const authHeader = await authHeaderFor(user.id);
    (deleteUserSubscription as jest.Mock).mockRejectedValue(new Error('Failed to delete Google Health subscription: 500'));
    (revokeHealthToken as jest.Mock).mockRejectedValue(new Error('Google token revocation returned 503'));
    const errors = jest.spyOn(console, 'error').mockImplementation(() => undefined);

    const res = await request(await testServer(createApp()))
      .delete('/me')
      .set(authHeader)
      .send({ confirm: 'DELETE' });
    errors.mockRestore();

    expect(res.status).toBe(204);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).toBeNull();
    expect(totalRows(await countOwnedRows(user.id))).toBe(0);
  });

  it.each([
    ['no body', undefined],
    ['an empty object', {}],
    ['the wrong word', { confirm: 'delete' }],
    ['a near miss', { confirm: 'DELETE ' }],
    ['a non-string', { confirm: true }],
    ['a different field', { confirmation: 'DELETE' }],
    ['an array', ['DELETE']],
  ])('rejects %s with 400 and deletes nothing', async (_label, body) => {
    const user = await newUser();
    await seedAllOwnedRows(user.id);
    const authHeader = await authHeaderFor(user.id);
    const before = await countOwnedRows(user.id);

    const req = request(await testServer(createApp())).delete('/me').set(authHeader);
    const res = await (body === undefined ? req : req.send(body as object));

    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
    expect(await countOwnedRows(user.id)).toEqual(before);
    expect(deleteUserSubscription).not.toHaveBeenCalled();
    expect(revokeHealthToken).not.toHaveBeenCalled();
  });

  it('rejects a non-JSON body (the word alone) with 400 and deletes nothing', async () => {
    const user = await newUser();
    const authHeader = await authHeaderFor(user.id);

    const res = await request(await testServer(createApp()))
      .delete('/me')
      .set(authHeader)
      .set('Content-Type', 'text/plain')
      .send('DELETE');

    expect(res.status).toBe(400);
    expect(await prisma.user.findUnique({ where: { id: user.id } })).not.toBeNull();
  });

  it('rejects an unauthenticated request with 401', async () => {
    const res = await request(await testServer(createApp())).delete('/me').send({ confirm: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('rejects a garbage bearer token with 401', async () => {
    const res = await request(await testServer(createApp())).delete('/me').set('Authorization', 'Bearer nope').send({ confirm: 'DELETE' });
    expect(res.status).toBe(401);
  });

  it('kills the session: it is rejected afterwards', async () => {
    const user = await newUser();
    const authHeader = await authHeaderFor(user.id);
    const app = createApp();
    // The session works before deletion.
    await request(await testServer(app)).put('/me/timezone').set(authHeader).send({ timezone: 'UTC' }).expect(200);

    await request(await testServer(app)).delete('/me').set(authHeader).send({ confirm: 'DELETE' }).expect(204);

    expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);
    const after = await request(await testServer(app)).put('/me/timezone').set(authHeader).send({ timezone: 'UTC' });
    expect(after.status).toBe(401);
    expect((await request(await testServer(app)).delete('/me').set(authHeader).send({ confirm: 'DELETE' })).status).toBe(401);
  });
});
