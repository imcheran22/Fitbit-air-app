// Per-user fixed-window rate limits in Redis (spec 2026-10-06 buddies §4). One INCR+EXPIRE per call,
// bounded by withTimeout. Any Redis failure FAILS CLOSED ('unavailable' → the route answers
// try_later): these limits are the abuse protection for a short code and handle probing, so an
// outage must not switch them off. Commands ioredis queued during an outage may count once Redis
// returns; accepted.

import { connection } from '../sync/queue';
import { withTimeout } from './withTimeout';

export interface RateLimit {
  name: string;
  limit: number;
  windowSeconds: number;
}

export const RATE_LIMITS = {
  codeRedeem: { name: 'code_redeem', limit: 10, windowSeconds: 60 * 60 },
  buddyRequest: { name: 'buddy_request', limit: 50, windowSeconds: 24 * 60 * 60 },
  handle: { name: 'handle', limit: 30, windowSeconds: 60 },
  campNote: { name: 'camp_note', limit: 20, windowSeconds: 60 * 60 },
  // Chats (spec 2026-10-07 social §9). Text and card messages spend both message buckets; stickers keep their own limit.
  message: { name: 'message', limit: 30, windowSeconds: 60 },
  messageDay: { name: 'message_day', limit: 500, windowSeconds: 24 * 60 * 60 },
  statusNote: { name: 'status_note', limit: 20, windowSeconds: 60 * 60 },
  reaction: { name: 'reaction', limit: 60, windowSeconds: 60 },
  report: { name: 'report', limit: 20, windowSeconds: 60 * 60 },
} as const satisfies Record<string, RateLimit>;

export type RateLimitResult = 'ok' | 'limited' | 'unavailable';

interface RateLimitMulti {
  incr(key: string): RateLimitMulti;
  expire(key: string, seconds: number): RateLimitMulti;
  exec(): Promise<Array<[Error | null, unknown]> | null>;
}
export interface RateLimitRedis {
  multi(): RateLimitMulti;
}

export const RATE_LIMIT_TIMEOUT_MS = 300;

export async function consumeRateLimit(
  limit: RateLimit,
  userId: string,
  opts: { now?: number; redis?: RateLimitRedis; timeoutMs?: number } = {},
): Promise<RateLimitResult> {
  const now = opts.now ?? Date.now();
  const window = Math.floor(now / 1000 / limit.windowSeconds);
  const key = `ratelimit:${limit.name}:${userId}:${window}`;
  const redis = opts.redis ?? (connection as unknown as RateLimitRedis);
  try {
    const results = await withTimeout(
      redis.multi().incr(key).expire(key, limit.windowSeconds).exec(),
      opts.timeoutMs ?? RATE_LIMIT_TIMEOUT_MS,
      'rate limit timeout',
    );
    if (!results) throw new Error('rate limit transaction aborted');
    // Both commands must succeed: a counter whose EXPIRE failed would never reset.
    for (const [err] of results) if (err) throw err;
    return Number(results[0]![1]) > limit.limit ? 'limited' : 'ok';
  } catch (err) {
    console.error(JSON.stringify({ event: 'ratelimit.unavailable', limit: limit.name, userId, error: err instanceof Error ? err.name : 'unknown' }));
    return 'unavailable';
  }
}
