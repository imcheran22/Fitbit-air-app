# Foreground Sync and Sync Status — Design

## Context

Data from Google Health reaches the backend in exactly two ways today:

- the **backfill** queued once when a user connects (`backend/src/health/routes.ts`, `/health/callback`), and
- a **fetch** queued when Google's webhook calls `POST /webhooks/health`.

Nothing else pulls. There is no schedule and no endpoint the app can call.
Pull-to-refresh on Activity and Metrics only re-reads the database, and the
Today screen loads its data once, when it mounts.

In development the webhook must reach the backend through an ngrok tunnel, and
live webhook delivery has never been confirmed. On 2026-09-24 the developer's
own data had last synced 33 hours earlier. Nothing had arrived since.

## Goal (the user's words, paraphrased)

Like Bevel: when the user comes back to the app after being away a while, the
app resyncs with Google Health by itself, makes sure the sync actually happens,
and makes it obvious to the user that it synced.

## Decisions taken during brainstorming

1. **User awareness: both** a live status line on Today ("Syncing…" →
   "Synced just now" → "Synced 12 min ago"; tap to sync) **and** a toast when an
   app-started sync finishes, plus "Last synced" in Settings.
2. **Foreground threshold: 15 minutes.** On returning to the foreground, sync if
   the server's `lastSyncedAt` is more than 15 minutes old or has never happened.
3. **Server backstop: every 3 hours** for every connected user, so scores and the
   coach see fresh data even if the app is not opened and webhooks fail.
4. **Approach: the server runs the sync and the app requests and polls it.**
   Rejected: a synchronous `POST` that waits on Google for 5–20 s (it risks the
   request timeout and duplicates the backstop), and server-pushed completion
   (too heavy; push doesn't work on the free Apple team).

## Non-goals

- Changing or replacing webhook handling, the connect backfill, or the 365-day
  steps history backfill.
- Any schema change or migration.
- Background sync while the app is closed, including iOS background fetch.
- Syncing sources other than Google Health.

## Design

### 1. Backend

**`backend/src/sync/catchUp.ts` (new)**

- `catchUpWindow(lastSyncedAt: Date | null, today: string): { startDate; endDate }`
  returns a half-open `[start, end)` window in `YYYY-MM-DD`:
  - `end` is the day after `today`, so today is included.
  - `start` is the day **before** the civil date of `lastSyncedAt`, so
    late-arriving data from that day is picked up. It is clamped to no earlier
    than `today − 13`, a cap of 14 days.
  - With no `lastSyncedAt`, `start` is `today − 13`.
  - `today` is the user's civil date in `User.timezone`, using the same helper
    the rest of the backend uses for civil dates.
- `enqueueCatchUp(userId): Promise<'syncing'>`:
  - The job name is `catchUp`, the data is `{ userId }`, and the job ID is
    `catchUp-<userId>`. BullMQ rejects `:` in job IDs.
  - If a job with that ID is waiting, delayed or active, it is left alone.
  - A completed or failed job with that ID is removed first, so a new one can
    be added.
  - Options are `removeOnComplete: true` and `removeOnFail: false`. A failed job
    stays until the next attempt, so `GET /me/sync` can report `failed`.
- `catchUpState(userId): Promise<'idle' | 'syncing' | 'failed'>` maps the job's
  state:
  - `waiting`, `delayed`, `active` or `prioritized` → `syncing`,
  - `failed` → `failed`,
  - anything else, including no job → `idle`.
- `scheduleCatchUpSweep()` upserts a repeatable `catchUpSweep` job every
  3 hours (`every: 3 * 60 * 60 * 1000`). It is registered in
  `backend/src/server.ts` beside `scheduleTokenRefreshSweep()`.

**`backend/src/sync/worker.ts` (modified)**

- The body of `handleBackfillJob` (fetch every metric and sleep, upsert, queue
  score recalculation, stamp `lastSyncedAt`) moves into an exported
  `syncWindow(userId, startDate, endDate)`. `handleBackfillJob` calls it, and
  its behaviour is unchanged.
- The new `catchUp` job computes its window **when it runs**: it loads the
  connection and the user's time zone, calls `catchUpWindow`, then calls
  `syncWindow`. It skips a user whose connection is missing or `DISCONNECTED`.
  Token-revocation handling (which marks `DISCONNECTED`) is inherited from the
  existing session code.
- The new `catchUpSweep` job loads every `CONNECTED` connection and calls
  `enqueueCatchUp` for each one.

**`backend/src/sync/routes.ts` (new), mounted in `app.ts`, both routes behind `requireAuth`**

- `POST /me/sync`:
  - With no `HealthConnection`, it returns **409** `{ error: 'not_connected' }`.
  - If `lastSyncedAt` is under 30 s old and no job is running, it returns
    **200** `{ state: 'idle', lastSyncedAt }` without queueing. This stops
    repeated taps from hammering Google.
  - Otherwise it calls `enqueueCatchUp` and returns **202**
    `{ state: 'syncing', lastSyncedAt }`.
- `GET /me/sync` returns **200**
  `{ state: 'idle' | 'syncing' | 'failed', lastSyncedAt: string | null, connection: 'CONNECTED' | 'DISCONNECTED' | 'NOT_CONNECTED' }`.

### 2. Mobile

**`mobile/src/sync/SyncProvider.tsx` (new) and the `useSync()` hook**

- Context value: `{ state: 'unknown' | 'idle' | 'syncing' | 'failed', lastSyncedAt: string | null, connection, dataVersion: number, syncNow(source: 'foreground' | 'manual' | 'pull') }`.
- `mobile/src/api/sync.ts` (new) holds `requestSync()` for `POST /me/sync`
  and `fetchSyncStatus()` for `GET /me/sync`.
- `syncNow`:
  - It does nothing if a sync is already `syncing`.
  - It calls `POST /me/sync`. A 409 sets `connection = 'NOT_CONNECTED'` and
    does nothing more.
  - It then polls `GET /me/sync` every **1500 ms** while the state is
    `syncing`, for at most **60 s**. After that it gives up with `failed`.
  - **Success** means the state is `idle` and `lastSyncedAt` is newer than
    before the request. On success it bumps `dataVersion` and shows the toast
    "Synced with Google Health".
  - **Failure** means `failed` or the timeout. It shows the toast
    "Couldn't sync with Google Health".
- **Automatic trigger:**
  - It runs on mount (launch or sign-in) and whenever `AppState` becomes
    `active`.
  - It reads `GET /me/sync` first, and calls `syncNow('foreground')` only if
    `connection === 'CONNECTED'` and the server's `lastSyncedAt` is `null` or
    more than **15 minutes** old.
  - The provider is mounted only while signed in.
- **Where it's mounted:** `RootNavigator`'s signed-in branch, inside a new
  `ToastProvider`.

**Screens reload after a sync**

`DashboardScreen`, `ActivityScreen` and `MetricsScreen` add `dataVersion` from
`useSync()` to their data-loading effects, so they re-fetch after each
successful sync.

**`mobile/src/components/sync-status-line.tsx` (new), under the "Today" title**

- `syncing`: a small `ActivityIndicator` and "Syncing with Google Health…".
- `idle`: "Synced just now" when under 1 min old, then "Synced N min ago",
  "Synced N h ago", "Synced yesterday", and "Synced on Sep 21" when older.
  It re-renders every 60 s.
- `failed`: "Couldn't sync · Tap to retry".
- `connection === 'DISCONNECTED'`: "Google Health disconnected · Reconnect".
  Tapping it navigates to `ConnectHealth`.
- Not connected or `unknown`: nothing is rendered.
- Tapping in the `idle` or `failed` state calls `syncNow('manual')`.
- Each state has an `accessibilityLabel`, and the component's role is `button`.
- The relative-time wording lives in a pure helper, `formatLastSynced(iso, now)`,
  in `mobile/src/sync/formatLastSynced.ts`.

**`mobile/src/components/ui/toast.tsx` (new): `ToastProvider` and `useToast()`**

- `show(text, tone: 'success' | 'error')` slides a pill down from the top safe
  area, using a Reanimated `translateY` and opacity over 250 ms.
- It hides itself after 2.5 s, and a newer toast replaces the current one.
- It calls `AccessibilityInfo.announceForAccessibility(text)`.
- It uses no new dependency.
- Only syncs the app started show a toast. The server's 3-hour sweep runs
  silently.

**Settings**

Under the Google Health row, Settings shows "Last synced …", using
`formatLastSynced` with "Last" as the prefix. Below it is a **"Sync now"** row
that calls `syncNow('manual')`. It is disabled while syncing, when it shows
"Syncing…".

**Pull-to-refresh on Activity and Metrics**

`onRefresh` awaits `syncNow('pull')` and then re-reads, as it does today.

### 3. Error handling

- **A 5xx or network error from `POST` or `GET /me/sync`:** the state becomes
  `failed` and the error toast is shown. It never signs the user out; only a
  401 does, through `api/client.ts`.
- **Google revokes access during a catch-up:** the existing worker marks the
  connection `DISCONNECTED`, the job fails, and the next `GET /me/sync` returns
  `connection: 'DISCONNECTED'`, so the status line offers Reconnect.
- **A worker restart mid-job:** BullMQ retries the job. The job ID keeps it to
  one catch-up per user.

### 4. Testing

**Backend** (Jest, with the real test database and Redis; Google is stubbed
with `nock`, as in `tests/sync/*`):

- `catchUpWindow`: the one-day overlap, the 14-day cap, no previous sync, and
  a time-zone boundary.
- `enqueueCatchUp` and `catchUpState`: an in-flight job is not duplicated, a
  finished or failed job is replaced, and each job state maps correctly.
- `POST /me/sync`: 409 when not connected, 202 when a job is queued, 200 idle
  inside the 30 s guard, and 401 with no session.
- `GET /me/sync`: each state and connection value.
- A `catchUp` job run end to end: it stores records and advances
  `lastSyncedAt`, and it skips a `DISCONNECTED` user.
- `catchUpSweep`: it queues only `CONNECTED` users.
- The refactored `handleBackfillJob` still passes its existing tests.

**Mobile** (Jest):

- `formatLastSynced`: every wording band.
- `SyncProvider`:
  - success bumps `dataVersion` and shows the success toast,
  - failure and the 60 s timeout show the error toast,
  - a 409 sets not-connected,
  - no second sync starts while one is running,
  - the foreground rule syncs when the last sync is over 15 minutes old and
    not when it is under, using a mocked `AppState` and fake timers.
- `SyncStatusLine`: each state's text, tap behaviour, and the Reconnect
  navigation.
- `ToastProvider`: it shows, hides after 2.5 s, and a newer toast replaces an
  older one.
- Settings: "Last synced" and "Sync now".
- Dashboard: it reloads when `dataVersion` changes.

**Manual**, on the DeviceHub simulator against the dev database:

- Leave the app for over 15 minutes. On return the status line shows
  "Syncing…", then "Synced just now", and the toast appears.
- Tapping the status line syncs.
- Pull-to-refresh syncs.
- Settings shows "Last synced".

### 5. Rollout

- One branch (`foreground-sync`) and one PR. No migration and no new
  environment variables.
- The backstop starts on the next backend start, because it is registered in
  `server.ts`.
