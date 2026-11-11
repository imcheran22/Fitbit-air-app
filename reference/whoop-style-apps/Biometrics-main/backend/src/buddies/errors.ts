// Buddy error codes (spec 2026-10-06 buddies §4, §7). Every error body is { error: code, ...extra }.
// not_buddies is 403, never a bare 404: the app reads only a bare 404 on GET /me/buddies as an
// older backend.

import type { Response } from 'express';
import type { AuthedRequest } from '../auth/middleware';
import { consumeRateLimit, type RateLimit } from '../lib/rateLimit';

export const BUDDY_ERROR_STATUS = {
  invalid_handle: 400,
  invalid_display_name: 400,
  setup_incomplete: 400,
  handle_taken: 409,
  rate_limited: 429,
  try_later: 503,
  handle_required: 409,
  mood_notice_required: 409,
  consent_required: 409,
  stale_consent_version: 400,
  invalid_settings: 400,
  code_invalid: 400,
  own_handle: 400,
  not_found: 404,
  blocked_by_you: 409,
  too_many_pending: 409,
  request_gone: 404,
  not_buddies: 403,
  sticker_limit: 429,
  invalid_sticker: 400,
  invalid_cursor: 400,
  invalid_checkin: 400,
  recap_not_found: 404,
  goodnight_closed: 409,
  undo_expired: 409,
  invalid_note: 400,
  invalid_message: 400,
  message_gone: 404,
  invalid_reaction: 400,
  card_unavailable: 409,
  invalid_status_note: 400,
  invalid_report: 400,
  report_target_gone: 404,
} as const;

export type BuddyErrorCode = keyof typeof BUDDY_ERROR_STATUS;

export class BuddyError extends Error {
  constructor(readonly code: BuddyErrorCode, readonly extra: Record<string, unknown> = {}) {
    super(code);
    this.name = 'BuddyError';
  }
}

export { UUID_RE } from '../coach/push';

export const isUniqueViolation = (err: unknown): boolean => (err as { code?: string } | null)?.code === 'P2002';

/** Wraps a handler: a BuddyError becomes its status and body; anything else reaches Express (500). */
export function buddyRoute(fn: (req: AuthedRequest, res: Response) => Promise<void>) {
  return async (req: AuthedRequest, res: Response): Promise<void> => {
    try {
      await fn(req, res);
    } catch (err) {
      if (err instanceof BuddyError) {
        res.status(BUDDY_ERROR_STATUS[err.code]).json({ error: err.code, ...err.extra });
        return;
      }
      throw err;
    }
  };
}

/** Over the limit → rate_limited; Redis down or slow → try_later (fail closed). */
export async function limitOrThrow(limit: RateLimit, userId: string): Promise<void> {
  const result = await consumeRateLimit(limit, userId);
  if (result === 'limited') throw new BuddyError('rate_limited');
  if (result === 'unavailable') throw new BuddyError('try_later');
}
