# Stage 7 — Harden and ship (milestones M6 and M7)

**Main session:** Sonnet, effort medium. Haiku for the documentation half. Optional `/gate 7` on **Opus**. **Relative cost:** $$
**Goal:** a release build that launches, a red-team log, honest docs, and a final report that matches the evidence table.

## Agents
`build-runner` (Haiku) · `integration-coder` (Sonnet) for proguard, CI, lint · `takeout-engineer` (Sonnet high) only for any red-team failure in import or time handling ·
`diff-reviewer` · `reference-finder`.

## Do, in order
**7a — Red team** (spec 301): turn every attack into an automated test where possible; log attack, result and fix in `docs/REDTEAM.md`. Fix every Critical and High.
Known-unknowns protocol (spec 303): a Diagnostics probe plus an `OPEN_POINTS.md` row for each real-band / real-account / real-archive unknown.
**7b — Release build** (spec 253-254): `:app:assembleRelease` (unsigned reproducible if no signing material), R8 keep rules proven by a release smoke test (opens the encrypted DB, renders Overview in Demo,
parses a fixture API response and a synthetic Takeout ZIP), lint, ktlint or detekt, CI green, release APK size, cold-start and import-memory budgets measured or marked unverified with the device profile.
**7c — Docs** (Haiku can draft, Sonnet checks) (spec 309-314): `SETUP.md` for a non-developer (exact clicks, Takeout export steps, troubleshooting table), `VERIFICATION.md`, README status table, `ARCHITECTURE.md` and `FORMULAS.md`
matching the code. No speculative console labels.
**7d — Completion gate** (spec 272-284): run every item, record the exact commands. File count (35) is a floor. Grep for `TODO`, `DevPlaceholder`, `TODO()`, hard-coded screen values, secrets, health values in logs.
**7e — Final report** in the format at spec line 322, generated from `EVIDENCE.md`. Never write "complete" or "verified" beyond the evidence.

## Gate review (optional, recommended): `/gate 7` on **Opus**, one short session, diff only
Checklist: no network host outside Google/Anthropic · no write scope or write call · `allowBackup=false` · tokens and keys only in Keystore-backed storage · no secrets/health values in logs, crash output or notifications ·
Takeout path never persists the ZIP · Demo never reaches the real DB or exports · proguard rules cover every JNI/reflection library · manifest exports minimal. Fix High/Critical only.

## Done means
Spec section 13 satisfied item by item, or each unmet item recorded with its exact blocker.
