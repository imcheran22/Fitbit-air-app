# Better Auth Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Biometrics' hand-rolled JWT/refresh-token auth with Better Auth 1.7.5 (native Apple/Google ID-token sign-in, email + password with verification and reset, verified-email account linking, device/session management).

**Architecture:** One `betterAuth` instance in `backend/src/auth/auth.ts` (Prisma adapter, DB-backed sessions, `expo()` plugin) mounted at `/auth/*` before `express.json`. `requireAuth` becomes a `getSession` call and keeps its `req.userId` contract, so domain routers do not change. The Expo app uses `createAuthClient` + `expoClient` (session cookie in SecureStore); `api/client.ts` sends that cookie and has no refresh logic.

**Tech Stack:** Node 24, Express 5, Prisma 6 / PostgreSQL, better-auth 1.7.5, @better-auth/expo 1.7.5, Jest 30 + ts-jest (backend), Expo SDK 57 + React Navigation + jest-expo (mobile).

**Spec:** `docs/superpowers/specs/2026-09-23-better-auth-migration-design.md`

## Global Constraints

- Node **24** everywhere (local, Dockerfile, CI). better-auth is ESM-only; the CommonJS backend loads it through Node 24's `require(esm)`. Backend Jest runs with `NODE_OPTIONS=--experimental-vm-modules`.
- Pin exact versions: `better-auth@1.7.5`, `@better-auth/expo@1.7.5`.
- Backend stays `"module": "commonjs"`; do not convert to ESM.
- Better Auth `basePath` is `/auth`; the handler is mounted with `app.all('/auth/*splat', …)` **before** `express.json`.
- IDs stay UUID strings (`advanced.database.generateId: 'uuid'`, Prisma `@default(uuid())`).
- Session `expiresIn` 30 days, `updateAge` 1 day. No cookie cache (revocation must be immediate).
- Account linking: `trustedProviders: ['apple', 'google']`, `allowDifferentEmails: false`, `allowUnlinkingAll: false`.
- Email/password: `requireEmailVerification: true`, `revokeSessionsOnPasswordReset: true`.
- Mobile deep-link scheme is `biometrics`; `trustedOrigins` contains `'biometrics://'` (plus `exp://` wildcards outside production).
- `requireAuth` 401 bodies: `{ error: 'Missing session' }` (no credentials) and `{ error: 'Invalid or expired token' }` (bad/expired). DB failures are 500, never 401.
- `google-auth-library` stays (used by `health/serviceAccount.ts`). `jsonwebtoken`, `@types/jsonwebtoken`, `jose` are removed from the backend.
- Google Health OAuth (`health/oauth.ts`, `sync/*`, `HealthConnection`) is not touched.
- Commit messages: imperative sentence, no `feat:` prefixes (match `git log`), no Co-Authored-By trailer.

## Review Focus

1. **Database outage during `requireAuth`** — a reasonable person expects a 500 ("try again"), not a 401 that the app turns into a sign-out. Pinned in Task 3 (`middleware.test.ts`: getSession returns null while the DB is down → 500).
2. **A stale 401 after re-sign-in** — a request started with the old cookie comes back 401 after the user has already signed in again; it must not sign the new session out. Pinned in Task 8 (`client.test.tsx`).
3. **Email case / whitespace** — `User@Example.com ` at sign-up then `user@example.com` at sign-in (or a Google token with lower-case email) must be the same account. Pinned in Task 4 (`emailPassword.test.ts`).
4. **Apple sign-in with a hidden name** — Apple sends no name after the first sign-in (and the user may hide it); account creation must not fail on the required `name`. Pinned in Task 3 (`socialSignIn.test.ts`).
5. **Unlinking the last sign-in method** — must be refused both in UI and by the server, otherwise the user locks themselves out. Pinned in Task 4 (server) and Task 11 (UI).

## Spec amendments made while planning (approved with this plan)

- **Node 24 upgrade** (Task 1): better-auth 1.7.5 is ESM-only; Node 20.15 (current) cannot `require()` it. Verified: Node 24.21 + `--experimental-vm-modules` runs it under the existing Jest/ts-jest setup.
- **Dev data is migrated, not wiped** (Task 3): the migration derives `name`, `emailVerified`, and `Account` rows from existing `User` rows, so the developer's synced health data survives. If two dev users share an email the migration fails on the unique index; delete one of them and re-run.
- **Verification link lands on sign-in, not signed in** (Task 10): `autoSignInAfterVerification: false`; `biometrics://verified` opens the sign-in screen with an "Email verified" banner. Storing a session from a cold-start deep link would depend on undocumented Expo-plugin internals.
- **No `onSessionExpired` event** (Task 8/9): the Expo client clears its cached session inside `authClient.signOut()`'s request hook (before the network call), so `api/client.ts` calls `authClient.signOut()` on a 401 and `AuthContext` derives `session` from `authClient.useSession()`.
- **`GOOGLE_IOS_CLIENT_ID` is optional**: today's `GOOGLE_CLIENT_ID` already verifies the app's tokens; the second id is accepted if set.

## File Structure

Backend (`backend/`):

| File | Responsibility |
|---|---|
| `src/email/sender.ts` (new) | `EmailSender` interface; console, Resend, default selection |
| `src/email/templates.ts` (new) | Verification / reset / existing-account message builders |
| `src/auth/auth.ts` (new) | `createAuth(deps)`, default `auth`, `Auth` type |
| `src/auth/middleware.ts` (rewrite) | `requireAuth` via `auth.api.getSession` |
| `src/app.ts` (modify) | `createApp({ auth })`, mount handler before JSON |
| `src/auth/{jwt,appleAuth,googleAuth,routes}.ts` (delete) | old system |
| `src/users/repository.ts` (delete) | `findOrCreateUserByProvider` only lived here |
| `src/users/deletion.ts` (modify) | `USER_OWNED_MODELS`: `Session`, `Account` replace `RefreshToken` |
| `src/types.ts` (modify) | drop `AuthProvider`, `SessionTokens` |
| `prisma/schema.prisma`, `prisma/migrations/20260927120000_better_auth/` | schema + hand-written migration |
| `tests/setupEnv.ts` (new) | test env defaults loaded before modules |
| `tests/helpers/auth.ts` (new) | `createTestUser`, `authHeaderFor`, `fakeIdToken`, `captureEmail`, `createTestApp` |
| `tests/auth/*.test.ts` (replace) | `esmLoad`, `middleware`, `socialSignIn`, `emailPassword`, `sessions` |
| `tests/email/*.test.ts` (new) | sender tests |
| `scripts/sweep-test-auth.mjs` (new, deleted after use) | mechanical test sweep |

Mobile (`mobile/`):

| File | Responsibility |
|---|---|
| `src/auth/authClient.ts` (new) | `authClient`, `API_BASE_URL` |
| `src/auth/authErrors.ts` (new) | `AuthError`, `unwrap()`, `messageFor()` |
| `src/auth/useGoogleIdToken.ts` (new) | shared Google ID-token hook |
| `src/auth/AuthContext.tsx` (rewrite) | session from `useSession`, sign-in/up/out, reset |
| `src/api/client.ts` (modify) | cookie auth, no refresh, stale-401 guard |
| `src/navigation/AuthNavigator.tsx` (new) | signed-out stack + deep-link config |
| `src/navigation/RootNavigator.tsx` (modify) | uses `AuthNavigator`; adds `SignInMethods`, `Devices` |
| `src/screens/SignInScreen.tsx` (rewrite) | social + email/password |
| `src/screens/SignUpScreen.tsx`, `ForgotPasswordScreen.tsx`, `ResetPasswordScreen.tsx` (new) | email flows |
| `src/screens/SignInMethodsScreen.tsx`, `DevicesScreen.tsx` (new) | linking, sessions |
| `src/components/account-section.tsx` (new) | Settings rows to the two screens |
| `jest-mocks/authClient.js` (new) | global authClient mock |

---

### Task 1: Node 24 runtime and Better Auth dependency

**Files:**
- Create: `.nvmrc`, `backend/tests/auth/esmLoad.test.ts`
- Modify: `backend/Dockerfile:1,17`, `backend/package.json`

**Interfaces:**
- Produces: `better-auth@1.7.5` and `@better-auth/expo@1.7.5` importable from backend source and Jest.

- [ ] **Step 1: Pin Node 24**

```bash
cd <worktree root>
echo 24 > .nvmrc
nvm use 24 && node -v   # v24.x
```

In `backend/Dockerfile` replace both `FROM node:20-slim` lines with `FROM node:24-slim` (line 1 keeps `AS build`).

In `backend/package.json` add `"engines": { "node": ">=24" }` and change the test script:

```json
"test": "NODE_OPTIONS=--experimental-vm-modules jest",
```

- [ ] **Step 2: Write the failing load test**

`backend/tests/auth/esmLoad.test.ts`:

```ts
// better-auth is ESM-only. The backend is CommonJS, so it loads through Node
// 24's require(esm); under Jest that needs --experimental-vm-modules (set in the
// npm test script). This test fails first if either is missing.
import { betterAuth } from 'better-auth';
import { toNodeHandler } from 'better-auth/node';
import { expo } from '@better-auth/expo';

it('loads better-auth and the expo server plugin', () => {
  expect(typeof betterAuth).toBe('function');
  expect(typeof toNodeHandler).toBe('function');
  expect(typeof expo).toBe('function');
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && npx jest tests/auth/esmLoad.test.ts`
Expected: FAIL, `Cannot find module 'better-auth'`.

- [ ] **Step 4: Install**

```bash
cd backend
rm -rf node_modules && npm install          # rebuild native deps under Node 24
npm install --save-exact better-auth@1.7.5 @better-auth/expo@1.7.5
```

- [ ] **Step 5: Run the test and the full suite**

Run: `npm test -- tests/auth/esmLoad.test.ts` → PASS.
Run: `npm test` → same pass/fail set as on `main` under Node 20 (record any pre-existing failures in the commit message body).
Run: `npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit**

```bash
git add .nvmrc backend/Dockerfile backend/package.json backend/package-lock.json backend/tests/auth/esmLoad.test.ts
git commit -m "Move the backend to Node 24 and add Better Auth"
```

---

### Task 2: Email sender

**Files:**
- Create: `backend/src/email/sender.ts`, `backend/src/email/templates.ts`, `backend/tests/email/sender.test.ts`

**Interfaces:**
- Produces:
  - `interface EmailMessage { to: string; subject: string; text: string }`
  - `interface EmailSender { send(message: EmailMessage): Promise<void> }`
  - `consoleEmailSender(log?: (line: string) => void): EmailSender`
  - `resendEmailSender(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailSender`
  - `defaultEmailSender(env?: NodeJS.ProcessEnv): EmailSender`
  - `verificationEmail(to: string, url: string): EmailMessage`
  - `resetPasswordEmail(to: string, url: string): EmailMessage`
  - `existingAccountEmail(to: string): EmailMessage`

- [ ] **Step 1: Write the failing tests**

`backend/tests/email/sender.test.ts`:

```ts
import { consoleEmailSender, resendEmailSender, defaultEmailSender } from '../../src/email/sender';
import { verificationEmail } from '../../src/email/templates';

describe('consoleEmailSender', () => {
  it('logs the recipient, subject and body (links are clickable in dev logs)', async () => {
    const lines: string[] = [];
    await consoleEmailSender((l) => lines.push(l)).send(verificationEmail('a@example.com', 'http://x/verify?token=t'));
    const out = lines.join('\n');
    expect(out).toContain('a@example.com');
    expect(out).toContain('http://x/verify?token=t');
  });
});

describe('resendEmailSender', () => {
  it('POSTs to the Resend API with the key and from address', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
    await resendEmailSender({ apiKey: 'rk', from: 'Biometrics <no-reply@x.dev>', fetchImpl }).send({
      to: 'a@example.com', subject: 's', text: 't',
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer rk');
    expect(JSON.parse(init.body)).toEqual({ from: 'Biometrics <no-reply@x.dev>', to: ['a@example.com'], subject: 's', text: 't' });
  });

  it('throws on a non-2xx response, without echoing the API key', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'bad from' });
    const err = await resendEmailSender({ apiKey: 'secret-key', from: 'f@x.dev', fetchImpl })
      .send({ to: 'a@example.com', subject: 's', text: 't' })
      .catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('422');
    expect((err as Error).message).not.toContain('secret-key');
  });
});

describe('defaultEmailSender', () => {
  it('uses Resend when RESEND_API_KEY and EMAIL_FROM are set, console otherwise', () => {
    expect(defaultEmailSender({ RESEND_API_KEY: 'k', EMAIL_FROM: 'f@x.dev' }).constructor.name).toBe('ResendEmailSender');
    expect(defaultEmailSender({}).constructor.name).toBe('ConsoleEmailSender');
  });

  it('refuses to fall back to console in production', () => {
    expect(() => defaultEmailSender({ NODE_ENV: 'production' })).toThrow('RESEND_API_KEY');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && npm test -- tests/email` → FAIL, module not found.

- [ ] **Step 3: Implement**

`backend/src/email/sender.ts`:

```ts
// Outbound email for auth flows (verification, password reset, "someone tried
// to sign up with your address"). Resend in production; in development the
// console sender prints the message so the link can be opened from the log.

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface EmailSender {
  send(message: EmailMessage): Promise<void>;
}

class ConsoleEmailSender implements EmailSender {
  constructor(private readonly log: (line: string) => void) {}

  async send(message: EmailMessage): Promise<void> {
    this.log(`[email] to=${message.to} subject=${JSON.stringify(message.subject)}\n${message.text}`);
  }
}

class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetchImpl: typeof fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await this.fetchImpl('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!res.ok) {
      // The body is Resend's error description; it never contains our key.
      throw new Error(`Resend rejected the email with ${res.status}: ${await res.text()}`);
    }
  }
}

export function consoleEmailSender(log: (line: string) => void = console.log): EmailSender {
  return new ConsoleEmailSender(log);
}

export function resendEmailSender(opts: { apiKey: string; from: string; fetchImpl?: typeof fetch }): EmailSender {
  return new ResendEmailSender(opts.apiKey, opts.from, opts.fetchImpl ?? fetch);
}

export function defaultEmailSender(env: NodeJS.ProcessEnv = process.env): EmailSender {
  if (env.RESEND_API_KEY && env.EMAIL_FROM) {
    return resendEmailSender({ apiKey: env.RESEND_API_KEY, from: env.EMAIL_FROM });
  }
  // A production server that silently logs password-reset links would be a
  // security bug, not a fallback.
  if (env.NODE_ENV === 'production') {
    throw new Error('RESEND_API_KEY and EMAIL_FROM must be set in production');
  }
  return consoleEmailSender();
}
```

`backend/src/email/templates.ts`:

```ts
import type { EmailMessage } from './sender';

export function verificationEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Confirm your Biometrics email',
    text: `Open this link on your phone to confirm your email address:\n\n${url}\n\nIf you did not create a Biometrics account, ignore this email.`,
  };
}

export function resetPasswordEmail(to: string, url: string): EmailMessage {
  return {
    to,
    subject: 'Reset your Biometrics password',
    text: `Open this link on your phone to choose a new password:\n\n${url}\n\nIt expires in one hour. If you did not ask for this, ignore this email.`,
  };
}

// Sent instead of a verification email when someone signs up with an address
// that already has an account. The sign-up response itself is identical either
// way, so the form cannot be used to discover which addresses are registered.
export function existingAccountEmail(to: string): EmailMessage {
  return {
    to,
    subject: 'Someone tried to create a Biometrics account with your email',
    text:
      'Someone tried to create a new Biometrics account with this email address, which already has an account.\n\n' +
      'If it was you, sign in instead (use "Forgot password?" if you signed up with Apple or Google and want a password).\n' +
      'If it was not you, you can ignore this email.',
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npm test -- tests/email` → PASS. `npx tsc --noEmit` → clean.

- [ ] **Step 5: Commit**

```bash
git add backend/src/email backend/tests/email
git commit -m "Add an email sender for auth flows"
```

---

### Task 3: Swap the core — schema, Better Auth instance, middleware, social sign-in, test sweep

This task is large because the schema change breaks every test that creates a user; the suite is only green again once all of it lands. Commit at the marked checkpoints; the final commit must be green.

**Files:**
- Modify: `backend/prisma/schema.prisma`, `backend/src/app.ts`, `backend/src/auth/middleware.ts`, `backend/src/users/deletion.ts:27-46`, `backend/src/types.ts:1-7`, `backend/jest.config.js`, `backend/tests/users/ownedData.ts`, every test file listed by the sweep
- Create: `backend/prisma/migrations/20260927120000_better_auth/migration.sql`, `backend/src/auth/auth.ts`, `backend/tests/setupEnv.ts`, `backend/tests/helpers/auth.ts`, `backend/tests/auth/middleware.test.ts`, `backend/tests/auth/socialSignIn.test.ts`, `backend/scripts/sweep-test-auth.mjs` (temporary)
- Delete: `backend/src/auth/jwt.ts`, `appleAuth.ts`, `googleAuth.ts`, `routes.ts`, `backend/src/users/repository.ts`, `backend/tests/auth/{jwt,appleAuth,googleAuth,routes}.test.ts`, `backend/__mocks__/jose.js`

**Interfaces:**
- Consumes: `EmailSender`, `defaultEmailSender`, templates (Task 2).
- Produces:
  - `createAuth(deps: AuthDeps): Auth`, `auth: Auth`, `type Auth = ReturnType<typeof createAuth>`
  - `interface AuthDeps { email: EmailSender; verifyIdToken?: (token: string, nonce?: string) => Promise<boolean> }`
  - `createApp(options?: { auth?: Auth }): Express`
  - `requireAuth(req: AuthedRequest, res, next)` — unchanged signature, sets `req.userId`
  - test helpers: `createTestUser(overrides?)`, `authHeaderFor(userId): Promise<{ Cookie: string }>`, `fakeIdToken(claims)`, `captureEmail()`, `createTestApp(opts?)`

- [ ] **Step 1: Update the Prisma schema**

In `backend/prisma/schema.prisma`:

1. Delete the `enum AuthProvider { … }` block.
2. In `model User`: delete `authProvider`, `providerUserId`, `refreshTokens RefreshToken[]`, and the `@@unique([authProvider, providerUserId])` line together with the comment above it. Change `email String` to `email String @unique`. Add, directly after `id`:

```prisma
  name          String
  email         String    @unique
  emailVerified Boolean   @default(false)
  image         String?
  updatedAt     DateTime  @updatedAt
  sessions      Session[]
  accounts      Account[]
```

   (remove the old `email String` line so it appears once) and add this comment above `model User`:

```prisma
// Identity is the Better Auth user: one row per person, email unique. Sign-in
// methods (Apple, Google, email+password) are Account rows. A new method whose
// VERIFIED email matches a VERIFIED user is linked to that user automatically
// (spec 2026-09-23-better-auth-migration-design.md, decision 3); an unverified
// sign-up can never attach to an existing account.
```

3. Delete `model RefreshToken { … }`.
4. Add after `model User`:

```prisma
// Better Auth core tables. Field names are Better Auth's; do not rename.
model Session {
  id        String   @id @default(uuid())
  expiresAt DateTime
  token     String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  ipAddress String?
  userAgent String?
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Account {
  id                    String    @id @default(uuid())
  // The provider's subject ("sub") for apple/google; the user id for "credential".
  accountId             String
  // "apple" | "google" | "credential" (email + password)
  providerId            String
  userId                String
  user                  User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime  @default(now())
  updatedAt             DateTime  @updatedAt

  @@unique([providerId, accountId])
  @@index([userId])
}

model Verification {
  id         String   @id @default(uuid())
  identifier String
  value      String
  expiresAt  DateTime
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@index([identifier])
}
```

- [ ] **Step 2: Write the migration by hand**

```bash
cd backend && npx prisma migrate dev --create-only --name better_auth
```

Rename the generated folder to `prisma/migrations/20260927120000_better_auth` (it must sort after `20260926120000_add_steps_history_backfilled_at`) and replace its `migration.sql` with:

```sql
-- Better Auth migration. Pre-launch, but existing dev users are carried over
-- so their synced data survives: each keeps its id, gets a name derived from
-- the email, is marked verified (Apple/Google had verified the address), and
-- its old (authProvider, providerUserId) pair becomes an Account row.

-- User: new columns
ALTER TABLE "User" ADD COLUMN "name" TEXT;
UPDATE "User" SET "name" = split_part("email", '@', 1);
ALTER TABLE "User" ALTER COLUMN "name" SET NOT NULL;
ALTER TABLE "User" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ALTER COLUMN "emailVerified" SET DEFAULT false;
ALTER TABLE "User" ADD COLUMN "image" TEXT;
ALTER TABLE "User" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "User" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- Session
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Account
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Account_providerId_accountId_key" ON "Account"("providerId", "accountId");
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "Account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "providerUserId", lower("authProvider"::text), "id", "createdAt", CURRENT_TIMESTAMP
FROM "User";

-- Verification
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Verification_identifier_idx" ON "Verification"("identifier");

-- Drop the old identity columns and tables. Fails on duplicate emails across
-- the old Apple/Google split: delete one of the dev users and re-run.
DROP INDEX "User_authProvider_providerUserId_key";
ALTER TABLE "User" DROP COLUMN "authProvider", DROP COLUMN "providerUserId";
DROP TYPE "AuthProvider";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
DROP TABLE "RefreshToken";
```

- [ ] **Step 3: Apply and check for drift**

```bash
npx prisma migrate dev              # applies to the dev DB, regenerates the client
npx prisma migrate dev --create-only --name drift_check
```

Expected: the second command reports the schema is already in sync and creates no migration. If it creates one, read its SQL, fix `migration.sql` to match, delete the drift folder, `npx prisma migrate reset` the **test** DB only if needed, and repeat.

- [ ] **Step 4: Test environment defaults**

`backend/tests/setupEnv.ts`:

```ts
// Loaded by Jest before any test module (jest.config.js `setupFiles`), because
// the default Better Auth instance reads these when src/auth/auth.ts is first
// imported.
process.env.BETTER_AUTH_SECRET ??= 'test-better-auth-secret-at-least-32-chars';
process.env.BETTER_AUTH_URL ??= 'http://localhost:3000';
process.env.APPLE_BUNDLE_ID ??= 'com.tusharcora.biometrics';
process.env.GOOGLE_CLIENT_ID ??= 'test-google-client-id';
```

In `backend/jest.config.js`: delete the `moduleNameMapper` block (the `jose` mock goes with `appleAuth.ts`) and add `setupFiles: ['<rootDir>/tests/setupEnv.ts'],`. Delete `backend/__mocks__/jose.js`.

- [ ] **Step 5: Create the Better Auth instance**

`backend/src/auth/auth.ts`:

```ts
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { expo } from '@better-auth/expo';
import { prisma } from '../db/client';
import { defaultEmailSender, type EmailMessage, type EmailSender } from '../email/sender';
import { existingAccountEmail, resetPasswordEmail, verificationEmail } from '../email/templates';

export interface AuthDeps {
  email: EmailSender;
  /**
   * Test-only: replaces the Apple/Google ID-token signature check. The
   * providers still decode the token's claims (sub, email, email_verified).
   */
  verifyIdToken?: (token: string, nonce?: string) => Promise<boolean>;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// An email that fails to send must not turn into a response that differs by
// whether the address exists; log it and carry on.
async function sendQuietly(sender: EmailSender, message: EmailMessage): Promise<void> {
  try {
    await sender.send(message);
  } catch (err) {
    console.error(`Failed to send "${message.subject}": ${err instanceof Error ? err.message : 'unknown error'}`);
  }
}

export function createAuth(deps: AuthDeps) {
  const isProduction = process.env.NODE_ENV === 'production';
  const appleBundleId = requiredEnv('APPLE_BUNDLE_ID');
  const googleClientIds = [process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_IOS_CLIENT_ID].filter(
    (id): id is string => Boolean(id),
  );
  const idTokenOverride = deps.verifyIdToken ? { verifyIdToken: deps.verifyIdToken } : {};

  return betterAuth({
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    basePath: '/auth',
    secret: requiredEnv('BETTER_AUTH_SECRET'),
    baseURL: requiredEnv('BETTER_AUTH_URL'),
    advanced: { database: { generateId: 'uuid' } },
    trustedOrigins: ['biometrics://', ...(isProduction ? [] : ['exp://', 'exp://**'])],
    socialProviders: {
      apple: {
        clientId: appleBundleId,
        appBundleIdentifier: appleBundleId,
        // Only the browser redirect flow uses a client secret; native
        // idToken sign-in never does.
        clientSecret: '',
        ...idTokenOverride,
      },
      google: {
        clientId: googleClientIds,
        ...idTokenOverride,
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      revokeSessionsOnPasswordReset: true,
      sendResetPassword: async ({ user, url }) => sendQuietly(deps.email, resetPasswordEmail(user.email, url)),
      onExistingUserSignUp: async ({ user }) => sendQuietly(deps.email, existingAccountEmail(user.email)),
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => sendQuietly(deps.email, verificationEmail(user.email, url)),
    },
    account: {
      accountLinking: {
        enabled: true,
        trustedProviders: ['apple', 'google'],
        allowDifferentEmails: false,
        allowUnlinkingAll: false,
      },
    },
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      updateAge: 24 * 60 * 60,
    },
    databaseHooks: {
      user: {
        create: {
          // User.name is required, but Apple only sends a name on the very
          // first sign-in and the user may hide it.
          before: async (user) => ({
            data: { ...user, name: user.name?.trim() || user.email.split('@')[0] || 'Biometrics user' },
          }),
        },
      },
    },
    plugins: [expo()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

export const auth: Auth = createAuth({ email: defaultEmailSender() });
```

If `tsc` rejects `clientSecret: ''` as unnecessary, remove the line; if it rejects its absence, keep it.

- [ ] **Step 6: Mount it and rewrite the middleware**

`backend/src/app.ts` — replace the `authRouter` import with:

```ts
import { toNodeHandler } from 'better-auth/node';
import { auth as defaultAuth, type Auth } from './auth/auth';
```

and change the start of `createApp`:

```ts
export function createApp(options: { auth?: Auth } = {}): Express {
  const app = express();
  // Better Auth reads the raw request body itself, so its handler must run
  // before express.json consumes it.
  app.all('/auth/*splat', toNodeHandler(options.auth ?? defaultAuth));
  app.use(
    express.json({
```

and delete the `app.use(authRouter);` line.

`backend/src/auth/middleware.ts` (whole file):

```ts
import { Request, Response, NextFunction } from 'express';
import { fromNodeHeaders } from 'better-auth/node';
import { auth } from './auth';
import { prisma } from '../db/client';

export interface AuthedRequest extends Request {
  userId?: string;
}

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): Promise<void> {
  if (!req.headers.cookie && !req.headers.authorization) {
    res.status(401).json({ error: 'Missing session' });
    return;
  }
  // Sessions live in the database and are deleted with their user, so a found
  // session always belongs to an existing user.
  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session) {
    // getSession can report "no session" when the database is unreachable. A
    // 401 would make the app sign the user out for our outage, so confirm the
    // database answers first: if it does not, this throws and Express sends a
    // 500.
    await prisma.$queryRaw`SELECT 1`;
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }
  req.userId = session.user.id;
  next();
}
```

- [ ] **Step 7: Delete the old system**

```bash
git rm backend/src/auth/jwt.ts backend/src/auth/appleAuth.ts backend/src/auth/googleAuth.ts backend/src/auth/routes.ts \
       backend/src/users/repository.ts backend/__mocks__/jose.js \
       backend/tests/auth/jwt.test.ts backend/tests/auth/appleAuth.test.ts backend/tests/auth/googleAuth.test.ts backend/tests/auth/routes.test.ts
npm uninstall jsonwebtoken @types/jsonwebtoken jose
```

In `backend/src/types.ts` delete `export type AuthProvider = …` and the `SessionTokens` interface.

In `backend/src/users/deletion.ts` `USER_OWNED_MODELS`, replace `'RefreshToken',` with:

```ts
  'Session',
  'Account',
```

Run `npx tsc --noEmit`. Expected: errors only in `src/` files that still import deleted modules — there should be none; fix any that appear by removing the import.

- [ ] **Step 8: Checkpoint commit (suite red)**

```bash
git add -A backend
git commit -m "Replace the custom JWT auth with Better Auth (tests follow)"
```

- [ ] **Step 9: Test helpers**

`backend/tests/helpers/auth.ts`:

```ts
import { randomUUID } from 'crypto';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { testUtils } from 'better-auth/plugins';
import type { Express } from 'express';
import { prisma } from '../../src/db/client';
import { createApp } from '../../src/app';
import { createAuth } from '../../src/auth/auth';
import type { EmailMessage, EmailSender } from '../../src/email/sender';

// A test-only Better Auth instance with the testUtils plugin. It shares the
// secret and database with the app's instance, so a session it creates is
// accepted by requireAuth.
const testAuth = betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  basePath: '/auth',
  secret: process.env.BETTER_AUTH_SECRET!,
  baseURL: process.env.BETTER_AUTH_URL!,
  advanced: { database: { generateId: 'uuid' } },
  plugins: [testUtils()],
});

/** A verified user with a unique @example.com email (purged by globalSetup/Teardown). */
export async function createTestUser(
  overrides: { email?: string; name?: string; emailVerified?: boolean; timezone?: string } = {},
) {
  return prisma.user.create({
    data: {
      email: overrides.email ?? `user-${randomUUID()}@example.com`,
      name: overrides.name ?? 'Test User',
      emailVerified: overrides.emailVerified ?? true,
      ...(overrides.timezone ? { timezone: overrides.timezone } : {}),
    },
  });
}

/** A real session for the user, as the header object supertest's .set() takes. */
export async function authHeaderFor(userId: string): Promise<{ Cookie: string }> {
  const ctx = await testAuth.$context;
  const { headers } = await ctx.test.login({ userId });
  const cookie = headers.get('cookie');
  if (!cookie) throw new Error('testUtils login returned no cookie');
  return { Cookie: cookie };
}

/** An unsigned JWT carrying the given claims; pair it with a verifyIdToken stub. */
export function fakeIdToken(claims: Record<string, unknown>): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  return `${b64({ alg: 'RS256', kid: 'test' })}.${b64({ iat: now, exp: now + 600, ...claims })}.sig`;
}

/** An EmailSender that records instead of sending. */
export function captureEmail(): EmailSender & { sent: EmailMessage[]; lastTo(to: string): EmailMessage | undefined } {
  const sent: EmailMessage[] = [];
  return {
    sent,
    async send(message) {
      sent.push(message);
    },
    lastTo(to) {
      return [...sent].reverse().find((m) => m.to === to);
    },
  };
}

/** The app wired to a Better Auth instance with stubbed ID-token checks and captured email. */
export function createTestApp(opts: { verifyIdToken?: (token: string) => Promise<boolean> } = {}): {
  app: Express;
  email: ReturnType<typeof captureEmail>;
} {
  const email = captureEmail();
  const auth = createAuth({ email, verifyIdToken: opts.verifyIdToken ?? (async () => true) });
  return { app: createApp({ auth }), email };
}

/** Pulls the first URL out of an email body. */
export function linkIn(message: EmailMessage | undefined): string {
  const match = message?.text.match(/https?:\/\/\S+/);
  if (!match) throw new Error('no link in email');
  return match[0];
}
```

- [ ] **Step 10: Sweep existing tests**

`backend/scripts/sweep-test-auth.mjs`:

```js
// One-off: moves backend tests from the old JWT helpers to tests/helpers/auth.
// Run once, review the diff, then delete this script.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, relative, dirname } from 'path';

const root = new URL('../tests', import.meta.url).pathname;
const files = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.ts')) files.push(p);
  }
})(root);

for (const file of files) {
  let src = readFileSync(file, 'utf8');
  const before = src;
  src = src.replace(/authProvider: '(GOOGLE|APPLE)',\s*providerUserId: [^,}\n]+/g, "name: 'Test User'");
  src = src.replace(/const \{ accessToken \} = await issueSessionTokens\(([^)]+)\);/g, 'const authHeader = await authHeaderFor($1);');
  src = src.replace(/\.set\('Authorization', `Bearer \$\{accessToken\}`\)/g, '.set(authHeader)');
  src = src.replace(/^.*process\.env\.JWT_(ACCESS|REFRESH)_SECRET = .*\n/gm, '');
  if (src.includes('authHeaderFor(')) {
    const helper = relative(dirname(file), join(root, 'helpers/auth')).replace(/^(?!\.)/, './');
    src = src.replace(/^import \{ issueSessionTokens \} from '[^']+';\n/m, `import { authHeaderFor } from '${helper}';\n`);
  }
  if (src !== before) {
    writeFileSync(file, src);
    console.log('updated', relative(root, file));
  }
}
```

```bash
cd backend && node scripts/sweep-test-auth.mjs
grep -rn "authProvider\|providerUserId\|issueSessionTokens\|accessToken\|JWT_" tests
```

Fix every remaining hit by hand. Known ones:
- `tests/biometrics/routes.test.ts:18`, `tests/scripts/resyncSleep.test.ts:44`, `tests/scoring/dbHelpers.ts:10` — the pair spans two lines; replace both lines with `name: 'Test User',`.
- `tests/users/deleteMe.test.ts` — `const { accessToken, refreshToken } = await issueSessionTokens(user.id);`: replace with `const authHeader = await authHeaderFor(user.id);` and delete assertions about the refresh token; add instead: after the delete, `expect(await prisma.session.count({ where: { userId: user.id } })).toBe(0);`.
- `tests/health/routes.test.ts` `'Bearer webhook-secret'` and `'Bearer nope'` are webhook/negative cases — leave them.
- `tests/users/ownedData.ts` `createUserWithEmail`: data becomes `{ email, name: 'Test User' }` (the regex handles it). In `seedAllOwnedRows`, replace the `prisma.refreshToken.create(...)` call with:

```ts
  await prisma.session.create({
    data: { userId, token: `session-${uniq}`, expiresAt: new Date(Date.now() + 86_400_000) },
  });
  await prisma.account.create({ data: { userId, providerId: 'google', accountId: `google-${uniq}` } });
```

Delete `scripts/sweep-test-auth.mjs`.

- [ ] **Step 11: Run the swept suite**

Run: `npm test -- --testPathIgnorePatterns tests/auth`
Expected: PASS (same pre-existing failures as recorded in Task 1, none new). The deletion schema-introspection test must pass with `Session` and `Account` listed.

- [ ] **Step 12: Write the middleware tests**

`backend/tests/auth/middleware.test.ts`:

```ts
import express from 'express';
import request from 'supertest';
import { requireAuth, type AuthedRequest } from '../../src/auth/middleware';
import { auth } from '../../src/auth/auth';
import { prisma } from '../../src/db/client';
import { deleteUserAccount } from '../../src/users/deletion';
import { migrateTestDb } from '../setupTestDb';
import { authHeaderFor, createTestUser } from '../helpers/auth';

function whoamiApp() {
  const app = express();
  app.get('/whoami', requireAuth, (req: AuthedRequest, res) => res.json({ userId: req.userId }));
  return app;
}

beforeAll(() => migrateTestDb());
afterEach(() => jest.restoreAllMocks());
afterAll(() => prisma.$disconnect());

describe('requireAuth', () => {
  it('passes a valid session through with req.userId set', async () => {
    const user = await createTestUser();
    const res = await request(whoamiApp()).get('/whoami').set(await authHeaderFor(user.id));
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ userId: user.id });
  });

  it('401s with "Missing session" when no credentials are sent', async () => {
    const res = await request(whoamiApp()).get('/whoami');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Missing session' });
  });

  it('401s on a forged cookie', async () => {
    const res = await request(whoamiApp()).get('/whoami').set('Cookie', 'better-auth.session_token=forged.sig');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'Invalid or expired token' });
  });

  it('401s once the session has expired', async () => {
    const user = await createTestUser();
    const header = await authHeaderFor(user.id);
    await prisma.session.updateMany({ where: { userId: user.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await request(whoamiApp()).get('/whoami').set(header);
    expect(res.status).toBe(401);
  });

  it('401s after the account is deleted', async () => {
    const user = await createTestUser();
    const header = await authHeaderFor(user.id);
    await deleteUserAccount(user.id);
    const res = await request(whoamiApp()).get('/whoami').set(header);
    expect(res.status).toBe(401);
  });

  it('500s, not 401s, when the database is down', async () => {
    jest.spyOn(auth.api, 'getSession').mockResolvedValue(null);
    jest.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('connection refused'));
    const res = await request(whoamiApp()).get('/whoami').set('Cookie', 'better-auth.session_token=x.y');
    expect(res.status).toBe(500);
  });

  it('500s when getSession itself throws', async () => {
    jest.spyOn(auth.api, 'getSession').mockRejectedValue(new Error('connection refused'));
    const res = await request(whoamiApp()).get('/whoami').set('Cookie', 'better-auth.session_token=x.y');
    expect(res.status).toBe(500);
  });
});
```

Run: `npm test -- tests/auth/middleware.test.ts` → PASS. (If `jest.spyOn(auth.api, 'getSession')` fails because the property is non-configurable, wrap the call in middleware as `getSessionFor(headers)` exported from `auth.ts` and spy on that module export instead.)

- [ ] **Step 13: Write the social sign-in tests**

`backend/tests/auth/socialSignIn.test.ts`:

```ts
import request from 'supertest';
import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createTestApp, fakeIdToken } from '../helpers/auth';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const google = (sub: string, email: string, extra: object = {}) => ({
  provider: 'google',
  idToken: { token: fakeIdToken({ iss: 'https://accounts.google.com', aud: 'test-google-client-id', sub, email, email_verified: true, ...extra }) },
});
const apple = (sub: string, email: string, user?: object) => ({
  provider: 'apple',
  idToken: {
    token: fakeIdToken({ iss: 'https://appleid.apple.com', aud: 'com.tusharcora.biometrics', sub, email, email_verified: 'true' }),
    ...(user ? { user } : {}),
  },
});

describe('native ID-token sign-in', () => {
  it('creates a user and a google account, and sets a session cookie', async () => {
    const { app } = createTestApp();
    const email = `g-${randomUUID()}@example.com`;
    const res = await request(app).post('/auth/sign-in/social').send(google('g-sub-1-' + email, email));
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie']?.join(';')).toContain('session_token');
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
    expect(user.accounts.map((a) => a.providerId)).toEqual(['google']);
    expect(user.emailVerified).toBe(true);
  });

  it('reuses the same user on a repeat sign-in', async () => {
    const { app } = createTestApp();
    const email = `g-${randomUUID()}@example.com`;
    const body = google(`sub-${email}`, email);
    await request(app).post('/auth/sign-in/social').send(body);
    await request(app).post('/auth/sign-in/social').send(body);
    expect(await prisma.user.count({ where: { email } })).toBe(1);
    expect(await prisma.account.count({ where: { user: { email } } })).toBe(1);
  });

  it('names an Apple user from the first-sign-in name, and from the email when Apple hides it', async () => {
    const { app } = createTestApp();
    const named = `a-${randomUUID()}@example.com`;
    await request(app).post('/auth/sign-in/social').send(apple(`sub-${named}`, named, { name: { firstName: 'Ada', lastName: 'Lovelace' } }));
    expect((await prisma.user.findUniqueOrThrow({ where: { email: named } })).name).toBe('Ada Lovelace');

    const hidden = `hidden-${randomUUID()}@privaterelay.appleid.com`;
    const res = await request(app).post('/auth/sign-in/social').send(apple(`sub-${hidden}`, hidden));
    expect(res.status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: hidden } })).name).toBe(hidden.split('@')[0]);
    await prisma.user.deleteMany({ where: { email: hidden } });
  });

  it('links a Google sign-in to the verified Apple user with the same email', async () => {
    const { app } = createTestApp();
    const email = `link-${randomUUID()}@example.com`;
    await request(app).post('/auth/sign-in/social').send(apple(`a-${email}`, email));
    const res = await request(app).post('/auth/sign-in/social').send(google(`g-${email}`, email));
    expect(res.status).toBe(200);
    const user = await prisma.user.findUniqueOrThrow({ where: { email }, include: { accounts: true } });
    expect(user.accounts.map((a) => a.providerId).sort()).toEqual(['apple', 'google']);
  });

  it('refuses a token whose signature check fails', async () => {
    const { app } = createTestApp({ verifyIdToken: async () => false });
    const email = `bad-${randomUUID()}@example.com`;
    const res = await request(app).post('/auth/sign-in/social').send(google(`s-${email}`, email));
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});
```

Run: `npm test -- tests/auth` → PASS. If the linking test fails because Better Auth reports the Apple `email_verified: 'true'` string as unverified, check `emailVerified` on the Apple user first; the spec requires Apple users to be verified.

- [ ] **Step 14: Full suite, typecheck, commit**

Run: `npm test` → PASS (except failures recorded in Task 1). `npx tsc --noEmit` → clean.

```bash
git add -A backend
git commit -m "Move backend tests to Better Auth sessions and cover sign-in and requireAuth"
```

---

### Task 4: Email + password, linking rules, and session management

**Files:**
- Create: `backend/tests/auth/emailPassword.test.ts`, `backend/tests/auth/sessions.test.ts`

**Interfaces:**
- Consumes: `createTestApp`, `linkIn`, `fakeIdToken`, `createTestUser`, `authHeaderFor` (Task 3). No new production interfaces: the behavior is configured in Task 3's `createAuth`; this task proves it and fixes config if a test fails.

- [ ] **Step 1: Write the email/password tests**

`backend/tests/auth/emailPassword.test.ts`:

```ts
import request from 'supertest';
import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createTestApp, fakeIdToken, linkIn } from '../helpers/auth';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const ORIGIN = { 'expo-origin': 'biometrics://' };
const PASSWORD = 'correct horse battery';

async function signUp(app: Parameters<typeof request>[0], email: string, password = PASSWORD) {
  return request(app).post('/auth/sign-up/email').set(ORIGIN)
    .send({ email, password, name: 'Pat', callbackURL: 'biometrics://verified' });
}

async function verify(app: Parameters<typeof request>[0], email: ReturnType<typeof createTestApp>['email'], address: string) {
  const url = new URL(linkIn(email.lastTo(address)));
  return request(app).get(url.pathname + url.search);
}

describe('email and password', () => {
  it('sends a verification email and refuses sign-in until it is used', async () => {
    const { app, email } = createTestApp();
    const address = `pw-${randomUUID()}@example.com`;
    expect((await signUp(app, address)).status).toBe(200);
    expect(email.lastTo(address)?.subject).toContain('Confirm');

    const early = await request(app).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    expect(early.status).toBe(403);

    const verified = await verify(app, email, address);
    expect(verified.status).toBe(302);
    expect(verified.headers.location).toMatch(/^biometrics:\/\/verified/);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: address } })).emailVerified).toBe(true);

    const ok = await request(app).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    expect(ok.status).toBe(200);
  });

  it('treats email case and surrounding space as the same account', async () => {
    const { app, email } = createTestApp();
    const address = `case-${randomUUID()}@example.com`;
    await signUp(app, `  ${address.toUpperCase()} `);
    await verify(app, email, address);
    const ok = await request(app).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    expect(ok.status).toBe(200);
    expect(await prisma.user.count({ where: { email: address } })).toBe(1);
  });

  it('answers a sign-up for an existing email exactly like a new one, and tells the owner', async () => {
    const { app, email } = createTestApp();
    const address = `dupe-${randomUUID()}@example.com`;
    const first = await signUp(app, address);
    const second = await signUp(app, address, 'another password 123');
    expect(second.status).toBe(first.status);
    expect(Object.keys(second.body).sort()).toEqual(Object.keys(first.body).sort());
    expect(await prisma.user.count({ where: { email: address } })).toBe(1);
    expect(email.lastTo(address)?.subject).toContain('Someone tried');
  });

  it('does not link a Google sign-in to an unverified password account', async () => {
    const { app } = createTestApp();
    const address = `unverified-${randomUUID()}@example.com`;
    await signUp(app, address);
    const token = fakeIdToken({ iss: 'https://accounts.google.com', aud: 'test-google-client-id', sub: `g-${address}`, email: address, email_verified: true });
    const res = await request(app).post('/auth/sign-in/social').send({ provider: 'google', idToken: { token } });
    expect(res.status).not.toBe(200);
    const accounts = await prisma.account.findMany({ where: { user: { email: address } } });
    expect(accounts.map((a) => a.providerId)).toEqual(['credential']);
  });

  it('resets a password and signs out every existing session', async () => {
    const { app, email } = createTestApp();
    const address = `reset-${randomUUID()}@example.com`;
    await signUp(app, address);
    await verify(app, email, address);
    const signIn = await request(app).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: PASSWORD });
    const oldCookie = signIn.headers['set-cookie']!.map((c: string) => c.split(';')[0]).join('; ');

    const asked = await request(app).post('/auth/request-password-reset').set(ORIGIN)
      .send({ email: address, redirectTo: 'biometrics://reset-password' });
    expect(asked.status).toBe(200);
    const link = new URL(linkIn(email.lastTo(address)));
    const redirect = await request(app).get(link.pathname + link.search);
    expect(redirect.headers.location).toMatch(/^biometrics:\/\/reset-password\?token=/);
    const token = new URL(redirect.headers.location.replace('biometrics://', 'http://x/')).searchParams.get('token');

    const reset = await request(app).post('/auth/reset-password').set(ORIGIN).send({ newPassword: 'a brand new password', token });
    expect(reset.status).toBe(200);

    const oldSession = await request(app).get('/auth/get-session').set('Cookie', oldCookie);
    expect(oldSession.body).toBeNull();
    const again = await request(app).post('/auth/sign-in/email').set(ORIGIN).send({ email: address, password: 'a brand new password' });
    expect(again.status).toBe(200);
  });

  it('answers a reset request for an unknown email the same way (no enumeration)', async () => {
    const { app } = createTestApp();
    const res = await request(app).post('/auth/request-password-reset').set(ORIGIN)
      .send({ email: `nobody-${randomUUID()}@example.com`, redirectTo: 'biometrics://reset-password' });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Write the session and unlink tests**

`backend/tests/auth/sessions.test.ts`:

```ts
import request from 'supertest';
import { randomUUID } from 'crypto';
import { prisma } from '../../src/db/client';
import { migrateTestDb } from '../setupTestDb';
import { createTestApp, fakeIdToken } from '../helpers/auth';

beforeAll(() => migrateTestDb());
afterAll(() => prisma.$disconnect());

const ORIGIN = { 'expo-origin': 'biometrics://' };

function cookieFrom(res: request.Response): string {
  return (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
}

async function googleSignIn(app: Parameters<typeof request>[0], email: string, userAgent: string) {
  const token = fakeIdToken({ iss: 'https://accounts.google.com', aud: 'test-google-client-id', sub: `g-${email}`, email, email_verified: true });
  const res = await request(app).post('/auth/sign-in/social').set('User-Agent', userAgent).send({ provider: 'google', idToken: { token } });
  return cookieFrom(res);
}

describe('session management', () => {
  it('lists every signed-in device and revokes the others', async () => {
    const { app } = createTestApp();
    const email = `devices-${randomUUID()}@example.com`;
    const phone = await googleSignIn(app, email, 'Biometrics/1 iPhone');
    const tablet = await googleSignIn(app, email, 'Biometrics/1 iPad');

    const list = await request(app).get('/auth/list-sessions').set('Cookie', phone);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);

    const revoke = await request(app).post('/auth/revoke-other-sessions').set(ORIGIN).set('Cookie', phone).send({});
    expect(revoke.status).toBe(200);
    expect((await request(app).get('/auth/get-session').set('Cookie', tablet)).body).toBeNull();
    expect((await request(app).get('/auth/get-session').set('Cookie', phone)).body?.user?.email).toBe(email);
  });

  it('revokes one session by token', async () => {
    const { app } = createTestApp();
    const email = `one-${randomUUID()}@example.com`;
    const a = await googleSignIn(app, email, 'A');
    const b = await googleSignIn(app, email, 'B');
    const sessions = (await request(app).get('/auth/list-sessions').set('Cookie', a)).body as Array<{ token: string; userAgent: string }>;
    const bToken = sessions.find((s) => s.userAgent === 'B')!.token;
    await request(app).post('/auth/revoke-session').set(ORIGIN).set('Cookie', a).send({ token: bToken });
    expect((await request(app).get('/auth/get-session').set('Cookie', b)).body).toBeNull();
  });

  it('refuses to unlink the last sign-in method', async () => {
    const { app } = createTestApp();
    const email = `last-${randomUUID()}@example.com`;
    const cookie = await googleSignIn(app, email, 'A');
    const account = await prisma.account.findFirstOrThrow({ where: { user: { email } } });
    const res = await request(app).post('/auth/unlink-account').set(ORIGIN).set('Cookie', cookie)
      .send({ providerId: 'google', accountId: account.accountId });
    expect(res.status).toBe(400);
    expect(await prisma.account.count({ where: { user: { email } } })).toBe(1);
  });
});
```

- [ ] **Step 3: Run**

Run: `npm test -- tests/auth`
Expected: PASS. Where a test fails, the fix belongs in `createAuth` config (Task 3's file), not in the test, unless the failure is an endpoint path or status code Better Auth 1.7.5 names differently — then read `node_modules/better-auth/dist/api/routes/*.mjs` for the real path/status and correct the test, keeping its intent.

- [ ] **Step 4: Commit**

```bash
git add backend/tests/auth backend/src/auth/auth.ts
git commit -m "Cover email and password, linking rules and session management"
```

---

### Task 5: Backend configuration and docs

**Files:**
- Modify: `backend/.env.example`, `README.md`

- [ ] **Step 1: Update `.env.example`**

Remove `JWT_ACCESS_SECRET=` and `JWT_REFRESH_SECRET=`. Add:

```bash
# Better Auth. Generate the secret with: openssl rand -base64 32
BETTER_AUTH_SECRET=
# Public URL of this API (used in email links), e.g. http://192.168.1.20:3000
BETTER_AUTH_URL=
# Optional: a second Google OAuth client id whose ID tokens are accepted
GOOGLE_IOS_CLIENT_ID=
# Email. Without RESEND_API_KEY, emails are printed to the console (dev only).
EMAIL_FROM=
RESEND_API_KEY=
```

- [ ] **Step 2: README**

In `README.md`, in the backend setup section, replace any mention of the JWT secrets with the variables above, state "Node 24 is required (`nvm use`)", and add: "In development, verification and password-reset links are printed in the backend log as `[email] to=…`; open them on the simulator with `xcrun simctl openurl booted '<link>'`."

- [ ] **Step 3: Verify and commit**

Run: `grep -rn "JWT_" backend/.env.example README.md backend/src` → no hits.

```bash
git add backend/.env.example README.md
git commit -m "Document the Better Auth environment variables"
```

---

### Task 6: Mobile auth client and global test mock

**Files:**
- Create: `mobile/src/auth/authClient.ts`, `mobile/src/auth/authErrors.ts`, `mobile/jest-mocks/authClient.js`, `mobile/__tests__/auth/authErrors.test.ts`
- Modify: `mobile/package.json`, `mobile/jest-setup.js`, `mobile/App.tsx:9-12`

**Interfaces:**
- Produces:
  - `authClient` (Better Auth React client with `expoClient`), `API_BASE_URL: string`
  - `class AuthError extends Error { code: string | undefined; status: number | undefined }`
  - `unwrap<T>(call: Promise<{ data: T | null; error: { message?: string; code?: string; status?: number } | null }>): Promise<T>`
  - `messageFor(err: unknown): string`

- [ ] **Step 1: Install**

```bash
cd mobile
npx expo install expo-network expo-linking
npm install --save-exact better-auth@1.7.5 @better-auth/expo@1.7.5
```

- [ ] **Step 2: Write the failing test**

`mobile/__tests__/auth/authErrors.test.ts`:

```ts
import { AuthError, messageFor, unwrap } from '../../src/auth/authErrors';

describe('unwrap', () => {
  it('returns data when there is no error', async () => {
    await expect(unwrap(Promise.resolve({ data: { ok: 1 }, error: null }))).resolves.toEqual({ ok: 1 });
  });

  it('throws an AuthError carrying the Better Auth code and status', async () => {
    const err = await unwrap(Promise.resolve({ data: null, error: { code: 'EMAIL_NOT_VERIFIED', status: 403, message: 'Email not verified' } })).catch((e) => e);
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe('EMAIL_NOT_VERIFIED');
    expect(err.status).toBe(403);
  });
});

describe('messageFor', () => {
  it.each([
    ['INVALID_EMAIL_OR_PASSWORD', 'That email and password do not match.'],
    ['EMAIL_NOT_VERIFIED', 'Confirm your email first. We sent you a link.'],
    ['PASSWORD_TOO_SHORT', 'Use at least 8 characters for your password.'],
  ])('maps %s to a friendly message', (code, message) => {
    expect(messageFor(new AuthError(code, 'raw', 400))).toBe(message);
  });

  it('falls back to a generic message for anything else', () => {
    expect(messageFor(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
```

Run: `npx jest __tests__/auth/authErrors.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

`mobile/src/auth/authErrors.ts`:

```ts
// Better Auth client calls resolve to { data, error } instead of throwing.
// unwrap() turns that into the throw-on-failure style the rest of the app uses.

export class AuthError extends Error {
  readonly code: string | undefined;
  readonly status: number | undefined;

  constructor(code: string | undefined, message: string, status?: number) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
    this.status = status;
    Object.setPrototypeOf(this, AuthError.prototype);
  }
}

type BetterAuthResult<T> = { data: T | null; error: { message?: string; code?: string; status?: number } | null };

export async function unwrap<T>(call: Promise<BetterAuthResult<T>>): Promise<T> {
  const { data, error } = await call;
  if (error) throw new AuthError(error.code, error.message ?? 'Request failed', error.status);
  return data as T;
}

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email and password do not match.',
  EMAIL_NOT_VERIFIED: 'Confirm your email first. We sent you a link.',
  PASSWORD_TOO_SHORT: 'Use at least 8 characters for your password.',
  INVALID_TOKEN: 'This link has expired. Ask for a new one.',
  ACCOUNT_NOT_LINKED: 'An account with this email already exists. Sign in with your original method, then link this one in Settings.',
  FAILED_TO_UNLINK_LAST_ACCOUNT: 'You need at least one way to sign in.',
};

export function messageFor(err: unknown): string {
  if (err instanceof AuthError && err.code && MESSAGES[err.code]) return MESSAGES[err.code]!;
  return 'Something went wrong. Please try again.';
}
```

`mobile/src/auth/authClient.ts`:

```ts
import { createAuthClient } from 'better-auth/react';
import { expoClient } from '@better-auth/expo/client';
import * as SecureStore from 'expo-secure-store';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000';

// The session cookie lives in SecureStore under the "biometrics" prefix; the
// Expo plugin attaches it to every auth call. Our own API calls read it with
// authClient.getCookie() (see api/client.ts).
export const authClient = createAuthClient({
  baseURL: `${API_BASE_URL}/auth`,
  plugins: [expoClient({ scheme: 'biometrics', storagePrefix: 'biometrics', storage: SecureStore })],
});
```

`mobile/jest-mocks/authClient.js`:

```js
// Global mock of src/auth/authClient (registered in jest-setup.js). Kept in a
// file rather than an inline factory: inline factories trip
// babel-plugin-jest-hoist under NativeWind's Babel transform.
const ok = (data = {}) => jest.fn(async () => ({ data, error: null }));

const authClient = {
  useSession: jest.fn(() => ({ data: null, isPending: false, error: null })),
  getCookie: jest.fn(async () => 'biometrics.session_token=test'),
  signIn: { social: ok(), email: ok() },
  signUp: { email: ok() },
  signOut: ok(),
  sendVerificationEmail: ok(),
  requestPasswordReset: ok(),
  resetPassword: ok(),
  listAccounts: ok([]),
  linkSocial: ok(),
  unlinkAccount: ok(),
  listSessions: ok([]),
  revokeSession: ok(),
  revokeOtherSessions: ok(),
};

module.exports = { authClient, API_BASE_URL: 'http://localhost:3000' };
```

Append to `mobile/jest-setup.js`:

```js
jest.mock('./src/auth/authClient', () => require('./jest-mocks/authClient'));
```

In `mobile/App.tsx` replace the `setBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000');` line with `setBaseUrl(API_BASE_URL);` and add `import { API_BASE_URL } from './src/auth/authClient';`.

- [ ] **Step 4: Run and commit**

Run: `npx jest __tests__/auth/authErrors.test.ts` → PASS. `npx tsc --noEmit` → clean (existing errors unrelated to auth are recorded, not fixed).

```bash
git add mobile/package.json mobile/package-lock.json mobile/src/auth/authClient.ts mobile/src/auth/authErrors.ts mobile/jest-mocks/authClient.js mobile/jest-setup.js mobile/App.tsx mobile/__tests__/auth/authErrors.test.ts
git commit -m "Add the Better Auth client to the mobile app"
```

---

### Task 7: Shared Google ID-token hook

**Files:**
- Create: `mobile/src/auth/useGoogleIdToken.ts`, `mobile/__tests__/auth/useGoogleIdToken.test.tsx`

**Interfaces:**
- Produces: `useGoogleIdToken(onIdToken: (idToken: string) => void): { prompt: () => Promise<void>; ready: boolean }`

- [ ] **Step 1: Failing test**

`mobile/__tests__/auth/useGoogleIdToken.test.tsx`:

```tsx
import { renderHook } from '@testing-library/react-native';
import * as Google from 'expo-auth-session/providers/google';
import { useGoogleIdToken } from '../../src/auth/useGoogleIdToken';

jest.mock('expo-auth-session/providers/google', () => ({ useAuthRequest: jest.fn() }));

it('calls back once with the ID token from a successful response', () => {
  const onIdToken = jest.fn();
  (Google.useAuthRequest as jest.Mock).mockReturnValue([{}, { type: 'success', authentication: { idToken: 'gid' } }, jest.fn()]);
  const { rerender } = renderHook(() => useGoogleIdToken(onIdToken));
  rerender({});
  expect(onIdToken).toHaveBeenCalledTimes(1);
  expect(onIdToken).toHaveBeenCalledWith('gid');
});

it('ignores cancelled responses', () => {
  const onIdToken = jest.fn();
  (Google.useAuthRequest as jest.Mock).mockReturnValue([{}, { type: 'cancel' }, jest.fn()]);
  renderHook(() => useGoogleIdToken(onIdToken));
  expect(onIdToken).not.toHaveBeenCalled();
});
```

Run → FAIL.

- [ ] **Step 2: Implement**

`mobile/src/auth/useGoogleIdToken.ts`:

```ts
import { useEffect, useRef } from 'react';
import * as Google from 'expo-auth-session/providers/google';

/**
 * Google sign-in through the system browser sheet, reduced to "give me the ID
 * token". Used by sign-in and by Settings -> Sign-in methods (linking).
 */
export function useGoogleIdToken(onIdToken: (idToken: string) => void): { prompt: () => Promise<void>; ready: boolean } {
  const [request, response, promptAsync] = Google.useAuthRequest({
    iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
    androidClientId: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID,
  });
  // The response object is stable across re-renders; deliver each one once.
  const delivered = useRef<unknown>(null);

  useEffect(() => {
    if (response?.type === 'success' && response.authentication?.idToken && delivered.current !== response) {
      delivered.current = response;
      onIdToken(response.authentication.idToken);
    }
  }, [response, onIdToken]);

  return {
    ready: Boolean(request),
    prompt: async () => {
      await promptAsync();
    },
  };
}
```

- [ ] **Step 3: Run and commit**

Run: `npx jest __tests__/auth/useGoogleIdToken.test.tsx` → PASS.

```bash
git add mobile/src/auth/useGoogleIdToken.ts mobile/__tests__/auth/useGoogleIdToken.test.tsx
git commit -m "Extract the Google ID-token hook"
```

---

### Task 8: API client on the session cookie

**Files:**
- Modify: `mobile/src/api/client.ts` (remove lines for `skipAuth`, `inFlightRefresh`, `onSessionExpired`, `expireSession`, `performRefresh`, `refreshAccessToken`; rewrite `apiFetch`)
- Modify: `mobile/__tests__/api/client.test.tsx`

**Interfaces:**
- Consumes: `authClient.getCookie()`, `authClient.signOut()` (Task 6).
- Produces: `apiFetch<T>(path: string, options?: RequestInit): Promise<T>` (no `skipAuth`); `onSessionExpired` is **removed**.

- [ ] **Step 1: Rewrite the client tests**

Replace `mobile/__tests__/api/client.test.tsx` with:

```tsx
import { apiFetch, ApiError, setBaseUrl, updateTimezone } from '../../src/api/client';
import { authClient } from '../../src/auth/authClient';

const fetchMock = jest.fn();
(global as any).fetch = fetchMock;
const getCookie = authClient.getCookie as jest.Mock;
const signOut = authClient.signOut as jest.Mock;

beforeEach(() => {
  setBaseUrl('https://api.example.com');
  fetchMock.mockReset();
  getCookie.mockReset().mockResolvedValue('biometrics.session_token=abc');
  signOut.mockClear();
});

describe('apiFetch', () => {
  it('sends the stored session cookie and never sends browser credentials', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ data: 'ok' }) });
    await expect(apiFetch('/me/biometrics')).resolves.toEqual({ data: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/me/biometrics',
      expect.objectContaining({ credentials: 'omit', headers: expect.objectContaining({ Cookie: 'biometrics.session_token=abc' }) }),
    );
  });

  it('resolves to undefined for a 204', async () => {
    const json = jest.fn();
    fetchMock.mockResolvedValueOnce({ ok: true, status: 204, json });
    await expect(apiFetch('/x', { method: 'DELETE' })).resolves.toBeUndefined();
    expect(json).not.toHaveBeenCalled();
  });

  it('signs out on a 401 and throws an ApiError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ error: 'Invalid or expired token' }) });
    const err = await apiFetch('/me/scores').catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err.status).toBe(401);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('does not sign out a newer session when a request made with an older cookie comes back 401', async () => {
    getCookie.mockResolvedValueOnce('biometrics.session_token=old').mockResolvedValueOnce('biometrics.session_token=new');
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) });
    await apiFetch('/me/scores').catch(() => undefined);
    expect(signOut).not.toHaveBeenCalled();
  });

  it.each([500, 503])('never signs out on a %s', async (status) => {
    fetchMock.mockResolvedValueOnce({ ok: false, status, json: async () => ({}) });
    await apiFetch('/me/scores').catch(() => undefined);
    expect(signOut).not.toHaveBeenCalled();
  });

  it('carries the server error code on ApiError', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 404, json: async () => ({ error: 'coach_disabled' }) });
    const err = await apiFetch('/coach').catch((e) => e);
    expect(err.code).toBe('coach_disabled');
  });
});

describe('updateTimezone', () => {
  it('PUTs the zone', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ timezone: 'Europe/Paris' }) });
    await updateTimezone('Europe/Paris');
    expect(fetchMock.mock.calls[0][1].method).toBe('PUT');
  });
});
```

Run: `npx jest __tests__/api/client.test.tsx` → FAIL (sends Bearer, no `credentials`).

- [ ] **Step 2: Implement**

In `mobile/src/api/client.ts`:
- Replace `import * as SecureStore from 'expo-secure-store';` with `import { authClient } from '../auth/authClient';`.
- Delete `ApiFetchOptions`, `inFlightRefresh`, the `SessionExpiredListener` block and `onSessionExpired`, `expireSession`, `performRefresh`, `refreshAccessToken`.
- Replace `apiFetch` with:

```ts
export async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const cookie = await authClient.getCookie();
  const res = await fetch(`${baseUrl}${path}`, {
    ...options,
    // The session travels as an explicit Cookie header from SecureStore; the
    // platform cookie jar must not add or override anything.
    credentials: 'omit',
    headers: { ...options.headers, Cookie: cookie },
  });
  if (res.status === 401) {
    // Sessions slide on the server and there is no refresh step: a 401 means
    // the session is gone (revoked, expired, account deleted). Sign out -- which
    // clears the stored cookie and flips useSession() to null -- unless the
    // user has already signed in again since this request started.
    if ((await authClient.getCookie()) === cookie) {
      await authClient.signOut().catch(() => undefined);
    }
    throw await apiErrorFor(res, path);
  }
  if (!res.ok) throw await apiErrorFor(res, path);
  // 204 No Content (e.g. DELETE) has no body to parse.
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
```

Update the `deleteAccount` comment: "Once it succeeds the session is dead, so the caller must clear it locally (clearSession) rather than sign out through the server."

- [ ] **Step 3: Run and commit**

Run: `npx jest __tests__/api/client.test.tsx` → PASS. (`AuthContext` still imports `onSessionExpired`; that is fixed in Task 9 — do not run the full suite yet.)

```bash
git add mobile/src/api/client.ts mobile/__tests__/api/client.test.tsx
git commit -m "Send the Better Auth session cookie from the API client"
```

---

### Task 9: AuthContext on Better Auth

**Files:**
- Rewrite: `mobile/src/auth/AuthContext.tsx`, `mobile/__tests__/auth/AuthContext.test.tsx`, `mobile/__tests__/auth/AuthClearSession.test.tsx`, `mobile/__tests__/auth/AuthSignOutPush.test.tsx`
- Modify (fixture value only): every test with `session: { accessToken: … }` → `session: { userId: 'u1', email: 'u1@example.com' }` (`RootNavigatorPush`, `RootNavigatorCoach`, `RootNavigatorCoachMemory`, `RootNavigator`, `DashboardScreen`, `DashboardCoachEntry`, `DashboardDigest`); `SettingsDeleteAccount.test.tsx` (SecureStore token assertions → `authClient.signOut` assertions)

**Interfaces:**
- Consumes: `authClient`, `unwrap` (Task 6).
- Produces (`useAuth()` / `useOptionalAuth()` value):

```ts
interface Session { userId: string; email: string }
interface AuthContextValue {
  session: Session | null;
  isPending: boolean;
  signInWithApple(identityToken: string, fullName?: { givenName?: string | null; familyName?: string | null } | null): Promise<void>;
  signInWithGoogle(idToken: string): Promise<void>;
  signInWithEmail(email: string, password: string): Promise<void>;
  signUpWithEmail(input: { name: string; email: string; password: string }): Promise<void>;
  resendVerification(email: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
  resetPassword(token: string, newPassword: string): Promise<void>;
  signOut(): Promise<void>;
  clearSession(): Promise<void>;
}
```

Deep-link targets used by these calls: `VERIFIED_URL = 'biometrics://verified'`, `RESET_URL = 'biometrics://reset-password'` (exported).

- [ ] **Step 1: Rewrite the tests**

`mobile/__tests__/auth/AuthContext.test.tsx`:

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, useAuth, VERIFIED_URL, RESET_URL } from '../../src/auth/AuthContext';
import { authClient } from '../../src/auth/authClient';
import { AuthError } from '../../src/auth/authErrors';

const mocked = authClient as unknown as Record<string, any>;
let ctx: ReturnType<typeof useAuth>;
function Capture() {
  ctx = useAuth();
  return <Text testID="status">{ctx.session ? `in:${ctx.session.userId}` : 'out'}</Text>;
}
const renderAuth = () => render(<AuthProvider><Capture /></AuthProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mocked.useSession.mockReturnValue({ data: null, isPending: false });
});

it('derives the session from authClient.useSession', () => {
  mocked.useSession.mockReturnValue({ data: { user: { id: 'u1', email: 'u1@example.com' }, session: {} }, isPending: false });
  expect(renderAuth().getByTestId('status').props.children).toBe('in:u1');
});

it('signs in with Apple, passing the first-sign-in name', async () => {
  renderAuth();
  await act(() => ctx.signInWithApple('apple-token', { givenName: 'Ada', familyName: 'Lovelace' }));
  expect(mocked.signIn.social).toHaveBeenCalledWith({
    provider: 'apple',
    idToken: { token: 'apple-token', user: { name: { firstName: 'Ada', lastName: 'Lovelace' } } },
  });
});

it('signs in with Google by ID token', async () => {
  renderAuth();
  await act(() => ctx.signInWithGoogle('gid'));
  expect(mocked.signIn.social).toHaveBeenCalledWith({ provider: 'google', idToken: { token: 'gid' } });
});

it('trims and lower-cases the email on sign-up and sign-in', async () => {
  renderAuth();
  await act(() => ctx.signUpWithEmail({ name: ' Pat ', email: ' Pat@Example.com ', password: 'pw123456' }));
  expect(mocked.signUp.email).toHaveBeenCalledWith({ name: 'Pat', email: 'pat@example.com', password: 'pw123456', callbackURL: VERIFIED_URL });
  await act(() => ctx.signInWithEmail('PAT@example.com ', 'pw123456'));
  expect(mocked.signIn.email).toHaveBeenCalledWith({ email: 'pat@example.com', password: 'pw123456' });
});

it('asks for a reset link that deep-links back into the app', async () => {
  renderAuth();
  await act(() => ctx.requestPasswordReset('pat@example.com'));
  expect(mocked.requestPasswordReset).toHaveBeenCalledWith({ email: 'pat@example.com', redirectTo: RESET_URL });
});

it('throws an AuthError when Better Auth reports one', async () => {
  mocked.signIn.email.mockResolvedValueOnce({ data: null, error: { code: 'INVALID_EMAIL_OR_PASSWORD', status: 401 } });
  renderAuth();
  await expect(ctx.signInWithEmail('a@example.com', 'x')).rejects.toBeInstanceOf(AuthError);
});
```

`mobile/__tests__/auth/AuthSignOutPush.test.tsx` (replace):

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import { authClient } from '../../src/auth/authClient';
import { disablePush } from '../../src/lib/pushRegistration';
import { clearTimezoneState } from '../../src/lib/timezone';

jest.mock('../../src/lib/pushRegistration', () => ({ disablePush: jest.fn() }));
jest.mock('../../src/lib/timezone', () => ({ clearTimezoneState: jest.fn().mockResolvedValue(undefined) }));

let ctx: ReturnType<typeof useAuth>;
function Capture() { ctx = useAuth(); return <Text>x</Text>; }

beforeEach(() => jest.clearAllMocks());

it('unregisters push before signing out, then clears the time zone state', async () => {
  const order: string[] = [];
  (disablePush as jest.Mock).mockImplementation(async () => { order.push('push'); });
  (authClient.signOut as jest.Mock).mockImplementation(async () => { order.push('signOut'); return { data: {}, error: null }; });
  (clearTimezoneState as jest.Mock).mockImplementation(async () => { order.push('tz'); });
  render(<AuthProvider><Capture /></AuthProvider>);
  await act(() => ctx.signOut());
  expect(order).toEqual(['push', 'signOut', 'tz']);
});

it('still signs out when push unregistration hangs', async () => {
  jest.useFakeTimers();
  (disablePush as jest.Mock).mockReturnValue(new Promise(() => undefined));
  render(<AuthProvider><Capture /></AuthProvider>);
  const done = ctx.signOut();
  await act(async () => { jest.advanceTimersByTime(2000); });
  await act(() => done);
  expect(authClient.signOut).toHaveBeenCalled();
  jest.useRealTimers();
});

it('still clears local state when the server sign-out fails', async () => {
  (disablePush as jest.Mock).mockResolvedValue(undefined);
  (authClient.signOut as jest.Mock).mockRejectedValueOnce(new Error('offline'));
  render(<AuthProvider><Capture /></AuthProvider>);
  await act(() => ctx.signOut());
  expect(clearTimezoneState).toHaveBeenCalled();
});
```

`mobile/__tests__/auth/AuthClearSession.test.tsx` (replace):

```tsx
import React from 'react';
import { Text } from 'react-native';
import { render, act } from '@testing-library/react-native';
import { AuthProvider, useAuth } from '../../src/auth/AuthContext';
import { authClient } from '../../src/auth/authClient';
import { disablePush } from '../../src/lib/pushRegistration';
import { clearTimezoneState } from '../../src/lib/timezone';

jest.mock('../../src/lib/pushRegistration', () => ({ disablePush: jest.fn() }));
jest.mock('../../src/lib/timezone', () => ({ clearTimezoneState: jest.fn().mockResolvedValue(undefined) }));

let ctx: ReturnType<typeof useAuth>;
function Capture() { ctx = useAuth(); return <Text>x</Text>; }

it('clears the stored session without push unregistration (used after account deletion)', async () => {
  (authClient.signOut as jest.Mock).mockResolvedValueOnce({ data: null, error: { status: 401 } });
  render(<AuthProvider><Capture /></AuthProvider>);
  await act(() => ctx.clearSession());
  // authClient.signOut clears SecureStore before its request is sent, so a
  // server rejection (the session is already deleted) still clears locally.
  expect(authClient.signOut).toHaveBeenCalled();
  expect(disablePush).not.toHaveBeenCalled();
  expect(clearTimezoneState).toHaveBeenCalled();
});
```

Run: `npx jest __tests__/auth` → FAIL.

- [ ] **Step 2: Implement**

`mobile/src/auth/AuthContext.tsx` (whole file):

```tsx
import React, { createContext, useContext, ReactNode } from 'react';
import { authClient } from './authClient';
import { unwrap } from './authErrors';
import { disablePush } from '../lib/pushRegistration';
import { clearTimezoneState } from '../lib/timezone';

export const VERIFIED_URL = 'biometrics://verified';
export const RESET_URL = 'biometrics://reset-password';

interface Session {
  userId: string;
  email: string;
}

type AppleName = { givenName?: string | null; familyName?: string | null } | null | undefined;

interface AuthContextValue {
  session: Session | null;
  isPending: boolean;
  signInWithApple: (identityToken: string, fullName?: AppleName) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  signUpWithEmail: (input: { name: string; email: string; password: string }) => Promise<void>;
  resendVerification: (email: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resetPassword: (token: string, newPassword: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Drops the local session without push unregistration (after account deletion). */
  clearSession: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const PUSH_UNREGISTER_TIMEOUT_MS = 2000;

async function unregisterPushBestEffort(): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      disablePush(),
      new Promise<void>((resolve) => {
        timer = setTimeout(resolve, PUSH_UNREGISTER_TIMEOUT_MS);
      }),
    ]);
  } catch {
    // Signing out matters more than tidying up the push token.
  } finally {
    clearTimeout(timer);
  }
}

// Emails are compared case-sensitively by the server; normalise once here.
const normalizeEmail = (email: string) => email.trim().toLowerCase();

// Clears the stored cookie (inside authClient.signOut, before its request is
// sent, so it clears even when the server call fails) and the device-global
// time zone state, which would otherwise carry into the next account.
async function dropLocalSession(): Promise<void> {
  await authClient.signOut().catch(() => undefined);
  await clearTimezoneState().catch(() => undefined);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { data, isPending } = authClient.useSession();
  const session: Session | null = data ? { userId: data.user.id, email: data.user.email } : null;

  const value: AuthContextValue = {
    session,
    isPending,
    async signInWithApple(identityToken, fullName) {
      const firstName = fullName?.givenName ?? undefined;
      const lastName = fullName?.familyName ?? undefined;
      const user = firstName || lastName ? { user: { name: { firstName, lastName } } } : {};
      await unwrap(authClient.signIn.social({ provider: 'apple', idToken: { token: identityToken, ...user } }));
    },
    async signInWithGoogle(idToken) {
      await unwrap(authClient.signIn.social({ provider: 'google', idToken: { token: idToken } }));
    },
    async signInWithEmail(email, password) {
      await unwrap(authClient.signIn.email({ email: normalizeEmail(email), password }));
    },
    async signUpWithEmail({ name, email, password }) {
      await unwrap(authClient.signUp.email({ name: name.trim(), email: normalizeEmail(email), password, callbackURL: VERIFIED_URL }));
    },
    async resendVerification(email) {
      await unwrap(authClient.sendVerificationEmail({ email: normalizeEmail(email), callbackURL: VERIFIED_URL }));
    },
    async requestPasswordReset(email) {
      await unwrap(authClient.requestPasswordReset({ email: normalizeEmail(email), redirectTo: RESET_URL }));
    },
    async resetPassword(token, newPassword) {
      await unwrap(authClient.resetPassword({ token, newPassword }));
    },
    async signOut() {
      // Before the session goes: the push unregister call needs it.
      await unregisterPushBestEffort();
      await dropLocalSession();
    },
    clearSession: dropLocalSession,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Like useAuth, but undefined outside an AuthProvider (for components rendered in isolation). */
export function useOptionalAuth(): AuthContextValue | undefined {
  return useContext(AuthContext);
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: Update fixtures in other tests**

```bash
cd mobile
grep -rln "accessToken: '" __tests__ | xargs sed -i '' -E "s/session: \{ accessToken: '[^']*' \}/session: { userId: 'u1', email: 'u1@example.com' }/g"
grep -rn "accessToken\|onSessionExpired\|skipAuth" __tests__ src
```

Fix remaining hits by hand: in `SettingsDeleteAccount.test.tsx` replace the `SecureStore.getItemAsync` token stub with nothing (the global authClient mock supplies the cookie) and replace `expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith('accessToken')` with `expect(authClient.signOut).toHaveBeenCalled()` (import `authClient` from `../../src/auth/authClient`). Where a test drove "signed in" through SecureStore (e.g. `SettingsDeleteAccount` line 19 consumer), set `(authClient.useSession as jest.Mock).mockReturnValue({ data: { user: { id: 'u1', email: 'u1@example.com' }, session: {} }, isPending: false })` in `beforeEach` instead.

- [ ] **Step 4: Run and commit**

Run: `npx jest` → PASS except `SignInScreen.test.tsx` (rewritten in Task 10) and any pre-existing failures. `npx tsc --noEmit` → errors only in `SignInScreen.tsx` (Task 10).

```bash
git add mobile/src/auth/AuthContext.tsx mobile/__tests__
git commit -m "Drive the auth context from the Better Auth session"
```

---

### Task 10: Signed-out screens and deep links

**Files:**
- Create: `mobile/src/navigation/AuthNavigator.tsx`, `mobile/src/screens/SignUpScreen.tsx`, `mobile/src/screens/ForgotPasswordScreen.tsx`, `mobile/src/screens/ResetPasswordScreen.tsx`, `mobile/src/components/ui/text-field.tsx`, `mobile/__tests__/screens/SignUpScreen.test.tsx`, `mobile/__tests__/screens/ResetPasswordScreen.test.tsx`, `mobile/__tests__/navigation/AuthNavigator.test.tsx`
- Rewrite: `mobile/src/screens/SignInScreen.tsx`, `mobile/__tests__/screens/SignInScreen.test.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx:76-78`

**Interfaces:**
- Consumes: `useAuth()` (Task 9), `useGoogleIdToken` (Task 7), `messageFor`, `AuthError` (Task 6).
- Produces:
  - `type AuthStackParamList = { SignIn: { verified?: boolean } | undefined; SignUp: undefined; ForgotPassword: undefined; ResetPassword: { token?: string } | undefined }`
  - `AuthNavigator` component; `authLinking` config (`biometrics://verified` → `SignIn` with `verified: true`, `biometrics://reset-password?token=` → `ResetPassword`)
  - `TextField` component: `{ label: string; testID: string; value: string; onChangeText(v: string): void; secure?: boolean; keyboardType?: 'default' | 'email-address'; autoComplete?: 'email' | 'password' | 'new-password' | 'name' }`

- [ ] **Step 1: Tests**

`mobile/__tests__/screens/SignInScreen.test.tsx` (replace):

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SignInScreen } from '../../src/screens/SignInScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { AuthError } from '../../src/auth/authErrors';

jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('../../src/auth/useGoogleIdToken', () => ({ useGoogleIdToken: () => ({ prompt: jest.fn(), ready: true }) }));
jest.mock('expo-apple-authentication', () => ({
  signInAsync: jest.fn(),
  AppleAuthenticationScope: { EMAIL: 0, FULL_NAME: 1 },
}));

const navigation = { navigate: jest.fn() } as any;
const auth = () => ({
  signInWithApple: jest.fn().mockResolvedValue(undefined),
  signInWithGoogle: jest.fn(),
  signInWithEmail: jest.fn().mockResolvedValue(undefined),
  resendVerification: jest.fn().mockResolvedValue(undefined),
});

it('passes the Apple identity token and full name', async () => {
  const a = auth();
  (useAuth as jest.Mock).mockReturnValue(a);
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-token', fullName: { givenName: 'Ada', familyName: 'L' } });
  const { getByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.press(getByTestId('apple-sign-in-button'));
  await waitFor(() => expect(a.signInWithApple).toHaveBeenCalledWith('apple-token', { givenName: 'Ada', familyName: 'L' }));
});

it('signs in with email and password', async () => {
  const a = auth();
  (useAuth as jest.Mock).mockReturnValue(a);
  const { getByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pw123456');
  fireEvent.press(getByTestId('email-sign-in-button'));
  await waitFor(() => expect(a.signInWithEmail).toHaveBeenCalledWith('pat@example.com', 'pw123456'));
});

it('offers to resend the verification email when the address is unverified', async () => {
  const a = auth();
  a.signInWithEmail.mockRejectedValue(new AuthError('EMAIL_NOT_VERIFIED', 'x', 403));
  (useAuth as jest.Mock).mockReturnValue(a);
  const { getByTestId, findByText } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pw123456');
  fireEvent.press(getByTestId('email-sign-in-button'));
  await findByText('Confirm your email first. We sent you a link.');
  fireEvent.press(getByTestId('resend-verification-button'));
  await waitFor(() => expect(a.resendVerification).toHaveBeenCalledWith('pat@example.com'));
});

it('shows the verified banner after the email link', () => {
  (useAuth as jest.Mock).mockReturnValue(auth());
  const { getByText } = render(<SignInScreen navigation={navigation} route={{ params: { verified: true } } as any} />);
  expect(getByText('Email confirmed. Sign in to continue.')).toBeTruthy();
});

it('ignores a cancelled Apple sheet', async () => {
  const a = auth();
  (useAuth as jest.Mock).mockReturnValue(a);
  (AppleAuthentication.signInAsync as jest.Mock).mockRejectedValue(Object.assign(new Error('cancel'), { code: 'ERR_REQUEST_CANCELED' }));
  const { getByTestId, queryByTestId } = render(<SignInScreen navigation={navigation} route={{ params: undefined } as any} />);
  fireEvent.press(getByTestId('apple-sign-in-button'));
  await waitFor(() => expect(queryByTestId('sign-in-error')).toBeNull());
});
```

`mobile/__tests__/screens/SignUpScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SignUpScreen } from '../../src/screens/SignUpScreen';
import { useAuth } from '../../src/auth/AuthContext';

jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const navigation = { navigate: jest.fn(), goBack: jest.fn() } as any;

function fill(getByTestId: (id: string) => any) {
  fireEvent.changeText(getByTestId('name-input'), 'Pat');
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'pw123456');
  fireEvent.press(getByTestId('sign-up-button'));
}

it('shows "check your inbox" after sign-up (new or existing email look the same)', async () => {
  const signUpWithEmail = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ signUpWithEmail });
  const { getByTestId, findByText } = render(<SignUpScreen navigation={navigation} route={{} as any} />);
  fill(getByTestId);
  await findByText(/Check your inbox/);
  expect(signUpWithEmail).toHaveBeenCalledWith({ name: 'Pat', email: 'pat@example.com', password: 'pw123456' });
});

it('refuses a password shorter than 8 characters before calling the server', async () => {
  const signUpWithEmail = jest.fn();
  (useAuth as jest.Mock).mockReturnValue({ signUpWithEmail });
  const { getByTestId, findByText } = render(<SignUpScreen navigation={navigation} route={{} as any} />);
  fireEvent.changeText(getByTestId('name-input'), 'Pat');
  fireEvent.changeText(getByTestId('email-input'), 'pat@example.com');
  fireEvent.changeText(getByTestId('password-input'), 'short');
  fireEvent.press(getByTestId('sign-up-button'));
  await findByText('Use at least 8 characters for your password.');
  expect(signUpWithEmail).not.toHaveBeenCalled();
});
```

`mobile/__tests__/screens/ResetPasswordScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ResetPasswordScreen } from '../../src/screens/ResetPasswordScreen';
import { useAuth } from '../../src/auth/AuthContext';
import { AuthError } from '../../src/auth/authErrors';

jest.mock('../../src/auth/AuthContext', () => ({ useAuth: jest.fn() }));
const navigation = { navigate: jest.fn() } as any;

it('resets with the token from the deep link and returns to sign-in', async () => {
  const resetPassword = jest.fn().mockResolvedValue(undefined);
  (useAuth as jest.Mock).mockReturnValue({ resetPassword });
  const { getByTestId } = render(<ResetPasswordScreen navigation={navigation} route={{ params: { token: 'tok' } } as any} />);
  fireEvent.changeText(getByTestId('password-input'), 'new password 1');
  fireEvent.press(getByTestId('reset-password-button'));
  await waitFor(() => expect(resetPassword).toHaveBeenCalledWith('tok', 'new password 1'));
  expect(navigation.navigate).toHaveBeenCalledWith('SignIn', undefined);
});

it('explains an expired link', async () => {
  (useAuth as jest.Mock).mockReturnValue({ resetPassword: jest.fn().mockRejectedValue(new AuthError('INVALID_TOKEN', 'x', 400)) });
  const { getByTestId, findByText } = render(<ResetPasswordScreen navigation={navigation} route={{ params: { token: 'old' } } as any} />);
  fireEvent.changeText(getByTestId('password-input'), 'new password 1');
  fireEvent.press(getByTestId('reset-password-button'));
  await findByText('This link has expired. Ask for a new one.');
});

it('without a token, sends the user to ask for a new link', () => {
  (useAuth as jest.Mock).mockReturnValue({ resetPassword: jest.fn() });
  const { getByText } = render(<ResetPasswordScreen navigation={navigation} route={{ params: undefined } as any} />);
  expect(getByText('This link has expired. Ask for a new one.')).toBeTruthy();
});
```

`mobile/__tests__/navigation/AuthNavigator.test.tsx`:

```tsx
import { getStateFromPath } from '@react-navigation/native';
import { authLinking } from '../../src/navigation/AuthNavigator';

it('maps the verify-email redirect to sign-in with the verified banner', () => {
  const state = getStateFromPath('verified', authLinking.config);
  expect(state?.routes[0]).toMatchObject({ name: 'SignIn', params: { verified: true } });
});

it('maps the reset redirect to the reset screen with its token', () => {
  const state = getStateFromPath('reset-password?token=abc', authLinking.config);
  expect(state?.routes[0]).toMatchObject({ name: 'ResetPassword', params: { token: 'abc' } });
});
```

Run: `npx jest __tests__/screens/SignInScreen.test.tsx __tests__/screens/SignUpScreen.test.tsx __tests__/screens/ResetPasswordScreen.test.tsx __tests__/navigation/AuthNavigator.test.tsx` → FAIL.

- [ ] **Step 2: Implement the text field**

`mobile/src/components/ui/text-field.tsx`:

```tsx
import React from 'react';
import { TextInput, View } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Text } from './text';
import { COLORS } from '../../theme';

export interface TextFieldProps {
  label: string;
  testID: string;
  value: string;
  onChangeText: (value: string) => void;
  secure?: boolean;
  keyboardType?: 'default' | 'email-address';
  autoComplete?: 'email' | 'password' | 'new-password' | 'name';
}

export function TextField({ label, testID, value, onChangeText, secure, keyboardType = 'default', autoComplete }: TextFieldProps) {
  const { colorScheme } = useColorScheme();
  const colors = colorScheme === 'dark' ? COLORS.dark : COLORS.light;
  return (
    <View className="gap-1">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <TextInput
        testID={testID}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secure}
        keyboardType={keyboardType}
        autoCapitalize={keyboardType === 'email-address' || secure ? 'none' : 'words'}
        autoCorrect={false}
        autoComplete={autoComplete}
        placeholderTextColor={colors.mutedForeground}
        className="rounded-xl border border-border bg-card px-4 py-3 text-base text-foreground"
      />
    </View>
  );
}
```

(If `COLORS.light.mutedForeground` does not exist, use the key `src/theme` exports for muted text — check with `grep -n "muted" mobile/src/theme*`.)

- [ ] **Step 3: Implement the screens**

`mobile/src/screens/SignInScreen.tsx`:

```tsx
import React, { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, { FadeInDown } from 'react-native-reanimated';
import * as AppleAuthentication from 'expo-apple-authentication';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { useGoogleIdToken } from '../auth/useGoogleIdToken';
import { AuthError, messageFor } from '../auth/authErrors';
import type { AuthStackParamList } from '../navigation/AuthNavigator';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignIn'>;

export function SignInScreen({ navigation, route }: Props) {
  const { signInWithApple, signInWithGoogle, signInWithEmail, resendVerification } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unverified, setUnverified] = useState(false);
  const [notice, setNotice] = useState<string | null>(route.params?.verified ? 'Email confirmed. Sign in to continue.' : null);

  const run = useCallback(async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    setUnverified(false);
    try {
      await action();
    } catch (err) {
      setError(messageFor(err));
      setUnverified(err instanceof AuthError && err.code === 'EMAIL_NOT_VERIFIED');
    } finally {
      setBusy(false);
    }
  }, []);

  const google = useGoogleIdToken(useCallback((idToken: string) => void run(() => signInWithGoogle(idToken)), [run, signInWithGoogle]));

  async function handleApple() {
    let credential: AppleAuthentication.AppleAuthenticationCredential;
    try {
      credential = await AppleAuthentication.signInAsync({
        requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL, AppleAuthentication.AppleAuthenticationScope.FULL_NAME],
      });
    } catch {
      return; // The user closed the Apple sheet.
    }
    if (credential.identityToken) {
      const token = credential.identityToken;
      await run(() => signInWithApple(token, credential.fullName));
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-10 p-8" keyboardShouldPersistTaps="handled">
        <Animated.View entering={FadeInDown.duration(450)} className="gap-2">
          <Text className="text-4xl font-bold tracking-tight">Biometrics</Text>
          <Text className="text-base text-muted-foreground">Your health data, unified.</Text>
        </Animated.View>
        {notice ? <Text className="text-sm text-foreground">{notice}</Text> : null}
        <Animated.View entering={FadeInDown.delay(120).duration(450)} className="gap-3">
          <Button testID="apple-sign-in-button" className="w-full bg-foreground" onPress={handleApple} disabled={busy}>
            <Text className="text-base font-semibold text-background">Sign in with Apple</Text>
          </Button>
          <Button testID="google-sign-in-button" className="w-full border border-border bg-card" onPress={() => google.prompt()} disabled={busy || !google.ready}>
            <Text className="text-base font-semibold">Sign in with Google</Text>
          </Button>
        </Animated.View>
        <View className="gap-3">
          <TextField label="Email" testID="email-input" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
          <TextField label="Password" testID="password-input" value={password} onChangeText={setPassword} secure autoComplete="password" />
          {error ? <Text testID="sign-in-error" className="text-sm text-destructive">{error}</Text> : null}
          {unverified ? (
            <Button
              testID="resend-verification-button"
              variant="ghost"
              onPress={() => run(async () => { await resendVerification(email); setNotice('We sent you a new link.'); })}
            >
              Resend confirmation email
            </Button>
          ) : null}
          <Button testID="email-sign-in-button" className="w-full" onPress={() => run(() => signInWithEmail(email, password))} disabled={busy || !email || !password}>
            <Text className="text-base font-semibold text-primary-foreground">Sign in</Text>
          </Button>
          <Button testID="forgot-password-link" variant="ghost" onPress={() => navigation.navigate('ForgotPassword')}>
            Forgot password?
          </Button>
          <Button testID="create-account-link" variant="ghost" onPress={() => navigation.navigate('SignUp')}>
            Create an account
          </Button>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
```

(Check `mobile/src/components/ui/button.tsx` for the prop that renders string children and for `variant="ghost"` — both are already used by `SettingsScreen.tsx:141`. Use the same class names Settings uses for the primary button text colour if `text-primary-foreground` is not defined in `tailwind.config.js`.)

`mobile/src/screens/SignUpScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { messageFor } from '../auth/authErrors';
import type { AuthStackParamList } from '../navigation/AuthNavigator';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';

type Props = NativeStackScreenProps<AuthStackParamList, 'SignUp'>;

export const MIN_PASSWORD_LENGTH = 8;

export function SignUpScreen({ navigation }: Props) {
  const { signUpWithEmail } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit() {
    setError(null);
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    try {
      await signUpWithEmail({ name, email, password });
      // Shown whether or not the address already had an account: the server
      // answers both the same way, and so does the app.
      setSentTo(email.trim());
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  if (sentTo) {
    return (
      <SafeAreaView className="flex-1 bg-background">
        <ScrollView contentContainerClassName="flex-grow justify-center gap-6 p-8">
          <Text className="text-2xl font-bold">Check your inbox</Text>
          <Text className="text-base text-muted-foreground">
            We sent a link to {sentTo}. Open it on this phone to confirm your email, then sign in.
          </Text>
          <Button testID="back-to-sign-in" onPress={() => navigation.navigate('SignIn', undefined)}>
            Back to sign in
          </Button>
        </ScrollView>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-4 p-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold">Create an account</Text>
        <TextField label="Name" testID="name-input" value={name} onChangeText={setName} autoComplete="name" />
        <TextField label="Email" testID="email-input" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
        <TextField label="Password" testID="password-input" value={password} onChangeText={setPassword} secure autoComplete="new-password" />
        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
        <Button testID="sign-up-button" onPress={submit} disabled={busy || !name.trim() || !email.trim() || !password}>
          Create account
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
}
```

`mobile/src/screens/ForgotPasswordScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { messageFor } from '../auth/authErrors';
import type { AuthStackParamList } from '../navigation/AuthNavigator';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';

type Props = NativeStackScreenProps<AuthStackParamList, 'ForgotPassword'>;

export function ForgotPasswordScreen({ navigation }: Props) {
  const { requestPasswordReset } = useAuth();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-4 p-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold">Reset your password</Text>
        {sent ? (
          <>
            <Text testID="reset-sent" className="text-base text-muted-foreground">
              If an account uses {email.trim()}, we sent it a link. Open it on this phone.
            </Text>
            <Button onPress={() => navigation.navigate('SignIn', undefined)}>Back to sign in</Button>
          </>
        ) : (
          <>
            <TextField label="Email" testID="email-input" value={email} onChangeText={setEmail} keyboardType="email-address" autoComplete="email" />
            {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
            <Button testID="send-reset-button" onPress={submit} disabled={busy || !email.trim()}>
              Send reset link
            </Button>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}
```

`mobile/src/screens/ResetPasswordScreen.tsx`:

```tsx
import React, { useState } from 'react';
import { ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useAuth } from '../auth/AuthContext';
import { messageFor } from '../auth/authErrors';
import type { AuthStackParamList } from '../navigation/AuthNavigator';
import { MIN_PASSWORD_LENGTH } from './SignUpScreen';
import { Text } from '../components/ui/text';
import { Button } from '../components/ui/button';
import { TextField } from '../components/ui/text-field';

type Props = NativeStackScreenProps<AuthStackParamList, 'ResetPassword'>;

const EXPIRED = 'This link has expired. Ask for a new one.';

export function ResetPasswordScreen({ navigation, route }: Props) {
  const { resetPassword } = useAuth();
  const token = route.params?.token;
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(token ? null : EXPIRED);

  async function submit() {
    if (!token) return;
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError('Use at least 8 characters for your password.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await resetPassword(token, password);
      navigation.navigate('SignIn', undefined);
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-background">
      <ScrollView contentContainerClassName="flex-grow justify-center gap-4 p-8" keyboardShouldPersistTaps="handled">
        <Text className="text-2xl font-bold">Choose a new password</Text>
        {token ? (
          <>
            <TextField label="New password" testID="password-input" value={password} onChangeText={setPassword} secure autoComplete="new-password" />
            <Button testID="reset-password-button" onPress={submit} disabled={busy || !password}>
              Save password
            </Button>
          </>
        ) : null}
        {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
        {error === EXPIRED ? (
          <Button variant="ghost" onPress={() => navigation.navigate('ForgotPassword')}>
            Send a new link
          </Button>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
```

- [ ] **Step 4: Auth navigator and root wiring**

`mobile/src/navigation/AuthNavigator.tsx`:

```tsx
import React from 'react';
import { NavigationContainer, type LinkingOptions, type Theme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SignInScreen } from '../screens/SignInScreen';
import { SignUpScreen } from '../screens/SignUpScreen';
import { ForgotPasswordScreen } from '../screens/ForgotPasswordScreen';
import { ResetPasswordScreen } from '../screens/ResetPasswordScreen';

export type AuthStackParamList = {
  SignIn: { verified?: boolean } | undefined;
  SignUp: undefined;
  ForgotPassword: undefined;
  ResetPassword: { token?: string } | undefined;
};

const Stack = createNativeStackNavigator<AuthStackParamList>();

// The two links the server sends by email redirect here:
//   biometrics://verified               (after confirming an email)
//   biometrics://reset-password?token=… (after opening a reset link)
export const authLinking: LinkingOptions<AuthStackParamList> = {
  prefixes: ['biometrics://'],
  config: {
    screens: {
      SignIn: { path: 'verified', parse: { verified: () => true } },
      ResetPassword: 'reset-password',
    },
  },
};

export function AuthNavigator({ theme }: { theme: Theme }) {
  return (
    <NavigationContainer theme={theme} linking={authLinking}>
      <Stack.Navigator screenOptions={{ headerShadowVisible: false, headerTitle: '', headerTransparent: true }}>
        <Stack.Screen name="SignIn" component={SignInScreen} options={{ headerShown: false }} />
        <Stack.Screen name="SignUp" component={SignUpScreen} />
        <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
        <Stack.Screen name="ResetPassword" component={ResetPasswordScreen} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
```

If `getStateFromPath('verified', …)` does not yield `params: { verified: true }` because `parse` only runs on present query params, change the `SignIn` entry to `{ path: 'verified/:verified?', parse: { verified: () => true } }` and, if that still fails, add an `initialParams`-free wrapper screen `EmailVerified` (path `verified`) that renders `<SignInScreen … route={{ …route, params: { verified: true } }} />`; keep the test's expectation that the user lands on sign-in with the banner.

In `mobile/src/navigation/RootNavigator.tsx` replace:

```tsx
  if (!session) {
    return <SignInScreen />;
  }
```

with:

```tsx
  if (!session) {
    return <AuthNavigator theme={navTheme} />;
  }
```

and replace the `SignInScreen` import with `import { AuthNavigator } from './AuthNavigator';`. Update `__tests__/navigation/RootNavigator.test.tsx` where it asserts the signed-out screen: it should still find `apple-sign-in-button` (keep that assertion; add `jest.mock('../../src/auth/useGoogleIdToken', () => ({ useGoogleIdToken: () => ({ prompt: jest.fn(), ready: true }) }))` if Google's hook is not mocked there).

- [ ] **Step 5: Run and commit**

Run: `npx jest` → PASS (except pre-existing). `npx tsc --noEmit` → clean.

```bash
git add mobile/src mobile/__tests__
git commit -m "Add email sign-in, sign-up and password reset screens"
```

---

### Task 11: Sign-in methods screen (linking)

**Files:**
- Create: `mobile/src/screens/SignInMethodsScreen.tsx`, `mobile/__tests__/screens/SignInMethodsScreen.test.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx` (param list + screen)

**Interfaces:**
- Consumes: `authClient.listAccounts/linkSocial/unlinkAccount`, `unwrap`, `messageFor`, `useGoogleIdToken`.
- Produces: `RootStackParamList.SignInMethods: undefined`; component `SignInMethodsScreen`.

- [ ] **Step 1: Test**

`mobile/__tests__/screens/SignInMethodsScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { SignInMethodsScreen } from '../../src/screens/SignInMethodsScreen';
import { authClient } from '../../src/auth/authClient';

jest.mock('../../src/auth/useGoogleIdToken', () => ({ useGoogleIdToken: () => ({ prompt: jest.fn(), ready: true }) }));
jest.mock('expo-apple-authentication', () => ({ signInAsync: jest.fn(), AppleAuthenticationScope: { EMAIL: 0 } }));
const m = authClient as unknown as Record<string, jest.Mock>;

const accounts = (...providers: string[]) => ({ data: providers.map((p, i) => ({ id: `a${i}`, providerId: p, accountId: `acc-${p}` })), error: null });

beforeEach(() => jest.clearAllMocks());

it('lists linked methods and offers to link the missing ones', async () => {
  m.listAccounts.mockResolvedValue(accounts('google', 'credential'));
  const { findByTestId, getByTestId, queryByTestId } = render(<SignInMethodsScreen />);
  await findByTestId('method-google');
  expect(getByTestId('method-credential')).toBeTruthy();
  expect(getByTestId('link-apple-button')).toBeTruthy();
  expect(queryByTestId('link-google-button')).toBeNull();
});

it('disables unlinking the only remaining method', async () => {
  m.listAccounts.mockResolvedValue(accounts('apple'));
  const { findByTestId } = render(<SignInMethodsScreen />);
  const unlink = await findByTestId('unlink-apple-button');
  expect(unlink.props.accessibilityState?.disabled).toBe(true);
});

it('unlinks a method when another remains, then reloads', async () => {
  m.listAccounts.mockResolvedValueOnce(accounts('apple', 'google')).mockResolvedValueOnce(accounts('apple'));
  const { findByTestId } = render(<SignInMethodsScreen />);
  fireEvent.press(await findByTestId('unlink-google-button'));
  await waitFor(() => expect(m.unlinkAccount).toHaveBeenCalledWith({ providerId: 'google', accountId: 'acc-google' }));
  await waitFor(() => expect(m.listAccounts).toHaveBeenCalledTimes(2));
});

it('links Apple with the native identity token', async () => {
  m.listAccounts.mockResolvedValue(accounts('google'));
  (AppleAuthentication.signInAsync as jest.Mock).mockResolvedValue({ identityToken: 'apple-token' });
  const { findByTestId } = render(<SignInMethodsScreen />);
  fireEvent.press(await findByTestId('link-apple-button'));
  await waitFor(() => expect(m.linkSocial).toHaveBeenCalledWith({ provider: 'apple', idToken: { token: 'apple-token' } }));
});
```

Run → FAIL.

- [ ] **Step 2: Implement**

`mobile/src/screens/SignInMethodsScreen.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { authClient } from '../auth/authClient';
import { unwrap, messageFor } from '../auth/authErrors';
import { useGoogleIdToken } from '../auth/useGoogleIdToken';
import { Text } from '../components/ui/text';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';

interface LinkedAccount {
  id: string;
  providerId: string;
  accountId: string;
}

const LABELS: Record<string, string> = { apple: 'Apple', google: 'Google', credential: 'Email and password' };
const LINKABLE = ['apple', 'google'] as const;

export function SignInMethodsScreen() {
  const [accounts, setAccounts] = useState<LinkedAccount[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setAccounts(await unwrap<LinkedAccount[]>(authClient.listAccounts()));
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(
    async (action: () => Promise<unknown>) => {
      setBusy(true);
      setError(null);
      try {
        await action();
        await load();
      } catch (err) {
        setError(messageFor(err));
      } finally {
        setBusy(false);
      }
    },
    [load],
  );

  const google = useGoogleIdToken(
    useCallback((idToken: string) => void act(() => unwrap(authClient.linkSocial({ provider: 'google', idToken: { token: idToken } }))), [act]),
  );

  async function linkApple() {
    let token: string | null;
    try {
      token = (await AppleAuthentication.signInAsync({ requestedScopes: [AppleAuthentication.AppleAuthenticationScope.EMAIL] })).identityToken;
    } catch {
      return; // Sheet closed.
    }
    if (token) {
      const identityToken = token;
      await act(() => unwrap(authClient.linkSocial({ provider: 'apple', idToken: { token: identityToken } })));
    }
  }

  const linked = new Set(accounts?.map((a) => a.providerId));
  const onlyOne = (accounts?.length ?? 0) <= 1;

  return (
    <ScrollView contentContainerClassName="gap-4 p-4">
      <Text className="text-sm text-muted-foreground">
        You can sign in with any of these. Linking only works for an account that uses the same email.
      </Text>
      {accounts?.map((account) => (
        <Card key={account.id} testID={`method-${account.providerId}`} className="flex-row items-center justify-between">
          <Text className="text-base font-medium">{LABELS[account.providerId] ?? account.providerId}</Text>
          <Button
            testID={`unlink-${account.providerId}-button`}
            variant="ghost"
            disabled={busy || onlyOne}
            onPress={() => act(() => unwrap(authClient.unlinkAccount({ providerId: account.providerId, accountId: account.accountId })))}
          >
            Unlink
          </Button>
        </Card>
      ))}
      {onlyOne && accounts ? <Text className="text-xs text-muted-foreground">You need at least one way to sign in.</Text> : null}
      <View className="gap-2">
        {accounts && LINKABLE.filter((p) => !linked.has(p)).map((provider) => (
          <Button
            key={provider}
            testID={`link-${provider}-button`}
            disabled={busy || (provider === 'google' && !google.ready)}
            onPress={() => (provider === 'apple' ? linkApple() : google.prompt())}
          >
            {`Link ${LABELS[provider]}`}
          </Button>
        ))}
      </View>
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </ScrollView>
  );
}
```

(If `Card` does not forward `testID`, wrap its content in a `View testID=…`.)

In `RootNavigator.tsx`: add `SignInMethods: undefined;` and `Devices: undefined;` to `RootStackParamList` (Devices is used in Task 12), import the screen, and add
`<Stack.Screen name="SignInMethods" component={SignInMethodsScreen} options={{ title: 'Sign-in methods' }} />`.

- [ ] **Step 3: Run and commit**

Run: `npx jest __tests__/screens/SignInMethodsScreen.test.tsx` → PASS. `npx tsc --noEmit` → clean.

```bash
git add mobile/src mobile/__tests__/screens/SignInMethodsScreen.test.tsx
git commit -m "Let users link and unlink sign-in methods"
```

---

### Task 12: Devices screen and Settings entry points

**Files:**
- Create: `mobile/src/screens/DevicesScreen.tsx`, `mobile/src/components/account-section.tsx`, `mobile/__tests__/screens/DevicesScreen.test.tsx`, `mobile/__tests__/components/AccountSection.test.tsx`
- Modify: `mobile/src/navigation/RootNavigator.tsx`, `mobile/src/screens/SettingsScreen.tsx:145-146`

**Interfaces:**
- Consumes: `authClient.useSession/listSessions/revokeSession/revokeOtherSessions`.
- Produces: `DevicesScreen`, `AccountSection`, `describeDevice(userAgent: string | null | undefined): string`.

- [ ] **Step 1: Tests**

`mobile/__tests__/screens/DevicesScreen.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { DevicesScreen, describeDevice } from '../../src/screens/DevicesScreen';
import { authClient } from '../../src/auth/authClient';

const m = authClient as unknown as Record<string, jest.Mock>;
const sessions = [
  { id: 's1', token: 'tok-this', userAgent: 'Biometrics/1 CFNetwork Darwin iPhone', updatedAt: '2026-09-23T10:00:00Z' },
  { id: 's2', token: 'tok-other', userAgent: 'Biometrics/1 CFNetwork Darwin iPad', updatedAt: '2026-09-20T10:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  m.useSession.mockReturnValue({ data: { user: { id: 'u1' }, session: { token: 'tok-this' } }, isPending: false });
  m.listSessions.mockResolvedValue({ data: sessions, error: null });
});

it('marks this device and offers sign-out only on the others', async () => {
  const { findByTestId, queryByTestId } = render(<DevicesScreen />);
  expect(await findByTestId('this-device-badge-s1')).toBeTruthy();
  expect(queryByTestId('revoke-s1')).toBeNull();
  expect(await findByTestId('revoke-s2')).toBeTruthy();
});

it('revokes one device by token and reloads', async () => {
  const { findByTestId } = render(<DevicesScreen />);
  fireEvent.press(await findByTestId('revoke-s2'));
  await waitFor(() => expect(m.revokeSession).toHaveBeenCalledWith({ token: 'tok-other' }));
  await waitFor(() => expect(m.listSessions).toHaveBeenCalledTimes(2));
});

it('signs out all other devices', async () => {
  const { findByTestId } = render(<DevicesScreen />);
  fireEvent.press(await findByTestId('revoke-others-button'));
  await waitFor(() => expect(m.revokeOtherSessions).toHaveBeenCalled());
});

it.each([
  ['Biometrics/1 CFNetwork Darwin iPhone', 'iPhone'],
  ['Mozilla/5.0 (iPad; CPU OS 18_0)', 'iPad'],
  ['okhttp/4.12 Android', 'Android device'],
  [null, 'Unknown device'],
])('describes %s as %s', (ua, label) => {
  expect(describeDevice(ua)).toBe(label);
});
```

`mobile/__tests__/components/AccountSection.test.tsx`:

```tsx
import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { NavigationContext } from '@react-navigation/native';
import { AccountSection } from '../../src/components/account-section';

it('opens the sign-in methods and devices screens', () => {
  const navigate = jest.fn();
  const { getByTestId } = render(
    <NavigationContext.Provider value={{ navigate } as any}>
      <AccountSection />
    </NavigationContext.Provider>,
  );
  fireEvent.press(getByTestId('sign-in-methods-row'));
  fireEvent.press(getByTestId('devices-row'));
  expect(navigate.mock.calls.map((c) => c[0])).toEqual(['SignInMethods', 'Devices']);
});

it('renders without a navigator (Settings is rendered in isolation in tests)', () => {
  expect(() => render(<AccountSection />)).not.toThrow();
});
```

Run → FAIL.

- [ ] **Step 2: Implement**

`mobile/src/screens/DevicesScreen.tsx`:

```tsx
import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { authClient } from '../auth/authClient';
import { unwrap, messageFor } from '../auth/authErrors';
import { Text } from '../components/ui/text';
import { Card } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';

interface DeviceSession {
  id: string;
  token: string;
  userAgent?: string | null;
  updatedAt: string | Date;
}

export function describeDevice(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Unknown device';
  if (/iPad/i.test(userAgent)) return 'iPad';
  if (/iPhone|Darwin|iOS/i.test(userAgent)) return 'iPhone';
  if (/Android|okhttp/i.test(userAgent)) return 'Android device';
  return 'Unknown device';
}

export function DevicesScreen() {
  const { data } = authClient.useSession();
  const currentToken = data?.session?.token;
  const [sessions, setSessions] = useState<DeviceSession[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setSessions(await unwrap<DeviceSession[]>(authClient.listSessions()));
    } catch (err) {
      setError(messageFor(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(action: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  const others = sessions?.filter((s) => s.token !== currentToken) ?? [];

  return (
    <ScrollView contentContainerClassName="gap-3 p-4">
      {sessions?.map((s) => (
        <Card key={s.id} className="flex-row items-center justify-between">
          <View className="gap-1">
            <Text className="text-base font-medium">{describeDevice(s.userAgent)}</Text>
            <Text className="text-xs text-muted-foreground">Last active {new Date(s.updatedAt).toLocaleDateString()}</Text>
          </View>
          {s.token === currentToken ? (
            <View testID={`this-device-badge-${s.id}`}>
              <Badge>This device</Badge>
            </View>
          ) : (
            <Button testID={`revoke-${s.id}`} variant="ghost" disabled={busy} onPress={() => act(() => unwrap(authClient.revokeSession({ token: s.token })))}>
              Sign out
            </Button>
          )}
        </Card>
      ))}
      {others.length > 0 ? (
        <Button testID="revoke-others-button" variant="ghost" disabled={busy} onPress={() => act(() => unwrap(authClient.revokeOtherSessions()))}>
          Sign out all other devices
        </Button>
      ) : null}
      {error ? <Text className="text-sm text-destructive">{error}</Text> : null}
    </ScrollView>
  );
}
```

(Check `mobile/src/components/ui/badge.tsx`'s export name and children API; adapt the `<Badge>` usage to it.)

`mobile/src/components/account-section.tsx`:

```tsx
import React, { useContext } from 'react';
import { Pressable } from 'react-native';
import { NavigationContext } from '@react-navigation/native';
import { Card } from './ui/card';
import { Text } from './ui/text';

// Settings -> Account. Uses the navigation context rather than useNavigation()
// because Settings is also rendered without a navigator (see SettingsScreen).
export function AccountSection() {
  const navigation = useContext(NavigationContext);
  return (
    <Card className="gap-3">
      <Pressable testID="sign-in-methods-row" onPress={() => navigation?.navigate('SignInMethods' as never)} className="active:opacity-70">
        <Text className="text-base font-medium">Sign-in methods</Text>
        <Text className="text-xs text-muted-foreground">Apple, Google, email and password</Text>
      </Pressable>
      <Pressable testID="devices-row" onPress={() => navigation?.navigate('Devices' as never)} className="active:opacity-70">
        <Text className="text-base font-medium">Devices</Text>
        <Text className="text-xs text-muted-foreground">Where you are signed in</Text>
      </Pressable>
    </Card>
  );
}
```

In `SettingsScreen.tsx`, import `AccountSection` and render `<AccountSection />` directly above `<CoachSettingsSection />`.
In `RootNavigator.tsx`, import `DevicesScreen` and add `<Stack.Screen name="Devices" component={DevicesScreen} options={{ title: 'Devices' }} />`.

- [ ] **Step 3: Run and commit**

Run: `npx jest` → PASS (except pre-existing). `npx tsc --noEmit` → clean.

```bash
git add mobile/src mobile/__tests__
git commit -m "Show signed-in devices and add account rows to Settings"
```

---

### Task 13: End-to-end verification on the simulator

**Files:**
- Modify: `mobile/.env.example` (no new vars; confirm unchanged), `README.md` (mobile section: new screens)

- [ ] **Step 1: Full automated checks**

```bash
cd backend && npm test && npx tsc --noEmit
cd ../mobile && npx jest && npx tsc --noEmit
```

Expected: all pass (pre-existing failures recorded in Task 1 excepted).

- [ ] **Step 2: Build and run**

Follow the project's iOS run setup (build outside iCloud Documents, in `~/dev/biometrics-run`, via `xcodebuild` ad-hoc; simulator "DeviceHub"). Rebuild the native project because `expo-network`/`expo-linking` were added: `npx expo prebuild --platform ios` in the run copy first. Start the backend with `BETTER_AUTH_URL=http://<LAN IP>:3000` and no `RESEND_API_KEY`.

- [ ] **Step 3: Manual script** (tick each; note failures with exact messages)

1. Create an account with email/password → "Check your inbox". Backend log shows `[email] to=… Confirm your Biometrics email` with a link.
2. Sign in before confirming → "Confirm your email first…" and a Resend button.
3. `xcrun simctl openurl booted '<link from log>'` → app opens on sign-in with "Email confirmed. Sign in to continue." → sign in → dashboard.
4. Settings → Devices shows "This device". Settings → Sign-in methods shows "Email and password"; Unlink is disabled.
5. Sign out → Forgot password → link from log → `openurl` → Reset screen → new password → sign in with it.
6. Sign in with Google → lands on dashboard (a new user unless the Google email matches the verified email/password user, in which case Sign-in methods now lists both).
7. Apple sign-in to the extent the simulator allows (needs a signed-in Apple ID on the simulator).
8. Kill and relaunch the app → still signed in (session persisted in SecureStore).
9. Account deletion from Settings → back on sign-in; relaunch → still signed out.

- [ ] **Step 4: Commit docs**

```bash
git add README.md mobile/.env.example
git commit -m "Document the new sign-in flows"
```
