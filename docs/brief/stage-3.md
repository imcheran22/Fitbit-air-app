# Stage 3 — Real data in: Health Connect, Takeout, replay (milestone M3, part 1)

**Main session:** Sonnet, effort medium. `takeout-engineer` runs on **Sonnet, effort high**. **Relative cost:** $$$ (the heaviest stage)
**Goal:** data from a phone's Health Connect and from a Takeout ZIP lands in the encrypted DB once, in the right order and time zone, and the analytics replay correctly.
**Why this stage is risky:** a subtle bug silently corrupts history. The defence is tests written first, not a bigger model.

## Agents
`takeout-engineer` (Sonnet high) for 3b and 3c · `integration-coder` (Sonnet) for 3a · `diff-reviewer` · `build-runner` · `reference-finder`.

## Do, in order (each sub-step ends with its own green tests and a commit; `/handoff` between them if context is large)
**3a — Health Connect** (spec 165, 202-207)
- `HealthConnectDataSource` + `HealthConnectSource` implementing `HealthSource`, all twelve record types, ChangeToken sync with windowed fallback,
  states for not installed / outdated / partial permission / history permission / revoked while running.
- Manifest: read permissions, `READ_HEALTH_DATA_HISTORY`, `READ_HEALTH_DATA_IN_BACKGROUND`, rationale action, Android 14 `activity-alias`; a manifest test proves both resolve.
  Confirm permission strings against the pinned SDK.

**3b — Takeout engine, tests first** (spec 212-230)
- First write the synthetic-archive generator (in test code) and the failing tests from spec line 230, including the 250,000-row bounded-memory test, truncated ZIP,
  malformed rows mid-stream, cancel and resume, DST days, multi-part archives.
- Then `TakeoutArchiveInspector`, `TakeoutEntryRouter`, the parsers, `TakeoutZipImporter` (zero-disk streaming, non-closing entry wrapper, 2,500-row batches,
  header-name CSV mapping, confidence filter with counted drops), `TakeoutImportWatermarks`, `TakeoutImportWorker` (foreground-service worker, cancellable, resumable).
- All observed data goes through `HealthIngestor`. Never log content, names with personal data, or URLs with queries.

**3c — Reconciliation and replay**
- Tri-source de-duplication tests (invariant 3): Takeout over Health Connect, over itself (idempotent), partial-day coverage, workouts and steps never doubled,
  older archive over newer data.
- `DailyIntelligencePipeline.replay(from, to)`: strict chronological order, EWMA seeded from the persisted prior day, deterministic, resumable; golden-vector test for propagation.
- Record the timestamp-semantics probe result and unknowns in `docs/API_VALIDATION.md` and `docs/OPEN_POINTS.md` (real archive needed: `UNVERIFIED-NEEDS-REAL-ACCOUNT`).

## Spec lines
165 · 202-207 · 212-230 · 135-146 (invariants) · 248-249 (fault injection, time chaos).

## Done means
`./gradlew :core:data:testDebugUnitTest` plus the full gate command green · every test in spec line 230 exists and passes · manifest test passes · diff reviewed.

## Gate review (optional, recommended): `/gate 3` on **Opus**, one short session, diff only
Checklist: ZIP never extracted or read whole · non-closing wrapper · batches 2,500 · watermark advances after commit only · re-import identical state ·
supersede bounded to covered ranges · no source writes DAOs directly · DST and midnight-crossing sleep tested · no health value, token or content in logs ·
drops and quarantines counted. Fix High/Critical only; do not rewrite.

## Next
Stage 4 on **Sonnet** (or Haiku for the rate-limit and DTO mechanics if you want to push cost down; escalate if it fails twice).
