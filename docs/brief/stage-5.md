# Stage 5 — Every screen (milestone M4)

**Main session:** Sonnet, effort medium. **Relative cost:** $$ (parallel and well-specified; the cheapest way to build a lot of UI)
**Goal:** every destination exists, has all its states, survives process death, and is driven only by `AthleteRepository` state.

## Agents
`screen-builder` (Sonnet), two at a time on different files · `integration-coder` (Sonnet) for export/import/delete and settings plumbing ·
`reference-finder` (Haiku) for the matching Pulse screen and screenshot · `build-runner` · `diff-reviewer`.
One screen per agent call; the brief names the Pulse spec section and the Apex mapping in `DESIGN_SYSTEM.md` §4.

## Do, in order (a `/handoff` after each group)
**5a — Detail screens from the Overview dials** (spec 188-190): Recovery (HRV log-scale baseline, RHR, sleep contribution, `FatigueSignals`, calibration progress, what moved the score) ·
Strain (dial, zone histogram, workout log and detail, ACWR/CTL/ATL/TSB chart with caveats, monotony, manual workout + RPE as `USER_REPORTED`) ·
Sleep (hypnogram, restorative %, efficiency, latency, wake bouts, circadian consistency, tonight's `SleepNeed`, bedtime suggestion).
**5b — Tabs** (spec 191): Health (Body & Health, Trends, Explore) · Journal · More (Data Sources & Diagnostics with sync watermarks and rate budget, **Takeout import card** with file X of Y, rows
imported/dropped/quarantined, "Recalculating day X of Y", Force full re-import; Settings; units; theme; notification and quiet hours; How Apex works with `FORMULAS.md`). Coach opens from the round action.
**5c — Onboarding and data control** (spec 268, 191): onboarding (how data arrives, profile, sign-in, Health Connect permissions, real backfill progress, optional Takeout, first results with "Calibrating" explained) ·
export/import (JSON, CSV) · "Delete all my data" · DB-corruption/lost-key recovery screen that explains and offers a clean re-sync.

Remove `DevPlaceholder` when 5b lands.

## Every screen must (spec 193)
Implement loading, empty, partial, calibrating, stale, offline and error states · expose provenance, calibration state and a "how this is calculated" sheet matching `FORMULAS.md` ·
use tokens only · 48 dp targets · TalkBack parity · 200% font · reduced motion · strings in `strings.xml` · never touch DAOs or engines from a composable.

## Visual check
Once per hero screen at 1x (Recovery, Strain, Sleep, Health, More), next to the Pulse screenshot, fix the listed defects, move on.

## Done means
Full gate command green · every destination reachable from navigation · a Compose test per screen covers each state · process-death restore test for the navigation and the selected day ·
export → import round trip and delete-all tested · `DevPlaceholder` gone · diff reviewed.

## Next
Stage 6 on **Sonnet**.
