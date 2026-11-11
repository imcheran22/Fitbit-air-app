# Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a working, multi-user pipe from Fitbit → backend → mobile app: sign-in, Fitbit OAuth connection, automatic webhook-driven sync of biometric data, and a minimal dashboard that displays it.

**Architecture:** A Node.js/TypeScript Express API (deployed to AWS ECS Fargate, backed by AWS RDS Postgres via Prisma) handles auth, Fitbit OAuth, webhook receipt, and a BullMQ/Redis-backed sync queue that fetches and stores biometric data. A React Native (Expo) app consumes this API for sign-in, connecting Fitbit, and viewing synced data.

**Tech Stack:** Node.js 20, TypeScript, Express 4, Prisma 5 (Postgres), BullMQ 5 + ioredis, `node-fetch` (not global `fetch` — see Task 6 note), `jsonwebtoken`, `jose` (Apple JWKS), `google-auth-library`, Jest + ts-jest + supertest + nock for backend tests; React Native + Expo (SDK 51), React Navigation, `expo-apple-authentication`, `expo-auth-session` (Google), `expo-web-browser`, `expo-secure-store`, Jest + jest-expo + `@testing-library/react-native` for mobile tests.

**Spec:** `docs/superpowers/specs/2026-09-15-phase1-foundation-design.md`

## Global Constraints

- Backend is Node.js/TypeScript, built to run as a persistent container (AWS ECS Fargate) — no Lambda-style handler exports.
- Database is Postgres (AWS RDS in production; local/CI Postgres for dev and tests) accessed via Prisma.
- Mobile app is React Native + Expo, targeting iOS and Android from one codebase.
- Auth providers are Apple and Google only.
- Session tokens: 15-minute access token + longer-lived refresh token; refresh tokens are revocable server-side (sign-out must invalidate them, not just discard client-side).
- Fitbit OAuth tokens are encrypted at rest (AES-256-GCM), not protected by DB access control alone.
- The Fitbit webhook endpoint must handle both the one-time GET verification challenge and ongoing POST notifications.
- Webhook notification payloads carry only collection type + date, never metric values — values are always fetched via a separate authenticated Fitbit API call.
- Initial backfill pulls the last 30 days on first connect; reconnect triggers a backfill scoped to the gap since the last sync, not a full 30-day repull.
- `BiometricRecord` rows are never deleted when a Fitbit connection is disconnected; only new writes stop.
- All Fitbit API calls happen through the sync worker queue (BullMQ/Redis), never inline from the webhook handler — this bounds concurrent outbound Fitbit requests.
- No polling fallback for sync in this phase — webhook-only, an accepted risk per the spec.
- Supported metric types are exactly: HRV, resting heart rate, sleep, steps. No other metrics or wearables.

---

## File Structure

**Backend** (`backend/`):
```
backend/
  package.json, tsconfig.json, jest.config.js, .env.example
  prisma/schema.prisma
  src/
    types.ts                    # shared TS types
    config/env.ts                # validated env vars
    db/client.ts                  # Prisma client singleton
    crypto/tokenCipher.ts          # AES-256-GCM encrypt/decrypt
    auth/
      jwt.ts                      # session token issue/verify/refresh/revoke
      appleAuth.ts                 # verify Apple identity token
      googleAuth.ts                 # verify Google ID token
      middleware.ts                  # requireAuth
      routes.ts                       # /auth/* routes
    fitbit/
      oauth.ts                     # authorize URL + code/refresh token exchange
      client.ts                     # fetchMetricRange against Fitbit API
      webhookVerify.ts               # GET challenge + POST signature verification
      subscription.ts                # register webhook subscription
      routes.ts                      # /fitbit/* + /webhooks/fitbit routes
    sync/
      queue.ts                     # BullMQ queue + enqueue helpers
      worker.ts                     # job processor (fetch + backfill)
      tokenRefreshJob.ts             # scheduled proactive token refresh
    biometrics/
      repository.ts                 # BiometricRecord reads/writes
      routes.ts                      # GET /me/biometrics
    users/
      repository.ts                 # User + FitbitConnection reads/writes
    app.ts                         # assembles Express app
    server.ts                      # entrypoint: http server + worker + cron
  tests/
    setupTestDb.ts
    crypto/tokenCipher.test.ts
    auth/jwt.test.ts
    auth/appleAuth.test.ts
    auth/googleAuth.test.ts
    auth/routes.test.ts
    fitbit/oauth.test.ts
    fitbit/client.test.ts
    fitbit/webhookVerify.test.ts
    fitbit/subscription.test.ts
    fitbit/routes.test.ts
    sync/queue.test.ts
    sync/worker.test.ts
    sync/tokenRefreshJob.test.ts
    biometrics/routes.test.ts
    integration/connectAndSync.test.ts
```

**Mobile** (`mobile/`):
```
mobile/
  package.json, app.json, tsconfig.json, jest.config.js
  App.tsx
  src/
    api/client.ts                 # fetch wrapper: attaches/refreshes session token
    auth/AuthContext.tsx            # session state, sign-in/out
    navigation/RootNavigator.tsx
    screens/
      SignInScreen.tsx
      ConnectFitbitScreen.tsx
      DashboardScreen.tsx
  __tests__/
    api/client.test.tsx
    auth/AuthContext.test.tsx
    screens/SignInScreen.test.tsx
    screens/ConnectFitbitScreen.test.tsx
    screens/DashboardScreen.test.tsx
```

---

### Task 1: Backend scaffolding, shared types, and health check

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`, `backend/jest.config.js`, `backend/.env.example`
- Create: `backend/src/types.ts`
- Create: `backend/src/app.ts`
- Create: `backend/src/server.ts`
- Test: `backend/tests/app.test.ts`

**Interfaces:**
- Produces: `AuthProvider`, `FitbitConnectionStatus`, `BiometricMetricType`, `SessionTokens`, `FitbitTokenResponse`, `FitbitMetricPoint` types (used by every later task); `createApp(): Express` function.

- [ ] **Step 1: Initialize the backend project**

```bash
mkdir -p backend/src backend/tests
cd backend
npm init -y
npm install express
npm install -D typescript ts-node @types/node @types/express jest ts-jest @types/jest supertest @types/supertest
npx tsc --init --rootDir src --outDir dist --target ES2022 --module commonjs --esModuleInterop --strict --skipLibCheck
```

- [ ] **Step 2: Write `backend/jest.config.js`**

```js
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
};
```

- [ ] **Step 3: Write `backend/.env.example`**

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/biometrics
REDIS_URL=redis://localhost:6379
JWT_ACCESS_SECRET=change-me
JWT_REFRESH_SECRET=change-me-too
TOKEN_ENCRYPTION_KEY=base64:change-me-32-bytes
FITBIT_CLIENT_ID=
FITBIT_CLIENT_SECRET=
FITBIT_REDIRECT_URI=http://localhost:3000/fitbit/callback
FITBIT_VERIFY_CODE=
GOOGLE_CLIENT_ID=
APPLE_BUNDLE_ID=
PORT=3000
```

- [ ] **Step 4: Write `backend/src/types.ts`**

```typescript
export type AuthProvider = 'APPLE' | 'GOOGLE';
export type FitbitConnectionStatus = 'CONNECTED' | 'DISCONNECTED';
export type BiometricMetricType = 'HRV' | 'RESTING_HR' | 'SLEEP' | 'STEPS';

export interface SessionTokens {
  accessToken: string;
  refreshToken: string;
}

export interface FitbitTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds
  fitbitUserId: string;
}

export interface FitbitMetricPoint {
  recordedAt: Date;
  value: number;
}
```

- [ ] **Step 5: Write the failing test for the health check**

```typescript
// backend/tests/app.test.ts
import request from 'supertest';
import { createApp } from '../src/app';

describe('GET /health', () => {
  it('returns 200 ok', async () => {
    const app = createApp();
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd backend && npx jest tests/app.test.ts`
Expected: FAIL — `createApp` is not exported / module not found.

- [ ] **Step 7: Write `backend/src/app.ts`**

```typescript
import express, { Express } from 'express';

export function createApp(): Express {
  const app = express();
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  return app;
}
```

- [ ] **Step 8: Write `backend/src/server.ts`**

```typescript
import { createApp } from './app';

const port = Number(process.env.PORT ?? 3000);
createApp().listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
```

- [ ] **Step 9: Run test to verify it passes**

Run: `cd backend && npx jest tests/app.test.ts`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
cd backend
git add package.json tsconfig.json jest.config.js .env.example src/types.ts src/app.ts src/server.ts tests/app.test.ts
git commit -m "Scaffold backend project with health check"
```

---

### Task 2: Database schema and Prisma client

**Files:**
- Create: `backend/prisma/schema.prisma`
- Create: `backend/src/db/client.ts`
- Create: `backend/tests/setupTestDb.ts`
- Test: `backend/tests/db/client.test.ts`
- Create: `backend/docker-compose.test.yml`

**Interfaces:**
- Consumes: `AuthProvider`, `FitbitConnectionStatus`, `BiometricMetricType` from `../src/types` (mirrored as Prisma enums).
- Produces: `prisma: PrismaClient` singleton from `db/client.ts`; Prisma models `User`, `RefreshToken`, `FitbitConnection`, `BiometricRecord` (used by every task that touches persistence).

- [ ] **Step 1: Install Prisma**

```bash
cd backend
npm install @prisma/client
npm install -D prisma
npx prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Write `backend/docker-compose.test.yml`**

```yaml
services:
  postgres-test:
    image: postgres:16
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: biometrics_test
    ports:
      - '5434:5432'
```

- [ ] **Step 3: Write `backend/prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum AuthProvider {
  APPLE
  GOOGLE
}

enum FitbitConnectionStatus {
  CONNECTED
  DISCONNECTED
}

enum BiometricMetricType {
  HRV
  RESTING_HR
  SLEEP
  STEPS
}

model User {
  id               String            @id @default(uuid())
  email            String            @unique
  authProvider     AuthProvider
  createdAt        DateTime          @default(now())
  fitbitConnection FitbitConnection?
  biometricRecords BiometricRecord[]
  refreshTokens    RefreshToken[]
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id])
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())
}

model FitbitConnection {
  id                    String                  @id @default(uuid())
  userId                String                  @unique
  user                  User                    @relation(fields: [userId], references: [id])
  fitbitUserId          String
  encryptedAccessToken  String
  encryptedRefreshToken String
  tokenExpiresAt        DateTime
  webhookSubscriptionId String?
  status                FitbitConnectionStatus  @default(CONNECTED)
  lastSyncedAt          DateTime?
  createdAt             DateTime                @default(now())
  updatedAt             DateTime                @updatedAt
}

model BiometricRecord {
  id         String              @id @default(uuid())
  userId     String
  user       User                @relation(fields: [userId], references: [id])
  metricType BiometricMetricType
  value      Float
  recordedAt DateTime
  syncedAt   DateTime            @default(now())

  @@unique([userId, metricType, recordedAt])
  @@index([userId, recordedAt])
}
```

- [ ] **Step 4: Write `backend/src/db/client.ts`**

```typescript
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
```

- [ ] **Step 5: Write `backend/tests/setupTestDb.ts`**

```typescript
import { execSync } from 'child_process';

export function migrateTestDb(): void {
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: 'inherit',
  });
}
```

- [ ] **Step 6: Write the failing test**

```typescript
// backend/tests/db/client.test.ts
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('prisma client', () => {
  it('can create and read back a user', async () => {
    const user = await prisma.user.create({
      data: { email: 'test@example.com', authProvider: 'GOOGLE' },
    });
    const found = await prisma.user.findUnique({ where: { id: user.id } });
    expect(found?.email).toBe('test@example.com');
  });
});
```

- [ ] **Step 7: Start the test database and run the migration**

Run:
```bash
cd backend
docker compose -f docker-compose.test.yml up -d
export TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate dev --name init
```
Expected: migration succeeds, creates tables matching the schema above.

- [ ] **Step 8: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/db/client.test.ts`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd backend
git add prisma docker-compose.test.yml src/db/client.ts tests/setupTestDb.ts tests/db/client.test.ts
git commit -m "Add Prisma schema and database client"
```

---

### Task 3: Token encryption helper

**Files:**
- Create: `backend/src/crypto/tokenCipher.ts`
- Test: `backend/tests/crypto/tokenCipher.test.ts`

**Interfaces:**
- Consumes: `TOKEN_ENCRYPTION_KEY` env var (base64-encoded 32-byte key).
- Produces: `encryptToken(plaintext: string): string`, `decryptToken(ciphertext: string): string` — used by Task 6 (Fitbit OAuth) to protect stored tokens.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/crypto/tokenCipher.test.ts
import { encryptToken, decryptToken } from '../../src/crypto/tokenCipher';

describe('tokenCipher', () => {
  beforeAll(() => {
    process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
  });

  it('round-trips a plaintext token', () => {
    const ciphertext = encryptToken('my-fitbit-access-token');
    expect(ciphertext).not.toContain('my-fitbit-access-token');
    expect(decryptToken(ciphertext)).toBe('my-fitbit-access-token');
  });

  it('produces different ciphertext for the same plaintext (random IV)', () => {
    const a = encryptToken('same-value');
    const b = encryptToken('same-value');
    expect(a).not.toBe(b);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/crypto/tokenCipher.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/crypto/tokenCipher.ts`**

```typescript
import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('TOKEN_ENCRYPTION_KEY is not set');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('TOKEN_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

export function decryptToken(encoded: string): string {
  const raw = Buffer.from(encoded, 'base64');
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/crypto/tokenCipher.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/crypto/tokenCipher.ts tests/crypto/tokenCipher.test.ts
git commit -m "Add AES-256-GCM token encryption helper"
```

---

### Task 4: Session JWT issuance, refresh, and revocation

**Files:**
- Create: `backend/src/auth/jwt.ts`
- Test: `backend/tests/auth/jwt.test.ts`

**Interfaces:**
- Consumes: `prisma` from `../db/client`, `SessionTokens` from `../types`, `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` env vars.
- Produces: `issueSessionTokens(userId: string): Promise<SessionTokens>`, `verifyAccessToken(token: string): { userId: string }`, `refreshSession(refreshToken: string): Promise<SessionTokens>`, `revokeRefreshToken(refreshToken: string): Promise<void>` — used by Task 5 (auth routes) and Task 9 (requireAuth middleware).

- [ ] **Step 1: Install jsonwebtoken**

```bash
cd backend
npm install jsonwebtoken
npm install -D @types/jsonwebtoken
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/tests/auth/jwt.test.ts
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import {
  issueSessionTokens,
  verifyAccessToken,
  refreshSession,
  revokeRefreshToken,
} from '../../src/auth/jwt';

beforeAll(() => {
  migrateTestDb();
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('session jwt lifecycle', () => {
  it('issues an access token that verifies to the same userId', async () => {
    const user = await prisma.user.create({ data: { email: 'a@example.com', authProvider: 'GOOGLE' } });
    const { accessToken } = await issueSessionTokens(user.id);
    expect(verifyAccessToken(accessToken).userId).toBe(user.id);
  });

  it('refreshes using the refresh token and rotates it', async () => {
    const user = await prisma.user.create({ data: { email: 'b@example.com', authProvider: 'GOOGLE' } });
    const { refreshToken } = await issueSessionTokens(user.id);
    const rotated = await refreshSession(refreshToken);
    expect(verifyAccessToken(rotated.accessToken).userId).toBe(user.id);
    expect(rotated.refreshToken).not.toBe(refreshToken);
  });

  it('rejects a refresh token after it has been revoked', async () => {
    const user = await prisma.user.create({ data: { email: 'c@example.com', authProvider: 'GOOGLE' } });
    const { refreshToken } = await issueSessionTokens(user.id);
    await revokeRefreshToken(refreshToken);
    await expect(refreshSession(refreshToken)).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/auth/jwt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `backend/src/auth/jwt.ts`**

```typescript
import jwt from 'jsonwebtoken';
import { randomUUID, createHash } from 'crypto';
import { prisma } from '../db/client';
import { SessionTokens } from '../types';

const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function accessSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET is not set');
  return secret;
}

async function issueRefreshToken(userId: string): Promise<string> {
  const refreshToken = randomUUID() + randomUUID();
  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return refreshToken;
}

export async function issueSessionTokens(userId: string): Promise<SessionTokens> {
  const accessToken = jwt.sign({ userId }, accessSecret(), { expiresIn: ACCESS_TOKEN_TTL_SECONDS });
  const refreshToken = await issueRefreshToken(userId);
  return { accessToken, refreshToken };
}

export function verifyAccessToken(token: string): { userId: string } {
  const payload = jwt.verify(token, accessSecret()) as { userId: string };
  return { userId: payload.userId };
}

export async function refreshSession(refreshToken: string): Promise<SessionTokens> {
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(refreshToken) } });
  if (!record || record.revokedAt || record.expiresAt < new Date()) {
    throw new Error('Invalid or expired refresh token');
  }
  await prisma.refreshToken.update({ where: { id: record.id }, data: { revokedAt: new Date() } });
  return issueSessionTokens(record.userId);
}

export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { tokenHash: hashToken(refreshToken) },
    data: { revokedAt: new Date() },
  });
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/auth/jwt.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/auth/jwt.ts tests/auth/jwt.test.ts
git commit -m "Add session JWT issuance, refresh, and revocation"
```

---

### Task 5: Apple and Google identity token verification

**Files:**
- Create: `backend/src/auth/appleAuth.ts`
- Create: `backend/src/auth/googleAuth.ts`
- Test: `backend/tests/auth/appleAuth.test.ts`
- Test: `backend/tests/auth/googleAuth.test.ts`

**Interfaces:**
- Consumes: `APPLE_BUNDLE_ID`, `GOOGLE_CLIENT_ID` env vars.
- Produces: `verifyAppleIdentityToken(identityToken: string): Promise<{ email: string; providerUserId: string }>`, `verifyGoogleIdToken(idToken: string): Promise<{ email: string; providerUserId: string }>` — used by Task 6 (auth routes).

- [ ] **Step 1: Install verification libraries**

```bash
cd backend
npm install jose google-auth-library
```

- [ ] **Step 2: Write the failing Apple test**

```typescript
// backend/tests/auth/appleAuth.test.ts
import * as jose from 'jose';
import { verifyAppleIdentityToken } from '../../src/auth/appleAuth';

jest.mock('jose');

describe('verifyAppleIdentityToken', () => {
  beforeAll(() => {
    process.env.APPLE_BUNDLE_ID = 'com.example.biometrics';
  });

  it('returns email and provider user id from a valid token payload', async () => {
    (jose.createRemoteJWKSet as jest.Mock).mockReturnValue('mock-jwks');
    (jose.jwtVerify as jest.Mock).mockResolvedValue({
      payload: { sub: 'apple-user-123', email: 'user@icloud.com', aud: 'com.example.biometrics' },
    });

    const result = await verifyAppleIdentityToken('fake-identity-token');
    expect(result).toEqual({ email: 'user@icloud.com', providerUserId: 'apple-user-123' });
  });

  it('rejects a token with the wrong audience', async () => {
    (jose.createRemoteJWKSet as jest.Mock).mockReturnValue('mock-jwks');
    (jose.jwtVerify as jest.Mock).mockResolvedValue({
      payload: { sub: 'apple-user-123', email: 'user@icloud.com', aud: 'wrong-bundle-id' },
    });

    await expect(verifyAppleIdentityToken('fake-identity-token')).rejects.toThrow();
  });
});
```

- [ ] **Step 3: Write the failing Google test**

```typescript
// backend/tests/auth/googleAuth.test.ts
import { OAuth2Client } from 'google-auth-library';
import { verifyGoogleIdToken } from '../../src/auth/googleAuth';

jest.mock('google-auth-library');

describe('verifyGoogleIdToken', () => {
  beforeAll(() => {
    process.env.GOOGLE_CLIENT_ID = 'test-client-id.apps.googleusercontent.com';
  });

  it('returns email and provider user id from a valid ticket', async () => {
    const verifyIdToken = jest.fn().mockResolvedValue({
      getPayload: () => ({ sub: 'google-user-456', email: 'user@gmail.com' }),
    });
    (OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({ verifyIdToken }));

    const result = await verifyGoogleIdToken('fake-id-token');
    expect(result).toEqual({ email: 'user@gmail.com', providerUserId: 'google-user-456' });
  });
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `cd backend && npx jest tests/auth/appleAuth.test.ts tests/auth/googleAuth.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 5: Write `backend/src/auth/appleAuth.ts`**

```typescript
import * as jose from 'jose';

const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';

export async function verifyAppleIdentityToken(
  identityToken: string,
): Promise<{ email: string; providerUserId: string }> {
  const bundleId = process.env.APPLE_BUNDLE_ID;
  if (!bundleId) throw new Error('APPLE_BUNDLE_ID is not set');

  const jwks = jose.createRemoteJWKSet(new URL(APPLE_JWKS_URL));
  const { payload } = await jose.jwtVerify(identityToken, jwks, {
    issuer: 'https://appleid.apple.com',
  });

  if (payload.aud !== bundleId) {
    throw new Error('Apple identity token audience mismatch');
  }
  if (typeof payload.sub !== 'string' || typeof payload.email !== 'string') {
    throw new Error('Apple identity token missing required claims');
  }
  return { email: payload.email, providerUserId: payload.sub };
}
```

- [ ] **Step 6: Write `backend/src/auth/googleAuth.ts`**

```typescript
import { OAuth2Client } from 'google-auth-library';

export async function verifyGoogleIdToken(
  idToken: string,
): Promise<{ email: string; providerUserId: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  if (!clientId) throw new Error('GOOGLE_CLIENT_ID is not set');

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error('Google ID token missing required claims');
  }
  return { email: payload.email, providerUserId: payload.sub };
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd backend && npx jest tests/auth/appleAuth.test.ts tests/auth/googleAuth.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/auth/appleAuth.ts src/auth/googleAuth.ts tests/auth/appleAuth.test.ts tests/auth/googleAuth.test.ts
git commit -m "Add Apple and Google identity token verification"
```

---

### Task 6: Auth routes and requireAuth middleware

**Files:**
- Create: `backend/src/auth/middleware.ts`
- Create: `backend/src/users/repository.ts`
- Create: `backend/src/auth/routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/auth/routes.test.ts`

**Interfaces:**
- Consumes: `verifyAppleIdentityToken`, `verifyGoogleIdToken` (Task 5); `issueSessionTokens`, `verifyAccessToken`, `refreshSession`, `revokeRefreshToken` (Task 4); `prisma` (Task 2).
- Produces: `findOrCreateUserByProvider(email: string, provider: AuthProvider, providerUserId: string): Promise<{ id: string }>` from `users/repository.ts`; `requireAuth` Express middleware (attaches `req.userId`) — used by Task 8 (Fitbit routes) and Task 13 (biometrics routes); mounts `POST /auth/apple`, `POST /auth/google`, `POST /auth/refresh`, `POST /auth/signout` on the app.

- [ ] **Step 1: Write `backend/src/users/repository.ts`**

```typescript
import { prisma } from '../db/client';
import { AuthProvider } from '../types';

export async function findOrCreateUserByProvider(
  email: string,
  provider: AuthProvider,
  providerUserId: string,
): Promise<{ id: string }> {
  return prisma.user.upsert({
    where: { email },
    update: {},
    create: { email, authProvider: provider },
    select: { id: true },
  });
}
```

(`providerUserId` is accepted for future use — e.g. detecting a changed provider account for the same email — but Phase 1 keys strictly on email.)

- [ ] **Step 2: Write `backend/src/auth/middleware.ts`**

```typescript
import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken } from './jwt';

export interface AuthedRequest extends Request {
  userId?: string;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing bearer token' });
    return;
  }
  try {
    const { userId } = verifyAccessToken(header.slice('Bearer '.length));
    req.userId = userId;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

- [ ] **Step 3: Write the failing test**

```typescript
// backend/tests/auth/routes.test.ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import * as appleAuth from '../../src/auth/appleAuth';
import * as googleAuth from '../../src/auth/googleAuth';

jest.mock('../../src/auth/appleAuth');
jest.mock('../../src/auth/googleAuth');

beforeAll(() => {
  migrateTestDb();
  process.env.JWT_ACCESS_SECRET = 'test-access-secret';
  process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('auth routes', () => {
  it('signs in with Google and returns session tokens', async () => {
    (googleAuth.verifyGoogleIdToken as jest.Mock).mockResolvedValue({
      email: 'google-user@example.com',
      providerUserId: 'g-1',
    });

    const res = await request(createApp()).post('/auth/google').send({ idToken: 'fake' });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
  });

  it('refreshes a session', async () => {
    (appleAuth.verifyAppleIdentityToken as jest.Mock).mockResolvedValue({
      email: 'apple-user@example.com',
      providerUserId: 'a-1',
    });
    const signIn = await request(createApp()).post('/auth/apple').send({ identityToken: 'fake' });

    const res = await request(createApp())
      .post('/auth/refresh')
      .send({ refreshToken: signIn.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toBeDefined();
  });

  it('rejects a refresh token after sign-out', async () => {
    (appleAuth.verifyAppleIdentityToken as jest.Mock).mockResolvedValue({
      email: 'apple-user-2@example.com',
      providerUserId: 'a-2',
    });
    const signIn = await request(createApp()).post('/auth/apple').send({ identityToken: 'fake' });

    await request(createApp()).post('/auth/signout').send({ refreshToken: signIn.body.refreshToken });
    const res = await request(createApp())
      .post('/auth/refresh')
      .send({ refreshToken: signIn.body.refreshToken });

    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/auth/routes.test.ts`
Expected: FAIL — route module not found / 404s.

- [ ] **Step 5: Write `backend/src/auth/routes.ts`**

```typescript
import { Router } from 'express';
import { verifyAppleIdentityToken } from './appleAuth';
import { verifyGoogleIdToken } from './googleAuth';
import { issueSessionTokens, refreshSession, revokeRefreshToken } from './jwt';
import { findOrCreateUserByProvider } from '../users/repository';

export const authRouter = Router();

authRouter.post('/auth/apple', async (req, res) => {
  try {
    const { email, providerUserId } = await verifyAppleIdentityToken(req.body.identityToken);
    const user = await findOrCreateUserByProvider(email, 'APPLE', providerUserId);
    res.json(await issueSessionTokens(user.id));
  } catch {
    res.status(401).json({ error: 'Invalid Apple identity token' });
  }
});

authRouter.post('/auth/google', async (req, res) => {
  try {
    const { email, providerUserId } = await verifyGoogleIdToken(req.body.idToken);
    const user = await findOrCreateUserByProvider(email, 'GOOGLE', providerUserId);
    res.json(await issueSessionTokens(user.id));
  } catch {
    res.status(401).json({ error: 'Invalid Google ID token' });
  }
});

authRouter.post('/auth/refresh', async (req, res) => {
  try {
    res.json(await refreshSession(req.body.refreshToken));
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

authRouter.post('/auth/signout', async (req, res) => {
  await revokeRefreshToken(req.body.refreshToken);
  res.status(204).send();
});
```

- [ ] **Step 6: Modify `backend/src/app.ts` to mount the router**

```typescript
import express, { Express } from 'express';
import { authRouter } from './auth/routes';

export function createApp(): Express {
  const app = express();
  app.use(express.json());
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(authRouter);
  return app;
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/auth/routes.test.ts`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
cd backend
git add src/auth/middleware.ts src/auth/routes.ts src/users/repository.ts src/app.ts tests/auth/routes.test.ts
git commit -m "Add auth routes and requireAuth middleware"
```

---

### Task 7: Fitbit OAuth — authorize URL and token exchange

**Files:**
- Create: `backend/src/fitbit/oauth.ts`
- Test: `backend/tests/fitbit/oauth.test.ts`

**Interfaces:**
- Consumes: `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_REDIRECT_URI` env vars; `FitbitTokenResponse` from `../types`.
- Produces: `buildAuthorizeUrl(state: string): string`, `exchangeCodeForTokens(code: string): Promise<FitbitTokenResponse>`, `refreshFitbitTokens(refreshToken: string): Promise<FitbitTokenResponse>` — used by Task 8 (Fitbit routes) and Task 12 (token refresh job).

**Note:** outbound HTTP uses `node-fetch`, not the global `fetch`, specifically so `nock` (used here and in Task 9) can intercept it — global `fetch`'s undici transport bypasses `nock`'s `http` module interception.

- [ ] **Step 1: Install dependencies**

```bash
cd backend
npm install node-fetch@2
npm install -D @types/node-fetch nock
```

- [ ] **Step 2: Write the failing test**

```typescript
// backend/tests/fitbit/oauth.test.ts
import nock from 'nock';
import { buildAuthorizeUrl, exchangeCodeForTokens, refreshFitbitTokens } from '../../src/fitbit/oauth';

beforeAll(() => {
  process.env.FITBIT_CLIENT_ID = 'client-123';
  process.env.FITBIT_CLIENT_SECRET = 'secret-456';
  process.env.FITBIT_REDIRECT_URI = 'https://app.example.com/fitbit/callback';
});

afterEach(() => nock.cleanAll());

describe('buildAuthorizeUrl', () => {
  it('includes client id, redirect uri, scopes, and state', () => {
    const url = buildAuthorizeUrl('state-abc');
    expect(url).toContain('client_id=client-123');
    expect(url).toContain(encodeURIComponent('https://app.example.com/fitbit/callback'));
    expect(url).toContain('state=state-abc');
  });
});

describe('exchangeCodeForTokens', () => {
  it('exchanges an auth code for tokens', async () => {
    nock('https://api.fitbit.com')
      .post('/oauth2/token')
      .reply(200, {
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 28800,
        user_id: 'fitbit-user-1',
      });

    const tokens = await exchangeCodeForTokens('auth-code-1');
    expect(tokens).toEqual({
      accessToken: 'access-1',
      refreshToken: 'refresh-1',
      expiresIn: 28800,
      fitbitUserId: 'fitbit-user-1',
    });
  });
});

describe('refreshFitbitTokens', () => {
  it('exchanges a refresh token for new tokens', async () => {
    nock('https://api.fitbit.com')
      .post('/oauth2/token')
      .reply(200, {
        access_token: 'access-2',
        refresh_token: 'refresh-2',
        expires_in: 28800,
        user_id: 'fitbit-user-1',
      });

    const tokens = await refreshFitbitTokens('refresh-1');
    expect(tokens.accessToken).toBe('access-2');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd backend && npx jest tests/fitbit/oauth.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `backend/src/fitbit/oauth.ts`**

```typescript
import fetch from 'node-fetch';
import { FitbitTokenResponse } from '../types';

const AUTHORIZE_URL = 'https://www.fitbit.com/oauth2/authorize';
const TOKEN_URL = 'https://api.fitbit.com/oauth2/token';
const SCOPES = ['heartrate', 'sleep', 'activity'].join(' ');

function config() {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const redirectUri = process.env.FITBIT_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Fitbit OAuth env vars are not fully configured');
  }
  return { clientId, clientSecret, redirectUri };
}

export function buildAuthorizeUrl(state: string): string {
  const { clientId, redirectUri } = config();
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirectUri,
    scope: SCOPES,
    state,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

interface FitbitTokenApiResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: string;
}

async function requestToken(body: URLSearchParams): Promise<FitbitTokenResponse> {
  const { clientId, clientSecret } = config();
  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    throw new Error(`Fitbit token endpoint returned ${res.status}`);
  }

  const json = (await res.json()) as FitbitTokenApiResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: json.expires_in,
    fitbitUserId: json.user_id,
  };
}

export async function exchangeCodeForTokens(code: string): Promise<FitbitTokenResponse> {
  const { redirectUri } = config();
  return requestToken(
    new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri }),
  );
}

export async function refreshFitbitTokens(refreshToken: string): Promise<FitbitTokenResponse> {
  return requestToken(new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }));
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && npx jest tests/fitbit/oauth.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/fitbit/oauth.ts tests/fitbit/oauth.test.ts
git commit -m "Add Fitbit OAuth authorize URL and token exchange"
```

---

### Task 8: Fitbit API client — fetching metric data

**Files:**
- Create: `backend/src/fitbit/client.ts`
- Test: `backend/tests/fitbit/client.test.ts`

**Interfaces:**
- Consumes: `FitbitMetricPoint`, `BiometricMetricType` from `../types`.
- Produces: `fetchMetricRange(accessToken: string, metricType: BiometricMetricType, startDate: string, endDate: string): Promise<FitbitMetricPoint[]>` — used by Task 11 (sync worker). Dates are `YYYY-MM-DD`. A single-day fetch is `fetchMetricRange(token, type, date, date)`.

**Note on endpoints:** these are Fitbit Web API v1/v1.2 endpoints as documented at the time of writing (`dev.fitbit.com/build/reference/web-api/`) — confirm against current Fitbit docs during implementation in case of API version changes. HRV's range endpoint caps at 30 days, which is exactly why the spec's initial backfill window is 30 days.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/fitbit/client.test.ts
import nock from 'nock';
import { fetchMetricRange } from '../../src/fitbit/client';

afterEach(() => nock.cleanAll());

describe('fetchMetricRange', () => {
  it('fetches resting heart rate for a range', async () => {
    nock('https://api.fitbit.com')
      .get('/1/user/-/activities/heart/date/2026-09-01/2026-09-02.json')
      .reply(200, {
        'activities-heart': [
          { dateTime: '2026-09-01', value: { restingHeartRate: 58 } },
          { dateTime: '2026-09-02', value: { restingHeartRate: 60 } },
        ],
      });

    const points = await fetchMetricRange('token-1', 'RESTING_HR', '2026-09-01', '2026-09-02');
    expect(points).toEqual([
      { recordedAt: new Date('2026-09-01'), value: 58 },
      { recordedAt: new Date('2026-09-02'), value: 60 },
    ]);
  });

  it('fetches steps for a range', async () => {
    nock('https://api.fitbit.com')
      .get('/1/user/-/activities/steps/date/2026-09-01/2026-09-01.json')
      .reply(200, { 'activities-steps': [{ dateTime: '2026-09-01', value: '8123' }] });

    const points = await fetchMetricRange('token-1', 'STEPS', '2026-09-01', '2026-09-01');
    expect(points).toEqual([{ recordedAt: new Date('2026-09-01'), value: 8123 }]);
  });

  it('fetches sleep minutes for a range', async () => {
    nock('https://api.fitbit.com')
      .get('/1.2/user/-/sleep/date/2026-09-01/2026-09-01.json')
      .reply(200, { sleep: [{ dateOfSleep: '2026-09-01', minutesAsleep: 415 }] });

    const points = await fetchMetricRange('token-1', 'SLEEP', '2026-09-01', '2026-09-01');
    expect(points).toEqual([{ recordedAt: new Date('2026-09-01'), value: 415 }]);
  });

  it('fetches HRV for a range', async () => {
    nock('https://api.fitbit.com')
      .get('/1/user/-/hrv/date/2026-09-01/2026-09-01.json')
      .reply(200, { hrv: [{ dateTime: '2026-09-01', value: { dailyRmssd: 42.3 } }] });

    const points = await fetchMetricRange('token-1', 'HRV', '2026-09-01', '2026-09-01');
    expect(points).toEqual([{ recordedAt: new Date('2026-09-01'), value: 42.3 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/fitbit/client.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/fitbit/client.ts`**

```typescript
import fetch from 'node-fetch';
import { BiometricMetricType, FitbitMetricPoint } from '../types';

const BASE_URL = 'https://api.fitbit.com';

async function get<T>(path: string, accessToken: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = new Error(`Fitbit API returned ${res.status} for ${path}`);
    (err as any).status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

interface HeartRateResponse {
  'activities-heart': { dateTime: string; value: { restingHeartRate?: number } }[];
}
interface StepsResponse {
  'activities-steps': { dateTime: string; value: string }[];
}
interface SleepResponse {
  sleep: { dateOfSleep: string; minutesAsleep: number }[];
}
interface HrvResponse {
  hrv: { dateTime: string; value: { dailyRmssd: number } }[];
}

export async function fetchMetricRange(
  accessToken: string,
  metricType: BiometricMetricType,
  startDate: string,
  endDate: string,
): Promise<FitbitMetricPoint[]> {
  switch (metricType) {
    case 'RESTING_HR': {
      const data = await get<HeartRateResponse>(
        `/1/user/-/activities/heart/date/${startDate}/${endDate}.json`,
        accessToken,
      );
      return data['activities-heart']
        .filter((entry) => entry.value.restingHeartRate !== undefined)
        .map((entry) => ({ recordedAt: new Date(entry.dateTime), value: entry.value.restingHeartRate! }));
    }
    case 'STEPS': {
      const data = await get<StepsResponse>(
        `/1/user/-/activities/steps/date/${startDate}/${endDate}.json`,
        accessToken,
      );
      return data['activities-steps'].map((entry) => ({
        recordedAt: new Date(entry.dateTime),
        value: Number(entry.value),
      }));
    }
    case 'SLEEP': {
      const data = await get<SleepResponse>(
        `/1.2/user/-/sleep/date/${startDate}/${endDate}.json`,
        accessToken,
      );
      return data.sleep.map((entry) => ({
        recordedAt: new Date(entry.dateOfSleep),
        value: entry.minutesAsleep,
      }));
    }
    case 'HRV': {
      const data = await get<HrvResponse>(`/1/user/-/hrv/date/${startDate}/${endDate}.json`, accessToken);
      return data.hrv.map((entry) => ({
        recordedAt: new Date(entry.dateTime),
        value: entry.value.dailyRmssd,
      }));
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/fitbit/client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/fitbit/client.ts tests/fitbit/client.test.ts
git commit -m "Add Fitbit API client for fetching metric ranges"
```

---

### Task 9: Webhook verification — GET challenge and POST signature

**Files:**
- Create: `backend/src/fitbit/webhookVerify.ts`
- Test: `backend/tests/fitbit/webhookVerify.test.ts`

**Interfaces:**
- Consumes: `FITBIT_VERIFY_CODE`, `FITBIT_CLIENT_SECRET` env vars.
- Produces: `isValidVerificationCode(verify: string): boolean`, `isValidWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean` — used by Task 10 (Fitbit webhook route).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/fitbit/webhookVerify.test.ts
import { createHmac } from 'crypto';
import { isValidVerificationCode, isValidWebhookSignature } from '../../src/fitbit/webhookVerify';

beforeAll(() => {
  process.env.FITBIT_VERIFY_CODE = 'expected-verify-code';
  process.env.FITBIT_CLIENT_SECRET = 'client-secret';
});

describe('isValidVerificationCode', () => {
  it('accepts the configured verify code', () => {
    expect(isValidVerificationCode('expected-verify-code')).toBe(true);
  });

  it('rejects any other code', () => {
    expect(isValidVerificationCode('wrong-code')).toBe(false);
  });
});

describe('isValidWebhookSignature', () => {
  it('accepts a correctly signed body', () => {
    const body = Buffer.from(JSON.stringify([{ collectionType: 'sleep' }]));
    const signature = createHmac('sha1', 'client-secret').update(body).digest('base64');
    expect(isValidWebhookSignature(body, signature)).toBe(true);
  });

  it('rejects a body with a mismatched signature', () => {
    const body = Buffer.from(JSON.stringify([{ collectionType: 'sleep' }]));
    expect(isValidWebhookSignature(body, 'bogus-signature')).toBe(false);
  });

  it('rejects a missing signature header', () => {
    const body = Buffer.from('[]');
    expect(isValidWebhookSignature(body, undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx jest tests/fitbit/webhookVerify.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/fitbit/webhookVerify.ts`**

```typescript
import { createHmac, timingSafeEqual } from 'crypto';

export function isValidVerificationCode(verify: string): boolean {
  return verify === process.env.FITBIT_VERIFY_CODE;
}

export function isValidWebhookSignature(rawBody: Buffer, signatureHeader: string | undefined): boolean {
  if (!signatureHeader) return false;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  if (!clientSecret) throw new Error('FITBIT_CLIENT_SECRET is not set');

  const expected = createHmac('sha1', clientSecret).update(rawBody).digest();
  const actual = Buffer.from(signatureHeader, 'base64');
  if (expected.length !== actual.length) return false;
  return timingSafeEqual(expected, actual);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx jest tests/fitbit/webhookVerify.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/fitbit/webhookVerify.ts tests/fitbit/webhookVerify.test.ts
git commit -m "Add Fitbit webhook GET challenge and POST signature verification"
```

---

### Task 10: Sync queue and worker

**Files:**
- Create: `backend/src/sync/queue.ts`
- Create: `backend/src/sync/worker.ts`
- Create: `backend/src/biometrics/repository.ts`
- Create: `backend/src/fitbit/subscription.ts`
- Test: `backend/tests/sync/queue.test.ts`
- Test: `backend/tests/sync/worker.test.ts`
- Test: `backend/tests/fitbit/subscription.test.ts`

**Interfaces:**
- Consumes: `fetchMetricRange` (Task 8), `refreshFitbitTokens` (Task 7), `encryptToken`/`decryptToken` (Task 3), `prisma` (Task 2).
- Produces: `enqueueFetchJob(payload: FetchJobData): Promise<void>`, `enqueueBackfillJob(payload: BackfillJobData): Promise<void>` from `sync/queue.ts`; `startSyncWorker(): Worker` from `sync/worker.ts`; `upsertBiometricRecords(userId, metricType, points: FitbitMetricPoint[]): Promise<void>`, `getBiometricsForUser(userId): Promise<BiometricRecord[]>` from `biometrics/repository.ts`; `registerWebhookSubscription(fitbitUserId, accessToken, subscriptionId): Promise<void>` from `fitbit/subscription.ts`. Used by Task 11 (Fitbit routes) and Task 12 (token refresh job).

- [ ] **Step 1: Install BullMQ**

```bash
cd backend
npm install bullmq ioredis
npm install -D ioredis-mock
```

- [ ] **Step 2: Write `backend/src/biometrics/repository.ts`**

```typescript
import { prisma } from '../db/client';
import { BiometricMetricType, FitbitMetricPoint } from '../types';

export async function upsertBiometricRecords(
  userId: string,
  metricType: BiometricMetricType,
  points: FitbitMetricPoint[],
): Promise<void> {
  for (const point of points) {
    await prisma.biometricRecord.upsert({
      where: { userId_metricType_recordedAt: { userId, metricType, recordedAt: point.recordedAt } },
      update: { value: point.value, syncedAt: new Date() },
      create: { userId, metricType, recordedAt: point.recordedAt, value: point.value },
    });
  }
}

export async function getBiometricsForUser(userId: string) {
  return prisma.biometricRecord.findMany({
    where: { userId },
    orderBy: { recordedAt: 'desc' },
  });
}
```

- [ ] **Step 3: Write `backend/src/fitbit/subscription.ts`**

```typescript
import fetch from 'node-fetch';

export async function registerWebhookSubscription(
  fitbitUserId: string,
  accessToken: string,
  subscriptionId: string,
): Promise<void> {
  const res = await fetch(`https://api.fitbit.com/1/user/-/apiSubscriptions/${subscriptionId}.json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error(`Failed to register Fitbit webhook subscription: ${res.status}`);
  }
}
```

- [ ] **Step 4: Write the failing queue test**

```typescript
// backend/tests/sync/queue.test.ts
import { syncQueue, enqueueFetchJob, enqueueBackfillJob } from '../../src/sync/queue';

afterAll(async () => {
  await syncQueue.close();
});

describe('sync queue', () => {
  it('enqueues a fetch job with the expected name and data', async () => {
    const job = await enqueueFetchJob({ userId: 'u1', metricType: 'STEPS', date: '2026-09-01' });
    expect(job.name).toBe('fetch');
    expect(job.data).toEqual({ userId: 'u1', metricType: 'STEPS', date: '2026-09-01' });
  });

  it('enqueues a backfill job with the expected name and data', async () => {
    const job = await enqueueBackfillJob({ userId: 'u1', startDate: '2026-08-01', endDate: '2026-09-01' });
    expect(job.name).toBe('backfill');
    expect(job.data).toEqual({ userId: 'u1', startDate: '2026-08-01', endDate: '2026-09-01' });
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `cd backend && REDIS_URL=redis://localhost:6379 npx jest tests/sync/queue.test.ts`
Expected: FAIL — module not found. (Requires a local Redis; `redis:7` via `docker run -p 6379:6379 redis:7` if not already running.)

- [ ] **Step 6: Write `backend/src/sync/queue.ts`**

```typescript
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { BiometricMetricType } from '../types';

export interface FetchJobData {
  userId: string;
  metricType: BiometricMetricType;
  date: string; // YYYY-MM-DD
}

export interface BackfillJobData {
  userId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
}

export const connection = new IORedis(process.env.REDIS_URL ?? 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const syncQueue = new Queue('fitbit-sync', { connection });

export function enqueueFetchJob(data: FetchJobData) {
  return syncQueue.add('fetch', data);
}

export function enqueueBackfillJob(data: BackfillJobData) {
  return syncQueue.add('backfill', data);
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd backend && REDIS_URL=redis://localhost:6379 npx jest tests/sync/queue.test.ts`
Expected: PASS

- [ ] **Step 8: Write the failing worker test**

```typescript
// backend/tests/sync/worker.test.ts
import { Job } from 'bullmq';
import { processSyncJob } from '../../src/sync/worker';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import * as fitbitClient from '../../src/fitbit/client';
import { encryptToken } from '../../src/crypto/tokenCipher';

jest.mock('../../src/fitbit/client');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 3).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

async function createConnectedUser() {
  const user = await prisma.user.create({ data: { email: `w-${Date.now()}@example.com`, authProvider: 'GOOGLE' } });
  await prisma.fitbitConnection.create({
    data: {
      userId: user.id,
      fitbitUserId: 'fb-1',
      encryptedAccessToken: encryptToken('access-token'),
      encryptedRefreshToken: encryptToken('refresh-token'),
      tokenExpiresAt: new Date(Date.now() + 3600_000),
    },
  });
  return user;
}

describe('processSyncJob', () => {
  it('writes fetched metric points for a fetch job', async () => {
    const user = await createConnectedUser();
    (fitbitClient.fetchMetricRange as jest.Mock).mockResolvedValue([
      { recordedAt: new Date('2026-09-01'), value: 8000 },
    ]);

    await processSyncJob({
      name: 'fetch',
      data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' },
    } as Job);

    const records = await prisma.biometricRecord.findMany({ where: { userId: user.id } });
    expect(records).toHaveLength(1);
    expect(records[0].value).toBe(8000);
  });

  it('marks the connection disconnected on a 401 from Fitbit', async () => {
    const user = await createConnectedUser();
    const err = new Error('unauthorized');
    (err as any).status = 401;
    (fitbitClient.fetchMetricRange as jest.Mock).mockRejectedValue(err);

    await processSyncJob({
      name: 'fetch',
      data: { userId: user.id, metricType: 'STEPS', date: '2026-09-01' },
    } as Job);

    const connection = await prisma.fitbitConnection.findUnique({ where: { userId: user.id } });
    expect(connection?.status).toBe('DISCONNECTED');
  });

  it('processes a backfill job by fetching each metric type for the date range', async () => {
    const user = await createConnectedUser();
    (fitbitClient.fetchMetricRange as jest.Mock).mockResolvedValue([
      { recordedAt: new Date('2026-08-01'), value: 42 },
    ]);

    await processSyncJob({
      name: 'backfill',
      data: { userId: user.id, startDate: '2026-08-01', endDate: '2026-08-01' },
    } as Job);

    expect(fitbitClient.fetchMetricRange).toHaveBeenCalledWith(
      'access-token',
      'HRV',
      '2026-08-01',
      '2026-08-01',
    );
    expect(fitbitClient.fetchMetricRange).toHaveBeenCalledWith(
      'access-token',
      'RESTING_HR',
      '2026-08-01',
      '2026-08-01',
    );
    expect(fitbitClient.fetchMetricRange).toHaveBeenCalledWith(
      'access-token',
      'SLEEP',
      '2026-08-01',
      '2026-08-01',
    );
    expect(fitbitClient.fetchMetricRange).toHaveBeenCalledWith(
      'access-token',
      'STEPS',
      '2026-08-01',
      '2026-08-01',
    );
  });
});
```

- [ ] **Step 9: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/sync/worker.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 10: Write `backend/src/sync/worker.ts`**

```typescript
import { Job, Worker } from 'bullmq';
import { prisma } from '../db/client';
import { connection } from './queue';
import { fetchMetricRange } from '../fitbit/client';
import { decryptToken } from '../crypto/tokenCipher';
import { upsertBiometricRecords } from '../biometrics/repository';
import { BiometricMetricType } from '../types';
import { FetchJobData, BackfillJobData } from './queue';

const ALL_METRIC_TYPES: BiometricMetricType[] = ['HRV', 'RESTING_HR', 'SLEEP', 'STEPS'];
const SYNC_WORKER_CONCURRENCY = 5;

async function handleFetchJob(data: FetchJobData): Promise<void> {
  const conn = await prisma.fitbitConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  try {
    const accessToken = decryptToken(conn.encryptedAccessToken);
    const points = await fetchMetricRange(accessToken, data.metricType, data.date, data.date);
    await upsertBiometricRecords(data.userId, data.metricType, points);
    await prisma.fitbitConnection.update({
      where: { userId: data.userId },
      data: { lastSyncedAt: new Date() },
    });
  } catch (err) {
    if ((err as any).status === 401) {
      await prisma.fitbitConnection.update({
        where: { userId: data.userId },
        data: { status: 'DISCONNECTED' },
      });
      return;
    }
    throw err; // other errors (e.g. 429) are retried by BullMQ's job retry policy
  }
}

async function handleBackfillJob(data: BackfillJobData): Promise<void> {
  const conn = await prisma.fitbitConnection.findUnique({ where: { userId: data.userId } });
  if (!conn || conn.status === 'DISCONNECTED') return;

  const accessToken = decryptToken(conn.encryptedAccessToken);
  for (const metricType of ALL_METRIC_TYPES) {
    const points = await fetchMetricRange(accessToken, metricType, data.startDate, data.endDate);
    await upsertBiometricRecords(data.userId, metricType, points);
  }
  await prisma.fitbitConnection.update({ where: { userId: data.userId }, data: { lastSyncedAt: new Date() } });
}

export async function processSyncJob(job: Job): Promise<void> {
  if (job.name === 'fetch') {
    await handleFetchJob(job.data as FetchJobData);
  } else if (job.name === 'backfill') {
    await handleBackfillJob(job.data as BackfillJobData);
  }
}

export function startSyncWorker(): Worker {
  return new Worker('fitbit-sync', processSyncJob, {
    connection,
    concurrency: SYNC_WORKER_CONCURRENCY,
  });
}
```

- [ ] **Step 11: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/sync/worker.test.ts`
Expected: PASS

- [ ] **Step 12: Write and run the subscription test**

```typescript
// backend/tests/fitbit/subscription.test.ts
import nock from 'nock';
import { registerWebhookSubscription } from '../../src/fitbit/subscription';

afterEach(() => nock.cleanAll());

describe('registerWebhookSubscription', () => {
  it('posts to the Fitbit subscriptions endpoint', async () => {
    const scope = nock('https://api.fitbit.com')
      .post('/1/user/-/apiSubscriptions/sub-1.json')
      .reply(201, {});

    await registerWebhookSubscription('fitbit-user-1', 'access-token', 'sub-1');
    expect(scope.isDone()).toBe(true);
  });

  it('throws when Fitbit rejects the subscription request', async () => {
    nock('https://api.fitbit.com').post('/1/user/-/apiSubscriptions/sub-1.json').reply(500);
    await expect(registerWebhookSubscription('fitbit-user-1', 'access-token', 'sub-1')).rejects.toThrow();
  });
});
```

Run: `cd backend && npx jest tests/fitbit/subscription.test.ts`
Expected: PASS

- [ ] **Step 13: Commit**

```bash
cd backend
git add src/sync/queue.ts src/sync/worker.ts src/biometrics/repository.ts src/fitbit/subscription.ts \
  tests/sync/queue.test.ts tests/sync/worker.test.ts tests/fitbit/subscription.test.ts
git commit -m "Add sync worker queue, biometrics repository, and webhook subscription registration"
```

---

### Task 11: Fitbit connect and webhook routes

**Files:**
- Create: `backend/src/fitbit/routes.ts`
- Modify: `backend/src/app.ts`
- Test: `backend/tests/fitbit/routes.test.ts`

**Interfaces:**
- Consumes: `requireAuth`, `AuthedRequest` (Task 6); `buildAuthorizeUrl`, `exchangeCodeForTokens` (Task 7); `encryptToken` (Task 3); `registerWebhookSubscription` (Task 10); `enqueueBackfillJob` (Task 10); `isValidVerificationCode`, `isValidWebhookSignature` (Task 9); `prisma` (Task 2).
- Produces: mounts `GET /fitbit/authorize`, `GET /fitbit/callback`, `GET /webhooks/fitbit`, `POST /webhooks/fitbit` on the app.

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/fitbit/routes.test.ts
import request from 'supertest';
import { randomUUID } from 'crypto';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { issueSessionTokens } from '../../src/auth/jwt';
import * as oauth from '../../src/fitbit/oauth';
import * as subscription from '../../src/fitbit/subscription';
import * as queue from '../../src/sync/queue';

jest.mock('../../src/fitbit/oauth');
jest.mock('../../src/fitbit/subscription');
jest.mock('../../src/sync/queue');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 9).toString('base64');
  process.env.FITBIT_VERIFY_CODE = 'verify-me';
  process.env.FITBIT_CLIENT_SECRET = 'client-secret';
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /webhooks/fitbit', () => {
  it('echoes back the verify code when it matches', async () => {
    const res = await request(createApp()).get('/webhooks/fitbit').query({ verify: 'verify-me' });
    expect(res.status).toBe(204);
  });

  it('returns 404 when the verify code does not match', async () => {
    const res = await request(createApp()).get('/webhooks/fitbit').query({ verify: 'wrong' });
    expect(res.status).toBe(404);
  });
});

describe('GET /fitbit/callback', () => {
  it('exchanges the code, stores the connection, registers a subscription, and enqueues a backfill', async () => {
    const user = await prisma.user.create({ data: { email: `f-${randomUUID()}@example.com`, authProvider: 'GOOGLE' } });
    const { accessToken } = await issueSessionTokens(user.id);

    (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
      accessToken: 'fitbit-access',
      refreshToken: 'fitbit-refresh',
      expiresIn: 28800,
      fitbitUserId: 'fitbit-user-1',
    });

    const res = await request(createApp())
      .get('/fitbit/callback')
      .query({ code: 'auth-code', state: user.id })
      .set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    const conn = await prisma.fitbitConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('CONNECTED');
    expect(subscription.registerWebhookSubscription).toHaveBeenCalled();
    expect(queue.enqueueBackfillJob).toHaveBeenCalledWith(
      expect.objectContaining({ userId: user.id }),
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/fitbit/routes.test.ts`
Expected: FAIL — route module not found / 404s.

- [ ] **Step 3: Write `backend/src/fitbit/routes.ts`**

```typescript
import { Router } from 'express';
import { randomUUID } from 'crypto';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { buildAuthorizeUrl, exchangeCodeForTokens } from './oauth';
import { encryptToken } from '../crypto/tokenCipher';
import { registerWebhookSubscription } from './subscription';
import { isValidVerificationCode, isValidWebhookSignature } from './webhookVerify';
import { enqueueBackfillJob, enqueueFetchJob } from '../sync/queue';
import { prisma } from '../db/client';

export const fitbitRouter = Router();

const BACKFILL_WINDOW_DAYS = 30;
const FITBIT_WEBHOOK_COLLECTIONS: Record<string, ('HRV' | 'RESTING_HR' | 'SLEEP' | 'STEPS')[]> = {
  sleep: ['SLEEP'],
  activities: ['RESTING_HR', 'STEPS', 'HRV'],
};

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

fitbitRouter.get('/fitbit/authorize', requireAuth, (req: AuthedRequest, res) => {
  res.redirect(buildAuthorizeUrl(req.userId!));
});

fitbitRouter.get('/fitbit/callback', requireAuth, async (req: AuthedRequest, res) => {
  const code = req.query.code as string;
  const tokens = await exchangeCodeForTokens(code);
  const subscriptionId = randomUUID();

  await prisma.fitbitConnection.upsert({
    where: { userId: req.userId! },
    update: {
      fitbitUserId: tokens.fitbitUserId,
      encryptedAccessToken: encryptToken(tokens.accessToken),
      encryptedRefreshToken: encryptToken(tokens.refreshToken),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      webhookSubscriptionId: subscriptionId,
      status: 'CONNECTED',
    },
    create: {
      userId: req.userId!,
      fitbitUserId: tokens.fitbitUserId,
      encryptedAccessToken: encryptToken(tokens.accessToken),
      encryptedRefreshToken: encryptToken(tokens.refreshToken),
      tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      webhookSubscriptionId: subscriptionId,
    },
  });

  await registerWebhookSubscription(tokens.fitbitUserId, tokens.accessToken, subscriptionId);

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  await enqueueBackfillJob({
    userId: req.userId!,
    startDate: isoDate(startDate),
    endDate: isoDate(endDate),
  });

  res.json({ status: 'connected' });
});

fitbitRouter.get('/webhooks/fitbit', (req, res) => {
  const verify = req.query.verify as string | undefined;
  if (verify && isValidVerificationCode(verify)) {
    res.status(204).send();
  } else {
    res.status(404).send();
  }
});

interface FitbitNotification {
  collectionType: string;
  date: string;
  ownerId: string;
}

fitbitRouter.post('/webhooks/fitbit', async (req, res) => {
  const signature = req.headers['x-fitbit-signature'] as string | undefined;
  const rawBody = (req as any).rawBody as Buffer;
  if (!isValidWebhookSignature(rawBody, signature)) {
    res.status(401).send();
    return;
  }

  const notifications = JSON.parse(rawBody.toString()) as FitbitNotification[];
  for (const notification of notifications) {
    if (notification.collectionType === 'userRevokedAccess') {
      await prisma.fitbitConnection.updateMany({
        where: { fitbitUserId: notification.ownerId },
        data: { status: 'DISCONNECTED' },
      });
      continue;
    }

    const conn = await prisma.fitbitConnection.findFirst({ where: { fitbitUserId: notification.ownerId } });
    if (!conn) continue;

    const metricTypes = FITBIT_WEBHOOK_COLLECTIONS[notification.collectionType] ?? [];
    for (const metricType of metricTypes) {
      await enqueueFetchJob({ userId: conn.userId, metricType, date: notification.date });
    }
  }

  res.status(204).send();
});
```

- [ ] **Step 4: Modify `backend/src/app.ts` to capture the raw webhook body and mount the router**

```typescript
import express, { Express } from 'express';
import { authRouter } from './auth/routes';
import { fitbitRouter } from './fitbit/routes';

export function createApp(): Express {
  const app = express();
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(authRouter);
  app.use(fitbitRouter);
  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/fitbit/routes.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/fitbit/routes.ts src/app.ts tests/fitbit/routes.test.ts
git commit -m "Add Fitbit connect flow and webhook routes"
```

---

### Task 12: Token refresh scheduled job

**Files:**
- Create: `backend/src/sync/tokenRefreshJob.ts`
- Test: `backend/tests/sync/tokenRefreshJob.test.ts`

**Interfaces:**
- Consumes: `refreshFitbitTokens` (Task 7); `encryptToken`/`decryptToken` (Task 3); `prisma` (Task 2).
- Produces: `runTokenRefreshSweep(): Promise<void>` — called on an interval from Task 14 (`server.ts`).

- [ ] **Step 1: Write the failing test**

```typescript
// backend/tests/sync/tokenRefreshJob.test.ts
import { runTokenRefreshSweep } from '../../src/sync/tokenRefreshJob';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { encryptToken, decryptToken } from '../../src/crypto/tokenCipher';
import * as oauth from '../../src/fitbit/oauth';

jest.mock('../../src/fitbit/oauth');

beforeAll(() => {
  migrateTestDb();
  process.env.TOKEN_ENCRYPTION_KEY = Buffer.alloc(32, 5).toString('base64');
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('runTokenRefreshSweep', () => {
  it('refreshes connections expiring within the next hour', async () => {
    const user = await prisma.user.create({ data: { email: `t-${Date.now()}@example.com`, authProvider: 'GOOGLE' } });
    await prisma.fitbitConnection.create({
      data: {
        userId: user.id,
        fitbitUserId: 'fb-1',
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min from now
      },
    });
    (oauth.refreshFitbitTokens as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 28800,
      fitbitUserId: 'fb-1',
    });

    await runTokenRefreshSweep();

    const conn = await prisma.fitbitConnection.findUnique({ where: { userId: user.id } });
    expect(decryptToken(conn!.encryptedAccessToken)).toBe('new-access');
  });

  it('marks a connection disconnected when the refresh token has been revoked', async () => {
    const user = await prisma.user.create({ data: { email: `t2-${Date.now()}@example.com`, authProvider: 'GOOGLE' } });
    await prisma.fitbitConnection.create({
      data: {
        userId: user.id,
        fitbitUserId: 'fb-2',
        encryptedAccessToken: encryptToken('old-access'),
        encryptedRefreshToken: encryptToken('old-refresh'),
        tokenExpiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    (oauth.refreshFitbitTokens as jest.Mock).mockRejectedValue(new Error('invalid_grant'));

    await runTokenRefreshSweep();

    const conn = await prisma.fitbitConnection.findUnique({ where: { userId: user.id } });
    expect(conn?.status).toBe('DISCONNECTED');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/sync/tokenRefreshJob.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `backend/src/sync/tokenRefreshJob.ts`**

```typescript
import { prisma } from '../db/client';
import { refreshFitbitTokens } from '../fitbit/oauth';
import { encryptToken, decryptToken } from '../crypto/tokenCipher';

const REFRESH_LOOKAHEAD_MS = 60 * 60 * 1000; // refresh anything expiring within the next hour

export async function runTokenRefreshSweep(): Promise<void> {
  const expiringSoon = await prisma.fitbitConnection.findMany({
    where: {
      status: 'CONNECTED',
      tokenExpiresAt: { lt: new Date(Date.now() + REFRESH_LOOKAHEAD_MS) },
    },
  });

  for (const conn of expiringSoon) {
    try {
      const refreshToken = decryptToken(conn.encryptedRefreshToken);
      const tokens = await refreshFitbitTokens(refreshToken);
      await prisma.fitbitConnection.update({
        where: { id: conn.id },
        data: {
          encryptedAccessToken: encryptToken(tokens.accessToken),
          encryptedRefreshToken: encryptToken(tokens.refreshToken),
          tokenExpiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
        },
      });
    } catch {
      await prisma.fitbitConnection.update({ where: { id: conn.id }, data: { status: 'DISCONNECTED' } });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/sync/tokenRefreshJob.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/sync/tokenRefreshJob.ts tests/sync/tokenRefreshJob.test.ts
git commit -m "Add proactive Fitbit token refresh sweep"
```

---

### Task 13: Reconnect gap-scoped backfill

**Files:**
- Modify: `backend/src/fitbit/routes.ts`
- Modify: `backend/tests/fitbit/routes.test.ts`

**Interfaces:**
- Consumes: `enqueueBackfillJob` (Task 10); `FitbitConnection.lastSyncedAt` (Task 2).
- Produces: updates `/fitbit/callback` to distinguish first-connect (30-day backfill) from reconnect (gap-scoped backfill from `lastSyncedAt`).

- [ ] **Step 1: Add the failing reconnect test**

```typescript
// append to backend/tests/fitbit/routes.test.ts, inside the GET /fitbit/callback describe block
it('scopes the backfill to the gap since last sync on reconnect', async () => {
  const user = await prisma.user.create({ data: { email: `r-${randomUUID()}@example.com`, authProvider: 'GOOGLE' } });
  const { accessToken } = await issueSessionTokens(user.id);
  const lastSyncedAt = new Date('2026-08-15T00:00:00.000Z');

  await prisma.fitbitConnection.create({
    data: {
      userId: user.id,
      fitbitUserId: 'fitbit-user-2',
      encryptedAccessToken: 'placeholder',
      encryptedRefreshToken: 'placeholder',
      tokenExpiresAt: new Date(Date.now() + 3600_000),
      status: 'DISCONNECTED',
      lastSyncedAt,
    },
  });

  (oauth.exchangeCodeForTokens as jest.Mock).mockResolvedValue({
    accessToken: 'fitbit-access-2',
    refreshToken: 'fitbit-refresh-2',
    expiresIn: 28800,
    fitbitUserId: 'fitbit-user-2',
  });

  await request(createApp())
    .get('/fitbit/callback')
    .query({ code: 'auth-code-2', state: user.id })
    .set('Authorization', `Bearer ${accessToken}`);

  expect(queue.enqueueBackfillJob).toHaveBeenCalledWith(
    expect.objectContaining({ userId: user.id, startDate: '2026-08-15' }),
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/fitbit/routes.test.ts`
Expected: FAIL — new test always gets the full 30-day window instead of the gap-scoped one.

- [ ] **Step 3: Modify `backend/src/fitbit/routes.ts`'s callback handler**

Replace the backfill-window calculation block with:

```typescript
  const existing = await prisma.fitbitConnection.findUnique({ where: { userId: req.userId! } });
  const endDate = new Date();
  const startDate = existing?.lastSyncedAt
    ? existing.lastSyncedAt
    : new Date(endDate.getTime() - BACKFILL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
```

and move this block (plus the existing upsert) so `existing` is read *before* the upsert overwrites the row — reorder the handler body to: read `existing` → upsert connection → register subscription → compute `startDate`/`endDate` from `existing` → enqueue backfill.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/fitbit/routes.test.ts`
Expected: PASS (all tests in the file, including the original first-connect case, which has no `lastSyncedAt` and still gets the full 30-day window)

- [ ] **Step 5: Commit**

```bash
cd backend
git add src/fitbit/routes.ts tests/fitbit/routes.test.ts
git commit -m "Scope reconnect backfill to the gap since last sync"
```

---

### Task 14: Biometrics endpoint, app wiring, and integration test

**Files:**
- Create: `backend/src/biometrics/routes.ts`
- Modify: `backend/src/app.ts`
- Modify: `backend/src/server.ts`
- Test: `backend/tests/biometrics/routes.test.ts`
- Test: `backend/tests/integration/connectAndSync.test.ts`

**Interfaces:**
- Consumes: `requireAuth` (Task 6); `getBiometricsForUser` (Task 10); `startSyncWorker` (Task 10); `runTokenRefreshSweep` (Task 12).
- Produces: mounts `GET /me/biometrics`; `server.ts` starts the HTTP server, the sync worker, and the token-refresh interval together — this is the deliverable that makes the whole Phase 1 pipeline runnable as one process.

- [ ] **Step 1: Write the failing biometrics route test**

```typescript
// backend/tests/biometrics/routes.test.ts
import request from 'supertest';
import { createApp } from '../../src/app';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { issueSessionTokens } from '../../src/auth/jwt';

beforeAll(() => {
  migrateTestDb();
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('GET /me/biometrics', () => {
  it('returns the current user\'s biometric records', async () => {
    const user = await prisma.user.create({ data: { email: `b-${Date.now()}@example.com`, authProvider: 'GOOGLE' } });
    await prisma.biometricRecord.create({
      data: { userId: user.id, metricType: 'STEPS', value: 9000, recordedAt: new Date('2026-09-01') },
    });
    const { accessToken } = await issueSessionTokens(user.id);

    const res = await request(createApp()).get('/me/biometrics').set('Authorization', `Bearer ${accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].value).toBe(9000);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await request(createApp()).get('/me/biometrics');
    expect(res.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/biometrics/routes.test.ts`
Expected: FAIL — route not mounted.

- [ ] **Step 3: Write `backend/src/biometrics/routes.ts`**

```typescript
import { Router } from 'express';
import { requireAuth, AuthedRequest } from '../auth/middleware';
import { getBiometricsForUser } from './repository';

export const biometricsRouter = Router();

biometricsRouter.get('/me/biometrics', requireAuth, async (req: AuthedRequest, res) => {
  res.json(await getBiometricsForUser(req.userId!));
});
```

- [ ] **Step 4: Modify `backend/src/app.ts`**

```typescript
import express, { Express } from 'express';
import { authRouter } from './auth/routes';
import { fitbitRouter } from './fitbit/routes';
import { biometricsRouter } from './biometrics/routes';

export function createApp(): Express {
  const app = express();
  app.use(
    express.json({
      verify: (req: any, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(authRouter);
  app.use(fitbitRouter);
  app.use(biometricsRouter);
  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/biometrics/routes.test.ts`
Expected: PASS

- [ ] **Step 6: Write `backend/src/server.ts`**

```typescript
import { createApp } from './app';
import { startSyncWorker } from './sync/worker';
import { runTokenRefreshSweep } from './sync/tokenRefreshJob';

const port = Number(process.env.PORT ?? 3000);
const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000; // every 10 minutes

createApp().listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

startSyncWorker();
setInterval(() => {
  runTokenRefreshSweep().catch((err) => console.error('Token refresh sweep failed', err));
}, TOKEN_REFRESH_INTERVAL_MS);
```

- [ ] **Step 7: Write the failing end-to-end integration test**

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
  process.env.FITBIT_CLIENT_ID = 'client-id';
  process.env.FITBIT_CLIENT_SECRET = 'client-secret';
  process.env.FITBIT_REDIRECT_URI = 'https://app.example.com/fitbit/callback';
});

afterEach(() => nock.cleanAll());
afterAll(async () => {
  await prisma.$disconnect();
});

describe('connect Fitbit and sync end to end (mocked Fitbit API)', () => {
  it('connects, backfills, and serves data via /me/biometrics', async () => {
    const user = await prisma.user.create({ data: { email: `e2e-${Date.now()}@example.com`, authProvider: 'GOOGLE' } });
    const { accessToken } = await issueSessionTokens(user.id);

    nock('https://api.fitbit.com').post('/oauth2/token').reply(200, {
      access_token: 'fitbit-access',
      refresh_token: 'fitbit-refresh',
      expires_in: 28800,
      user_id: 'fitbit-user-e2e',
    });
    nock('https://api.fitbit.com').post(/apiSubscriptions/).reply(201, {});

    let enqueuedBackfill: any;
    jest.spyOn(queue, 'enqueueBackfillJob').mockImplementation(async (data) => {
      enqueuedBackfill = data;
      return {} as any;
    });

    const connectRes = await request(createApp())
      .get('/fitbit/callback')
      .query({ code: 'auth-code', state: user.id })
      .set('Authorization', `Bearer ${accessToken}`);
    expect(connectRes.status).toBe(200);

    nock('https://api.fitbit.com')
      .get(/activities\/heart\/date/)
      .reply(200, { 'activities-heart': [{ dateTime: '2026-09-01', value: { restingHeartRate: 55 } }] });
    nock('https://api.fitbit.com')
      .get(/activities\/steps\/date/)
      .reply(200, { 'activities-steps': [{ dateTime: '2026-09-01', value: '7000' }] });
    nock('https://api.fitbit.com')
      .get(/1\.2\/user\/-\/sleep\/date/)
      .reply(200, { sleep: [{ dateOfSleep: '2026-09-01', minutesAsleep: 400 }] });
    nock('https://api.fitbit.com')
      .get(/hrv\/date/)
      .reply(200, { hrv: [{ dateTime: '2026-09-01', value: { dailyRmssd: 40 } }] });

    await processSyncJob({ name: 'backfill', data: enqueuedBackfill } as any);

    const res = await request(createApp()).get('/me/biometrics').set('Authorization', `Bearer ${accessToken}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(4);
  });
});
```

- [ ] **Step 8: Run test to verify it fails, then passes**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/integration/connectAndSync.test.ts`
Expected: fails first if any wiring gap exists (e.g. missed mock), then passes once all prior tasks' code is correctly wired together. This test exercises the full Goals list from the spec in one pass — treat any failure here as a wiring bug to fix, not a reason to weaken the test.

- [ ] **Step 9: Run the full backend test suite**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL REDIS_URL=redis://localhost:6379 npx jest`
Expected: all tests PASS.

- [ ] **Step 10: Commit**

```bash
cd backend
git add src/biometrics/routes.ts src/app.ts src/server.ts tests/biometrics/routes.test.ts tests/integration/connectAndSync.test.ts
git commit -m "Add biometrics endpoint, wire up server, and add end-to-end integration test"
```

---

### Task 15: Mobile scaffolding, API client, and auth context

**Files:**
- Create: `mobile/package.json`, `mobile/app.json`, `mobile/tsconfig.json`, `mobile/jest.config.js`
- Create: `mobile/src/api/client.ts`
- Create: `mobile/src/auth/AuthContext.tsx`
- Create: `mobile/App.tsx`
- Test: `mobile/__tests__/api/client.test.tsx`
- Test: `mobile/__tests__/auth/AuthContext.test.tsx`

**Interfaces:**
- Produces: `apiFetch<T>(path: string, options?: RequestInit): Promise<T>` (attaches the access token, transparently retries once after a silent refresh on a 401) from `api/client.ts`; `AuthProvider` React context component + `useAuth(): { session, signInWithApple, signInWithGoogle, signOut }` from `auth/AuthContext.tsx` — used by Task 16-18 screens.

- [ ] **Step 1: Initialize the Expo project**

```bash
npx create-expo-app@latest mobile --template blank-typescript
cd mobile
npm install @react-navigation/native @react-navigation/native-stack
npm install expo-secure-store expo-apple-authentication expo-auth-session expo-web-browser expo-crypto
npm install -D jest-expo @testing-library/react-native @testing-library/jest-native @types/jest
```

- [ ] **Step 2: Write `mobile/jest.config.js`**

```js
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEach: ['@testing-library/jest-native/extend-expect'],
};
```

- [ ] **Step 3: Write the failing API client test**

```tsx
// mobile/__tests__/api/client.test.tsx
import * as SecureStore from 'expo-secure-store';
import { apiFetch, setBaseUrl } from '../../src/api/client';

jest.mock('expo-secure-store');

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;

beforeEach(() => {
  setBaseUrl('https://api.example.com');
  fetchMock.mockReset();
  (SecureStore.getItemAsync as jest.Mock).mockImplementation((key: string) =>
    Promise.resolve(key === 'accessToken' ? 'old-access' : 'refresh-token'),
  );
  (SecureStore.setItemAsync as jest.Mock).mockResolvedValue(undefined);
});

describe('apiFetch', () => {
  it('attaches the stored access token to the request', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok' }) });

    const result = await apiFetch('/me/biometrics');

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/me/biometrics',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer old-access' }) }),
    );
    expect(result).toEqual({ data: 'ok' });
  });

  it('refreshes the token once and retries after a 401', async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 401 })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ accessToken: 'new-access', refreshToken: 'new-refresh' }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok-after-refresh' }) });

    const result = await apiFetch('/me/biometrics');

    expect(result).toEqual({ data: 'ok-after-refresh' });
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('accessToken', 'new-access');
  });
});
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/api/client.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 5: Write `mobile/src/api/client.ts`**

```typescript
import * as SecureStore from 'expo-secure-store';

let baseUrl = '';
export function setBaseUrl(url: string): void {
  baseUrl = url;
}

async function refreshAccessToken(): Promise<string> {
  const refreshToken = await SecureStore.getItemAsync('refreshToken');
  const res = await fetch(`${baseUrl}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) throw new Error('Session expired, please sign in again');
  const tokens = await res.json();
  await SecureStore.setItemAsync('accessToken', tokens.accessToken);
  await SecureStore.setItemAsync('refreshToken', tokens.refreshToken);
  return tokens.accessToken;
}

export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  let accessToken = await SecureStore.getItemAsync('accessToken');
  const doFetch = (token: string | null) =>
    fetch(`${baseUrl}${path}`, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${token}` },
    });

  let res = await doFetch(accessToken);
  if (res.status === 401) {
    accessToken = await refreshAccessToken();
    res = await doFetch(accessToken);
  }
  if (!res.ok) throw new Error(`Request to ${path} failed with ${res.status}`);
  return res.json() as Promise<T>;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/api/client.test.tsx`
Expected: PASS

- [ ] **Step 7: Write the failing AuthContext test**

```tsx
// mobile/__tests__/auth/AuthContext.test.tsx
import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Text, Button } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';

jest.mock('expo-secure-store');

function TestConsumer() {
  const { session, signOut } = useAuth();
  return (
    <>
      <Text testID="status">{session ? 'signed-in' : 'signed-out'}</Text>
      <Button title="sign out" onPress={signOut} />
    </>
  );
}

beforeEach(() => {
  (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
  (SecureStore.deleteItemAsync as jest.Mock).mockResolvedValue(undefined);
});

describe('AuthContext', () => {
  it('starts signed out when no stored session exists', async () => {
    const { getByTestId } = render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>,
    );
    await waitFor(() => expect(getByTestId('status').props.children).toBe('signed-out'));
  });
});
```

- [ ] **Step 8: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/auth/AuthContext.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 9: Write `mobile/src/auth/AuthContext.ts` (as `.tsx`)**

```tsx
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import * as SecureStore from 'expo-secure-store';
import { apiFetch } from '../api/client';

interface Session {
  accessToken: string;
}

interface AuthContextValue {
  session: Session | null;
  signInWithApple: (identityToken: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function storeSession(tokens: { accessToken: string; refreshToken: string }): Promise<void> {
  await SecureStore.setItemAsync('accessToken', tokens.accessToken);
  await SecureStore.setItemAsync('refreshToken', tokens.refreshToken);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    SecureStore.getItemAsync('accessToken').then((token) => {
      if (token) setSession({ accessToken: token });
    });
  }, []);

  async function signInWithApple(identityToken: string) {
    const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/apple', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityToken }),
    });
    await storeSession(tokens);
    setSession({ accessToken: tokens.accessToken });
  }

  async function signInWithGoogle(idToken: string) {
    const tokens = await apiFetch<{ accessToken: string; refreshToken: string }>('/auth/google', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken }),
    });
    await storeSession(tokens);
    setSession({ accessToken: tokens.accessToken });
  }

  async function signOut() {
    const refreshToken = await SecureStore.getItemAsync('refreshToken');
    await apiFetch('/auth/signout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    }).catch(() => undefined);
    await SecureStore.deleteItemAsync('accessToken');
    await SecureStore.deleteItemAsync('refreshToken');
    setSession(null);
  }

  return (
    <AuthContext.Provider value={{ session, signInWithApple, signInWithGoogle, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

(File is created at `mobile/src/auth/AuthContext.tsx` — the plan header lists it as `.tsx` because it contains JSX.)

- [ ] **Step 10: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/auth/AuthContext.test.tsx`
Expected: PASS

- [ ] **Step 11: Write `mobile/App.tsx`**

```tsx
import React from 'react';
import { AuthProvider } from './src/auth/AuthContext';
import { RootNavigator } from './src/navigation/RootNavigator';
import { setBaseUrl } from './src/api/client';

setBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000');

export default function App() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}
```

(`RootNavigator` is created in Task 16 alongside the first screen it needs to route to.)

- [ ] **Step 12: Commit**

```bash
cd mobile
git add package.json app.json tsconfig.json jest.config.js src/api/client.ts src/auth/AuthContext.tsx App.tsx \
  __tests__/api/client.test.tsx __tests__/auth/AuthContext.test.tsx
git commit -m "Scaffold mobile app with API client and auth context"
```

---

### Task 16: Sign-in screen and navigation shell

**Files:**
- Create: `mobile/.env.example`
- Create: `mobile/src/navigation/RootNavigator.tsx`
- Create: `mobile/src/screens/SignInScreen.tsx`
- Test: `mobile/__tests__/screens/SignInScreen.test.tsx`

**Interfaces:**
- Consumes: `useAuth` (Task 15).
- Produces: `RootNavigator` component that renders `SignInScreen` when `session` is null and `ConnectFitbitScreen`/`DashboardScreen` (Tasks 17-18) otherwise; `SignInScreen` component with both Apple and Google sign-in, per the spec's "Sign in with Apple/Google" requirement — both providers ship together, not one now and one deferred.

- [ ] **Step 1: Write `mobile/.env.example`**

```
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID=
```

- [ ] **Step 2: Write the failing test**

```tsx
// mobile/__tests__/screens/SignInScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { SignInScreen } from '../../src/screens/SignInScreen';
import { useAuth } from '../../src/auth/AuthContext';

jest.mock('../../src/auth/AuthContext');
jest.mock('expo-apple-authentication');
jest.mock('expo-auth-session/providers/google');

describe('SignInScreen', () => {
  it('signs in with Apple when the Apple button is pressed', async () => {
    const signInWithApple = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ signInWithApple, signInWithGoogle: jest.fn() });
    (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-token' });
    (Google.useAuthRequest as jest.Mock).mockReturnValue([{}, null, jest.fn()]);

    const { getByTestId } = render(<SignInScreen />);
    fireEvent.press(getByTestId('apple-sign-in-button'));

    await waitFor(() => expect(signInWithApple).toHaveBeenCalledWith('apple-token'));
  });

  it('calls promptAsync when the Google button is pressed', () => {
    const promptAsync = jest.fn();
    (useAuth as jest.Mock).mockReturnValue({ signInWithApple: jest.fn(), signInWithGoogle: jest.fn() });
    (Google.useAuthRequest as jest.Mock).mockReturnValue([{}, null, promptAsync]);

    const { getByTestId } = render(<SignInScreen />);
    fireEvent.press(getByTestId('google-sign-in-button'));

    expect(promptAsync).toHaveBeenCalled();
  });

  it('signs in with Google once the auth session response succeeds', async () => {
    const signInWithGoogle = jest.fn().mockResolvedValue(undefined);
    (useAuth as jest.Mock).mockReturnValue({ signInWithApple: jest.fn(), signInWithGoogle });
    (Google.useAuthRequest as jest.Mock).mockReturnValue([
      {},
      { type: 'success', authentication: { idToken: 'google-token' } },
      jest.fn(),
    ]);

    render(<SignInScreen />);

    await waitFor(() => expect(signInWithGoogle).toHaveBeenCalledWith('google-token'));
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/screens/SignInScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `mobile/src/screens/SignInScreen.tsx`**

```tsx
import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Google from 'expo-auth-session/providers/google';
import { useAuth } from '../auth/AuthContext';

export function SignInScreen() {
  const { signInWithApple, signInWithGoogle } = useAuth();
  const [, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.idToken) {
      signInWithGoogle(response.authentication.idToken);
    }
  }, [response]);

  async function handleAppleSignIn() {
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL],
    });
    if (credential.identityToken) {
      await signInWithApple(credential.identityToken);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Biometrics</Text>
      <Pressable testID="apple-sign-in-button" style={styles.button} onPress={handleAppleSignIn}>
        <Text style={styles.buttonText}>Sign in with Apple</Text>
      </Pressable>
      <Pressable testID="google-sign-in-button" style={styles.googleButton} onPress={() => promptAsync()}>
        <Text style={styles.buttonText}>Sign in with Google</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  title: { fontSize: 24, fontWeight: '600' },
  button: { backgroundColor: '#000', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  googleButton: { backgroundColor: '#4285F4', paddingVertical: 12, paddingHorizontal: 24, borderRadius: 8 },
  buttonText: { color: '#fff', fontSize: 16 },
});
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/screens/SignInScreen.test.tsx`
Expected: PASS

- [ ] **Step 6: Write `mobile/src/navigation/RootNavigator.tsx`**

```tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { SignInScreen } from '../screens/SignInScreen';
import { ConnectFitbitScreen } from '../screens/ConnectFitbitScreen';
import { DashboardScreen } from '../screens/DashboardScreen';

export type RootStackParamList = {
  ConnectFitbit: undefined;
  Dashboard: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  const { session } = useAuth();

  if (!session) {
    return <SignInScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="ConnectFitbit">
        <Stack.Screen name="ConnectFitbit" component={ConnectFitbitScreen} options={{ title: 'Connect Fitbit' }} />
        <Stack.Screen name="Dashboard" component={DashboardScreen} options={{ title: 'Dashboard' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

(`ConnectFitbitScreen` and `DashboardScreen` are implemented in Tasks 17-18 respectively; their import paths and export names are fixed here so both tasks can be implemented independently against this navigator.)

- [ ] **Step 7: Commit**

```bash
cd mobile
git add src/navigation/RootNavigator.tsx src/screens/SignInScreen.tsx __tests__/screens/SignInScreen.test.tsx
git commit -m "Add sign-in screen and navigation shell"
```

---

### Task 17: Connect Fitbit screen

**Files:**
- Create: `mobile/src/screens/ConnectFitbitScreen.tsx`
- Test: `mobile/__tests__/screens/ConnectFitbitScreen.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 15); `expo-web-browser`'s `openAuthSessionAsync`.
- Produces: `ConnectFitbitScreen` component, navigates to `Dashboard` (Task 16's stack) once connected.

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/screens/ConnectFitbitScreen.test.tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';
import { ConnectFitbitScreen } from '../../src/screens/ConnectFitbitScreen';

jest.mock('expo-web-browser');

const navigateMock = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));

describe('ConnectFitbitScreen', () => {
  it('opens the Fitbit auth session and navigates to Dashboard on success', async () => {
    (WebBrowser.openAuthSessionAsync as jest.Mock).mockResolvedValue({
      type: 'success',
      url: 'biometrics://fitbit/callback?status=connected',
    });

    const { getByTestId } = render(<ConnectFitbitScreen />);
    fireEvent.press(getByTestId('connect-fitbit-button'));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith('Dashboard'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/screens/ConnectFitbitScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `mobile/src/screens/ConnectFitbitScreen.tsx`**

```tsx
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import { useNavigation } from '@react-navigation/native';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';
const REDIRECT_URI = 'biometrics://fitbit/callback';

export function ConnectFitbitScreen() {
  const navigation = useNavigation<any>();

  async function handleConnect() {
    const result = await WebBrowser.openAuthSessionAsync(
      `${API_BASE_URL}/fitbit/authorize`,
      REDIRECT_URI,
    );
    if (result.type === 'success' && result.url.includes('status=connected')) {
      navigation.navigate('Dashboard');
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Connect your Fitbit</Text>
      <Pressable testID="connect-fitbit-button" style={styles.button} onPress={handleConnect}>
        <Text style={styles.buttonText}>Connect Fitbit</Text>
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

**Note:** this assumes `/fitbit/callback` on the backend (Task 11) redirects to `REDIRECT_URI` with a `status` query param on completion — Task 11's handler currently responds with JSON instead of a redirect. Add this as a follow-up fix to `backend/src/fitbit/routes.ts`:

```typescript
// replace res.json({ status: 'connected' }); in the /fitbit/callback handler with:
res.redirect(`biometrics://fitbit/callback?status=connected`);
```

Update `backend/tests/fitbit/routes.test.ts`'s assertions accordingly (`expect(res.status).toBe(302)` and check `res.headers.location`) before re-running the backend test suite.

- [ ] **Step 4: Apply the backend redirect fix and re-run backend tests**

Run: `cd backend && DATABASE_URL=$TEST_DATABASE_URL TEST_DATABASE_URL=$TEST_DATABASE_URL npx jest tests/fitbit/routes.test.ts`
Expected: PASS after updating the two callback tests' status/assertion expectations to match the redirect.

- [ ] **Step 5: Run the mobile test to verify it passes**

Run: `cd mobile && npx jest __tests__/screens/ConnectFitbitScreen.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
cd backend
git add src/fitbit/routes.ts tests/fitbit/routes.test.ts
git commit -m "Redirect to mobile app deep link after Fitbit connect"
cd ../mobile
git add src/screens/ConnectFitbitScreen.tsx __tests__/screens/ConnectFitbitScreen.test.tsx
git commit -m "Add Connect Fitbit screen"
```

---

### Task 18: Dashboard screen

**Files:**
- Create: `mobile/src/screens/DashboardScreen.tsx`
- Test: `mobile/__tests__/screens/DashboardScreen.test.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 15).
- Produces: `DashboardScreen` component — the terminal screen of Phase 1's user flow.

- [ ] **Step 1: Write the failing test**

```tsx
// mobile/__tests__/screens/DashboardScreen.test.tsx
import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { DashboardScreen } from '../../src/screens/DashboardScreen';
import { apiFetch } from '../../src/api/client';

jest.mock('../../src/api/client');

describe('DashboardScreen', () => {
  it('renders fetched biometric records', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([
      { id: '1', metricType: 'STEPS', value: 9000, recordedAt: '2026-09-01T00:00:00.000Z' },
      { id: '2', metricType: 'RESTING_HR', value: 58, recordedAt: '2026-09-01T00:00:00.000Z' },
    ]);

    const { getByText } = render(<DashboardScreen />);

    await waitFor(() => {
      expect(getByText(/STEPS/)).toBeTruthy();
      expect(getByText(/9000/)).toBeTruthy();
    });
  });

  it('shows an empty state when there are no records yet', async () => {
    (apiFetch as jest.Mock).mockResolvedValue([]);

    const { getByText } = render(<DashboardScreen />);

    await waitFor(() => expect(getByText(/No data yet/i)).toBeTruthy());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mobile && npx jest __tests__/screens/DashboardScreen.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `mobile/src/screens/DashboardScreen.tsx`**

```tsx
import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet } from 'react-native';
import { apiFetch } from '../api/client';

interface BiometricRecord {
  id: string;
  metricType: string;
  value: number;
  recordedAt: string;
}

export function DashboardScreen() {
  const [records, setRecords] = useState<BiometricRecord[] | null>(null);

  useEffect(() => {
    apiFetch<BiometricRecord[]>('/me/biometrics').then(setRecords);
  }, []);

  if (records === null) {
    return (
      <View style={styles.container}>
        <Text>Loading…</Text>
      </View>
    );
  }

  if (records.length === 0) {
    return (
      <View style={styles.container}>
        <Text>No data yet — check back after your Fitbit syncs.</Text>
      </View>
    );
  }

  return (
    <FlatList
      contentContainerStyle={styles.list}
      data={records}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <Text style={styles.metric}>{item.metricType}</Text>
          <Text>{item.value}</Text>
          <Text style={styles.date}>{new Date(item.recordedAt).toDateString()}</Text>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  list: { padding: 16, gap: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#eee' },
  metric: { fontWeight: '600' },
  date: { color: '#888' },
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mobile && npx jest __tests__/screens/DashboardScreen.test.tsx`
Expected: PASS

- [ ] **Step 5: Run the full mobile test suite**

Run: `cd mobile && npx jest`
Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
cd mobile
git add src/screens/DashboardScreen.tsx __tests__/screens/DashboardScreen.test.tsx
git commit -m "Add dashboard screen displaying synced biometric data"
```

---

### Task 19: Manual verification on iOS simulator via vphone-cli

**Files:** none (manual verification pass; no code changes expected unless a bug surfaces, in which case fix it in the relevant task's files and re-run that task's automated tests before continuing here).

**Interfaces:** none — this task consumes the fully wired app from Tasks 1-18 as a black box.

- [ ] **Step 1: Set up the emulated device**

Follow `Lakr233/vphone-cli`'s setup instructions to provision an iOS simulator instance suitable for testing the Expo app (check the repo's README for the exact CLI invocation, since this is an external tool this plan doesn't control the interface of).

- [ ] **Step 2: Run the backend locally**

```bash
cd backend
docker compose -f docker-compose.test.yml up -d
docker run -d -p 6379:6379 redis:7
DATABASE_URL=postgresql://postgres:postgres@localhost:5434/biometrics_test npx prisma migrate deploy
npm run build && node dist/server.js
```

Use `ngrok http 3000` (or similar) to get a public HTTPS URL for the Fitbit webhook endpoint, since Fitbit requires HTTPS for both the authorize redirect and webhook delivery — set `FITBIT_REDIRECT_URI` and register the webhook subscription's callback URL in the Fitbit developer console to this tunnel URL before testing.

- [ ] **Step 3: Run the mobile app against the emulator**

```bash
cd mobile
EXPO_PUBLIC_API_BASE_URL=https://<your-ngrok-url> npx expo start
```

Use `vphone-cli` to launch the app on the emulated device pointed at the Expo dev server.

- [ ] **Step 4: Walk the golden path manually**

1. Sign in with Apple (or Google) on a real/test account.
2. Tap "Connect Fitbit," complete the OAuth consent screen with a real Fitbit developer test account.
3. Confirm the app navigates to the Dashboard.
4. Confirm the backend logs show the webhook GET verification challenge succeeding and the backfill job running.
5. Wait for (or manually trigger, via the Fitbit developer console's test notification tool) a webhook POST, and confirm new data appears in `/me/biometrics` and, after a manual refresh, on the Dashboard.
6. Sign out, confirm the app returns to the Sign-In screen, and confirm the old refresh token now fails when replayed via `curl` against `/auth/refresh`.

- [ ] **Step 5: Record results**

Note any discrepancies from the spec's expected behavior directly against the relevant task in this plan (do not silently patch around a spec mismatch — if behavior needs to change, that's a signal to revisit the spec, not just the code).

---

### Task 20: Dockerize the backend for ECS Fargate

**Files:**
- Create: `backend/Dockerfile`
- Create: `backend/.dockerignore`
- Test: manual (see Step 3 below) — a container smoke-test, not a Jest test, since this validates the build/runtime environment rather than application logic already covered by Tasks 1-14's suites.

**Interfaces:**
- Consumes: `backend/package.json`, `backend/src/server.ts` (Task 1), `backend/prisma/schema.prisma` (Task 2) — everything produced by Tasks 1-14.
- Produces: a container image runnable on ECS Fargate, listening on `PORT` and requiring `DATABASE_URL`, `REDIS_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `TOKEN_ENCRYPTION_KEY`, `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, `FITBIT_REDIRECT_URI`, `FITBIT_VERIFY_CODE`, `GOOGLE_CLIENT_ID`, `APPLE_BUNDLE_ID` as environment variables (the same set defined in `backend/.env.example`, Task 1).

- [ ] **Step 1: Write `backend/.dockerignore`**

```
node_modules
dist
.env
*.test.ts
tests
```

- [ ] **Step 2: Write `backend/Dockerfile`**

```dockerfile
FROM node:20-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:20-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY prisma ./prisma
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- [ ] **Step 3: Build the image and smoke-test it locally**

```bash
cd backend
docker build -t biometrics-backend:local .
docker run --rm -p 3000:3000 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:5434/biometrics_test \
  -e REDIS_URL=redis://host.docker.internal:6379 \
  -e JWT_ACCESS_SECRET=smoke-test \
  -e JWT_REFRESH_SECRET=smoke-test \
  -e TOKEN_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('base64'))") \
  biometrics-backend:local &
sleep 2
curl -f http://localhost:3000/health
```

Expected: `curl` returns `{"status":"ok"}`, confirming the built image starts and serves traffic — this is the container-level equivalent of Task 1's health-check test, now run against the actual deployable artifact.

- [ ] **Step 4: Add the `build` script `package.json` needs (if not already present from Task 1)**

Confirm `backend/package.json`'s `scripts` includes:
```json
"build": "tsc"
```
If it's missing, add it — Task 1 only ran `npx tsc --init`, which doesn't add a build script.

- [ ] **Step 5: Commit**

```bash
cd backend
git add Dockerfile .dockerignore package.json
git commit -m "Add Dockerfile for ECS Fargate deployment"
```

---

## Out of Scope for This Plan

- **AWS infrastructure provisioning** (VPC, ECS cluster/service definition, RDS Postgres instance, ElastiCache/self-hosted Redis for BullMQ, Secrets Manager entries for the env vars listed in Task 20, IAM roles/policies) is performed directly against the user's AWS account and isn't broken into TDD-style tasks here — there's no test to write for "an RDS instance exists." Task 20's Docker image is the handoff artifact this provisioning work consumes.
- **CI/CD pipeline** (automatically building Task 20's image and deploying it to ECS on merge) is not covered — running the test suites and building the image locally, as each task's steps do, is sufficient for Phase 1.
- **Fitbit Developer Console app registration** (creating the app, obtaining `FITBIT_CLIENT_ID`/`FITBIT_CLIENT_SECRET`, and configuring the OAuth redirect + webhook subscriber URL) is an account-setup step the user performs once, referenced in Task 19's manual verification but not a coding task.
