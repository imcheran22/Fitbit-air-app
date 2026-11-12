# Security policy

Pulse holds health data and a Google OAuth grant, so security reports are taken seriously.

## Reporting a vulnerability

Report it privately through GitHub: **Security › Report a vulnerability** on this repository, or open
<https://github.com/adityaongit/pulse/security/advisories/new>. Please do not open a public issue,
discussion or pull request for a vulnerability.

Include what you found, how to reproduce it (against a demo instance where possible), and the impact you
see. Never send real health data, tokens or `.env` values.

Pulse is maintained by one person in their spare time. Expect an acknowledgement within a week, and a fix
or a plan as soon as the issue is understood. You will be credited in the advisory unless you prefer not
to be.

## Supported versions

Only the latest commit on `main` is supported. There are no release branches; update to `main` to get fixes.

## Scope

In scope, for example:

- Sign-up and sign-in (better-auth: `src/server/auth.ts`, `src/proxy.ts`, `src/app/login/`, `src/app/signup/`), and the Google connect flow (`src/app/oauth/`).
- Anything that lets one user read or change another user's data.
- Anything that lets a non-owner read data, run server actions or reach the Google grant.
- Leaks of OAuth tokens, the session secret or health data through logs, errors, exports or the API.
- The data exports and the avatar upload.

Out of scope:

- The server owner: whoever runs the instance can read its database and reset any password (`scripts/reset-password.mjs`) by design.
- Attacks that need root on the host, or physical access to it.
- Findings from automated scanners without a demonstrated impact.

## Hardening a self-hosted instance

- Set `BETTER_AUTH_SECRET` to a random value and keep it secret. Set `DISABLE_SIGNUP=true` once everyone who should have an account has one.
- Serve it over HTTPS only (a tunnel or reverse proxy); the session cookie is marked Secure over HTTPS.
- Keep `.env` and database dumps readable by you only, and encrypt dumps before they leave the machine.
- If you suspect a leak, revoke Pulse at <https://myaccount.google.com/permissions>, rotate the OAuth client secret, rotate `BETTER_AUTH_SECRET`, and ask users to change their passwords (a change signs out their other devices).

See [docs/setup.md](docs/setup.md) for the full setup.
