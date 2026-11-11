import { randomUUID } from 'crypto';
import { connection } from '../../src/sync/queue';
import { RATE_LIMITS, consumeRateLimit, type RateLimit } from '../../src/lib/rateLimit';
import { withTimeout } from '../../src/lib/withTimeout';

afterAll(() => connection.quit());

const tiny = (): RateLimit => ({ name: `test_${randomUUID().slice(0, 8)}`, limit: 3, windowSeconds: 60 });
const NOW = Date.UTC(2026, 9, 7, 12, 0, 30);

it('has the spec limits', () => {
  expect(RATE_LIMITS).toEqual({
    codeRedeem: { name: 'code_redeem', limit: 10, windowSeconds: 3600 },
    buddyRequest: { name: 'buddy_request', limit: 50, windowSeconds: 86400 },
    handle: { name: 'handle', limit: 30, windowSeconds: 60 },
    campNote: { name: 'camp_note', limit: 20, windowSeconds: 3600 },
    message: { name: 'message', limit: 30, windowSeconds: 60 },
    messageDay: { name: 'message_day', limit: 500, windowSeconds: 86400 },
    statusNote: { name: 'status_note', limit: 20, windowSeconds: 3600 },
    reaction: { name: 'reaction', limit: 60, windowSeconds: 60 },
    report: { name: 'report', limit: 20, windowSeconds: 3600 },
  });
});

it('allows `limit` calls per user per fixed window, then limits; the next window starts fresh', async () => {
  const limit = tiny();
  const user = randomUUID();
  const results = [];
  for (let i = 0; i < 4; i++) results.push(await consumeRateLimit(limit, user, { now: NOW }));
  expect(results).toEqual(['ok', 'ok', 'ok', 'limited']);
  expect(await consumeRateLimit(limit, randomUUID(), { now: NOW })).toBe('ok');
  expect(await consumeRateLimit(limit, user, { now: NOW + 60_000 })).toBe('ok');
});

it('sets the window as the key TTL, so a counter never outlives its window', async () => {
  const limit = tiny();
  const user = randomUUID();
  const now = Date.now();
  await consumeRateLimit(limit, user, { now });
  const ttl = await connection.ttl(`ratelimit:${limit.name}:${user}:${Math.floor(now / 1000 / limit.windowSeconds)}`);
  expect(ttl).toBeGreaterThan(0);
  expect(ttl).toBeLessThanOrEqual(limit.windowSeconds);
});

it('fails closed when the EXPIRE inside the transaction errors, not only the INCR', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const expireFails = { multi: () => ({ incr() { return this; }, expire() { return this; }, exec: async () => [[null, 1], [new Error('expire failed'), null]] }) };
  expect(await consumeRateLimit(tiny(), randomUUID(), { redis: expireFails as never })).toBe('unavailable');
  spy.mockRestore();
});

it('fails closed when Redis errors, and logs only the event, limit name, user id and error class', async () => {
  const lines: string[] = [];
  const spy = jest.spyOn(console, 'error').mockImplementation((line: unknown) => void lines.push(String(line)));
  const broken = { multi: () => ({ incr() { return this; }, expire() { return this; }, exec: () => Promise.reject(new Error('ECONNREFUSED secret-host')) }) };
  const user = randomUUID();
  expect(await consumeRateLimit(tiny(), user, { redis: broken as never })).toBe('unavailable');
  spy.mockRestore();
  expect(lines).toHaveLength(1);
  const logged = JSON.parse(lines[0]!);
  expect(logged).toEqual({ event: 'ratelimit.unavailable', limit: expect.stringMatching(/^test_/), userId: user, error: 'Error' });
  expect(lines[0]).not.toContain('secret-host');
});

it('fails closed when Redis hangs, within the timeout', async () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  const hanging = { multi: () => ({ incr() { return this; }, expire() { return this; }, exec: () => new Promise(() => {}) }) };
  const started = Date.now();
  expect(await consumeRateLimit(tiny(), randomUUID(), { redis: hanging as never, timeoutMs: 30 })).toBe('unavailable');
  expect(Date.now() - started).toBeLessThan(1000);
  expect(JSON.parse(String(spy.mock.calls[0]![0])).error).toBe('TimeoutError');
  spy.mockRestore();
});

it('withTimeout resolves a fast promise and rejects a slow one with a TimeoutError', async () => {
  await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  await expect(withTimeout(new Promise(() => {}), 10, 'slow')).rejects.toMatchObject({ name: 'TimeoutError', message: 'slow' });
});
