# Stage 1 — Lock the base (milestone M0)

**Main session:** Sonnet, effort low. (Haiku is enough if the build is already green.) **Relative cost:** $
**Goal:** a green, committed, documented foundation, so every later stage starts from known ground.

## Agents
`build-runner` (Haiku) for every Gradle run · `integration-coder` (Sonnet) for the migration test and fixes · `reference-finder` (Haiku) for lookups.

## Do, in order
1. Baseline: `build-runner` runs `./gradlew clean :core:domain:test :core:analytics:test testDebugUnitTest :app:assembleDebug --continue`.
   Record the exact result. Fix compile or test breaks minimally (cause, not symptoms; never weaken a test).
2. Schema: confirm Room schema export is on, commit `core/database/schemas/**` for v1 and v2, add the **v1→v2 migration test**
   (`workout.perceivedExertion` auto-migration) with real data surviving.
3. Close the audit leads that are cheap facts (spec lines 121-129): bundled SQLCipher SQLite version (are window functions safe?),
   JDK 17 vs 21 note in README, unused dependencies, and **whether the database can hold** 5-minute HRV LF/HF, minute SpO2 and
   minute skin temperature. If not: add the additive entity/DAO/migration now (Stage 3 needs it), with a migration test.
   Leads about proguard and the manifest belong to Stage 2 and Stage 7; just list them in `docs/AUDIT.md` as open.
4. Write `docs/AUDIT.md` (finding, severity, evidence, fix; "read-through, no defects needing a fix" is allowed only with the leads above checked),
   `docs/DECISIONS.md` (Pulse navigation, Strain 0-21, legacy Fitbit Web API retired and not implemented, schema v2, archive ranked first,
   model routing without Fable), `docs/EVIDENCE.md` and `docs/OPEN_POINTS.md` (headers and the first rows).
5. Correct `docs/PROGRESS.md` (work is committed; list what Stage 1 changed). Commit small and green. Run `/handoff 1`.

## Spec lines (only if needed)
Audit leads 117-131 · Section 3 table 81-98 · evidence statuses 256.

## Done means
Full build green with exact command and totals recorded · migration test green · schema JSON committed · AUDIT, DECISIONS, EVIDENCE, OPEN_POINTS exist.

## Next
Stage 2 on **Sonnet**.
