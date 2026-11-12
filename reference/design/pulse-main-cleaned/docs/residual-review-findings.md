# Residual review findings

The findings left open after the Pulse v1 code review (ce-code-review run `20261003-100049-affd8291`). Line numbers are for commit `c36814c`.

Fixed after the review: #2 sync on Google connect (`04bac0d`), #6 clearing a check-in answer (`8ac7902`), #24 recompute after a check-in (`f40453a`), #7 DateSwitcher rapid steps (`8bdece1`) and #11 one age helper (`c36814c`).

## Known residuals

All resolved on 2026-10-03 (branch `fix/residual-findings`). The "Where" line numbers are for `c36814c`, before the pipeline split.

| # | Sev | Where | Finding | Resolution |
|---|---|---|---|---|
| 1 | P1 | `src/server/pipeline.ts:551` | `pipeline.ts` is about 1,030 lines, and `stage2()` is a loop body of about 440 lines. | Resolved: split into `src/server/pipeline/` (`index`, `types`, `data`, `stage1`, `stage2`, and `scores.ts` with one scorer per column over a typed fold). `daily_scores`, `intraday_series` and `reports` stayed byte-identical on the seeded demo database, so `SCORING_VERSION` stays 3. |
| 3 | P2 | `src/server/pipeline.ts:392` | Stage 1 stamps the new `scoring_version` before stage 2 finishes, so a crash between stages hides stale stage-2 columns from `needsRecompute`. | Resolved: stage 1 no longer stamps the version (a new row starts at 0) or clears `intraday_dirty`; stage 2 does both in its own transaction. Failure-injection tests in `pipeline.test.ts` run stage 1 alone. |
| 4 | P2 | `src/server/sources/google/sync.ts:213` | Sleep and exercises deleted in Fitbit stay in the DB and keep scoring. | Resolved: inside each re-fetched list window, sessions, exercises and band HR samples Google no longer returns are deleted and their days marked dirty. Nothing is deleted outside the window, on a failed fetch, on a page with an unreadable point, or on an HR window with no band samples. Assumes Google omits deleted points; a tombstone shape, if a live payload ever shows one, needs a filter in `map.ts`. |
| 5 | P2 | `src/server/sources/google/client.ts:203` | The `raw_payloads` archive grows without bound. There is no retention. | Resolved: each Google pull deletes pages fetched more than `RAW_RETENTION_DAYS` (30) ago, using a new `fetched_at` index (migration 0005). Freed pages are reused, and SQLite's default auto-checkpoint handles the WAL. |
| 10 | P2 | `src/server/pipeline.ts:600` | Stage 2 builds each day's row as `Record<string, unknown>`, keyed by a separate `cols` list (`:961`). Neither is linked to the types. | Resolved with #1: rows are a typed `Stage2Row`, and `STAGE2_COLUMNS` comes from an object that must name every `Stage2Row` key (`satisfies`). |
| 12 | P2 | `src/server/queries/common.ts:213` | The strength-activity regex (also `pipeline.ts:502`) and the effort-to-strain scale (`pipeline.ts:909`, `common.ts:163`) are duplicated between the pipeline and the queries. | Resolved: both layers import `STRENGTH_TYPES` (`core/algorithms/healthspan.ts`) and `toStrainScale` (`core/scoring/strain.ts`). Outputs are unchanged, so no version bump. |
| 19 | P3 | `NOTICE:9` | The noop credit named only `src/core/scoring/`. | Already fixed: the credit at `NOTICE:9-13` now also covers the healthspan, stress, health monitor and sleep planner models in `src/core/algorithms/`. |
