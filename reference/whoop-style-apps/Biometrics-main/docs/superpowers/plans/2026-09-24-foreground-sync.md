# Foreground Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the user returns to the app after being away (the last server sync is more than 15 minutes old), the app pulls fresh Google Health data and shows the sync clearly: a status line on Today, a toast, and "Last synced" in Settings. The server also pulls every 3 hours as a backstop.

**Architecture:** A per-user BullMQ `catchUp` job reuses the existing backfill pipeline, over a window from the day before the last sync to today (capped at 14 days). `POST /me/sync` queues it and `GET /me/sync` reports its state. A repeatable `catchUpSweep` queues it for every connected user every 3 hours. On mobile, `SyncProvider` watches `AppState`, requests a sync, polls until it finishes, bumps a `dataVersion` that data screens reload on, and shows a toast. The status line, Settings rows and pull-to-refresh all go through `useSync()`.

**Tech Stack:** Express 5, BullMQ 6, Prisma 6 (backend); Expo SDK 57, React Native, Reanimated 4, React Navigation 7 (mobile); Jest and ts-jest / jest-expo.

**Spec:** `docs/superpowers/specs/2026-09-24-foreground-sync-design.md`

## Global Constraints

- Foreground threshold: sync when the **server's** `lastSyncedAt` is `null` or more than **15 minutes** (900000 ms) old.
- Backstop: a repeatable `catchUpSweep` job every **3 hours** (10800000 ms), queueing catch-ups for every `CONNECTED` connection.
- Catch-up window: half-open `[start, end)`, where `end = today + 1`, `start = civil date of lastSyncedAt − 1 day`, and `start` is clamped to no earlier than `today − 13`. With no previous sync, `start = today − 13`. `today` is `localCivilDate(new Date(), user.timezone)`.
- Job ID `catchUp-<userId>`. BullMQ rejects `:` in job IDs. Use `removeOnComplete: true, removeOnFail: false`.
- `POST /me/sync`:
  - no connection → `409 { error: 'not_connected' }`,
  - last sync under **30 s** old and no job running → `200 { state: 'idle', lastSyncedAt }`,
  - otherwise → `202 { state: 'syncing', lastSyncedAt }`.
- `GET /me/sync` → `200 { state: 'idle' | 'syncing' | 'failed', lastSyncedAt: string | null, connection: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED' }`.
- The mobile app polls every **1500 ms** and gives up after **60 s**.
- Toast text: success "Synced with Google Health"; failure "Couldn't sync with Google Health"; disconnected "Google Health is disconnected"; a manual sync with nothing new "Already up to date". Toasts hide after **2.5 s**.
- Status line text: "Syncing with Google Health…" / `formatLastSynced` output / "Couldn't sync · Tap to retry" / "Google Health disconnected · Reconnect" / "Not synced yet · Tap to sync".
- No schema change, no migration, no new dependencies, no new env vars.
- The backend test DB is `biometrics_test` only. Never touch `biometrics`. Never run `prisma migrate reset`, and never supply any tool's human-consent value.
- Node 24 for every command: `PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH"`. Run backend jest through `npm test -- <path> --forceExit`, and mobile jest with `npx jest <path> --forceExit`.
- Commits: imperative sentence, no `feat:` prefix, no Co-Authored-By or any AI attribution.
- The user wants modular code: every new unit in its own file with one job.

## Review Focus

1. **The app returns while a backstop sync is already running.** `GET /me/sync` says `syncing`, and the app must follow it to completion rather than showing "Syncing…" forever. This is pinned in Task 6: a foreground check that sees `syncing` calls `syncNow`, whose `POST` is a no-op for a running job, and then polls.
2. **Google revoked access during the sync.** The worker marks the connection `DISCONNECTED` and completes without failing, so `lastSyncedAt` doesn't advance. The app must say "disconnected", not "Synced". Pinned in Task 6.
3. **The user taps "Sync" repeatedly.** Only one job may run per user (Task 2), and a request inside 30 s of the last success doesn't queue at all (Task 3). The app gives "Already up to date" feedback on a manual tap (Task 6).
4. **A network or 5xx error during the POST or while polling.** The state becomes `failed` with the error toast, and the user is never signed out. Pinned in Task 6.
5. **Screens rendered without the providers** (existing tests, Settings rendered in isolation). `useSync()` and `useToast()` must return safe no-op defaults. Pinned in Tasks 5 and 6.

## File Structure

| File | Responsibility |
|---|---|
| `backend/src/sync/catchUp.ts` (new) | Window maths, job IDs, enqueue with dedupe, state lookup, sweep scheduler |
| `backend/src/sync/worker.ts` (modify) | `syncWindow()` extracted from the backfill; `catchUp` and `catchUpSweep` handlers |
| `backend/src/sync/routes.ts` (new) | `POST` and `GET /me/sync` |
| `backend/src/app.ts`, `backend/src/server.ts` (modify) | Mount the router; register the sweep |
| `backend/tests/sync/catchUp.test.ts`, `backend/tests/sync/routes.test.ts` (new) | Tests |
| `mobile/src/api/sync.ts` (new) | `requestSync`, `fetchSyncStatus` and their types |
| `mobile/src/sync/formatLastSynced.ts` (new) | Relative "Synced …" wording |
| `mobile/src/components/ui/toast.tsx` (new) | `ToastProvider` and `useToast` |
| `mobile/src/sync/SyncProvider.tsx` (new) | Sync state, `syncNow`, foreground trigger, `dataVersion` |
| `mobile/src/components/sync-status-line.tsx` (new) | The status line on Today |
| `mobile/src/navigation/RootNavigator.tsx`, `DashboardScreen.tsx`, `ActivityScreen.tsx`, `MetricsScreen.tsx`, `SettingsScreen.tsx` (modify) | Mount the providers; reload on `dataVersion`; status line; Settings rows; pull-to-refresh |

---

### Task 1: Catch-up window

**Files:**
- Create: `backend/src/sync/catchUp.ts` (the window part only)
- Test: `backend/tests/sync/catchUp.test.ts`

**Interfaces:**
- Produces: `catchUpWindow(lastSyncedAt: Date | null, today: string, timeZone: string): { startDate: string; endDate: string }`, `CATCH_UP_MAX_DAYS = 14`.

- [ ] **Step 1: Write the failing test**

`backend/tests/sync/catchUp.test.ts`:

```ts
import { catchUpWindow } from '../../src/sync/catchUp';

describe('catchUpWindow', () => {
  it('starts the day before the last sync and ends after today', () => {
    expect(catchUpWindow(new Date('2026-09-23T15:42:00Z'), '2026-09-24', 'UTC')).toEqual({
      startDate: '2026-09-22',
      endDate: '2026-09-25',
    });
  });

  it('uses the civil date of the last sync in the user time zone', () => {
    // 02:00 UTC on the 23rd is still the evening of the 22nd in New York.
    expect(catchUpWindow(new Date('2026-09-23T02:00:00Z'), '2026-09-24', 'America/New_York')).toEqual({
      startDate: '2026-09-21',
      endDate: '2026-09-25',
    });
  });

  it('caps the window at 14 days', () => {
    expect(catchUpWindow(new Date('2026-07-01T00:00:00Z'), '2026-09-24', 'UTC')).toEqual({
      startDate: '2026-09-11',
      endDate: '2026-09-25',
    });
  });

  it('covers the last 14 days when there was never a sync', () => {
    expect(catchUpWindow(null, '2026-09-24', 'UTC')).toEqual({ startDate: '2026-09-11', endDate: '2026-09-25' });
  });

  it('still covers yesterday and today when the last sync was today', () => {
    expect(catchUpWindow(new Date('2026-09-24T09:00:00Z'), '2026-09-24', 'UTC')).toEqual({
      startDate: '2026-09-23',
      endDate: '2026-09-25',
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd backend && PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" npm test -- tests/sync/catchUp.test.ts --forceExit`
Expected: FAIL, `Cannot find module '../../src/sync/catchUp'`.

- [ ] **Step 3: Implement**

`backend/src/sync/catchUp.ts`:

```ts
import { localCivilDate } from '../biometrics/civilDate';

// Catch-up sync: whatever Google Health has that we don't, since the last
// successful sync. Requested by the app on returning to the foreground and by
// a 3-hourly backstop sweep, so data stays fresh even when webhooks don't arrive.

export const CATCH_UP_MAX_DAYS = 14;

function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Half-open [startDate, endDate) in YYYY-MM-DD. Starts the day before the
 * last sync's civil date (late-arriving data from that day is picked up),
 * never earlier than 14 days back, and ends after today.
 */
export function catchUpWindow(lastSyncedAt: Date | null, today: string, timeZone: string): { startDate: string; endDate: string } {
  const endDate = shiftDay(today, 1);
  const floor = shiftDay(today, -(CATCH_UP_MAX_DAYS - 1));
  if (!lastSyncedAt) return { startDate: floor, endDate };
  const from = shiftDay(localCivilDate(lastSyncedAt, timeZone), -1);
  return { startDate: from < floor ? floor : from, endDate };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run the Step 2 command. Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sync/catchUp.ts backend/tests/sync/catchUp.test.ts
git commit -m "Add the catch-up sync window"
```

---

### Task 2: Catch-up job, dedupe and the 3-hour sweep

**Files:**
- Modify: `backend/src/sync/catchUp.ts` (append), `backend/src/sync/worker.ts`, `backend/src/server.ts`
- Test: `backend/tests/sync/catchUp.test.ts` (append), `backend/tests/sync/worker.test.ts` (append)

**Interfaces:**
- Consumes: `catchUpWindow` (Task 1); `syncQueue` from `./queue`.
- Produces:
  - `CATCH_UP_JOB = 'catchUp'`, `CATCH_UP_SWEEP_JOB = 'catchUpSweep'`, `CATCH_UP_SWEEP_INTERVAL_MS = 3 * 60 * 60 * 1000`
  - `interface CatchUpJobData { userId: string }`
  - `catchUpJobId(userId: string): string` → `catchUp-<userId>`
  - `enqueueCatchUp(userId: string): Promise<void>`
  - `catchUpState(userId: string): Promise<'idle' | 'syncing' | 'failed'>`
  - `scheduleCatchUpSweep(): Promise<unknown>`
  - `syncWindow(userId: string, startDate: string, endDate: string): Promise<void>`, exported from `worker.ts`

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/sync/catchUp.test.ts`:

```ts
import { syncQueue, connection } from '../../src/sync/queue';
import {
  CATCH_UP_SWEEP_JOB,
  CATCH_UP_SWEEP_INTERVAL_MS,
  catchUpJobId,
  catchUpState,
  enqueueCatchUp,
  scheduleCatchUpSweep,
} from '../../src/sync/catchUp';

describe('catch-up queueing', () => {
  const userId = `u-catchup-${Date.now()}`;

  afterEach(async () => {
    jest.restoreAllMocks();
    await syncQueue.remove(catchUpJobId(userId)).catch(() => undefined);
  });

  afterAll(async () => {
    await syncQueue.removeJobScheduler(CATCH_UP_SWEEP_JOB).catch(() => undefined);
    await syncQueue.close();
    await connection.quit();
  });

  it('queues one catch-up per user, however often it is asked', async () => {
    await enqueueCatchUp(userId);
    await enqueueCatchUp(userId);
    const job = await syncQueue.getJob(catchUpJobId(userId));
    expect(job?.name).toBe('catchUp');
    expect(job?.data).toEqual({ userId });
    const waiting = await syncQueue.getJobs(['waiting', 'delayed', 'prioritized']);
    expect(waiting.filter((j) => j.id === catchUpJobId(userId))).toHaveLength(1);
    expect(await catchUpState(userId)).toBe('syncing');
  });

  it('reports idle when there is no job', async () => {
    expect(await catchUpState(`nobody-${Date.now()}`)).toBe('idle');
  });

  it('reports failed for a failed job, and replaces it on the next request', async () => {
    const remove = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(syncQueue, 'getJob').mockResolvedValue({ getState: async () => 'failed', remove } as never);
    expect(await catchUpState(userId)).toBe('failed');

    const add = jest.spyOn(syncQueue, 'add').mockResolvedValue({} as never);
    await enqueueCatchUp(userId);
    expect(remove).toHaveBeenCalled();
    expect(add).toHaveBeenCalledWith('catchUp', { userId }, expect.objectContaining({ jobId: catchUpJobId(userId) }));
  });

  it('registers the 3-hour backstop sweep', async () => {
    await scheduleCatchUpSweep();
    const sweep = (await syncQueue.getJobSchedulers()).find((s) => s.key === CATCH_UP_SWEEP_JOB);
    expect(sweep?.every).toBe(String(CATCH_UP_SWEEP_INTERVAL_MS));
  });
});
```

(The existing `tests/sync/queue.test.ts` checks `every` on the token-refresh sweep. Copy its exact form: if it compares `every` to a number, compare to `CATCH_UP_SWEEP_INTERVAL_MS` without `String`.)

Append to `backend/tests/sync/worker.test.ts`, inside or after `describe('processSyncJob', …)`, reusing `createConnectedUser`:

```ts
import * as catchUp from '../../src/sync/catchUp';
import { localCivilDate } from '../../src/biometrics/civilDate';

describe('catch-up jobs', () => {
  it('fetches every metric over the catch-up window and advances lastSyncedAt', async () => {
    const user = await createConnectedUser();
    const lastSyncedAt = new Date(Date.now() - 2 * 24 * 3600_000);
    await prisma.healthConnection.update({ where: { userId: user.id }, data: { lastSyncedAt } });
    (healthClient.fetchMetricRange as jest.Mock).mockResolvedValue([{ recordedAt: new Date(), value: 4200 }]);

    await processSyncJob({ name: 'catchUp', data: { userId: user.id } } as Job);

    const today = localCivilDate(new Date(), 'UTC');
    const { startDate, endDate } = catchUp.catchUpWindow(lastSyncedAt, today, 'UTC');
    expect(healthClient.fetchMetricRange).toHaveBeenCalledWith('access-token', 'STEPS', startDate, endDate);
    const conn = await prisma.healthConnection.findUniqueOrThrow({ where: { userId: user.id } });
    expect(conn.lastSyncedAt!.getTime()).toBeGreaterThan(lastSyncedAt.getTime());
    expect(await prisma.biometricRecord.count({ where: { userId: user.id, metricType: 'STEPS' } })).toBe(1);
  });

  it('skips a disconnected user', async () => {
    const user = await createConnectedUser();
    await prisma.healthConnection.update({ where: { userId: user.id }, data: { status: 'DISCONNECTED' } });

    await processSyncJob({ name: 'catchUp', data: { userId: user.id } } as Job);

    expect(healthClient.fetchMetricRange).not.toHaveBeenCalled();
  });

  it('queues a catch-up for every connected user, and only those, on the sweep', async () => {
    const on = await createConnectedUser();
    const off = await createConnectedUser();
    await prisma.healthConnection.update({ where: { userId: off.id }, data: { status: 'DISCONNECTED' } });
    const enqueue = jest.spyOn(catchUp, 'enqueueCatchUp').mockResolvedValue(undefined);

    await processSyncJob({ name: 'catchUpSweep', data: {} } as Job);

    const queued = enqueue.mock.calls.map(([id]) => id);
    expect(queued).toContain(on.id);
    expect(queued).not.toContain(off.id);
    enqueue.mockRestore();
  });
});
```

(`createConnectedUser` creates users with the default `timezone` of `"UTC"`.)

- [ ] **Step 2: Run them to verify they fail**

Run: `npm test -- tests/sync/catchUp.test.ts tests/sync/worker.test.ts --forceExit` (Node 24 PATH, from `backend/`, after confirming `grep DATABASE_URL .env` names `biometrics_test`).
Expected: FAIL with the missing exports and unhandled job names.

- [ ] **Step 3: Implement the queue side**

Append to `backend/src/sync/catchUp.ts`:

```ts
import { syncQueue } from './queue';

export const CATCH_UP_JOB = 'catchUp';
export const CATCH_UP_SWEEP_JOB = 'catchUpSweep';
export const CATCH_UP_SWEEP_INTERVAL_MS = 3 * 60 * 60 * 1000;

export interface CatchUpJobData {
  userId: string;
}

// BullMQ rejects a custom job id containing ':'.
export const catchUpJobId = (userId: string) => `${CATCH_UP_JOB}-${userId}`;

const RUNNING = new Set(['waiting', 'delayed', 'active', 'prioritized', 'waiting-children']);

/**
 * One catch-up per user at a time: a request while one is queued or running is
 * a no-op. A finished (or failed) job is cleared first so a new one can start;
 * failed jobs are kept until then so GET /me/sync can report the failure.
 */
export async function enqueueCatchUp(userId: string): Promise<void> {
  const existing = await syncQueue.getJob(catchUpJobId(userId));
  if (existing) {
    if (RUNNING.has(await existing.getState())) return;
    await existing.remove();
  }
  await syncQueue.add(CATCH_UP_JOB, { userId } satisfies CatchUpJobData, {
    jobId: catchUpJobId(userId),
    removeOnComplete: true,
    removeOnFail: false,
  });
}

export async function catchUpState(userId: string): Promise<'idle' | 'syncing' | 'failed'> {
  const job = await syncQueue.getJob(catchUpJobId(userId));
  if (!job) return 'idle';
  const state = await job.getState();
  if (RUNNING.has(state)) return 'syncing';
  if (state === 'failed') return 'failed';
  return 'idle';
}

/** The 3-hourly backstop, as a repeatable job so one instance runs each tick. */
export function scheduleCatchUpSweep() {
  return syncQueue.upsertJobScheduler(CATCH_UP_SWEEP_JOB, { every: CATCH_UP_SWEEP_INTERVAL_MS }, { name: CATCH_UP_SWEEP_JOB });
}
```

Move the `import { localCivilDate }` line and this new import to the top of the file with the others.

- [ ] **Step 4: Implement the worker side**

In `backend/src/sync/worker.ts`:

1. Add the imports:

```ts
import { localCivilDate } from '../biometrics/civilDate';
import { CATCH_UP_JOB, CATCH_UP_SWEEP_JOB, CatchUpJobData, catchUpWindow, enqueueCatchUp } from './catchUp';
```

2. Replace `handleBackfillJob` with an empty-window guard plus the extracted `syncWindow`, keeping its body unchanged:

```ts
async function handleBackfillJob(data: BackfillJobData): Promise<void> {
  // Nothing to fetch, and Google answers an empty window with a 400 that would
  // fail the job (e.g. a reconnect on the same day as the last sync). Not a
  // sync, so lastSyncedAt is deliberately left alone.
  if (isEmptyWindow(data.startDate, data.endDate)) return;
  await syncWindow(data.userId, data.startDate, data.endDate);
}

/**
 * Pull every metric and sleep over [startDate, endDate), store it, request
 * the affected scores and stamp lastSyncedAt. Shared by the connect backfill
 * and the catch-up sync. Revoked access disconnects the user and returns.
 */
export async function syncWindow(userId: string, startDate: string, endDate: string): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  try {
    const session = new JobTokenSession(conn);
    const scoreDates: string[] = [];
    for (const metricType of ALL_METRIC_TYPES) {
      if (metricType === 'SLEEP') {
        scoreDates.push(...(await syncSleep(session, userId, startDate, endDate)));
        continue;
      }
      const points = await session.fetch(metricType, startDate, endDate);
      await upsertBiometricRecords(userId, metricType, points);
      if (SCORE_INPUT_METRICS.has(metricType)) scoreDates.push(...points.map(civilDateOf));
    }
    await requestScores(userId, scoreDates);
    await prisma.healthConnection.update({ where: { userId }, data: { lastSyncedAt: new Date() } });
  } catch (err) {
    if (isUnauthorized(err)) {
      await disconnect(userId, conn.webhookSubscriptionId);
      return;
    }
    throw err; // other errors (e.g. 429) are retried by BullMQ's job retry policy
  }
}

// The window is worked out when the job runs, not when it was queued, so a job
// that waited still covers up to now.
async function handleCatchUpJob(data: CatchUpJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId }, select: { status: true, lastSyncedAt: true } });
  if (!conn || conn.status === 'DISCONNECTED') return;
  const user = await prisma.user.findUnique({ where: { id: data.userId }, select: { timezone: true } });
  const timeZone = user?.timezone ?? 'UTC';
  const { startDate, endDate } = catchUpWindow(conn.lastSyncedAt, localCivilDate(new Date(), timeZone), timeZone);
  await syncWindow(data.userId, startDate, endDate);
}

async function handleCatchUpSweep(): Promise<void> {
  const connected = await prisma.healthConnection.findMany({ where: { status: 'CONNECTED' }, select: { userId: true } });
  for (const { userId } of connected) await enqueueCatchUp(userId);
}
```

3. In `processSyncJob`, add these branches after the `backfill` branch:

```ts
  } else if (job.name === CATCH_UP_JOB) {
    await handleCatchUpJob(job.data as CatchUpJobData);
  } else if (job.name === CATCH_UP_SWEEP_JOB) {
    await handleCatchUpSweep();
```

- [ ] **Step 5: Register the sweep in `backend/src/server.ts`**

Import `scheduleCatchUpSweep` from `./sync/catchUp`. Next to the `scheduleTokenRefreshSweep()` call, add:

```ts
  scheduleCatchUpSweep().catch((err) =>
    console.error('Failed to schedule the catch-up sync sweep', err),
  );
```

- [ ] **Step 6: Run tests**

Run: `npm test -- tests/sync --forceExit`.
Expected: all pass, including every existing backfill and worker test unchanged. Then run `npx tsc --noEmit` and expect it clean.

- [ ] **Step 7: Commit**

```bash
git add backend/src/sync backend/src/server.ts backend/tests/sync
git commit -m "Add a per-user catch-up sync job and a 3-hour backstop sweep"
```

---

### Task 3: `POST` and `GET /me/sync`

**Files:**
- Create: `backend/src/sync/routes.ts`, `backend/tests/sync/routes.test.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `enqueueCatchUp` and `catchUpState` (Task 2); `requireAuth` and `AuthedRequest`.
- Produces: `syncRouter`, and the HTTP contract in Global Constraints.

- [ ] **Step 1: Write the failing test**

`backend/tests/sync/routes.test.ts`:

```ts
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor, createTestUser } from '../helpers/auth';
import * as catchUp from '../../src/sync/catchUp';
import { encryptToken } from '../../src/crypto/tokenCipher';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});
afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

async function connectedUser(lastSyncedAt: Date | null, status: 'CONNECTED' | 'DISCONNECTED' = 'CONNECTED') {
  const user = await createTestUser();
  await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: `fb-${randomUUID()}`,
      encryptedAccessToken: encryptToken('a'),
      encryptedRefreshToken: encryptToken('r'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      lastSyncedAt,
      status,
    },
  });
  return user;
}

describe('POST /me/sync', () => {
  it('queues a catch-up and answers 202 syncing', async () => {
    const last = new Date(Date.now() - 3600_000);
    const user = await connectedUser(last);
    const enqueue = jest.spyOn(catchUp, 'enqueueCatchUp').mockResolvedValue(undefined);
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue('idle');

    const res = await request(createApp()).post('/me/sync').set(await authHeaderFor(user.id));

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ state: 'syncing', lastSyncedAt: last.toISOString() });
    expect(enqueue).toHaveBeenCalledWith(user.id);
  });

  it('does not queue when the last sync finished under 30 seconds ago', async () => {
    const last = new Date(Date.now() - 5_000);
    const user = await connectedUser(last);
    const enqueue = jest.spyOn(catchUp, 'enqueueCatchUp').mockResolvedValue(undefined);
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue('idle');

    const res = await request(createApp()).post('/me/sync').set(await authHeaderFor(user.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state: 'idle', lastSyncedAt: last.toISOString() });
    expect(enqueue).not.toHaveBeenCalled();
  });

  it('answers 409 when Google Health is not connected', async () => {
    const user = await createTestUser();
    const res = await request(createApp()).post('/me/sync').set(await authHeaderFor(user.id));
    expect(res.status).toBe(409);
    expect(res.body).toEqual({ error: 'not_connected' });
  });

  it('needs a session', async () => {
    const res = await request(createApp()).post('/me/sync');
    expect(res.status).toBe(401);
  });
});

describe('GET /me/sync', () => {
  it.each(['idle', 'syncing', 'failed'] as const)('reports the %s state with the last sync time and connection', async (state) => {
    const last = new Date(Date.now() - 600_000);
    const user = await connectedUser(last);
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue(state);

    const res = await request(createApp()).get('/me/sync').set(await authHeaderFor(user.id));

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ state, lastSyncedAt: last.toISOString(), connection: 'CONNECTED' });
  });

  it('reports a disconnected connection', async () => {
    const user = await connectedUser(null, 'DISCONNECTED');
    jest.spyOn(catchUp, 'catchUpState').mockResolvedValue('idle');
    const res = await request(createApp()).get('/me/sync').set(await authHeaderFor(user.id));
    expect(res.body).toEqual({ state: 'idle', lastSyncedAt: null, connection: 'DISCONNECTED' });
  });

  it('reports NOT_CONNECTED with no connection', async () => {
    const user = await createTestUser();
    const res = await request(createApp()).get('/me/sync').set(await authHeaderFor(user.id));
    expect(res.body).toEqual({ state: 'idle', lastSyncedAt: null, connection: 'NOT_CONNECTED' });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npm test -- tests/sync/routes.test.ts --forceExit`. Expected: FAIL, with 404s for `/me/sync`.

- [ ] **Step 3: Implement**

`backend/src/sync/routes.ts`:

```ts
import { Router } from 'express';
import { requireAuth, type AuthedRequest } from '../auth/middleware';
import { prisma } from '../db/client';
import { catchUpState, enqueueCatchUp } from './catchUp';

export const syncRouter = Router();

// A request this soon after a finished sync does not queue another: repeated
// taps must not hammer Google.
const RECENT_SYNC_MS = 30_000;

async function connectionFor(userId: string) {
  return prisma.healthConnection.findUnique({ where: { userId }, select: { status: true, lastSyncedAt: true } });
}

syncRouter.post('/me/sync', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const conn = await connectionFor(userId);
  if (!conn) {
    res.status(409).json({ error: 'not_connected' });
    return;
  }
  const lastSyncedAt = conn.lastSyncedAt?.toISOString() ?? null;
  const state = await catchUpState(userId);
  if (state !== 'syncing' && conn.lastSyncedAt && Date.now() - conn.lastSyncedAt.getTime() < RECENT_SYNC_MS) {
    res.json({ state: 'idle', lastSyncedAt });
    return;
  }
  await enqueueCatchUp(userId);
  res.status(202).json({ state: 'syncing', lastSyncedAt });
});

syncRouter.get('/me/sync', requireAuth, async (req: AuthedRequest, res) => {
  const userId = req.userId!;
  const conn = await connectionFor(userId);
  res.json({
    state: conn ? await catchUpState(userId) : 'idle',
    lastSyncedAt: conn?.lastSyncedAt?.toISOString() ?? null,
    connection: conn?.status ?? 'NOT_CONNECTED',
  });
});
```

In `backend/src/app.ts`, import `syncRouter` from `./sync/routes` and add `app.use(syncRouter);` after `app.use(biometricsRouter);`.

- [ ] **Step 4: Run tests**

Run `npm test -- tests/sync --forceExit`, then the full backend suite once with `npm test -- --forceExit`. Expected: everything passes, apart from environment-dependent flakes; report any failure by name. Then run `npx tsc --noEmit` and expect it clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/sync/routes.ts backend/src/app.ts backend/tests/sync/routes.test.ts
git commit -m "Add sync endpoints the app can request and poll"
```

---

### Task 4: Mobile API client and "Synced …" wording

**Files:**
- Create: `mobile/src/api/sync.ts`, `mobile/src/sync/formatLastSynced.ts`, `mobile/__tests__/sync/formatLastSynced.test.ts`

**Interfaces:**
- Produces:
  - `type SyncState = 'idle' | 'syncing' | 'failed'`
  - `type ConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED'`
  - `interface SyncStatusDTO { state: SyncState; lastSyncedAt: string | null; connection: ConnectionState }`
  - `requestSync(): Promise<{ state: SyncState; lastSyncedAt: string | null }>`, `fetchSyncStatus(): Promise<SyncStatusDTO>`
  - `formatLastSynced(iso: string, now: Date, prefix?: string): string` (the prefix defaults to `'Synced'`)

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/sync/formatLastSynced.test.ts`:

```ts
import { formatLastSynced } from '../../src/sync/formatLastSynced';

// Local-time constructors keep the test independent of the machine's time zone.
const now = new Date(2026, 8, 24, 15, 0, 0);
const at = (...parts: [number, number, number, number, number]) => new Date(2026, ...parts).toISOString();

describe('formatLastSynced', () => {
  it.each([
    [at(8, 24, 14, 59), 'Synced just now'],
    [at(8, 24, 14, 48), 'Synced 12 min ago'],
    [at(8, 24, 12, 0), 'Synced 3 h ago'],
    [at(8, 23, 22, 0), 'Synced yesterday'],
    [at(8, 21, 9, 0), 'Synced on Sep 21'],
  ])('describes %s as %p', (iso, text) => {
    expect(formatLastSynced(iso, now)).toBe(text);
  });

  it('takes a prefix for Settings', () => {
    expect(formatLastSynced(at(8, 24, 14, 48), now, 'Last synced')).toBe('Last synced 12 min ago');
  });

  it('treats a time slightly in the future (clock skew) as just now', () => {
    expect(formatLastSynced(at(8, 24, 15, 1), now)).toBe('Synced just now');
  });
});
```

Run: `cd mobile && PATH="$HOME/.nvm/versions/node/v24.21.0/bin:$PATH" npx jest __tests__/sync/formatLastSynced.test.ts --forceExit`. Expected: FAIL, module not found.

- [ ] **Step 2: Implement**

`mobile/src/sync/formatLastSynced.ts`:

```ts
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** "Synced just now" / "12 min ago" / "3 h ago" / "yesterday" / "on Sep 21", in the device's local time. */
export function formatLastSynced(iso: string, now: Date, prefix = 'Synced'): string {
  const then = new Date(iso);
  const minutes = Math.floor((now.getTime() - then.getTime()) / 60_000);
  if (minutes < 1) return `${prefix} just now`;
  if (minutes < 60) return `${prefix} ${minutes} min ago`;
  if (sameLocalDay(then, now)) return `${prefix} ${Math.floor(minutes / 60)} h ago`;
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (sameLocalDay(then, yesterday)) return `${prefix} yesterday`;
  return `${prefix} on ${MONTHS[then.getMonth()]} ${then.getDate()}`;
}
```

`mobile/src/api/sync.ts`:

```ts
import { apiFetch } from './client';

export type SyncState = 'idle' | 'syncing' | 'failed';
export type ConnectionState = 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED';

export interface SyncStatusDTO {
  state: SyncState;
  lastSyncedAt: string | null;
  connection: ConnectionState;
}

/** Asks the server to catch up with Google Health. 409 (ApiError) means not connected. */
export function requestSync(): Promise<{ state: SyncState; lastSyncedAt: string | null }> {
  return apiFetch('/me/sync', { method: 'POST' });
}

export function fetchSyncStatus(): Promise<SyncStatusDTO> {
  return apiFetch<SyncStatusDTO>('/me/sync');
}
```

- [ ] **Step 3: Run the test and commit**

Run the Step 1 command. Expected: 7 passed.

```bash
git add mobile/src/api/sync.ts mobile/src/sync/formatLastSynced.ts mobile/__tests__/sync/formatLastSynced.test.ts
git commit -m "Add the sync API client and last-synced wording"
```

---

### Task 5: Toast

**Files:**
- Create: `mobile/src/components/ui/toast.tsx`, `mobile/__tests__/components/Toast.test.tsx`

**Interfaces:**
- Produces:
  - `ToastProvider({ children })`
  - `useToast(): { show(text: string, tone: 'success' | 'error'): void }` (a no-op outside the provider)
  - `TOAST_MS = 2500`

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/components/Toast.test.tsx`:

```tsx
import React from 'react';
import { Button, AccessibilityInfo } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ToastProvider, useToast, TOAST_MS } from '../../src/components/ui/toast';

function Trigger({ text }: { text: string }) {
  const toast = useToast();
  return <Button title={`show ${text}`} onPress={() => toast.show(text, 'success')} />;
}

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

it('shows a toast, announces it, and hides it after 2.5 s', () => {
  const announce = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => undefined);
  const { getByText, queryByTestId } = render(
    <ToastProvider>
      <Trigger text="Synced with Google Health" />
    </ToastProvider>,
  );

  fireEvent.press(getByText('show Synced with Google Health'));
  expect(queryByTestId('toast')).toHaveTextContent('Synced with Google Health');
  expect(announce).toHaveBeenCalledWith('Synced with Google Health');

  act(() => {
    jest.advanceTimersByTime(TOAST_MS + 50);
  });
  expect(queryByTestId('toast')).toBeNull();
});

it('replaces the current toast with a newer one', () => {
  const { getByText, getByTestId } = render(
    <ToastProvider>
      <Trigger text="First" />
      <Trigger text="Second" />
    </ToastProvider>,
  );
  fireEvent.press(getByText('show First'));
  fireEvent.press(getByText('show Second'));
  expect(getByTestId('toast')).toHaveTextContent('Second');
});

it('is a harmless no-op without a provider', () => {
  const { getByText } = render(<Trigger text="Nowhere" />);
  expect(() => fireEvent.press(getByText('show Nowhere'))).not.toThrow();
});
```

Run it and expect FAIL, module not found.

- [ ] **Step 2: Implement**

`mobile/src/components/ui/toast.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeOut, SlideInUp } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import { useColorScheme } from 'nativewind';
import { Text } from './text';
import { COLORS } from '../../theme';

export const TOAST_MS = 2500;

type Tone = 'success' | 'error';
interface ToastApi {
  show: (text: string, tone: Tone) => void;
}

const NOOP: ToastApi = { show: () => undefined };
const ToastContext = createContext<ToastApi | null>(null);

/** Outside a ToastProvider (a screen rendered on its own, in tests) this is a no-op. */
export function useToast(): ToastApi {
  return useContext(ToastContext) ?? NOOP;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  const [toast, setToast] = useState<{ id: number; text: string; tone: Tone } | null>(null);

  const show = useCallback((text: string, tone: Tone) => {
    setToast((prev) => ({ id: (prev?.id ?? 0) + 1, text, tone }));
    AccessibilityInfo.announceForAccessibility(text);
  }, []);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(timer);
  }, [toast]);

  const api = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {toast ? (
        <SafeAreaView edges={['top']} pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Animated.View
            key={toast.id}
            entering={SlideInUp.duration(250)}
            exiting={FadeOut.duration(250)}
            testID="toast"
            className="mx-4 mt-2 flex-row items-center gap-2 self-center rounded-full border border-border bg-card px-4 py-2.5"
          >
            <Ionicons
              name={toast.tone === 'success' ? 'checkmark-circle' : 'alert-circle'}
              size={16}
              color={toast.tone === 'success' ? colors.scoreExcellent : colors.scorePoor}
            />
            <Text className="text-sm font-medium">{toast.text}</Text>
          </Animated.View>
        </SafeAreaView>
      ) : null}
    </ToastContext.Provider>
  );
}
```

Remove `View` from the import if it's unused. If `border-border` or `bg-card` aren't Tailwind classes in `tailwind.config.js`, use the classes `mobile/src/components/ui/card.tsx` uses.

- [ ] **Step 3: Run the test and commit**

Expected: 3 passed.

```bash
git add mobile/src/components/ui/toast.tsx mobile/__tests__/components/Toast.test.tsx
git commit -m "Add a toast for short confirmations"
```

---

### Task 6: `SyncProvider`

**Files:**
- Create: `mobile/src/sync/SyncProvider.tsx`, `mobile/__tests__/sync/SyncProvider.test.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Consumes: `requestSync`, `fetchSyncStatus` and their types (Task 4); `useToast` (Task 5); `ApiError` (`mobile/src/api/client.ts`).
- Produces:
  - `SyncProvider({ children })`
  - `useSync(): SyncContextValue`, where `SyncContextValue` is `{ state: 'unknown' | SyncState; lastSyncedAt: string | null; connection: ConnectionState | null; dataVersion: number; syncNow(source: 'foreground' | 'manual' | 'pull'): Promise<void> }`
  - `STALE_AFTER_MS = 900000`, `POLL_MS = 1500`, `POLL_TIMEOUT_MS = 60000`

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/sync/SyncProvider.test.tsx`:

```tsx
import React from 'react';
import { AppState, Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { SyncProvider, useSync, POLL_MS } from '../../src/sync/SyncProvider';
import { requestSync, fetchSyncStatus } from '../../src/api/sync';
import { ApiError } from '../../src/api/client';
import { useToast } from '../../src/components/ui/toast';

jest.mock('../../src/api/sync', () => ({ requestSync: jest.fn(), fetchSyncStatus: jest.fn() }));
jest.mock('../../src/components/ui/toast', () => ({ useToast: jest.fn() }));

const show = jest.fn();
let appStateListener: ((s: string) => void) | undefined;
let ctx: ReturnType<typeof useSync>;
function Capture() {
  ctx = useSync();
  return <Text testID="v">{`${ctx.state}|${ctx.dataVersion}|${ctx.connection}`}</Text>;
}

const OLD = new Date(Date.now() - 60 * 60_000).toISOString();
const NEW = new Date().toISOString();
const status = (over: object) => ({ state: 'idle', lastSyncedAt: OLD, connection: 'CONNECTED', ...over });

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  (useToast as jest.Mock).mockReturnValue({ show });
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_e, cb) => {
    appStateListener = cb as (s: string) => void;
    return { remove: jest.fn() } as never;
  });
  (requestSync as jest.Mock).mockResolvedValue({ state: 'syncing', lastSyncedAt: OLD });
});
afterEach(() => jest.useRealTimers());

async function flushPolls(times: number) {
  for (let i = 0; i < times; i++) {
    await act(async () => {
      jest.advanceTimersByTime(POLL_MS);
    });
  }
}

it('syncs on launch when the last sync is over 15 minutes old, then reloads data and confirms', async () => {
  (fetchSyncStatus as jest.Mock)
    .mockResolvedValueOnce(status({})) // the launch check
    .mockResolvedValueOnce(status({ state: 'syncing' })) // first poll
    .mockResolvedValue(status({ lastSyncedAt: NEW }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);

  await flushPolls(3);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent('idle|1|CONNECTED'));
  expect(requestSync).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledWith('Synced with Google Health', 'success');
});

it('does not sync on launch when the last sync is recent', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValue(status({ lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString() }));
  render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(2);
  expect(requestSync).not.toHaveBeenCalled();
});

it('checks again when the app returns to the foreground', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({ lastSyncedAt: NEW })).mockResolvedValue(status({}));
  render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);
  expect(requestSync).not.toHaveBeenCalled();

  await act(async () => appStateListener?.('active'));
  await flushPolls(2);
  expect(requestSync).toHaveBeenCalledTimes(1);
});

it('follows a sync that is already running when the app opens', async () => {
  (fetchSyncStatus as jest.Mock)
    .mockResolvedValueOnce(status({ state: 'syncing', lastSyncedAt: new Date().toISOString() }))
    .mockResolvedValue(status({ lastSyncedAt: new Date(Date.now() + 1000).toISOString() }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(3);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/^idle\|1\|/));
});

it('says disconnected, not synced, when Google revoked access during the sync', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({})).mockResolvedValue(status({ connection: 'DISCONNECTED' }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(3);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent('idle|0|DISCONNECTED'));
  expect(show).toHaveBeenCalledWith('Google Health is disconnected', 'error');
});

it('fails with an error toast on a server error, without signing anyone out', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({}));
  (requestSync as jest.Mock).mockRejectedValue(new ApiError(503, 'down'));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/^failed\|0\|/));
  expect(show).toHaveBeenCalledWith("Couldn't sync with Google Health", 'error');
});

it('gives up after 60 seconds of syncing', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValueOnce(status({})).mockResolvedValue(status({ state: 'syncing' }));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(45);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/^failed\|/));
});

it('marks not connected on a 409', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValue(status({}));
  (requestSync as jest.Mock).mockRejectedValue(new ApiError(409, 'no', 'not_connected'));
  const { getByTestId } = render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);
  await waitFor(() => expect(getByTestId('v')).toHaveTextContent(/NOT_CONNECTED$/));
});

it('gives "Already up to date" for a manual sync that found nothing new, and never runs two syncs at once', async () => {
  (fetchSyncStatus as jest.Mock).mockResolvedValue(status({ lastSyncedAt: NEW }));
  (requestSync as jest.Mock).mockResolvedValue({ state: 'idle', lastSyncedAt: NEW });
  render(<SyncProvider><Capture /></SyncProvider>);
  await flushPolls(1);

  await act(async () => {
    void ctx.syncNow('manual');
    void ctx.syncNow('manual');
  });
  await flushPolls(1);
  expect(requestSync).toHaveBeenCalledTimes(1);
  expect(show).toHaveBeenCalledWith('Already up to date', 'success');
});

it('is a harmless default outside the provider', () => {
  const { getByTestId } = render(<Capture />);
  expect(getByTestId('v')).toHaveTextContent('unknown|0|null');
});
```

Run it and expect FAIL, module not found.

- [ ] **Step 2: Implement**

`mobile/src/sync/SyncProvider.tsx`:

```tsx
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { fetchSyncStatus, requestSync, type ConnectionState, type SyncState, type SyncStatusDTO } from '../api/sync';
import { ApiError } from '../api/client';
import { useToast } from '../components/ui/toast';

// Keeps the app's Google Health data fresh. Coming back to the foreground
// after more than 15 minutes (by the SERVER's last sync, so a wrong phone
// clock can't confuse it) asks the server to catch up, follows the job until
// it finishes, and bumps dataVersion so data screens reload.

export const STALE_AFTER_MS = 15 * 60 * 1000;
export const POLL_MS = 1500;
export const POLL_TIMEOUT_MS = 60 * 1000;

export type SyncSource = 'foreground' | 'manual' | 'pull';

export interface SyncContextValue {
  state: 'unknown' | SyncState;
  lastSyncedAt: string | null;
  connection: ConnectionState | null;
  /** Bumped after every successful sync; data screens reload when it changes. */
  dataVersion: number;
  syncNow: (source: SyncSource) => Promise<void>;
}

const DEFAULT: SyncContextValue = { state: 'unknown', lastSyncedAt: null, connection: null, dataVersion: 0, syncNow: async () => undefined };
const SyncContext = createContext<SyncContextValue | null>(null);

/** Outside a SyncProvider (a screen rendered on its own, in tests) nothing syncs. */
export function useSync(): SyncContextValue {
  return useContext(SyncContext) ?? DEFAULT;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function SyncProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [status, setStatus] = useState<Omit<SyncContextValue, 'dataVersion' | 'syncNow'>>({
    state: 'unknown',
    lastSyncedAt: null,
    connection: null,
  });
  const [dataVersion, setDataVersion] = useState(0);
  const running = useRef(false);
  const mounted = useRef(true);
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const apply = (next: SyncStatusDTO) => {
    const value = { state: next.state, lastSyncedAt: next.lastSyncedAt, connection: next.connection };
    // Updated immediately, not on the next render: checkAndSync calls syncNow
    // straight after, and syncNow must compare against this lastSyncedAt.
    statusRef.current = value;
    if (mounted.current) setStatus(value);
  };

  const syncNow = useCallback(
    async (source: SyncSource) => {
      if (running.current) return;
      running.current = true;
      const before = statusRef.current.lastSyncedAt;
      setStatus((s) => ({ ...s, state: 'syncing' }));
      try {
        try {
          await requestSync();
        } catch (e) {
          if (e instanceof ApiError && e.status === 409) {
            if (mounted.current) setStatus({ state: 'idle', lastSyncedAt: before, connection: 'NOT_CONNECTED' });
            return;
          }
          throw e;
        }
        const deadline = Date.now() + POLL_TIMEOUT_MS;
        let latest = await fetchSyncStatus();
        while (latest.state === 'syncing') {
          if (Date.now() >= deadline) throw new Error('Sync took too long');
          await wait(POLL_MS);
          latest = await fetchSyncStatus();
        }
        apply(latest);
        const advanced = latest.lastSyncedAt !== null && latest.lastSyncedAt !== before;
        if (latest.connection === 'DISCONNECTED') {
          toast.show('Google Health is disconnected', 'error');
        } else if (latest.state === 'failed') {
          toast.show("Couldn't sync with Google Health", 'error');
        } else if (advanced) {
          if (mounted.current) setDataVersion((v) => v + 1);
          toast.show('Synced with Google Health', 'success');
        } else if (source !== 'foreground') {
          toast.show('Already up to date', 'success');
        }
      } catch {
        if (mounted.current) setStatus((s) => ({ ...s, state: 'failed' }));
        toast.show("Couldn't sync with Google Health", 'error');
      } finally {
        running.current = false;
      }
    },
    [toast],
  );

  const checkAndSync = useCallback(async () => {
    if (running.current) return;
    let current: SyncStatusDTO;
    try {
      current = await fetchSyncStatus();
    } catch {
      return; // A failed check is not worth an error toast; the next foreground tries again.
    }
    apply(current);
    if (current.connection !== 'CONNECTED') return;
    const stale = !current.lastSyncedAt || Date.now() - Date.parse(current.lastSyncedAt) > STALE_AFTER_MS;
    // A sync already running (e.g. the server's backstop) is followed to completion.
    if (stale || current.state === 'syncing') await syncNow('foreground');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncNow]);

  useEffect(() => {
    void checkAndSync();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') void checkAndSync();
    });
    return () => sub.remove();
  }, [checkAndSync]);

  const value = useMemo(() => ({ ...status, dataVersion, syncNow }), [status, dataVersion, syncNow]);
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}
```

- [ ] **Step 3: Mount the providers**

In `mobile/src/navigation/RootNavigator.tsx`, import `ToastProvider` from `../components/ui/toast` and `SyncProvider` from `../sync/SyncProvider`. In the signed-in `return`, wrap the `<Stack.Navigator …>…</Stack.Navigator>` inside `NavigationContainer`:

```tsx
    <NavigationContainer theme={navTheme}>
      <ToastProvider>
        <SyncProvider>
          <Stack.Navigator …>…</Stack.Navigator>
        </SyncProvider>
      </ToastProvider>
    </NavigationContainer>
```

(Signed-out users get neither provider, so nothing syncs before sign-in.)

- [ ] **Step 4: Run tests**

Run `npx jest __tests__/sync __tests__/navigation --forceExit`. Expected: pass.

If any existing `RootNavigator*` test now fails, it's because `SyncProvider` calls `fetchSyncStatus` on mount through a mocked `apiFetch`, which may break an assertion on call counts. In that case add `jest.mock('../../src/api/sync', () => ({ requestSync: jest.fn(), fetchSyncStatus: jest.fn().mockResolvedValue({ state: 'idle', lastSyncedAt: null, connection: 'NOT_CONNECTED' }) }))` to that test file. Don't change what it asserts.

- [ ] **Step 5: Commit**

```bash
git add mobile/src/sync/SyncProvider.tsx mobile/__tests__/sync/SyncProvider.test.tsx mobile/src/navigation/RootNavigator.tsx mobile/__tests__/navigation
git commit -m "Sync with Google Health when the app returns to the foreground"
```

---

### Task 7: Status line on Today, and screens reload after a sync

**Files:**
- Create: `mobile/src/components/sync-status-line.tsx`, `mobile/__tests__/components/SyncStatusLine.test.tsx`
- Modify: `mobile/src/screens/DashboardScreen.tsx`, `mobile/__tests__/screens/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: `useSync` (Task 6); `formatLastSynced` (Task 4).
- Produces: `SyncStatusLine()` with `testID="sync-status-line"`.

- [ ] **Step 1: Write the failing test**

`mobile/__tests__/components/SyncStatusLine.test.tsx`:

```tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { SyncStatusLine } from '../../src/components/sync-status-line';
import { useSync } from '../../src/sync/SyncProvider';

jest.mock('../../src/sync/SyncProvider', () => ({ useSync: jest.fn() }));

const syncNow = jest.fn();
const set = (over: object) => (useSync as jest.Mock).mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow, ...over });
const renderLine = (navigate = jest.fn()) =>
  render(
    <NavigationContext.Provider value={{ navigate } as any}>
      <SyncStatusLine />
    </NavigationContext.Provider>,
  );

beforeEach(() => jest.clearAllMocks());

it('shows syncing progress', () => {
  set({ state: 'syncing' });
  expect(renderLine().getByTestId('sync-status-line')).toHaveTextContent('Syncing with Google Health…');
});

it('shows when it last synced, and syncs on tap', () => {
  set({ lastSyncedAt: new Date(Date.now() - 12 * 60_000).toISOString() });
  const { getByTestId } = renderLine();
  expect(getByTestId('sync-status-line')).toHaveTextContent('Synced 12 min ago');
  fireEvent.press(getByTestId('sync-status-line'));
  expect(syncNow).toHaveBeenCalledWith('manual');
});

it('offers a retry after a failure', () => {
  set({ state: 'failed' });
  const { getByTestId } = renderLine();
  expect(getByTestId('sync-status-line')).toHaveTextContent("Couldn't sync · Tap to retry");
  fireEvent.press(getByTestId('sync-status-line'));
  expect(syncNow).toHaveBeenCalledWith('manual');
});

it('offers to reconnect when Google Health is disconnected', () => {
  set({ connection: 'DISCONNECTED' });
  const navigate = jest.fn();
  const { getByTestId } = renderLine(navigate);
  expect(getByTestId('sync-status-line')).toHaveTextContent('Google Health disconnected · Reconnect');
  fireEvent.press(getByTestId('sync-status-line'));
  expect(navigate).toHaveBeenCalledWith('ConnectHealth');
  expect(syncNow).not.toHaveBeenCalled();
});

it('shows nothing when not connected or not yet known', () => {
  set({ connection: 'NOT_CONNECTED' });
  expect(renderLine().queryByTestId('sync-status-line')).toBeNull();
  set({ state: 'unknown', connection: null });
  expect(renderLine().queryByTestId('sync-status-line')).toBeNull();
});
```

Append to `mobile/__tests__/screens/DashboardScreen.test.tsx`, adapting to how that file mocks `apiFetch`:

```tsx
it('reloads its data after a sync', async () => {
  // Uses the file's existing render helper and apiFetch mock.
  const syncModule = require('../../src/sync/SyncProvider');
  const spy = jest.spyOn(syncModule, 'useSync').mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow: jest.fn() });
  const utils = renderDashboard(); // the file's existing helper, or render(<DashboardScreen />)
  await waitFor(() => expect(apiFetch).toHaveBeenCalledWith('/me/biometrics'));
  const before = (apiFetch as jest.Mock).mock.calls.filter(([p]) => p === '/me/biometrics').length;

  spy.mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 1, syncNow: jest.fn() });
  utils.rerender(<DashboardScreen />);

  await waitFor(() =>
    expect((apiFetch as jest.Mock).mock.calls.filter(([p]) => p === '/me/biometrics').length).toBe(before + 1),
  );
  spy.mockRestore();
});
```

Run both and expect FAIL.

- [ ] **Step 2: Implement the status line**

`mobile/src/components/sync-status-line.tsx`:

```tsx
import React, { useContext, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { useColorScheme } from 'nativewind';
import { useSync } from '../sync/SyncProvider';
import { formatLastSynced } from '../sync/formatLastSynced';
import { Text } from './ui/text';
import { COLORS } from '../theme';

function useMinuteClock(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// Under the "Today" title: whether the data is current, and a tap to sync now.
export function SyncStatusLine() {
  const { state, lastSyncedAt, connection, syncNow } = useSync();
  const navigation = useContext(NavigationContext);
  const now = useMinuteClock();
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;

  if (connection === 'DISCONNECTED') {
    return (
      <Pressable
        testID="sync-status-line"
        accessibilityRole="button"
        accessibilityLabel="Google Health is disconnected. Reconnect."
        onPress={() => navigation?.navigate('ConnectHealth' as never)}
        className="active:opacity-60"
      >
        <Text className="text-xs text-destructive">Google Health disconnected · Reconnect</Text>
      </Pressable>
    );
  }
  if (connection !== 'CONNECTED' || state === 'unknown') return null;

  if (state === 'syncing') {
    return (
      <Pressable testID="sync-status-line" accessibilityRole="button" accessibilityLabel="Syncing with Google Health" disabled className="flex-row items-center gap-1.5">
        <ActivityIndicator size="small" color={colors.muted} />
        <Text className="text-xs text-muted-foreground">Syncing with Google Health…</Text>
      </Pressable>
    );
  }

  const text =
    state === 'failed'
      ? "Couldn't sync · Tap to retry"
      : lastSyncedAt
        ? formatLastSynced(lastSyncedAt, now)
        : 'Not synced yet · Tap to sync';
  return (
    <Pressable testID="sync-status-line" accessibilityRole="button" accessibilityLabel={`${text}. Double tap to sync now.`} onPress={() => void syncNow('manual')} className="active:opacity-60">
      <Text className={`text-xs ${state === 'failed' ? 'text-destructive' : 'text-muted-foreground'}`}>{text}</Text>
    </Pressable>
  );
}
```

- [ ] **Step 3: Wire it into Today**

In `mobile/src/screens/DashboardScreen.tsx`:
- Import `useSync` from `../sync/SyncProvider` and `SyncStatusLine` from `../components/sync-status-line`.
- In the component, add `const { dataVersion } = useSync();`.
- Change the dependency arrays of the three data effects (`/me/biometrics`, `/me/connection`, and the scores effect) from `[]` to `[dataVersion]`.
- Wrap the header so the status line sits under the title:

```tsx
        <View className="gap-1">
          <View className="flex-row items-center justify-between">
            <Text className="text-2xl font-bold">Today</Text>
            {headerActions}
          </View>
          <SyncStatusLine />
        </View>
```

- [ ] **Step 4: Run tests and commit**

Run `npx jest __tests__/components/SyncStatusLine.test.tsx __tests__/screens --forceExit`. Expected: pass.

```bash
git add mobile/src/components/sync-status-line.tsx mobile/__tests__/components/SyncStatusLine.test.tsx mobile/src/screens/DashboardScreen.tsx mobile/__tests__/screens/DashboardScreen.test.tsx
git commit -m "Show sync status on Today and reload after a sync"
```

---

### Task 8: Settings rows, and pull-to-refresh that actually syncs

**Files:**
- Modify: `mobile/src/screens/SettingsScreen.tsx`, `mobile/src/screens/ActivityScreen.tsx`, `mobile/src/screens/MetricsScreen.tsx`
- Test: `mobile/__tests__/screens/SettingsSync.test.tsx` (new), plus additions to the existing Activity and Metrics screen tests

**Interfaces:**
- Consumes: `useSync` (Task 6); `formatLastSynced` (Task 4).

- [ ] **Step 1: Write the failing tests**

`mobile/__tests__/screens/SettingsSync.test.tsx` (use the same mocks the existing Settings tests use for `getTimezoneState` and friends; copy them from `__tests__/screens/SettingsScreen*.test.tsx`):

```tsx
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/screens/SettingsScreen';
import { useSync } from '../../src/sync/SyncProvider';

jest.mock('../../src/sync/SyncProvider', () => ({ useSync: jest.fn() }));
// + the existing Settings test mocks (timezone state, coach settings, etc.)

const syncNow = jest.fn();

it('shows when it last synced and syncs from "Sync now"', () => {
  (useSync as jest.Mock).mockReturnValue({ state: 'idle', lastSyncedAt: new Date(Date.now() - 12 * 60_000).toISOString(), connection: 'CONNECTED', dataVersion: 0, syncNow });
  const { getByTestId } = render(<SettingsScreen />);
  expect(getByTestId('settings-last-synced')).toHaveTextContent('Last synced 12 min ago');
  fireEvent.press(getByTestId('settings-sync-now'));
  expect(syncNow).toHaveBeenCalledWith('manual');
});

it('disables "Sync now" while syncing', () => {
  (useSync as jest.Mock).mockReturnValue({ state: 'syncing', lastSyncedAt: null, connection: 'CONNECTED', dataVersion: 0, syncNow });
  const { getByTestId } = render(<SettingsScreen />);
  expect(getByTestId('settings-sync-now')).toBeDisabled();
  expect(getByTestId('settings-sync-now')).toHaveTextContent('Syncing…');
});

it('hides the sync rows when Google Health is not connected', () => {
  (useSync as jest.Mock).mockReturnValue({ state: 'idle', lastSyncedAt: null, connection: 'NOT_CONNECTED', dataVersion: 0, syncNow });
  const { queryByTestId } = render(<SettingsScreen />);
  expect(queryByTestId('settings-sync-now')).toBeNull();
});
```

In the existing Activity and Metrics screen tests, add one test each. With `useSync` mocked to return a `syncNow` jest.fn, firing the ScrollView's `refreshControl.props.onRefresh()` must call `syncNow('pull')` and then fetch again. Follow how each file already drives pull-to-refresh, if it does; otherwise find the `RefreshControl` with `UNSAFE_getByType(RefreshControl)`.

Run them and expect FAIL.

- [ ] **Step 2: Implement Settings**

In `SettingsScreen.tsx`, import `useSync` and `formatLastSynced`, and add `const { state: syncState, lastSyncedAt, connection, syncNow } = useSync();`. Inside the Google Health `Card`, after the existing `Pressable`, add:

```tsx
          {connection === 'CONNECTED' ? (
            <>
              <Text testID="settings-last-synced" className="text-xs text-muted-foreground">
                {lastSyncedAt ? formatLastSynced(lastSyncedAt, new Date(), 'Last synced') : 'Not synced yet'}
              </Text>
              <Pressable
                testID="settings-sync-now"
                accessibilityRole="button"
                disabled={syncState === 'syncing'}
                onPress={() => void syncNow('manual')}
                className="mt-1 active:opacity-70"
              >
                <Text className="text-sm font-medium text-accent">{syncState === 'syncing' ? 'Syncing…' : 'Sync now'}</Text>
              </Pressable>
            </>
          ) : null}
```

(Use whatever accent text class exists in `tailwind.config.js`. If `text-accent` isn't defined, use the class the app's accent-coloured text already uses.)

- [ ] **Step 3: Implement pull-to-refresh and reload in Activity and Metrics**

In each of `ActivityScreen.tsx` and `MetricsScreen.tsx`:
- import `useSync` and add `const { dataVersion, syncNow } = useSync();`,
- change the load effect's dependencies from `[load]` to `[load, dataVersion]`,
- change `onRefresh` to:

```ts
  async function onRefresh() {
    setRefreshing(true);
    // Pull from Google Health first, then read what it brought in.
    await syncNow('pull');
    await load();
    setRefreshing(false);
  }
```

- [ ] **Step 4: Run tests and commit**

Run the full mobile suite with `npx jest --forceExit`, then `npx tsc --noEmit`. Expect no non-test errors except the existing `App.tsx` `global.css` one.

```bash
git add mobile/src/screens mobile/__tests__/screens
git commit -m "Add Last synced and Sync now to Settings, and sync on pull-to-refresh"
```

---

### Task 9: End-to-end verification

- [ ] **Step 1:** Run the full backend suite (`npm test -- --forceExit`), backend `tsc`, the full mobile suite, and mobile `tsc`. Record the results.
- [ ] **Step 2:** Rebuild nothing native (there are no new native modules). Copy the changed mobile files into `~/dev/biometrics-run`, restart Metro, and relaunch the app. Restart the run copy's backend from this branch's code against `biometrics` (the dev DB is already migrated; this branch has no migrations).
- [ ] **Step 3: Manual checks** (the user does these, or the controller where it can):
  - on launch, the status line reads "Syncing with Google Health…" and then "Synced just now", the toast appears, and new days show up;
  - tapping the status line syncs again ("Already up to date" if within 30 s);
  - Settings shows "Last synced …" and "Sync now";
  - pull-to-refresh on Activity syncs.
- [ ] **Step 4:** Open the PR.
