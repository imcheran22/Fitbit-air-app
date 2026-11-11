# Better Auth Migration — Design

## Context

User authentication today is a small hand-rolled system (`backend/src/auth/`,
~194 lines):

- The mobile app obtains an Apple identity token (`expo-apple-authentication`)
  or a Google ID token (`expo-auth-session`) natively and POSTs it to
  `/auth/apple` or `/auth/google`.
- The backend verifies it (`jose` against Apple's JWKS, `google-auth-library`
  for Google) and upserts a `User` keyed on `(authProvider, providerUserId)`.
  Apple and Google accounts sharing an email are deliberately separate users.
- It returns a 15-minute HS256 access JWT and a single-use rotating 30-day
  refresh token (stored hashed in `RefreshToken`).
- `requireAuth` verifies the JWT and reads the user row on every request so a
  deleted user is rejected. Six routers use it.
- The mobile `api/client.ts` attaches the Bearer token, and on a 401 runs a
  single-flight refresh; only a 4xx from `/auth/refresh` signs the user out.

This spec replaces that system with **Better Auth 1.7.5**. The app is
**pre-launch**: there are no production users, so the auth tables are reset
rather than migrated.

The Google Health OAuth connection (`health/oauth.ts`, `sync/tokenRefreshJob.ts`,
`HealthConnection`) is a data-source connection, not user sign-in, and is
**not touched**.

## Goals (the user's words, as chosen during brainstorming)

- **A. New sign-in methods:** email + password (with email verification and
  password reset). Passkeys were chosen then deferred (see Non-goals).
- **C. Less custom auth code:** sessions, token refresh and ID-token
  verification move to a maintained library.
- **D. Plugins/features:** account linking, and session management (list
  signed-in devices, revoke them).

## Decisions taken during brainstorming

1. **Project:** Biometrics (TypeScript end to end, so Better Auth fits
   natively), not shared-backbone (Python API).
2. **Pre-launch, dev data only:** auth tables are reset; no user migration,
   no forced-re-sign-in concerns.
3. **Linking policy:** automatic linking only when *both* sides are verified —
   a trusted provider (Apple, Google) or a verified email/password account,
   matched to an existing user whose own email is verified. An unverified
   password sign-up can never take over an existing account. Users can also
   link and unlink methods manually. This **reverses** the previous
   "no cross-provider linking" rule documented on the `User` model.
4. **Passkeys deferred:** iOS passkeys need the Associated Domains
   entitlement (unavailable on the free personal Apple team this app is built
   with, as with push) and an HTTPS domain serving
   `apple-app-site-association`. Neither exists yet. Passkeys become a
   follow-up spec.
5. **Architecture:** database-backed Better Auth sessions with the Expo client
   plugin (opaque session cookie in SecureStore). Rejected alternatives:
   Better Auth + its JWT plugin (keeps a two-token/refresh shape for no gain,
   since `requireAuth` already reads the DB per request, and delays
   revocation); browser-redirect OAuth (worse Apple UX; App Review expects the
   native button).
6. **Email provider:** Resend in production (`RESEND_API_KEY`), a console
   sender that logs links in development. Assumed; the user did not object.

## Non-goals

- Passkeys, 2FA/TOTP, magic links.
- Setting a password on a social-only account from Settings (Better Auth's
  `setPassword` is server-only); such users can use "Forgot password".
- Web clients, organizations, admin.
- Any change to Google Health OAuth, sync, scoring, habits or coach logic.

## Design

### 1. Backend

**`backend/src/auth/auth.ts`** — exports `createAuth(deps)` and the default
`auth` instance built from real deps. `deps` carries the email sender and
optional Apple/Google `verifyIdToken` overrides (used only by tests).

```ts
betterAuth({
  database: prismaAdapter(prisma, { provider: 'postgresql' }),
  basePath: '/auth',
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  advanced: { database: { generateId: 'uuid' } },
  trustedOrigins: ['biometrics://', ...(isDev ? ['exp://', 'exp://**'] : [])],
  socialProviders: {
    apple: { clientId: APPLE_BUNDLE_ID, appBundleIdentifier: APPLE_BUNDLE_ID, clientSecret: '' },
    google: { clientId: [GOOGLE_CLIENT_ID, GOOGLE_IOS_CLIENT_ID] },
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword,          // via deps.email
    onExistingUserSignUp,       // emails the real owner "someone tried to sign up"
  },
  emailVerification: {
    sendVerificationEmail,      // via deps.email
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
  },
  account: {
    accountLinking: {
      enabled: true,
      trustedProviders: ['apple', 'google'],
      allowDifferentEmails: false,
      allowUnlinkingAll: false,
    },
  },
  session: { expiresIn: 30 * 24 * 60 * 60, updateAge: 24 * 60 * 60 },
  databaseHooks: { user: { create: { before: fillNameFromEmail } } },
  plugins: [expo()],
});
```

- `clientSecret: ''` for Apple only if the TypeScript types demand it; the
  idToken path never uses it.
- Session lifetime matches the old 30-day refresh window and slides daily
  while the app is used.
- `fillNameFromEmail`: `User.name` is required but Apple sends the name only
  on first sign-in (and the user may hide it); an empty name becomes the
  email's local part.
- Better Auth's own `user.deleteUser` stays **disabled**; the existing
  `DELETE /me` flow (which also revokes the Google Health grant) remains the
  only deletion path.

**`backend/src/app.ts`** — `app.all('/auth/*splat', toNodeHandler(auth))` is
mounted **before** the global `express.json` (Better Auth must read the raw
body). The `rawBody` capture for webhooks is unaffected. `authRouter` is
removed.

**`backend/src/auth/middleware.ts`** — `requireAuth` calls
`auth.api.getSession({ headers: fromNodeHeaders(req.headers) })`:
no session cookie → `401 { error: 'Missing session' }` (replacing
`'Missing bearer token'`); an invalid or expired session →
`401 { error: 'Invalid or expired token' }` (unchanged); a thrown DB error
propagates to Express as a 500.
It still sets `req.userId`, so the six routers that use it are unchanged.
A deleted user's sessions are deleted with the user, so the per-request
user check is inherent.

**`backend/src/email/`** — `EmailSender` interface
(`send({ to, subject, text })`), a Resend implementation selected when
`RESEND_API_KEY` is set, and a console implementation otherwise.

**Deleted:** `auth/jwt.ts`, `auth/appleAuth.ts`, `auth/googleAuth.ts`,
`auth/routes.ts`, `users/repository.ts#findOrCreateUserByProvider`, the
`jsonwebtoken` and `jose` dependencies (and `@types/jsonwebtoken`).
`google-auth-library` stays (used by `health/serviceAccount.ts`).

### 2. Data model

One Prisma migration (reset is acceptable, pre-launch):

- `User`: drop `authProvider`, `providerUserId`, the
  `@@unique([authProvider, providerUserId])`, and the `AuthProvider` enum.
  Add `name String`, `emailVerified Boolean @default(false)`, `image String?`,
  `updatedAt DateTime @updatedAt`. `email` becomes `@unique`. All domain
  columns and relations are unchanged. The model comment about deliberate
  non-linking is replaced with the new linking policy.
- Add `Session`, `Account`, `Verification` per Better Auth's core schema
  (generated with `npx auth@latest generate`, then reviewed), with `userId`
  relations to `User` and UUID ids.
- Drop `RefreshToken`.
- `users/deletion.ts#USER_OWNED_MODELS`: replace `RefreshToken` with
  `Session` and `Account`. (The existing schema-introspection test enforces
  that every `userId` model is listed.) `Verification` rows are keyed by
  identifier, not `userId`, and expire on their own.

### 3. Mobile

**`mobile/src/auth/authClient.ts`**

```ts
createAuthClient({
  baseURL: `${API_BASE_URL}/auth`,
  plugins: [expoClient({ scheme: 'biometrics', storagePrefix: 'biometrics', storage: SecureStore })],
});
```

New dependencies: `better-auth`, `@better-auth/expo`, `expo-network`,
`expo-linking` (`expo-secure-store`, `expo-web-browser`, `expo-constants`
are already present).

**`AuthContext`** keeps its public shape (`session`, `signInWithApple`,
`signInWithGoogle`, `signOut`, `clearSession`) and adds `signUpWithEmail`,
`signInWithEmail`, `requestPasswordReset`, `resetPassword`.

- `session` derives from `authClient.useSession()`.
- Apple/Google call `authClient.signIn.social({ provider, idToken: { token, user? } })`;
  Apple's first-sign-in `fullName` is passed as `user.name`.
- `signOut`: best-effort push unregister (unchanged, capped at 2 s) →
  `authClient.signOut()` → clear time-zone state.
- `clearSession` (used after account deletion): clears the Expo plugin's
  stored cookie and time-zone state locally without calling the server.

**`api/client.ts`** — sends `Cookie: authClient.getCookie()` instead of a
Bearer header. The refresh machinery (`inFlightRefresh`, `performRefresh`,
`/auth/refresh`, retry-on-401) is deleted. A 401 on an authed call clears the
stored session and fires the existing `onSessionExpired` event. `skipAuth`
is removed (only the old `/auth/*` calls used it; those now go through
`authClient`), along with its tests. `ApiError` and the endpoint helpers stay.

**Signed-out navigation** becomes a small stack:

- `SignInScreen`: Apple and Google buttons (as today) plus email/password
  fields, "Forgot password?" and "Create account" links.
- `SignUpScreen`: name, email, password → a "check your inbox" state. It
  shows that state even when the email already exists (matching the server's
  anti-enumeration response).
- `ForgotPasswordScreen` → "check your inbox".
- `ResetPasswordScreen` (new password, token from the deep link).

Deep links via React Navigation `linking`:

- `biometrics://verified` — the verify-email callback. The Expo plugin
  stores the session from the `?cookie=` parameter; the app lands signed in.
- `biometrics://reset-password?token=…` — opens `ResetPasswordScreen`.

Sign-up and forgot-password pass `callbackURL`/`redirectTo` as these relative
paths; the Expo client turns them into deep links.

**Signed in: two new screens reached from Settings**

- **Sign-in methods** — `listAccounts()` shows Apple / Google / Password.
  "Link Apple"/"Link Google" run the native sheet then
  `linkSocial({ provider, idToken })`. "Unlink" (`unlinkAccount`) is disabled
  on the last remaining method.
- **Devices** — `listSessions()`: user agent, last active, a "This device"
  badge; per-row "Sign out" (`revokeSession`) and "Sign out all other
  devices" (`revokeOtherSessions`).

Account deletion and push registration are otherwise unchanged.

### 4. Error handling

- Sign-in/sign-up failures surface Better Auth's error code as a short
  message on the screen (invalid credentials, email not verified, invalid
  token). "Email not verified" offers "Resend verification email".
- A 5xx or network error on an authed API call never signs the user out; only
  a 401 does (same rule as today, now without a refresh step).
- Email send failures in `sendVerificationEmail`/`sendResetPassword` are
  logged and do not leak whether the address exists.

### 5. Testing

**Backend** (Jest, real test Postgres):

- `tests/helpers/auth.ts`: `createTestUser(overrides?)` and
  `authHeaderFor(userId)` (a real session via Better Auth's internal adapter,
  returned as the header the middleware accepts). The ~30 test files that
  create users with `authProvider`/`providerUserId` and the 14 that call
  `issueSessionTokens` switch to these helpers in one mechanical sweep.
- New `tests/auth/` suite (replaces `jwt`, `appleAuth`, `googleAuth`,
  `routes` tests), using `createAuth` with stub `verifyIdToken`s and a
  capturing email sender:
  - Apple/Google idToken sign-in creates a user + account; a repeat sign-in
    reuses the user.
  - Google sign-in whose verified email matches a verified Apple user links to
    that user; it does **not** link when the local user's email is unverified.
  - Sign-up with an existing email: generic success, no second user, owner
    notified.
  - Password sign-in is refused before verification; the verification link
    verifies and signs in.
  - Password reset changes the password and revokes existing sessions.
  - `listSessions` / `revokeSession` / `revokeOtherSessions`.
  - `requireAuth`: 401 with no session, a bad cookie, an expired session, and
    after the user is deleted; a DB failure is a 500.
- `deletion.test.ts`: `Session` and `Account` rows are gone after `DELETE /me`.

**Mobile** (Jest):

- `authClient` is mocked. `AuthContext`, `AuthClearSession`,
  `AuthSignOutPush` tests are updated.
- `api/client` tests: refresh cases removed; a 401 fires `onSessionExpired`;
  a 5xx does not.
- New tests: sign-up shows "check your inbox" for both new and existing
  emails; sign-in methods disables unlink on the last method; devices lists
  sessions and revokes.

**Manual** (DeviceHub simulator): email sign-up → verify via the console
link → sign out → sign in; devices list and revoke; Google sign-in. Apple
sign-in and linking to the extent the simulator allows.

### 6. Configuration and rollout

- Backend env: remove `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`; add
  `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_IOS_CLIENT_ID`,
  `EMAIL_FROM`, optional `RESEND_API_KEY`. `.env.example` and README updated.
- Mobile env: unchanged (`EXPO_PUBLIC_API_BASE_URL`,
  `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID`).
- One branch, one PR. Done when backend `npm test` + `tsc` and mobile `jest`
  + `tsc` pass, and the manual simulator run succeeds.

## Open risks

- Better Auth's typing may require an Apple `clientSecret`; the idToken path
  does not use it (verified in source), so an empty string is acceptable.
- `npx auth@latest generate` has not been run against this schema; its output
  is reviewed and hand-adjusted rather than trusted.
- Better Auth and `@better-auth/expo` have not been exercised on Expo SDK 57
  specifically; the first implementation task installs them and runs the app
  before building on top.

## Amendments made while planning (2026-09-23)

Found while verifying Better Auth 1.7.5 against this codebase; the plan
(`docs/superpowers/plans/2026-09-23-better-auth-migration.md`) implements
these, and they supersede the sections above where they conflict.

1. **Node 24.** better-auth 1.7.5 is ESM-only and the backend is CommonJS on
   Node 20.15, which cannot `require()` it. The backend moves to Node 24
   (`require(esm)`); Jest runs with `--experimental-vm-modules`. Verified in a
   scratch project. Node 20 is past end-of-life anyway.
2. **Dev users are migrated, not wiped.** The migration derives `name`,
   `emailVerified` and `Account` rows from existing users so synced dev data
   survives (the Data model section said "reset").
3. **Verification lands on sign-in, not signed in.**
   `autoSignInAfterVerification: false`; `biometrics://verified` opens the
   sign-in screen with an "Email confirmed" banner. Restoring a session from a
   cold-start deep link would rely on undocumented Expo-plugin internals.
4. **No `onSessionExpired` event.** The Expo client clears its stored session
   inside `authClient.signOut()` before the request is sent, so a 401 in
   `api/client.ts` calls `authClient.signOut()` (unless the user has since
   signed in again) and `AuthContext` derives `session` from `useSession()`.
   `clearSession()` after account deletion uses the same call.
5. **`GOOGLE_IOS_CLIENT_ID` is optional**: the existing `GOOGLE_CLIENT_ID`
   already verifies the app's Google ID tokens.
