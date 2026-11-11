# Google Health API Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Fitbit's Web API integration (built in Phase 1) with Google Health API end to end — OAuth, data fetching, webhooks — while preserving every hardened behavior from Phase 1's final review (encryption at rest, queue-only sync, gap-scoped backfill, never-delete BiometricRecord, in-flight refresh coalescing, distributed-safe token refresh).

**Architecture:** Same shape as Phase 1 (Express, Prisma/Postgres, BullMQ/Redis, React Native/Expo). `backend/src/fitbit/` is fully replaced by `backend/src/health/`. Two distinct credential types now exist: per-user OAuth tokens (`googlehealth.*` scopes, data fetching) and a single app-wide service account (`cloud-platform` scope, subscriber/subscription management) — confirmed live that Google rejects a token carrying both scope families for a data-fetch call, so these must never be mixed.

**Tech Stack:** Same as Phase 1, plus `google-auth-library`'s `GoogleAuth` class for service-account authentication (already a dependency, added in Phase 1 for Google Sign-In verification).

**Spec:** `docs/superpowers/specs/2026-09-16-google-health-migration-design.md` — every technical fact in this plan is drawn from that spec's "Confirmed API Facts" and "Webhook Mechanism" sections, which were verified against the live API, not guessed.

## Global Constraints

- OAuth: authorize at `https://accounts.google.com/o/oauth2/v2/auth`, exchange/refresh at `https://oauth2.googleapis.com/token`. Scopes: `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly`, `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly`, `https://www.googleapis.com/auth/googlehealth.sleep.readonly`.
- All per-user data-fetch calls use the literal path segment `me` (`users/me/dataTypes/...`), never the resolved `healthUserId`. A token also carrying `cloud-platform` scope is rejected (`403 DISALLOWED_OAUTH_SCOPES`) for these calls — the end-user token must carry ONLY the three `googlehealth.*` scopes above.
- Subscriber/subscription management (`v4.projects.subscribers*`) requires a `cloud-platform`-scoped service account token — never the end-user's token.
- Metric mapping (exact, confirmed live): STEPS → `dailyRollUp` on parent `steps` → `rollupDataPoints[].steps.countSum`. RESTING_HR → `dailyRollUp` on parent `heart-rate` (kebab-case) → `rollupDataPoints[].heartRate.beatsPerMinuteMin`. SLEEP → `dataPoints.list` on `sleep` → `Sleep.summary.minutesAsleep` per session. HRV → `dataPoints.list` on `heartRateVariability` (sample-based) → `HeartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds`, one value per day (pick the last sample).
- `dailyRollUp` request body: `{"range": {"start": {"date": {"year","month","day"}}, "end": {"date": {...}}}, "windowSizeDays": 1}` (confirmed live — the discovery doc's own field names for this are wrong).
- `dataPoints.list` filter (AIP-160): interval-based (`steps`, `sleep`) use `{dataType}.interval.start_time >= "<RFC3339>" AND {dataType}.interval.start_time < "<RFC3339>"`; sample-based (`heartRateVariability`) use `{dataType}.sample_time.physical_time >= "..." AND ... < "..."`.
- Webhook verification: primary mechanism is the `Authorization` header carrying the exact shared secret configured at subscriber-creation time (a plain string comparison) — confirmed as Google's own required verification check, sufficient on its own. The `GOOGLE-HEALTH-API-SIGNATURE` ECDSA header is real and observed but its public-key distribution is undocumented anywhere Google publishes — do not attempt to implement signature verification in this plan; ship with Authorization-header verification only.
- Webhook notification body: a JSON array, each item shaped `{"data": {"version", "clientProvidedSubscriptionName", "healthUserId", "operation", "dataType", "intervals": [{"physicalTimeInterval": {"startTime","endTime"}, ...}]}}`.
- Never delete `BiometricRecord` rows on disconnect (unchanged from Phase 1). All Fitbit-specific naming (`fitbit/`, `FitbitConnection`, `FITBIT_*` env vars) is fully renamed to `health/`, `HealthConnection`, `GOOGLE_HEALTH_*` — no dual-provider support, no leftover Fitbit code path.
- No Claude/AI attribution trailers on any commit message.

---

## File Structure

**Backend changes:**
```
backend/prisma/schema.prisma                     # modify: rename model/enum/field
backend/prisma/migrations/<new>_rename_to_health/migration.sql  # new, hand-written rename
backend/.env.example                             # modify: FITBIT_* -> GOOGLE_HEALTH_*, add service account var
backend/src/health/                              # new directory, replaces src/fitbit/
  oauth.ts                                        # buildAuthorizeUrl, exchangeCodeForTokens, refreshHealthTokens
  client.ts                                       # fetchMetricRange (dailyRollUp + dataPoints.list)
  webhookVerify.ts                                # shared-secret Authorization header check
  serviceAccount.ts                               # cloud-platform token minting via google-auth-library
  subscriber.ts                                   # registerSubscriber (one-time), registerUserSubscription, deleteUserSubscription, getIdentity
  routes.ts                                       # /health/authorize, /health/callback, GET+POST /webhooks/health
backend/src/fitbit/                              # deleted entirely
backend/src/sync/worker.ts                       # modify: import from health/, not fitbit/
backend/src/sync/tokenRefreshJob.ts               # modify: call health/oauth.ts's refresh
backend/src/biometrics/routes.ts                 # modify: /me/connection reads HealthConnection
backend/src/app.ts                               # modify: mount healthRouter, not fitbitRouter
backend/src/types.ts                             # modify: any Fitbit-named types renamed
backend/scripts/registerHealthSubscriber.ts       # new: one-time ops script to register the project-level subscriber
backend/tests/fitbit/                            # deleted entirely
backend/tests/health/                            # new, mirrors old fitbit test structure
  oauth.test.ts, client.test.ts, webhookVerify.test.ts, serviceAccount.test.ts, subscriber.test.ts, routes.test.ts
backend/tests/sync/worker.test.ts                # modify: mock health/client instead of fitbit/client
backend/tests/sync/tokenRefreshJob.test.ts        # modify: mock health/oauth instead of fitbit/oauth
backend/tests/biometrics/routes.test.ts          # modify: HealthConnection-based fixtures
backend/tests/integration/connectAndSync.test.ts # modify: full rewrite of nock mocks for Google endpoints
backend/Dockerfile                               # modify: env var names in comments/docs, add GOOGLE_APPLICATION_CREDENTIALS note
```

**Mobile changes:**
```
mobile/src/screens/ConnectFitbitScreen.tsx -> mobile/src/screens/ConnectHealthScreen.tsx  # rename + copy update
mobile/__tests__/screens/ConnectFitbitScreen.test.tsx -> ConnectHealthScreen.test.tsx      # rename
mobile/src/navigation/RootNavigator.tsx          # modify: import path/component name update
```

---

### Task 1: Prisma schema migration and env var renames

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<timestamp>_rename_to_health/migration.sql`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: Prisma model `HealthConnection` (renamed from `FitbitConnection`) with field `healthUserId` (renamed from `fitbitUserId`, still `@unique`), enum `HealthConnectionStatus` (renamed from `FitbitConnectionStatus`, same values `CONNECTED`/`DISCONNECTED`). All other fields (`userId`, `encryptedAccessToken`, `encryptedRefreshToken`, `tokenExpiresAt`, `webhookSubscriptionId`, `status`, `lastSyncedAt`, `createdAt`, `updatedAt`) unchanged in name and type. Used by every subsequent task.

- [ ] **Step 1: Read the current schema and the exact constraint/index names**

```bash
cd backend
cat prisma/schema.prisma
ls prisma/migrations/
```

Find the migration that created `FitbitConnection` and note its exact auto-generated constraint/index names (Prisma's default convention is `FitbitConnection_pkey`, `FitbitConnection_userId_key`, `FitbitConnection_userId_fkey`, `FitbitConnection_fitbitUserId_key` — confirm these exact names against the real migration file rather than assuming).

- [ ] **Step 2: Modify `backend/prisma/schema.prisma`**

Rename the model, enum, and field. The rest of the model body (relations, `@@map` if any, other fields) stays identical in shape — only these three renames:

```prisma
enum HealthConnectionStatus {
  CONNECTED
  DISCONNECTED
}

model HealthConnection {
  id                    String                  @id @default(uuid())
  userId                String                  @unique
  user                  User                    @relation(fields: [userId], references: [id])
  healthUserId          String                  @unique
  encryptedAccessToken  String
  encryptedRefreshToken String
  tokenExpiresAt        DateTime
  webhookSubscriptionId String?
  status                HealthConnectionStatus  @default(CONNECTED)
  lastSyncedAt          DateTime?
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt
}
```

Also update the `User` model's back-relation field name if it references `fitbitConnection` — rename to `healthConnection`.

- [ ] **Step 3: Write the migration SQL by hand**

Do NOT run `prisma migrate dev` for this — Prisma's diff engine sees an unrelated drop+create for a model rename, which would be destructive. Write the migration directory and SQL manually (matching the exact constraint names found in Step 1):

```bash
mkdir -p "prisma/migrations/$(date -u +%Y%m%d%H%M%S)_rename_to_health"
```

```sql
-- prisma/migrations/<timestamp>_rename_to_health/migration.sql
ALTER TABLE "FitbitConnection" RENAME TO "HealthConnection";
ALTER TABLE "HealthConnection" RENAME COLUMN "fitbitUserId" TO "healthUserId";
ALTER TABLE "HealthConnection" RENAME CONSTRAINT "FitbitConnection_pkey" TO "HealthConnection_pkey";
ALTER TABLE "HealthConnection" RENAME CONSTRAINT "FitbitConnection_userId_fkey" TO "HealthConnection_userId_fkey";
ALTER INDEX "FitbitConnection_userId_key" RENAME TO "HealthConnection_userId_key";
ALTER INDEX "FitbitConnection_fitbitUserId_key" RENAME TO "HealthConnection_healthUserId_key";
ALTER TYPE "FitbitConnectionStatus" RENAME TO "HealthConnectionStatus";
```

Adjust the constraint names in this SQL to match whatever Step 1 actually found if they differ from the assumed defaults above.

- [ ] **Step 4: Apply the migration and verify**

```bash
docker ps --filter "name=backend-postgres-test-1"  # confirm test DB is running; start via docker-compose.test.yml if not
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx prisma migrate deploy
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx prisma generate
```

Expected: migration applies cleanly, `npx prisma generate` produces a `HealthConnection` type with a `healthUserId` field (verify via `node -e "console.log(Object.keys(require('@prisma/client').Prisma.HealthConnectionScalarFieldEnum))"` or by checking the generated `.prisma/client/index.d.ts`).

- [ ] **Step 5: Update `backend/.env.example`**

Replace the Fitbit block with:

```
GOOGLE_HEALTH_CLIENT_ID=
GOOGLE_HEALTH_CLIENT_SECRET=
GOOGLE_HEALTH_REDIRECT_URI=http://localhost:3000/health/callback
GOOGLE_HEALTH_WEBHOOK_SECRET=Bearer change-me-to-a-random-value
GOOGLE_CLOUD_PROJECT_NUMBER=
GOOGLE_APPLICATION_CREDENTIALS=./service-account-key.json
```

(Remove `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_REDIRECT_URI`, `FITBIT_VERIFY_CODE`.)

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma prisma/migrations .env.example
git commit -m "Rename FitbitConnection to HealthConnection and update env vars for Google Health API"
```

---

### Task 2: Health OAuth module

**Files:**
- Create: `backend/src/health/oauth.ts`
- Test: `backend/tests/health/oauth.test.ts`

**Interfaces:**
- Consumes: `GOOGLE_HEALTH_CLIENT_ID`, `GOOGLE_HEALTH_CLIENT_SECRET`, `GOOGLE_HEALTH_REDIRECT_URI` env vars.
- Produces: `buildAuthorizeUrl(state: string): string`, `exchangeCodeForTokens(code: string): Promise<HealthTokenResponse>`, `refreshHealthTokens(refreshToken: string): Promise<HealthTokenResponse>` where `HealthTokenResponse = { accessToken: string; refreshToken: string; expiresIn: number }`. Used by Task 7 (routes) and the token refresh job (Task 8).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/health/oauth.test.ts
import nock from 'nock';
import { buildAuthorizeUrl, exchangeCodeForTokens, refreshHealthTokens } from '../../src/health/oauth';

beforeAll(() => {
  process.env.GOOGLE_HEALTH_CLIENT_ID = 'client-123.apps.googleusercontent.com';
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'secret-456';
  process.env.GOOGLE_HEALTH_REDIRECT_URI = 'https://app.example.com/health/callback';
});

afterEach(() => nock.cleanAll());

describe('buildAuthorizeUrl', () => {
  it('includes client id, redirect uri, the three googlehealth scopes, and state', () => {
    const url = buildAuthorizeUrl('state-abc');
    expect(url).toContain('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url).toContain('client_id=client-123.apps.googleusercontent.com');
    expect(url).toContain(encodeURIComponent('https://app.example.com/health/callback'));
    expect(url).toContain('state=state-abc');
    expect(url).toContain(encodeURIComponent('googlehealth.activity_and_fitness.readonly'));
    expect(url).toContain(encodeURIComponent('googlehealth.health_metrics_and_measurements.readonly'));
    expect(url).toContain(encodeURIComponent('googlehealth.sleep.readonly'));
  });
});

describe('exchangeCodeForTokens', () => {
  it('exchanges an auth code for tokens via Google\'s token endpoint', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, { access_token: 'access-1', refresh_token: 'refresh-1', expires_in: 3599 });

    const tokens = await exchangeCodeForTokens('auth-code-1');
    expect(tokens).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 3599 });
  });
});

describe('refreshHealthTokens', () => {
  it('exchanges a refresh token for new tokens', async () => {
    nock('https://oauth2.googleapis.com')
      .post('/token')
      .reply(200, { access_token: 'access-2', expires_in: 3599 });

    const tokens = await refreshHealthTokens('refresh-1');
    expect(tokens.accessToken).toBe('access-2');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/health/oauth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/health/oauth.ts`**

```typescript
import fetch from 'node-fetch';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const SCOPES = [
  'https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly',
  'https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly',
  'https://www.googleapis.com/auth/googlehealth.sleep.readonly',
].join(' ');

export interface HealthTokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
}

function config() {
  const clientId = process.env.GOOGLE_HEALTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_HEALTH_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Google Health OAuth env vars are not fully configured');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: SCOPES,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface GoogleTokenApiResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}

async function requestToken(body: URLSearchParams): Promise<HealthTokenResponse> {
  const { clientId, clientSecret } = config();
  body.set('client_id', clientId);
  body.set('client_secret', clientSecret);

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Google token endpoint returned ${res.status}`);
  }

  const json = (await res.json()) as GoogleTokenApiResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<HealthTokenResponse> {
  const { redirectUri } = config();
  return requestToken(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  );
}

export async function refreshHealthTokens(refreshToken: string): Promise<HealthTokenResponse> {
  return requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/health/oauth.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/health/oauth.ts tests/health/oauth.test.ts
git commit -m "Add Google Health OAuth authorize URL and token exchange"
```

---

### Task 3: Service account client for cloud-platform-scoped calls

**Files:**
- Create: `backend/src/health/serviceAccount.ts`
- Test: `backend/tests/health/serviceAccount.test.ts`

**Interfaces:**
- Consumes: `GOOGLE_APPLICATION_CREDENTIALS` env var (standard Google ADC convention, a path to a service account JSON key file).
- Produces: `getServiceAccountToken(): Promise<string>` — returns a `cloud-platform`-scoped access token. Used by Task 4 (subscriber/subscription management).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/health/serviceAccount.test.ts
import { GoogleAuth } from 'google-auth-library';
import { getServiceAccountToken } from '../../src/health/serviceAccount';

jest.mock('google-auth-library');

describe('getServiceAccountToken', () => {
  it('returns an access token scoped to cloud-platform', async () => {
    const getAccessToken = jest.fn().mockResolvedValue('sa-access-token-123');
    const getClient = jest.fn().mockResolvedValue({ getAccessToken });
    (GoogleAuth as unknown as jest.Mock).mockImplementation(() => ({ getClient }));

    const token = await getServiceAccountToken();

    expect(token).toBe('sa-access-token-123');
    expect(GoogleAuth).toHaveBeenCalledWith({
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    });
  });

  it('throws a clear error if the client returns no token', async () => {
    const getAccessToken = jest.fn().mockResolvedValue(null);
    const getClient = jest.fn().mockResolvedValue({ getAccessToken });
    (GoogleAuth as unknown as jest.Mock).mockImplementation(() => ({ getClient }));

    await expect(getServiceAccountToken()).rejects.toThrow('Failed to obtain service account access token');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/health/serviceAccount.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/health/serviceAccount.ts`**

```typescript
import { GoogleAuth } from 'google-auth-library';

export async function getServiceAccountToken(): Promise<string> {
  const auth = new GoogleAuth({ scopes: ['https://www.googleapis.com/auth/cloud-platform'] });
  const client = await auth.getClient();
  const token = await client.getAccessToken();
  if (!token) {
    throw new Error('Failed to obtain service account access token');
  }
  return typeof token === 'string' ? token : (token as { token: string }).token;
}
```

(`GoogleAuth` reads `GOOGLE_APPLICATION_CREDENTIALS` automatically per Google's Application Default Credentials convention — no explicit env var reading needed in this module.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/health/serviceAccount.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/health/serviceAccount.ts tests/health/serviceAccount.test.ts
git commit -m "Add service account client for cloud-platform-scoped Google Health API calls"
```

---

### Task 4: Subscriber and subscription management

**Files:**
- Create: `backend/src/health/subscriber.ts`
- Create: `backend/scripts/registerHealthSubscriber.ts`
- Test: `backend/tests/health/subscriber.test.ts`

**Interfaces:**
- Consumes: `getServiceAccountToken` (Task 3).
- Produces: `getIdentity(userAccessToken: string): Promise<{ healthUserId: string }>`, `registerUserSubscription(healthUserId: string): Promise<string>` (returns the new subscription's ID), `deleteUserSubscription(subscriptionId: string): Promise<void>`. Used by Task 7 (routes). The one-time project-level subscriber registration lives in the separate `scripts/registerHealthSubscriber.ts` (an ops script, not called from the request path).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/health/subscriber.test.ts
import nock from 'nock';
import * as serviceAccount from '../../src/health/serviceAccount';
import { getIdentity, registerUserSubscription, deleteUserSubscription } from '../../src/health/subscriber';

jest.mock('../../src/health/serviceAccount');

beforeAll(() => {
  process.env.GOOGLE_CLOUD_PROJECT_NUMBER = '92059865078';
});

afterEach(() => nock.cleanAll());

describe('getIdentity', () => {
  it('resolves healthUserId using the end-user access token', async () => {
    nock('https://health.googleapis.com')
      .get('/v4/users/me/identity')
      .reply(200, { name: 'users/me/identity', legacyUserId: 'DCB3ZG', healthUserId: '8512524441117254421' });

    const identity = await getIdentity('user-access-token');
    expect(identity).toEqual({ healthUserId: '8512524441117254421' });
  });
});

describe('registerUserSubscription', () => {
  it('creates a subscription using the service account token and returns its ID', async () => {
    (serviceAccount.getServiceAccountToken as jest.Mock).mockResolvedValue('sa-token');
    nock('https://health.googleapis.com')
      .post('/v4/projects/92059865078/subscribers/biometrics-subscriber/subscriptions')
      .reply(200, {
        name: 'projects/92059865078/subscribers/biometrics-subscriber/subscriptions/sub-abc-123',
        dataTypes: ['users/8512524441117254421/dataTypes/steps'],
        user: 'users/8512524441117254421',
      });

    const subscriptionId = await registerUserSubscription('8512524441117254421');
    expect(subscriptionId).toBe('sub-abc-123');
  });
});

describe('deleteUserSubscription', () => {
  it('deletes the subscription using the service account token', async () => {
    (serviceAccount.getServiceAccountToken as jest.Mock).mockResolvedValue('sa-token');
    const scope = nock('https://health.googleapis.com')
      .delete('/v4/projects/92059865078/subscribers/biometrics-subscriber/subscriptions/sub-abc-123')
      .reply(200, {});

    await deleteUserSubscription('sub-abc-123');
    expect(scope.isDone()).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/health/subscriber.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/health/subscriber.ts`**

```typescript
import fetch from 'node-fetch';
import { getServiceAccountToken } from './serviceAccount';

const SUBSCRIBER_ID = 'biometrics-subscriber';

function projectNumber(): string {
  const value = process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
  if (!value) throw new Error('GOOGLE_CLOUD_PROJECT_NUMBER is not set');
  return value;
}

interface IdentityResponse {
  name: string;
  legacyUserId: string;
  healthUserId: string;
}

export async function getIdentity(userAccessToken: string): Promise<{ healthUserId: string }> {
  const res = await fetch('https://health.googleapis.com/v4/users/me/identity', {
    headers: { Authorization: `Bearer ${userAccessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to resolve Google Health identity: ${res.status}`);
  }
  const json = (await res.json()) as IdentityResponse;
  return { healthUserId: json.healthUserId };
}

export async function registerUserSubscription(healthUserId: string): Promise<string> {
  const token = await getServiceAccountToken();
  const url = `https://health.googleapis.com/v4/projects/${projectNumber()}/subscribers/${SUBSCRIBER_ID}/subscriptions`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user: `users/${healthUserId}`,
      dataTypes: ['steps', 'sleep', 'heart-rate', 'heartRateVariability'],
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create Google Health subscription: ${res.status}`);
  }
  const json = (await res.json()) as { name: string };
  const parts = json.name.split('/');
  return parts[parts.length - 1];
}

export async function deleteUserSubscription(subscriptionId: string): Promise<void> {
  const token = await getServiceAccountToken();
  const url = `https://health.googleapis.com/v4/projects/${projectNumber()}/subscribers/${SUBSCRIBER_ID}/subscriptions/${subscriptionId}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to delete Google Health subscription: ${res.status}`);
  }
}
```

**Note on the `dataTypes` list in `registerUserSubscription`:** this plan's live verification only tested subscribing to `steps`. The subscriber (registered once, see below) must declare all four data types in its own `subscriberConfigs`, and this per-user subscription call requests all four — if any of `heart-rate`, `sleep`, or `heartRateVariability` turns out not to be a valid subscribable data type (only confirmed live for `steps`), this call will fail with an error naming the invalid type. Treat that as a signal to adjust this array, not a sign the whole approach is wrong.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/health/subscriber.test.ts`
Expected: PASS

- [ ] **Step 5: Write the one-time ops script `backend/scripts/registerHealthSubscriber.ts`**

```typescript
import fetch from 'node-fetch';
import { getServiceAccountToken } from '../src/health/serviceAccount';

const SUBSCRIBER_ID = 'biometrics-subscriber';

async function main() {
  const projectNumber = process.env.GOOGLE_CLOUD_PROJECT_NUMBER;
  const webhookUrl = process.env.GOOGLE_HEALTH_WEBHOOK_URL; // e.g. https://api.yourdomain.com/webhooks/health
  const webhookSecret = process.env.GOOGLE_HEALTH_WEBHOOK_SECRET; // e.g. "Bearer <random-value>"
  if (!projectNumber || !webhookUrl || !webhookSecret) {
    throw new Error('GOOGLE_CLOUD_PROJECT_NUMBER, GOOGLE_HEALTH_WEBHOOK_URL, and GOOGLE_HEALTH_WEBHOOK_SECRET must be set');
  }

  const token = await getServiceAccountToken();
  const res = await fetch(
    `https://health.googleapis.com/v4/projects/${projectNumber}/subscribers?subscriberId=${SUBSCRIBER_ID}`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        endpointUri: webhookUrl,
        endpointAuthorization: { secret: webhookSecret },
        subscriberConfigs: [
          { dataTypes: ['steps', 'sleep', 'heart-rate', 'heartRateVariability'], subscriptionCreatePolicy: 'MANUAL' },
        ],
      }),
    },
  );

  const body = await res.json();
  if (!res.ok) {
    console.error('Failed to register subscriber:', JSON.stringify(body, null, 2));
    process.exit(1);
  }
  console.log('Subscriber registered:', JSON.stringify(body, null, 2));
}

main();
```

This script is run manually, once, by an operator (e.g. `npx ts-node scripts/registerHealthSubscriber.ts`), never from the request path — registering the project-level subscriber is a one-time setup action, confirmed in the spec's live verification. Document this in the script's own comment.

- [ ] **Step 6: Commit**

```bash
git add src/health/subscriber.ts scripts/registerHealthSubscriber.ts tests/health/subscriber.test.ts
git commit -m "Add subscriber/subscription management and one-time subscriber registration script"
```

---

### Task 5: Health API client for fetching metric data

**Files:**
- Create: `backend/src/health/client.ts`
- Test: `backend/tests/health/client.test.ts`

**Interfaces:**
- Consumes: `BiometricMetricType`, `FitbitMetricPoint` from `../types` (the second may need renaming to `HealthMetricPoint` — check `types.ts` and rename consistently if so, keeping the shape `{ recordedAt: Date; value: number }`).
- Produces: `fetchMetricRange(accessToken: string, metricType: BiometricMetricType, startDate: string, endDate: string): Promise<HealthMetricPoint[]>` — same signature shape as Phase 1's Fitbit client, so `sync/worker.ts` (Task 7) needs minimal changes beyond the import path. Dates are `YYYY-MM-DD`.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/health/client.test.ts
import nock from 'nock';
import { fetchMetricRange } from '../../src/health/client';

afterEach(() => nock.cleanAll());

describe('fetchMetricRange', () => {
  it('fetches STEPS via dailyRollUp on parent "steps"', async () => {
    nock('https://health.googleapis.com')
      .post('/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp')
      .reply(200, {
        rollupDataPoints: [
          {
            civilStartTime: { date: { year: 2026, month: 9, day: 1 } },
            civilEndTime: { date: { year: 2026, month: 9, day: 2 } },
            steps: { countSum: '8123' },
          },
        ],
      });

    const points = await fetchMetricRange('token-1', 'STEPS', '2026-09-01', '2026-09-02');
    expect(points).toEqual([{ recordedAt: new Date('2026-09-01'), value: 8123 }]);
  });

  it('fetches RESTING_HR via dailyRollUp on parent "heart-rate" (kebab-case)', async () => {
    nock('https://health.googleapis.com')
      .post('/v4/users/me/dataTypes/heart-rate/dataPoints:dailyRollUp')
      .reply(200, {
        rollupDataPoints: [
          {
            civilStartTime: { date: { year: 2026, month: 9, day: 1 } },
            civilEndTime: { date: { year: 2026, month: 9, day: 2 } },
            heartRate: { beatsPerMinuteMin: 52, beatsPerMinuteMax: 140, beatsPerMinuteAvg: 78 },
          },
        ],
      });

    const points = await fetchMetricRange('token-1', 'RESTING_HR', '2026-09-01', '2026-09-02');
    expect(points).toEqual([{ recordedAt: new Date('2026-09-01'), value: 52 }]);
  });

  it('fetches SLEEP via dataPoints.list on "sleep" using minutesAsleep from the summary', async () => {
    nock('https://health.googleapis.com')
      .get('/v4/users/me/dataTypes/sleep/dataPoints')
      .query((q) => typeof q.filter === 'string' && q.filter.includes('sleep.interval.start_time'))
      .reply(200, {
        dataPoints: [
          {
            sleep: {
              interval: { startTime: '2026-09-01T22:00:00Z' },
              summary: { minutesAsleep: 415 },
            },
          },
        ],
      });

    const points = await fetchMetricRange('token-1', 'SLEEP', '2026-09-01', '2026-09-02');
    expect(points).toEqual([{ recordedAt: new Date('2026-09-01T22:00:00Z'), value: 415 }]);
  });

  it('fetches HRV via dataPoints.list on "heartRateVariability", taking the last sample of the range', async () => {
    nock('https://health.googleapis.com')
      .get('/v4/users/me/dataTypes/heartRateVariability/dataPoints')
      .query((q) => typeof q.filter === 'string' && q.filter.includes('heartRateVariability.sample_time.physical_time'))
      .reply(200, {
        dataPoints: [
          {
            heartRateVariability: {
              sampleTime: { physicalTime: '2026-09-01T06:00:00Z' },
              rootMeanSquareOfSuccessiveDifferencesMilliseconds: 38.2,
            },
          },
          {
            heartRateVariability: {
              sampleTime: { physicalTime: '2026-09-01T23:00:00Z' },
              rootMeanSquareOfSuccessiveDifferencesMilliseconds: 41.7,
            },
          },
        ],
      });

    const points = await fetchMetricRange('token-1', 'HRV', '2026-09-01', '2026-09-02');
    expect(points).toEqual([{ recordedAt: new Date('2026-09-01T23:00:00Z'), value: 41.7 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/health/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/health/client.ts`**

```typescript
import fetch from 'node-fetch';
import { BiometricMetricType } from '../types';

const BASE_URL = 'https://health.googleapis.com/v4';

export interface HealthMetricPoint {
  recordedAt: Date;
  value: number;
}

function parseDate(dateStr: string): { year: number; month: number; day: number } {
  const [year, month, day] = dateStr.split('-').map(Number);
  return { year, month, day };
}

async function dailyRollUp(
  accessToken: string,
  parentDataType: string,
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const res = await fetch(`${BASE_URL}/users/me/dataTypes/${parentDataType}/dataPoints:dailyRollUp`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      range: { start: { date: parseDate(startDate) }, end: { date: parseDate(endDate) } },
      windowSizeDays: 1,
    }),
  });
  if (!res.ok) {
    const err = new Error(`Google Health dailyRollUp returned ${res.status} for ${parentDataType}`);
    (err as any).status = res.status;
    throw err;
  }
  const json = (await res.json()) as { rollupDataPoints?: any[] };
  return json.rollupDataPoints ?? [];
}

async function listDataPoints(
  accessToken: string,
  dataType: string,
  filterField: 'interval.start_time' | 'sample_time.physical_time',
  startDate: string,
  endDate: string,
): Promise<any[]> {
  const filter = `${dataType}.${filterField} >= "${startDate}T00:00:00Z" AND ${dataType}.${filterField} < "${endDate}T00:00:00Z"`;
  const url = `${BASE_URL}/users/me/dataTypes/${dataType}/dataPoints?${new URLSearchParams({ filter }).toString()}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) {
    const err = new Error(`Google Health dataPoints.list returned ${res.status} for ${dataType}`);
    (err as any).status = res.status;
    throw err;
  }
  const json = (await res.json()) as { dataPoints?: any[] };
  return json.dataPoints ?? [];
}

function civilDateToDate(civil: { date: { year: number; month: number; day: number } }): Date {
  const { year, month, day } = civil.date;
  return new Date(Date.UTC(year, month - 1, day));
}

export async function fetchMetricRange(
  accessToken: string,
  metricType: BiometricMetricType,
  startDate: string,
  endDate: string,
): Promise<HealthMetricPoint[]> {
  switch (metricType) {
    case 'STEPS': {
      const rows = await dailyRollUp(accessToken, 'steps', startDate, endDate);
      return rows
        .filter((r) => r.steps?.countSum !== undefined)
        .map((r) => ({ recordedAt: civilDateToDate(r.civilStartTime), value: Number(r.steps.countSum) }));
    }
    case 'RESTING_HR': {
      const rows = await dailyRollUp(accessToken, 'heart-rate', startDate, endDate);
      return rows
        .filter((r) => r.heartRate?.beatsPerMinuteMin !== undefined)
        .map((r) => ({ recordedAt: civilDateToDate(r.civilStartTime), value: r.heartRate.beatsPerMinuteMin }));
    }
    case 'SLEEP': {
      const rows = await listDataPoints(accessToken, 'sleep', 'interval.start_time', startDate, endDate);
      return rows
        .filter((r) => r.sleep?.summary?.minutesAsleep !== undefined)
        .map((r) => ({
          recordedAt: new Date(r.sleep.interval.startTime),
          value: r.sleep.summary.minutesAsleep,
        }));
    }
    case 'HRV': {
      const rows = await listDataPoints(accessToken, 'heartRateVariability', 'sample_time.physical_time', startDate, endDate);
      const points = rows
        .filter((r) => r.heartRateVariability?.rootMeanSquareOfSuccessiveDifferencesMilliseconds !== undefined)
        .map((r) => ({
          recordedAt: new Date(r.heartRateVariability.sampleTime.physicalTime),
          value: r.heartRateVariability.rootMeanSquareOfSuccessiveDifferencesMilliseconds,
        }))
        .sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
      // Per the spec's decision: HRV is sample-based, possibly multiple readings per day.
      // Take the last sample as the day's representative value.
      return points.length > 0 ? [points[points.length - 1]] : [];
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/health/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/health/client.ts tests/health/client.test.ts
git commit -m "Add Google Health API client for fetching metric ranges"
```

---

### Task 6: Webhook verification

**Files:**
- Create: `backend/src/health/webhookVerify.ts`
- Test: `backend/tests/health/webhookVerify.test.ts`

**Interfaces:**
- Consumes: `GOOGLE_HEALTH_WEBHOOK_SECRET` env var (the exact string configured as `endpointAuthorization.secret` when the subscriber was registered, e.g. `"Bearer <random-value>"`).
- Produces: `isValidWebhookAuthorization(authorizationHeader: string | undefined): boolean`. Used by Task 7 (routes).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/health/webhookVerify.test.ts
import { isValidWebhookAuthorization } from '../../src/health/webhookVerify';

beforeAll(() => {
  process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = 'Bearer test-webhook-secret-8f3a9c2e1b';
});

describe('isValidWebhookAuthorization', () => {
  it('accepts the exact configured secret', () => {
    expect(isValidWebhookAuthorization('Bearer test-webhook-secret-8f3a9c2e1b')).toBe(true);
  });

  it('rejects a mismatched value', () => {
    expect(isValidWebhookAuthorization('Bearer wrong-secret')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(isValidWebhookAuthorization(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/health/webhookVerify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/health/webhookVerify.ts`**

```typescript
import { timingSafeEqual } from 'crypto';

export function isValidWebhookAuthorization(authorizationHeader: string | undefined): boolean {
  if (!authorizationHeader) return false;
  const expected = process.env.GOOGLE_HEALTH_WEBHOOK_SECRET;
  if (!expected) throw new Error('GOOGLE_HEALTH_WEBHOOK_SECRET is not set');

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(authorizationHeader);
  if (expectedBuf.length !== actualBuf.length) return false;
  return timingSafeEqual(expectedBuf, actualBuf);
}
```

(Uses `timingSafeEqual` even though this is a simpler check than Fitbit's HMAC — still a security-boundary string comparison, worth the same timing-attack protection at negligible cost.)

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/health/webhookVerify.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/health/webhookVerify.ts tests/health/webhookVerify.test.ts
git commit -m "Add Google Health webhook Authorization header verification"
```

---

### Task 7: Health connect and webhook routes

**Files:**
- Create: `backend/src/health/routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/health/routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `AuthedRequest` (from `../auth/middleware`, unchanged from Phase 1); `buildAuthorizeUrl`, `exchangeCodeForTokens` (Task 2); `getIdentity`, `registerUserSubscription`, `deleteUserSubscription` (Task 4); `isValidWebhookAuthorization` (Task 6); `encryptToken`, `decryptToken` (from `../crypto/tokenCipher`, unchanged); `enqueueFetchJob`, `enqueueBackfillJob` (from `../sync/queue`, unchanged); `prisma` (from `../db/client`, unchanged); the existing Redis-backed OAuth state-token mechanism from Phase 1's `/fitbit/authorize`/`/fitbit/callback` (same `connection` export from `../sync/queue`, same `oauth-state:` key prefix, same TTL) — this mechanism is provider-agnostic and carries over unchanged.
- Produces: mounts `GET /health/authorize`, `GET /health/callback`, `GET /webhooks/health`, `POST /webhooks/health` on the app.

- [ ] **Step 1: Read the current `backend/src/fitbit/routes.ts` in full**

This task ports that file's logic (state-token issuance/consumption, error handling structure, backfill-window calculation, disconnect handling) to the new provider. Read it first so the port preserves every hardened behavior from Phase 1's final review — do not simplify away the try/catch structure, the gap-scoped backfill logic, or the subscription-before-CONNECTED-write ordering.

- [ ] **Step 2: Write the failing test**

```typescript
// backend/tests/health/routes.test.ts
import request from 'supertest';
import { randomUUID, createHmac } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { issueSessionTokens } from '../../src/auth/jwt';
import * as oauth from '../../src/health/oauth';
import * as subscriber from '../../src/health/subscriber';
import * as queue from '../../src/sync/queue';

jest.mock('../../src/health/oauth');
jest.mock('../../src/health/subscriber');
jest.mock('../../src/sync/queue', () => {
  const actual = jest.requireActual('../../src/sync/queue');
  return {
    ...actual,
    enqueueFetchJob: jest.fn(),
    enqueueBackfillJob: jest.fn(),
  };
});

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  process.env.GOOGLE_HEALTH_WEBHOOK_SECRET = 'Bearer webhook-secret';
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /health/authorize', () => {
  it('requires auth and returns the Google authorize URL as JSON', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, authProvider: 'GOOGLE', providerUserId: randomUUID() },
    });
    const { accessToken } = await issueSessionTokens(user.id);
    (oauth.buildAuthorizeUrl as jest.Mock).mockReturnValue('https://accounts.google.com/o/oauth2/v2/auth?state=abc');

    const res = await request(createApp()).get('/health/authorize').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.url).toBe('https://accounts.google.com/o/oauth2/v2/auth?state=abc');
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(createApp()).get('/health/authorize');
    expect(res.status).toBe(401);
  });
});

describe('GET /health/callback', () => {
  it('succeeds with NO Authorization header, using the state token instead', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, authProvider: 'GOOGLE', providerUserId: randomUUID() },
    });
    const { accessToken } = await issueSessionTokens(user.id);
    (oauth.buildAuthorizeUrl as jest.Mock).mockImplementation((state: string) => `https://accounts.google.com/o/oauth2/v2/auth?state=${state}`);

    const authorizeRes = await request(createApp()).get('/health/authorize').set('Authorization', `Bearer ${accessToken}`);
    const state = new URL(authorizeRes.body.url).searchParams.get('state')!;

    (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
      accessToken: 'health-access', refreshToken: 'health-refresh', expiresIn: 3599,
    });
    (subscriber.getIdentity as jest.Mock).mockResolvedValue({ healthUserId: 'health-user-1' });
    (subscriber.registerUserSubscription as jest.Mock).mockResolvedValue('sub-1');

    const res = await request(createApp()).get('/health/callback').query({ code: 'auth-code', state });

    expect(res.status).toBe(302);
    const conn = await prisma.healthConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
    expect(conn?.healthUserId).toBe('health-user-1');
    expect(conn?.webhookSubscriptionId).toBe('sub-1');
  });

  it('rejects a missing or unknown state token', async () => {
    const res = await request(createApp()).get('/health/callback').query({ code: 'auth-code', state: 'unknown-state' });
    expect(res.status).toBe(401);
  });
});

describe('GET /webhooks/health', () => {
  it('returns 204 (no verification-challenge handshake needed for this provider)', async () => {
    // Google's subscriber verification is handled entirely by the automated
    // handshake during subscriber creation (see scripts/registerHealthSubscriber.ts),
    // not a per-request GET challenge like Fitbit's — this route exists only
    // in case Google ever sends a GET here, and returns a harmless 204.
    const res = await request(createApp()).get('/webhooks/health');
    expect(res.status).toBe(204);
  });
});

describe('POST /webhooks/health', () => {
  it('rejects a request with a bad or missing Authorization header', async () => {
    const res = await request(createApp())
      .post('/webhooks/health')
      .send([{ data: { healthUserId: 'health-user-1', dataType: 'steps', operation: 'UPSERT', intervals: [] } }]);
    expect(res.status).toBe(401);
    expect(queue.enqueueFetchJob).not.toHaveBeenCalled();
  });

  it('enqueues a fetch job for a valid UPSERT notification', async () => {
    const user = await prisma.user.create({
      data: { email: `h-${randomUUID()}@example.com`, authProvider: 'GOOGLE', providerUserId: randomUUID() },
    });
    await prisma.healthConnection.create({
      data: {
        userId: user.id,
        healthUserId: 'health-user-2',
        encryptedAccessToken: 'x',
        encryptedRefreshToken: 'x',
        tokenExpiresAt: new Date(Date.now() + 3600_000),
      },
    });

    const body = JSON.stringify([
      {
        data: {
          healthUserId: 'health-user-2',
          dataType: 'steps',
          operation: 'UPSERT',
          intervals: [{ physicalTimeInterval: { startTime: '2026-09-16T00:00:00Z', endTime: '2026-09-16T00:05:00Z' } }],
        },
      },
    ]);

    const res = await request(createApp())
      .post('/webhooks/health')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer webhook-secret')
      .send(body);

    expect(res.status).toBe(204);
    expect(queue.enqueueFetchJob).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id, metricType: 'STEPS', date: '2026-09-16' }),
    );
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/health/routes.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `backend/src/health/routes.ts`**

```typescript
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { buildAuthorizeUrl, exchangeCodeForTokens } from './oauth';
import { getIdentity, registerUserSubscription } from './subscriber';
import { isValidWebhookAuthorization } from './webhookVerify';
import { encryptToken } from '../crypto/tokenCipher';
import { enqueueBackfillJob, enqueueFetchJob } from '../sync/queue';
import { connection } from '../sync/queue';
import { prisma } from '../db/client';
import { BiometricMetricType } from '../types';

export const healthRouter = Router();

const OAUTH_STATE_TTL_SECONDS = 600;
const BACKFILL_WINDOW_DAYS = 30;

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

healthRouter.get('/health/authorize', requireAuth, async (req: AuthedRequest, res) => {
  const state = randomUUID();
  await connection.set(oauthStateKey(state), req.userId!, 'EX', OAUTH_STATE_TTL_SECONDS);
  res.json({ url: buildAuthorizeUrl(state) });
});

healthRouter.get('/health/callback', async (req, res) => {
  const state = req.query.state as string | undefined;
  if (!state) {
    res.status(400).json({ error: 'Missing state parameter' });
    return;
  }
  const userId = await connection.getdel(oauthStateKey(state));
  if (!userId) {
    res.status(401).json({ error: 'Invalid or expired state token' });
    return;
  }

  try {
    const code = req.query.code as string;
    const tokens = await exchangeCodeForTokens(code);
    const identity = await getIdentity(tokens.accessToken);

    const existing = await prisma.healthConnection.findUnique({ where: { userId } });

    try {
      const subscriptionId = await registerUserSubscription(identity.healthUserId);

      await prisma.healthConnection.upsert({
        where: { userId },
        update: {
          healthUserId: identity.healthUserId,
          encryptedAccessToken: encryptToken(tokens.accessToken),
          encryptedRefreshToken: encryptToken(tokens.refreshToken!),
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          webhookSubscriptionId: subscriptionId,
          status: 'CONNECTED',
        },
        create: {
          userId,
          healthUserId: identity.healthUserId,
          encryptedAccessToken: encryptToken(tokens.accessToken),
          encryptedRefreshToken: encryptToken(tokens.refreshToken!),
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
          webhookSubscriptionId: subscriptionId,
        },
      });

      const endDate = new Date();
      const startDate = existing?.lastSyncedAt
        ? existing.lastSyncedAt
        : new Date(endDate.getTime() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
      await enqueueBackfillJob({ userId, startDate: isoDate(startDate), endDate: isoDate(endDate) });
    } catch (err) {
      res.status(500).json({ error: 'Failed to complete Google Health connection' });
      return;
    }

    res.redirect('biometrics://health/callback?status=connected');
  } catch {
    res.status(500).json({ error: 'Failed to complete Google Health connection' });
  }
});

healthRouter.get('/webhooks/health', (_req, res) => {
  // Google's subscriber endpoint verification happens automatically during
  // subscriber creation (see scripts/registerHealthSubscriber.ts) via a
  // POST-based handshake, not a per-request GET challenge. This route
  // exists only as a harmless fallback.
  res.status(204).send();
});

interface HealthWebhookNotification {
  healthUserId: string;
  operation: string;
  dataType: string;
  intervals: { physicalTimeInterval: { startTime: string; endTime: string } }[];
}

healthRouter.post('/webhooks/health', async (req, res) => {
  const authHeader = req.headers['authorization'];
  if (!isValidWebhookAuthorization(authHeader)) {
    res.status(401).send();
    return;
  }

  try {
    const notifications = req.body as { data: HealthWebhookNotification }[];
    for (const { data } of notifications) {
      if (data.operation !== 'UPSERT') continue; // conservative: skip any non-UPSERT operation, per spec's note that DELETE was never observed live

      const metricType = WEBHOOK_DATA_TYPE_TO_METRIC[data.dataType];
      if (!metricType) continue;

      const conn = await prisma.healthConnection.findFirst({ where: { healthUserId: data.healthUserId } });
      if (!conn) continue;

      for (const interval of data.intervals) {
        const date = isoDate(new Date(interval.physicalTimeInterval.startTime));
        await enqueueFetchJob({ userId: conn.userId, metricType, date });
      }
    }
    res.status(204).send();
  } catch {
    res.status(500).send();
  }
});
```

Note: `prisma.healthConnection.findFirst({ where: { healthUserId } })` mirrors Phase 1's final `findUnique` pattern for `fitbitUserId` (which had a `@unique` constraint) — since `healthUserId` is also `@unique` on `HealthConnection` (Task 1), use `findUnique` instead of `findFirst` here for consistency with that established pattern:

```typescript
const conn = await prisma.healthConnection.findUnique({ where: { healthUserId: data.healthUserId } });
```

- [ ] **Step 5: Modify `backend/src/app.ts`**

Replace the `fitbitRouter` import/mount with `healthRouter`:

```typescript
import express, { Express } from 'express';
import { authRouter } from './auth/routes';
import { healthRouter } from './health/routes';
import { biometricsRouter } from './biometrics/routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.get('/health-check', (_req, res) => res.json({ status: 'ok' })); // renamed from /health to avoid clashing with the new /health/* route prefix
  app.use(authRouter);
  app.use(healthRouter);
  app.use(biometricsRouter);
  return app;
}
```

**Important naming collision to resolve:** Phase 1's health check endpoint was `GET /health` (from Task 1 of the original plan). This migration introduces routes under the `/health/*` prefix (`/health/authorize`, `/health/callback`), which do not collide with a bare `/health` path in Express's routing, but is confusing to read side by side. Rename the original health-check endpoint to `/health-check` in this step (as shown above) to avoid the ambiguity, and update `backend/tests/app.test.ts` to match:

```typescript
// backend/tests/app.test.ts — update the request path
const res = await request(app).get('/health-check');
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/health/routes.test.ts tests/app.test.ts`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/health/routes.ts src/app.ts tests/health/routes.test.ts tests/app.test.ts
git commit -m "Add Google Health connect and webhook routes, rename health-check endpoint"
```

---

### Task 8: Update sync worker and token refresh job

**Files:**
- Modify: `backend/src/sync/worker.ts`
- Modify: `backend/src/sync/tokenRefreshJob.ts`
- Modify: `backend/src/sync/queue.ts`
- Modify: `backend/tests/sync/worker.test.ts`
- Modify: `backend/tests/sync/tokenRefreshJob.test.ts`
- Modify: `backend/tests/sync/queue.test.ts`

**Interfaces:**
- Consumes: `fetchMetricRange` (Task 5, replaces the Fitbit client import), `refreshHealthTokens` (Task 2, replaces `refreshFitbitTokens`), `deleteUserSubscription` (Task 4 — not called by any task before this one; this task is where it gets its only caller).
- Produces: same exports as before (`processSyncJob`, `startSyncWorker`, `runTokenRefreshSweep`) — this task changes imports and the Prisma model referenced (`healthConnection` instead of `fitbitConnection`), not the public interface.

**Two behavioral changes beyond a mechanical rename** (both found by re-reading the current files against the new provider's actual behavior, not assumed from the old ones):

1. **Refresh tokens are not rotated by Google on an ordinary refresh call.** `HealthTokenResponse.refreshToken` (Task 2) is optional and will be `undefined` on every response from `refreshHealthTokens` in normal operation — unlike Fitbit, which issued a new refresh token on every refresh and required overwriting the stored one each time. The current `tokenRefreshJob.ts` unconditionally does `encryptedRefreshToken: encryptToken(tokens.refreshToken)` on every sweep; ported as-is, this calls `encryptToken(undefined)` and corrupts the stored refresh token on the very first sweep after this migration ships, silently breaking re-authentication for every connected user. The update must only touch `encryptedRefreshToken` when `tokens.refreshToken` is actually present.
2. **A disconnected connection's Google Health subscription must be deleted**, not just marked `DISCONNECTED` locally. Unlike Fitbit (where Phase 1 never needed to call out to Fitbit on disconnect), a Google Health subscription keeps sending webhook notifications for a `healthUserId` indefinitely until explicitly deleted via `deleteUserSubscription` (Task 4) — otherwise it's an orphaned resource that outlives the local connection record. Call `deleteUserSubscription` at each of the three places the code marks a connection `DISCONNECTED`, guarded by the presence of `webhookSubscriptionId`, and wrapped so a failure to delete the remote subscription never blocks the (more important) local status update.

- [ ] **Step 1: Read the current `backend/src/sync/worker.ts`, `backend/src/sync/tokenRefreshJob.ts`, and `backend/src/sync/queue.ts` in full**

Their control flow (401-detection, disconnect-on-failure, per-connection isolation in the refresh sweep, the narrowed catch from Phase 1's final review) stays the same shape — only the import source, the Prisma model name, the queue name, and the two behavioral changes above apply.

- [ ] **Step 2: Update `backend/tests/sync/worker.test.ts`**

Replace every `jest.mock('../../src/fitbit/client')` with `jest.mock('../../src/health/client')`, every `fitbitClient.fetchMetricRange` reference with `healthClient.fetchMetricRange`, and every `prisma.fitbitConnection` with `prisma.healthConnection` (including the field name `fitbitUserId` → `healthUserId` in test fixtures). Also mock `../../src/health/subscriber` and add a case asserting `deleteUserSubscription` is called with the connection's `webhookSubscriptionId` when a fetch or backfill job hits a 401:

```typescript
import * as subscriber from '../../src/health/subscriber';
jest.mock('../../src/health/subscriber');

it('deletes the Google Health subscription when a fetch job hits a 401', async () => {
  const user = await prisma.user.create({ data: { email: `w-${Date.now()}-401@example.com`, authProvider: 'GOOGLE', providerUserId: randomUUID() } });
  const conn = await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: 'health-user-401',
      encryptedAccessToken: 'x',
      encryptedRefreshToken: 'x',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      webhookSubscriptionId: 'sub-to-delete',
    },
  });
  (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
  (subscriber.deleteUserSubscription as jest.Mock).mockResolvedValue(undefined);

  await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as any);

  expect(subscriber.deleteUserSubscription).toHaveBeenCalledWith('sub-to-delete');
  const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
  expect(updated?.status).toBe('DISCONNECTED');
});

it('still marks the connection DISCONNECTED even if deleting the subscription fails', async () => {
  const user = await prisma.user.create({ data: { email: `w-${Date.now()}-402@example.com`, authProvider: 'GOOGLE', providerUserId: randomUUID() } });
  const conn = await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: 'health-user-402',
      encryptedAccessToken: 'x',
      encryptedRefreshToken: 'x',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      webhookSubscriptionId: 'sub-that-fails',
    },
  });
  (healthClient.fetchMetricRange as jest.Mock).mockRejectedValue(Object.assign(new Error('unauthorized'), { status: 401 }));
  (subscriber.deleteUserSubscription as jest.Mock).mockRejectedValue(new Error('network error'));

  await processSyncJob({ name: 'fetch', data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' } } as any);

  const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
  expect(updated?.status).toBe('DISCONNECTED');
});
```

Run to confirm RED (module/field not found) before proceeding.

- [ ] **Step 3: Update `backend/src/sync/worker.ts`**

```typescript
import { Job, Worker } from 'bullmq';
import { prisma } from '../db/client';
import { connection, TOKEN_REFRESH_SWEEP_JOB } from './queue';
import { runTokenRefreshSweep } from './tokenRefreshJob';
import { fetchMetricRange } from '../health/client';
import { deleteUserSubscription } from '../health/subscriber';
import { decryptToken } from '../crypto/tokenCipher';
import { upsertBiometricRecords } from '../biometrics/repository';
import { BiometricMetricType } from '../types';
import { FetchJobData, BackfillJobData } from './queue';

const ALL_METRIC_TYPES: BiometricMetricType[] = ['HRV', 'RESTING_HR', 'SLEEP', 'STEPS'];
const SYNC_WORKER_CONCURRENCY = 5;

async function disconnect(userId: string, webhookSubscriptionId: string | null): Promise<void> {
  await prisma.healthConnection.update({
    where: { userId },
    data: { status: 'DISCONNECTED' },
  });
  if (webhookSubscriptionId) {
    try {
      await deleteUserSubscription(webhookSubscriptionId);
    } catch (err) {
      console.error(`Failed to delete Google Health subscription ${webhookSubscriptionId}`, err);
    }
  }
}

async function handleFetchJob(data: FetchJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  try {
    const accessToken = decryptToken(conn.encryptedAccessToken);
    const points = await fetchMetricRange(accessToken, data.metricType, data.date, data.date);
    await upsertBiometricRecords(data.userId, data.metricType, points);
    await prisma.healthConnection.update({
      where: { userId: data.userId },
      data: { lastSyncedAt: new Date() },
    });
  } catch (err) {
    if ((err as any).status === 401) {
      await disconnect(data.userId, conn.webhookSubscriptionId);
      return;
    }
    throw err; // other errors (e.g. 429) are retried by BullMQ's job retry policy
  }
}

async function handleBackfillJob(data: BackfillJobData): Promise<void> {
  const conn = await prisma.healthConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  try {
    const accessToken = decryptToken(conn.encryptedAccessToken);
    for (const metricType of ALL_METRIC_TYPES) {
      const points = await fetchMetricRange(accessToken, metricType, data.startDate, data.endDate);
      await upsertBiometricRecords(data.userId, metricType, points);
    }
    await prisma.healthConnection.update({ where: { userId: data.userId }, data: { lastSyncedAt: new Date() } });
  } catch (err) {
    if ((err as any).status === 401) {
      await disconnect(data.userId, conn.webhookSubscriptionId);
      return;
    }
    throw err; // other errors (e.g. 429) are retried by BullMQ's job retry policy
  }
}

export async function processSyncJob(job: Job): Promise<void> {
  if (job.name === 'fetch') {
    await handleFetchJob(job.data as FetchJobData);
  } else if (job.name === 'backfill') {
    await handleBackfillJob(job.data as BackfillJobData);
  } else if (job.name === TOKEN_REFRESH_SWEEP_JOB) {
    // Scheduled through the queue so exactly one instance sweeps per tick.
    await runTokenRefreshSweep();
  }
}

export function startSyncWorker(): Worker {
  return new Worker('health-sync', processSyncJob, {
    connection,
    concurrency: SYNC_WORKER_CONCURRENCY,
  });
}
```

- [ ] **Step 4: Run worker tests to verify GREEN**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/sync/worker.test.ts`
Expected: PASS

- [ ] **Step 5: Update `backend/tests/sync/tokenRefreshJob.test.ts`**

Same rename pattern as Step 2 (`jest.mock('../../src/fitbit/oauth')` → `jest.mock('../../src/health/oauth')`, `refreshFitbitTokens` → `refreshHealthTokens`, `prisma.fitbitConnection` → `prisma.healthConnection`), plus a case for the no-rotation behavior:

```typescript
it('does not overwrite the stored refresh token when Google does not return a new one', async () => {
  const user = await prisma.user.create({ data: { email: `t-${Date.now()}-norefresh@example.com`, authProvider: 'GOOGLE', providerUserId: randomUUID() } });
  const conn = await prisma.healthConnection.create({
    data: {
      userId: user.id,
      healthUserId: 'health-user-norefresh',
      encryptedAccessToken: 'old-access',
      encryptedRefreshToken: encryptToken('original-refresh-token'),
      tokenExpiresAt: new Date(Date.now() - 1000),
    },
  });
  (oauth.refreshHealthTokens as jest.Mock).mockResolvedValue({ accessToken: 'new-access', expiresIn: 3599 });

  await runTokenRefreshSweep();

  const updated = await prisma.healthConnection.findUnique({ where: { id: conn.id } });
  expect(decryptToken(updated!.encryptedRefreshToken)).toBe('original-refresh-token');
  expect(decryptToken(updated!.encryptedAccessToken)).toBe('new-access');
});
```

Run to confirm RED before proceeding.

- [ ] **Step 6: Update `backend/src/sync/tokenRefreshJob.ts`**

```typescript
import { prisma } from '../db/client';
import { refreshHealthTokens } from '../health/oauth';
import { encryptToken, decryptToken } from '../crypto/tokenCipher';

const REFRESH_LOOKAHEAD_MS = 60 * 60 * 1000; // refresh anything expiring within the next hour

export async function runTokenRefreshSweep(): Promise<void> {
  const expiringSoon = await prisma.healthConnection.findMany({
    where: {
      status: 'CONNECTED',
      tokenExpiresAt: { lt: new Date(Date.now() + REFRESH_LOOKAHEAD_MS) },
    },
  });

  for (const conn of expiringSoon) {
    // Only a failure of the refresh itself means the connection is genuinely
    // dead. A failure of the DB write afterwards is a transient infrastructure
    // problem and must not disconnect a perfectly healthy connection.
    let tokens;
    try {
      const refreshToken = decryptToken(conn.encryptedRefreshToken);
      tokens = await refreshHealthTokens(refreshToken);
    } catch (err) {
      console.error(`Google Health token refresh failed for connection ${conn.id}`, err);
      await prisma.healthConnection.update({
        where: { id: conn.id },
        data: { status: 'DISCONNECTED' },
      });
      continue;
    }

    try {
      // Google does not return a new refresh_token on an ordinary refresh
      // call — only exchangeCodeForTokens does. Overwriting a present
      // encryptedRefreshToken with an absent one would destroy the only
      // credential capable of any future refresh, so only touch it when
      // Google actually sent one.
      const updateData: { encryptedAccessToken: string; tokenExpiresAt: Date; encryptedRefreshToken?: string } = {
        encryptedAccessToken: encryptToken(tokens.accessToken),
        tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      };
      if (tokens.refreshToken) {
        updateData.encryptedRefreshToken = encryptToken(tokens.refreshToken);
      }
      await prisma.healthConnection.update({
        where: { id: conn.id },
        data: updateData,
      });
    } catch (err) {
      // The refresh succeeded, so the connection is fine; surface the write
      // failure instead of silently marking the user disconnected.
      console.error(`Failed to persist refreshed Google Health tokens for connection ${conn.id}`, err);
      throw err;
    }
  }
}
```

- [ ] **Step 7: Run token refresh job tests to verify GREEN**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/sync/tokenRefreshJob.test.ts`
Expected: PASS

- [ ] **Step 8: Update `backend/src/sync/queue.ts` and `backend/tests/sync/queue.test.ts`**

In `queue.ts`, rename the BullMQ queue and correct the doc comment (Google Health refresh tokens are not single-use the way Fitbit's were — the real reason to schedule the sweep through the queue rather than a per-process `setInterval` is to avoid every backend instance redundantly refreshing the same connection and fanning out rate-limited calls to Google, not to avoid racing a rotating token):

```typescript
export const syncQueue = new Queue('health-sync', { connection });
```

```typescript
/**
 * Schedules the token refresh sweep as a repeatable queue job rather than a
 * per-process setInterval. Without this, every backend instance would sweep
 * independently, sending redundant refresh calls to Google for the same
 * connections and fanning out avoidable rate-limited requests. BullMQ hands
 * each scheduled execution to exactly one worker across all processes.
 * Registration is idempotent: re-registering the same job id just updates
 * the existing schedule.
 */
```

In `queue.test.ts`, update the comment above the scheduler test (currently referencing "single-use Fitbit refresh token") to match:

```typescript
  // Scheduling the sweep on the queue (rather than a per-process setInterval)
  // is what keeps several backend instances from redundantly refreshing the
  // same connection and fanning out avoidable rate-limited calls to Google.
```

- [ ] **Step 9: Run the full sync test suite to verify GREEN**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/sync/`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add src/sync/worker.ts src/sync/tokenRefreshJob.ts src/sync/queue.ts tests/sync/worker.test.ts tests/sync/tokenRefreshJob.test.ts tests/sync/queue.test.ts
git commit -m "Point sync worker and token refresh job at Google Health API, fix refresh-token rotation assumption, clean up subscriptions on disconnect"
```

---

### Task 9: Update biometrics connection endpoint, rename shared type, delete old Fitbit files

**Files:**
- Modify: `backend/src/biometrics/routes.ts`
- Modify: `backend/src/biometrics/repository.ts`
- Modify: `backend/src/types.ts`
- Modify: `backend/src/health/client.ts` (Task 5, already committed — switch from a local duplicate interface to importing the renamed shared type)
- Modify: `backend/tests/biometrics/routes.test.ts`
- Delete: `backend/src/fitbit/` (entire directory)
- Delete: `backend/tests/fitbit/` (entire directory)

**Interfaces:**
- Produces: `GET /me/connection` returns the same `{status, lastSyncedAt}` shape as Phase 1, now reading `HealthConnection` instead of `FitbitConnection`. `types.ts` exports `HealthMetricPoint` (renamed from `FitbitMetricPoint`) — the single shared `{recordedAt: Date; value: number}` shape, replacing the local duplicate `HealthMetricPoint` interface Task 5 defined in `client.ts` when it correctly avoided touching this out-of-scope file.

**Note on this task's added scope:** Task 5 built `backend/src/health/client.ts` and, per its own brief, correctly left `types.ts`'s `FitbitMetricPoint` untouched as out-of-scope (still consumed by `biometrics/repository.ts` and the soon-to-be-deleted `fitbit/client.ts`). That created a temporary duplicate: `client.ts`'s local `HealthMetricPoint` interface and `types.ts`'s `FitbitMetricPoint` are structurally identical and both compile fine today, but `FitbitMetricPoint` is leftover Fitbit-specific naming that Step 5's grep below would otherwise catch. This task is the right place to resolve it, since it already touches `repository.ts`'s only other consumer and deletes `fitbit/client.ts`.

- [ ] **Step 1: Update `backend/src/biometrics/routes.ts`**

Replace `prisma.fitbitConnection` with `prisma.healthConnection` in the `/me/connection` handler. No other logic changes.

- [ ] **Step 2: Rename `FitbitMetricPoint` to `HealthMetricPoint` in `backend/src/types.ts`**

```typescript
export interface HealthMetricPoint {
  recordedAt: Date;
  value: number;
}
```

- [ ] **Step 3: Update `backend/src/biometrics/repository.ts`**

```typescript
import { prisma } from '../db/client';
import { BiometricMetricType, HealthMetricPoint } from '../types';

export async function upsertBiometricRecords(
  userId: string,
  metricType: BiometricMetricType,
  points: HealthMetricPoint[],
): Promise<void> {
```

(The rest of the function body is unchanged.)

- [ ] **Step 4: Update `backend/src/health/client.ts` to import the shared type instead of declaring its own**

Remove the local interface:
```typescript
export interface HealthMetricPoint {
  recordedAt: Date;
  value: number;
}
```

Replace the `import { BiometricMetricType } from '../types';` line with:
```typescript
import { BiometricMetricType, HealthMetricPoint } from '../types';
```

Every other reference to `HealthMetricPoint` in `client.ts` (the function return type, the internal `.map()` calls) stays exactly as it is — only the type's origin changes, from a local declaration to an import. Re-run `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/health/client.test.ts` and confirm it still passes unchanged — this step is a pure type-source change with no behavioral difference.

- [ ] **Step 5: Update `backend/tests/biometrics/routes.test.ts`**

Replace `prisma.fitbitConnection.create(...)` fixtures with `prisma.healthConnection.create(...)`, using `healthUserId` instead of `fitbitUserId` in the seed data.

- [ ] **Step 6: Run tests to verify GREEN**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/biometrics/ tests/health/client.test.ts`
Expected: PASS

- [ ] **Step 7: Delete the old Fitbit source and test directories**

```bash
rm -rf src/fitbit tests/fitbit
```

- [ ] **Step 8: Grep for any remaining references to confirm nothing else imports the deleted files or the old type name**

```bash
grep -rn "fitbit\|FitbitMetricPoint" src/ tests/ --include="*.ts" -i
```

Expected: no output (or only comments/strings that are intentionally historical, e.g. in this plan's own commit messages — not in source code). Fix any remaining import that breaks.

- [ ] **Step 9: Run the full backend suite**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest -- --forceExit`
Expected: all passing, no leftover references. (`--forceExit` needed for a full-suite run per the pre-existing open-handle issue noted in this project's SDD ledger — targeted runs in earlier steps don't need it.)

- [ ] **Step 10: Commit**

```bash
git add -A src/fitbit src/biometrics/routes.ts src/biometrics/repository.ts src/types.ts src/health/client.ts tests/fitbit tests/biometrics/routes.test.ts
git commit -m "Remove Fitbit source and tests, rename shared metric-point type, update biometrics connection endpoint"
```

---

### Task 10: Rewrite the end-to-end integration test

**Files:**
- Modify: `backend/tests/integration/connectAndSync.test.ts`

**Interfaces:**
- Consumes: everything built in Tasks 1-9.
- Produces: an end-to-end test exercising connect → backfill → DB write → `/me/biometrics` response, mocking only Google's HTTP endpoints via `nock`, matching Phase 1's integration test's shape but against the new provider.

- [ ] **Step 1: Read the current integration test in full**

This task ports its structure (real Express app, real Postgres, real `processSyncJob`, only external HTTP mocked) — not a rewrite from scratch.

- [ ] **Step 2: Rewrite the test**

Replace the Fitbit-specific `nock` interceptors with Google's real confirmed endpoints:

```typescript
// backend/tests/integration/connectAndSync.test.ts
import request from 'supertest';
import nock from 'nock';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { issueSessionTokens } from '../../src/auth/jwt';
import { processSyncJob } from '../../src/sync/worker';
import * as queue from '../../src/sync/queue';

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');
  process.env.GOOGLE_HEALTH_CLIENT_ID = 'client-id.apps.googleusercontent.com';
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = 'client-secret';
  process.env.GOOGLE_HEALTH_REDIRECT_URI = 'https://app.example.com/health/callback';
  process.env.GOOGLE_CLOUD_PROJECT_NUMBER = '92059865078';
});

afterEach(() => nock.cleanAll());
afterAll(async () => {
  await prisma.$disconnect();
});

describe('connect Google Health and sync end to end (mocked Google API)', () => {
  it('connects, backfills, and serves data via /me/biometrics', async () => {
    const { randomUUID } = require('crypto');
    const user = await prisma.user.create({
      data: { email: `e2e-${Date.now()}@example.com`, authProvider: 'GOOGLE', providerUserId: randomUUID() },
    });
    const { accessToken } = await issueSessionTokens(user.id);

    const authorizeRes = await request(createApp()).get('/health/authorize').set('Authorization', `Bearer ${accessToken}`);
    const state = new URL(authorizeRes.body.url).searchParams.get('state')!;

    nock('https://oauth2.googleapis.com').post('/token').reply(200, {
      access_token: 'health-access', refresh_token: 'health-refresh', expires_in: 3599,
    });
    nock('https://health.googleapis.com').get('/v4/users/me/identity').reply(200, {
      name: 'users/me/identity', legacyUserId: 'DCB3ZG', healthUserId: 'health-user-e2e',
    });
    nock('https://health.googleapis.com')
      .post('/v4/projects/92059865078/subscribers/biometrics-subscriber/subscriptions')
      .reply(200, { name: 'projects/92059865078/subscribers/biometrics-subscriber/subscriptions/sub-e2e' });

    let enqueuedBackfill: any;
    jest.spyOn(queue, 'enqueueBackfillJob').mockImplementation(async (data) => {
      enqueuedBackfill = data;
      return {} as any;
    });

    const connectRes = await request(createApp()).get('/health/callback').query({ code: 'auth-code', state });
    expect(connectRes.status).toBe(302);

    nock('https://health.googleapis.com')
      .post('/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp')
      .reply(200, {
        rollupDataPoints: [{ civilStartTime: { date: { year: 2026, month: 9, day: 1 } }, steps: { countSum: '7000' } }],
      });
    nock('https://health.googleapis.com')
      .post('/v4/users/me/dataTypes/heart-rate/dataPoints:dailyRollUp')
      .reply(200, {
        rollupDataPoints: [{ civilStartTime: { date: { year: 2026, month: 9, day: 1 } }, heartRate: { beatsPerMinuteMin: 55 } }],
      });
    nock('https://health.googleapis.com')
      .get('/v4/users/me/dataTypes/sleep/dataPoints')
      .query(true)
      .reply(200, {
        dataPoints: [{ sleep: { interval: { startTime: '2026-09-01T22:00:00Z' }, summary: { minutesAsleep: 400 } } }],
      });
    nock('https://health.googleapis.com')
      .get('/v4/users/me/dataTypes/heartRateVariability/dataPoints')
      .query(true)
      .reply(200, {
        dataPoints: [{ heartRateVariability: { sampleTime: { physicalTime: '2026-09-01T23:00:00Z' }, rootMeanSquareOfSuccessiveDifferencesMilliseconds: 40 } }],
      });

    await processSyncJob({ name: 'backfill', data: enqueuedBackfill } as any);

    const res = await request(createApp()).get('/me/biometrics').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 3: Run to verify it fails, then fix wiring gaps until it passes**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest tests/integration/connectAndSync.test.ts`
Expected: any failure here is a real wiring bug — fix the underlying code, don't weaken the test.

- [ ] **Step 4: Run the full backend suite**

Run: `cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest`
Expected: all passing.

- [ ] **Step 5: Commit**

```bash
git add tests/integration/connectAndSync.test.ts
git commit -m "Rewrite end-to-end integration test for Google Health API"
```

---

### Task 11: Mobile screen rename

**Files:**
- Rename: `mobile/src/screens/ConnectFitbitScreen.tsx` → `mobile/src/screens/ConnectHealthScreen.tsx`
- Rename: `mobile/__tests__/screens/ConnectFitbitScreen.test.tsx` → `mobile/__tests__/screens/ConnectHealthScreen.test.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`

**Interfaces:**
- Produces: `ConnectHealthScreen` component (same behavior/structure as `ConnectFitbitScreen` — calls `apiFetch('/health/authorize')` instead of `/fitbit/authorize`, opens the returned URL, listens for the `biometrics://health/callback` redirect instead of `biometrics://fitbit/callback`).

- [ ] **Step 1: Read the current `ConnectFitbitScreen.tsx` and its test in full**

- [ ] **Step 2: Create `mobile/src/screens/ConnectHealthScreen.tsx`**

Same structure as the original, with these changes: component renamed to `ConnectHealthScreen`, the `apiFetch` call targets `/health/authorize`, the deep-link redirect URI check looks for `biometrics://health/callback`, and any visible copy ("Connect your Fitbit") updated to "Connect your Google Health" (or similar — match the app's actual button copy elsewhere).

```typescript
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';
import { apiFetch } from '../api/client';

const REDIRECT_URI = 'biometrics://health/callback';

export function ConnectHealthScreen() {
  const navigation = useNavigation<any>();

  async function handleConnect() {
    const { url } = await apiFetch<{ url: string }>('/health/authorize');
    const result = await WebBrowser.openAuthSessionAsync(url, REDIRECT_URI);
    if (result.type === 'success' && result.url.includes('status=connected')) {
      navigation.navigate('Dashboard');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect your Google Health</Text>
      <Pressable testID="connect-health-button" style={styles.button} onPress={handleConnect}>
        <Text style={styles.buttonText}>Connect Google Health</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  title: { fontSize: 20, fontWeight: '600' },
  button: { backgroundColor: '#00b0b9', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16 },
});
```

- [ ] **Step 3: Create `mobile/__tests__/screens/ConnectHealthScreen.test.tsx`**

Same structure as the original test, renamed, asserting against `/health/authorize` and the `biometrics://health/callback` redirect check:

```typescript
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { ConnectHealthScreen } from '../../src/screens/ConnectHealthScreen';
import { apiFetch } from '../../src/api/client';

jest.mock('expo-web-browser');
jest.mock('../../src/api/client');

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate }),
}));

describe('ConnectHealthScreen', () => {
  it('fetches the authorize URL and navigates to Dashboard on success', async () => {
    (apiFetch as jest.Mock).mockResolvedValue({ url: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc' });
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'biometrics://health/callback?status=connected',
    });

    const { getByTestId } = render(<ConnectHealthScreen />);
    fireEvent.press(getByTestId('connect-health-button'));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('Dashboard'));
    expect(apiFetch).toHaveBeenCalledWith('/health/authorize');
    expect(WebBrowser.openAuthSessionAsync).toHaveBeenCalledWith(
      'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
      'biometrics://health/callback',
    );
  });
});
```

- [ ] **Step 4: Delete the old files**

```bash
cd mobile
rm src/screens/ConnectFitbitScreen.tsx __tests__/screens/ConnectFitbitScreen.test.tsx
```

- [ ] **Step 5: Update `mobile/src/navigation/RootNavigator.tsx`**

Replace the `ConnectFitbitScreen` import and `Stack.Screen` component reference with `ConnectHealthScreen`, and rename the route name from `'ConnectFitbit'` to `'ConnectHealth'` throughout the file (the `RootStackParamList` type, the `initialRouteName` logic, and the `Stack.Screen name="..."` prop) — check every call site in this file that references the old route name, including the connection-status-based initial-route logic from Phase 1's final review.

- [ ] **Step 6: Run the full mobile suite**

Run: `cd mobile && npx jest`
Expected: all passing.

- [ ] **Step 7: Commit**

```bash
git add -A src/screens/ConnectHealthScreen.tsx __tests__/screens/ConnectHealthScreen.test.tsx src/navigation/RootNavigator.tsx
git commit -m "Rename Connect Fitbit screen to Connect Health screen"
```

---

### Task 12: Dockerfile updates and final regression pass

**Files:**
- Modify: `backend/Dockerfile`
- Modify: `backend/.dockerignore` (if it excludes anything Fitbit-named)

**Interfaces:** none — this is a hygiene/deployment-readiness pass, not a new interface.

- [ ] **Step 1: Update `backend/Dockerfile`**

Add a comment documenting the new required environment variables and the service account key file requirement (the running container needs `GOOGLE_APPLICATION_CREDENTIALS` pointing at a mounted service account key, in addition to the existing env vars):

```dockerfile
# Required at runtime: DATABASE_URL, REDIS_URL, JWT_ACCESS_SECRET, JWT_REFRESH_SECRET,
# TOKEN_ENCRYPTION_KEY, GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET,
# GOOGLE_HEALTH_REDIRECT_URI, GOOGLE_HEALTH_WEBHOOK_SECRET, GOOGLE_CLOUD_PROJECT_NUMBER,
# GOOGLE_APPLICATION_CREDENTIALS (path to a mounted service account key file),
# GOOGLE_CLIENT_ID, APPLE_BUNDLE_ID.
```

Place this comment near the top of the file, after the existing `FROM` lines. No other Dockerfile changes are needed — the runtime stage already copies `node_modules` (which includes `google-auth-library`, already a Phase 1 dependency) and doesn't need to know about the service account key's contents, only its mounted path at runtime.

- [ ] **Step 2: Full-repository grep for leftover "fitbit" references**

```bash
grep -rniI "fitbit" backend/src backend/tests backend/prisma mobile/src mobile/__tests__ backend/.env.example backend/Dockerfile 2>/dev/null
```

Expected: no output. If anything remains, fix it — this is the final confirmation that the migration is complete, not partial.

- [ ] **Step 3: Run both full test suites one more time**

```bash
cd backend && DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx jest
cd ../mobile && npx jest
```

Expected: both fully passing.

- [ ] **Step 4: Commit**

```bash
cd backend
git add Dockerfile
git commit -m "Document Google Health env vars in Dockerfile, confirm no leftover Fitbit references"
```

---

## Out of Scope for This Plan

- **Registering the real production Google Cloud service account and running `scripts/registerHealthSubscriber.ts` against production infrastructure** is an operator action performed once, outside this plan's task set (the script itself is built and tested here; running it against a real deployed webhook URL is a deployment step, not a coding task).
- **The CASA security assessment for Restricted-scope verification** (see the spec's Launch-Critical Risk section) is a business/compliance process with real cost and no guaranteed timeline — entirely outside engineering scope.
- **ECDSA signature verification of the `GOOGLE-HEALTH-API-SIGNATURE` header** is explicitly deferred — the public-key distribution mechanism is undocumented anywhere Google publishes (confirmed via exhaustive search during spec verification). Revisit once that mechanism is found; ship with Authorization-header verification only for now.
- **A device-testing pass equivalent to Phase 1's Task 19** (real Fitbit-via-Google-Health OAuth consent, real webhook delivery, visual confirmation on a device) should follow this plan's completion, mirroring how Phase 1 required manual verification before being considered fully done.
