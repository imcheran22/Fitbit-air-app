import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { buildAuthorizeUrl, exchangeCodeForTokens } from './oauth';
import { getIdentity, registerUserSubscription, deleteUserSubscription } from './subscriber';
import { isValidWebhookAuthorization } from './webhookVerify';
import { encryptToken } from '../crypto/tokenCipher';
import { enqueueBackfillJob, enqueueFetchJob, enqueueSleepHistoryBackfill, enqueueStepsHistoryBackfill } from '../sync/queue';
import { isEmptyWindow } from '../sync/window';
import { connection } from '../sync/queue';
import { prisma } from '../db/client';
import { BiometricMetricType } from '../types';

export const healthRouter = Router();

const OAUTH_STATE_TTL_SECONDS = 600;
// Exported so the SLEEP wipe-and-resync script repopulates over exactly this window.
export const BACKFILL_WINDOW_DAYS = 30;

// Bare data type strings as they arrive in webhook notifications map to our metric types.
const WEBHOOK_DATA_TYPE_TO_METRIC: Record<string, BiometricMetricType> = {
  steps: 'STEPS',
  'heart-rate': 'RESTING_HR',
  sleep: 'SLEEP',
  heartRateVariability: 'HRV',
};

function oauthStateKey(state: string): string {
  return `oauth-state:${state}`;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// The mobile app opens the Google Health authorize page in the system browser,
// which cannot attach our Authorization header, and Google's redirect back to
// /health/callback cannot carry one either. So this endpoint (which IS
// authenticated, because we need to know who is connecting) mints a
// short-lived single-use state token bound to the user, and the callback
// authenticates by consuming that token rather than by session JWT.
healthRouter.get('/health/authorize', requireAuth, async (req: AuthedRequest, res) => {
  const state = randomUUID();
  await connection.set(oauthStateKey(state), req.userId!, 'EX', OAUTH_STATE_TTL_SECONDS);
  res.json({ url: buildAuthorizeUrl(state) });
});

// Deliberately NOT behind requireAuth — see the note above. Identity comes from
// the state token, which is consumed on first use.
healthRouter.get('/health/callback', async (req, res) => {
  const state = req.query.state as string | undefined;
  if (!state) {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }

  // GETDEL reads and deletes the key in a single atomic server-side operation,
  // so two concurrent requests presenting the same state token cannot both
  // observe a non-null userId before either delete completes.
  const userId = await connection.getdel(oauthStateKey(state));
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired state token' });
    return;
  }

  try {
    const code = req.query.code as string;
    const tokens = await exchangeCodeForTokens(code);
    // The initial authorization_code exchange (with access_type=offline and
    // prompt=consent) is the ONLY point at which Google issues a refresh
    // token; ordinary refresh calls never return one. Without it the
    // connection is unrecoverable after ~1 hour, so treat its absence as a
    // hard failure here rather than storing an unusable connection.
    if (!tokens.refreshToken) {
      throw new Error('Google did not return a refresh token during the initial OAuth exchange');
    }
    const refreshToken = tokens.refreshToken;
    const identity = await getIdentity(tokens.accessToken);

    const existing = await prisma.healthConnection.findUnique({ where: { userId } });

    // Google allows at most one live subscription per (subscriber, user):
    // registerUserSubscription 409s outright if one already exists, whether
    // our local row for it is still CONNECTED or was marked DISCONNECTED
    // without Google's side ever being successfully cleaned up (a swallowed
    // delete failure, or a row disconnected by a path that doesn't call
    // disconnect() at all). So any stale subscription this user's row already
    // references has to be cleared BEFORE attempting to create a new one, not
    // after -- cleaning up only on success never runs when success is exactly
    // what a leftover subscription blocks. Best effort: a failure here (e.g.
    // it was already deleted) must never block the reconnect attempt.
    if (existing?.webhookSubscriptionId) {
      try {
        await deleteUserSubscription(existing.webhookSubscriptionId);
      } catch (deleteErr) {
        console.error(`Failed to delete existing Google Health subscription ${existing.webhookSubscriptionId} before reconnecting`, deleteErr);
      }
    }

    // healthUserId is @unique on HealthConnection, and Google's own
    // subscription conflict is keyed on the real Google account
    // (healthUserId), not on our local userId. So a stale subscription can
    // block this request even when `existing` above is null -- e.g. a
    // *different* local user row (orphaned test data, or an account that
    // reconnects under a new local identity) still references the same real
    // healthUserId. Clean that row up too, before it can cause either a 409
    // at Google or a P2002 on the upsert's healthUserId unique constraint.
    const staleForAccount = await prisma.healthConnection.findUnique({ where: { healthUserId: identity.healthUserId } });
    if (staleForAccount && staleForAccount.userId !== userId) {
      if (staleForAccount.webhookSubscriptionId && staleForAccount.webhookSubscriptionId !== existing?.webhookSubscriptionId) {
        try {
          await deleteUserSubscription(staleForAccount.webhookSubscriptionId);
        } catch (deleteErr) {
          console.error(`Failed to delete cross-user stale Google Health subscription ${staleForAccount.webhookSubscriptionId} before reconnecting`, deleteErr);
        }
      }
      await prisma.healthConnection.delete({ where: { userId: staleForAccount.userId } });
    }

    let subscriptionId: string | undefined;
    let connectionPersisted = false;
    try {
      // Register the webhook subscription BEFORE committing the connection as
      // CONNECTED. If registration fails we fall through to the catch below and
      // the row is never left claiming to be healthy with a subscription ID that
      // does not exist at Google.
      subscriptionId = await registerUserSubscription(identity.healthUserId);

      await prisma.healthConnection.upsert({
        where: { userId },
        update: {
          healthUserId: identity.healthUserId,
          encryptedAccessToken: encryptToken(tokens.accessToken),
          encryptedRefreshToken: encryptToken(refreshToken),
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          webhookSubscriptionId: subscriptionId,
          status: 'CONNECTED',
        },
        create: {
          userId,
          healthUserId: identity.healthUserId,
          encryptedAccessToken: encryptToken(tokens.accessToken),
          encryptedRefreshToken: encryptToken(refreshToken),
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          webhookSubscriptionId: subscriptionId,
        },
      });
      connectionPersisted = true;

      const endDate = new Date();
      const startDate = existing?.lastSyncedAt
        ? existing.lastSyncedAt
        : new Date(endDate.getTime() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      // The window is half-open and ends at today, so a reconnect on the same
      // UTC day as the last sync has nothing before today left to fetch. Today
      // itself arrives through the webhook/day-fetch path. Enqueuing that empty
      // window would only get a 400 back from Google and fail the job.
      const startIso = isoDate(startDate);
      const endIso = isoDate(endDate);
      if (!isEmptyWindow(startIso, endIso)) {
        await enqueueBackfillJob({ userId, startDate: startIso, endDate: endIso });
      }
      // A year of steps and of sleep for the activity heat map. Only history:
      // failing to queue it must not fail a connection that is already live,
      // and the startup sweeps pick up any connection still missing it.
      try {
        await enqueueStepsHistoryBackfill(userId);
      } catch (historyErr) {
        console.error(`Failed to enqueue the steps history backfill for user ${userId}`, historyErr);
      }
      try {
        await enqueueSleepHistoryBackfill(userId);
      } catch (historyErr) {
        console.error(`Failed to enqueue the sleep history backfill for user ${userId}`, historyErr);
      }
    } catch (err) {
      console.error('Google Health subscription registration or connection write failed', err);
      // If the subscription was created at Google but the connection row was
      // never written (e.g. the upsert hit a unique-constraint violation on
      // healthUserId), nothing references the new subscription ID: delete it
      // so it is not orphaned. Skipped once the row IS persisted, because at
      // that point the ID is referenced and deleting it would strand a
      // CONNECTED row with a dead subscription.
      if (subscriptionId && !connectionPersisted) {
        try {
          await deleteUserSubscription(subscriptionId);
        } catch (deleteErr) {
          console.error(`Failed to roll back orphaned Google Health subscription ${subscriptionId}`, deleteErr);
        }
      }
      res.status(500).json({ error: 'Failed to complete Google Health connection' });
      return;
    }

    res.redirect('biometrics://health/callback?status=connected');
  } catch (err) {
    console.error('Google Health callback failed', err);
    res.status(500).json({ error: 'Failed to complete Google Health connection' });
  }
});

healthRouter.get('/webhooks/health', (_req, res) => {
  // Google's subscriber endpoint verification happens automatically during
  // subscriber creation (see scripts/registerHealthSubscriber.ts) via a
  // POST-based handshake, not a per-request GET challenge like some other
  // providers use. This route exists only as a harmless fallback in case
  // Google ever sends a GET here.
  res.status(204).send();
});

// Shape of one notification's `data`, per the spec's confirmed live payload.
// Every field is treated as untrusted at runtime (see the handler below).
interface HealthWebhookInterval {
  physicalTimeInterval?: { startTime?: string; endTime?: string };
  // The spec's live observation shows this as "structured local date/time"
  // without spelling out the nesting. Google's other civil-time structures in
  // this API (e.g. dailyRollUp's civilStartTime) use { date: {year, month,
  // day} }, so that is the shape probed for here.
  civilDateTimeInterval?: {
    startTime?: { date?: { year?: number; month?: number; day?: number } };
    endTime?: { date?: { year?: number; month?: number; day?: number } };
  };
  // Confirmed live as RFC3339-style local (civil) timestamps.
  civilIso8601TimeInterval?: { startTime?: string; endTime?: string };
}

interface HealthWebhookNotification {
  healthUserId: string;
  operation: string;
  dataType: string;
  intervals?: HealthWebhookInterval[];
}

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

// Metrics keyed by Google's civil (local) calendar date: STEPS via dailyRollUp,
// RESTING_HR via the dedicated daily-resting-heart-rate list, whose filter is a
// civil-date literal. The other two (SLEEP, HRV) are resolved from the raw UTC
// instant -- see fetchDateOfInterval.
const CIVIL_DATE_METRICS: ReadonlySet<BiometricMetricType> = new Set(['STEPS', 'RESTING_HR']);

/**
 * Resolves the calendar day (YYYY-MM-DD) the sync worker should re-fetch for
 * a changed interval, or null if the interval carries nothing usable. Which
 * calendar the day is on depends on how the metric is fetched:
 *
 * - STEPS / RESTING_HR are fetched by the user's civil date (dailyRollUp /
 *   the daily-resting-heart-rate filter), so the day must be the civil date too. Deriving it from the UTC
 *   date of `physicalTimeInterval.startTime` is wrong for users west of UTC
 *   in the evening (the instant is already "tomorrow" in UTC), so the civil
 *   fields are preferred and the UTC computation is only a last-resort
 *   fallback.
 *
 * - SLEEP / HRV use dataPoints.list, whose filter is on raw UTC instants
 *   ([date, date + 1) in UTC). The civil date is NOT used for these even when
 *   Google sends it: for the same west-of-UTC user the civil window would end
 *   before the physical instant the notification is about, and the fetch
 *   would silently return nothing (the original C3 bug). Only the UTC date of
 *   the physical instant is correct here.
 *
 * TODO(device-verification): the exact nesting of civilDateTimeInterval and
 * the precise format of civilIso8601TimeInterval.startTime were not
 * re-verified against a live notification in this pass (no live credentials
 * or tunnel available). Confirm both against a captured real payload during
 * the pending device-verification pass and tighten this resolver
 * accordingly.
 */
function fetchDateOfInterval(interval: HealthWebhookInterval, metricType: BiometricMetricType): string | null {
  if (CIVIL_DATE_METRICS.has(metricType)) {
    const civil = civilDateOfInterval(interval);
    if (civil) return civil;
  }
  return utcDateOfPhysicalStart(interval);
}

function civilDateOfInterval(interval: HealthWebhookInterval): string | null {
  const structured = interval.civilDateTimeInterval?.startTime?.date;
  if (
    structured &&
    Number.isInteger(structured.year) &&
    Number.isInteger(structured.month) &&
    Number.isInteger(structured.day)
  ) {
    return `${structured.year}-${pad2(structured.month as number)}-${pad2(structured.day as number)}`;
  }

  const civilIso = interval.civilIso8601TimeInterval?.startTime;
  if (typeof civilIso === 'string') {
    const m = ISO_DATE_PREFIX.exec(civilIso);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  }

  return null;
}

function utcDateOfPhysicalStart(interval: HealthWebhookInterval): string | null {
  const physical = interval.physicalTimeInterval?.startTime;
  if (typeof physical === 'string') {
    const d = new Date(physical);
    if (!Number.isNaN(d.getTime())) return isoDate(d);
  }
  return null;
}

healthRouter.post('/webhooks/health', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!isValidWebhookAuthorization(authHeader)) {
    res.status(401).send();
    return;
  }

  // The body is a JSON array of notifications (confirmed live). Anything else
  // is treated as an empty batch rather than an error: Google's subscriber
  // verification handshake POSTs to this endpoint with the shared secret and
  // requires exactly 201 (not just any 2xx -- confirmed live, see the spec's
  // Webhook Mechanism section), and a non-array (or absent) body must not
  // turn that into a failure. Nothing is enqueued for it either way.
  const notifications: unknown[] = Array.isArray(req.body) ? req.body : [];

  try {
    for (const item of notifications) {
      // Each notification is processed in isolation: one malformed item is
      // logged and skipped so it cannot 500 the whole batch, which would make
      // Google redeliver items that were already enqueued successfully.
      try {
        const data = (item as { data?: HealthWebhookNotification } | null)?.data;
        if (!data || typeof data !== 'object') {
          console.warn('Skipping Google Health webhook item with no data object');
          continue;
        }

        if (data.operation !== 'UPSERT') continue; // conservative: skip any non-UPSERT operation, per spec's note that DELETE was never observed live

        const metricType = WEBHOOK_DATA_TYPE_TO_METRIC[data.dataType];
        if (!metricType) continue;

        // healthUserId is @unique on HealthConnection (Task 1), so a single
        // Google Health account maps to at most one app user.
        const conn = await prisma.healthConnection.findUnique({ where: { healthUserId: data.healthUserId } });
        if (!conn) continue;

        const intervals = Array.isArray(data.intervals) ? data.intervals : [];
        for (const interval of intervals) {
          const date = interval && typeof interval === 'object' ? fetchDateOfInterval(interval, metricType) : null;
          if (!date) {
            console.warn(`Skipping Google Health webhook interval with no resolvable date for ${data.dataType}`);
            continue;
          }
          await enqueueFetchJob({ userId: conn.userId, metricType, date });
        }
      } catch (itemErr) {
        console.error('Skipping malformed Google Health webhook notification', itemErr);
      }
    }
    // Google's subscriber-verification handshake requires exactly 201 for an
    // authenticated request (confirmed live). Ordinary notification delivery
    // only needs a 2xx, so returning 201 here for both is correct and simpler
    // than distinguishing the two cases.
    res.status(201).send();
  } catch (err) {
    console.error('Google Health webhook notification processing failed', err);
    res.status(500).send();
  }
});
