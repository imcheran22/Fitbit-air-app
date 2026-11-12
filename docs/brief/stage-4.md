# Stage 4 — Cloud route: sign-in, Google Health client, sync (milestone M3, part 2)

**Main session:** Sonnet, effort medium. **Relative cost:** $$ (contract-driven, so a lot is mechanical; Haiku may run the parts listed under "Cheaper")
**Goal:** Google Health data can be pulled read-only with tokens in Keystore-backed storage, merged with the other two sources, and synced in the background.

## Agents
`integration-coder` (Sonnet) · `reference-finder` (Haiku) for discovery-document lookups · `build-runner` · `diff-reviewer`.

## Do, in order
1. **Reality gate, finish it** (spec 102-113): write `docs/API_VALIDATION.md` and `docs/API_MAPPING.md` from `docs/api-snapshots/google-health-v4-discovery-2026-11-11.json`
   (per metric: source, field, unit, interval, timestamp semantics, limits). Anything not in the snapshot is marked unverified.
2. `:core:network` (spec 154-161, with this change: **the legacy Fitbit Web API is retired, so items 1, 4 and 5 become one provider-agnostic layer**):
   PKCE S256 + state, redirect parser, `EncryptedTokenStore`, `TokenRefreshAuthenticator` (single-flight refresh, `invalid_grant` becomes "Sign in again" without touching local data,
   Testing-mode refresh expiry explained), a shared request-budget/rate tracker using the limits the snapshot states, `GoogleHealthApiClient` and tolerant DTOs from the discovery schema
   (401 refresh once, 403 names the scope, 404/empty is "no data", 429 backoff with jitter, 5xx retry).
3. `GoogleHealthApiSource` implementing `HealthSource`; extend `TriSourceSyncOrchestrator` to pull all three sources via `SyncWatermarkDao`, reconcile, persist, and recompute affected days **and later days in the EWMA chain**.
4. Workers: `BiometricSyncWorker` (periodic 15-30 min, network-constrained, expedited on open/pull-to-refresh, post-wake morning recovery; never promise exact timing under Doze) and the AppAuth redirect in the manifest.
5. **Fault-injection suite with MockWebServer** (spec 248): out-of-order and duplicate pages, 401 mid-sync, 429 with `Retry-After`, truncated JSON, unknown enums, empty streams, token expiry during backfill,
   offline three days then sync, killed mid-window then resume.
6. Sign-in must degrade gracefully with no client ID configured (clear message, Demo still works).

## Cheaper (Haiku can run these under a Sonnet brief)
DTO classes from the snapshot, MockWebServer fixtures, rate-limit tracker unit tests, API_MAPPING table.

## Spec lines
102-113 · 154-161 · 166 · 169 · 197-200 (quota thinking still applies as a budget idea) · 244-249.

## Done means
Full gate command green · fault-injection suite green · API docs written with verified vs unverified marked · no token or URL-with-secret in any log (grep test) · diff reviewed.

## Next
Stage 5 on **Sonnet**.
