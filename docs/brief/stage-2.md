# Stage 2 — Look and first APK (milestone M2, closes M1)

**Main session:** Sonnet, effort medium. **Relative cost:** $$
**Goal:** the Pulse-derived design kit exists in `:core:ui`, and a debug APK opens an Overview built on real engine output from Demo data.

## Agents
`screen-builder` (Sonnet) for UI · `integration-coder` (Sonnet) for app plumbing · `reference-finder` (Haiku) for Pulse lookups ·
`build-runner` (Haiku) · `diff-reviewer` (Sonnet) at the gate. Max two agents in parallel, on different files.

## Do, in order
**2a — `:core:ui` kit** (read `docs/design/DESIGN_SYSTEM.md` §4-5 through the agent; spec 173-182)
- Agent A: `ArcGauge` (the design doc's ScoreDial; mini/sm/home/hero; Strain target arc and tick), `StrainTargetBar`, `MetricState`
  (loading/value/provisional/calibrating/stale/unavailable-with-reason/error), `ProvenanceLabel`, `StatusChip`, `Tag`, `InfoCard`,
  `KeyStatRow`, `ContributorRow`, `DriverList`, skeletons.
- Agent B (parallel, other files): `SleepHypnogramChart`, `AcwrTrendChart`, `BiometricSparklineCard`, `IntradayHrChart`, `ZoneBars`.
  Gaps are gaps, no allocation in `DrawScope`, TalkBack text carries the same information.
- Then shells: `ApexScaffold` (fixed ground, glass tab bar, round Coach action), `HomeHeader`, `DetailHeader`, `DetailShell`,
  `ApexSheet`, `InsightCard`, and a debug-only component gallery.
- Tests: unit and Compose/Robolectric tests for state mapping, 200% font no clipping, contrast stays green. `/handoff` checkpoint here if the context is large.

**2b — `:app` shell and Overview** (spec 184-188, 192-193)
- `ApexAthleteApplication`, manual `AppContainer` DI wiring the database, Demo store, pipeline and repository.
- `MainActivity`, `ApexNavHost` (4 tabs + Coach action, per-tab back stacks, selected day as argument), manifest basics
  (`INTERNET`, notification permission, `allowBackup=false`), first real `proguard-rules.pro` keep rules (SQLCipher, kotlinx-serialization, Room).
- Overview: three dials (Recovery, Day Strain with recommended range, Sleep), strain-target banner, rule-based coach card, Health Monitor strip,
  last-sync with stale warning, persistent Demo banner. Every number through `MetricState` with provenance.
- Tabs not built yet (Health, Journal, More) show a clearly labelled debug-only `DevPlaceholder`; Stage 5 removes it and the Stage 7 gate greps for it.

**Visual check (once, 1x):** render Overview light and dark, look at it next to the Pulse Overview screenshot, fix the listed defects, move on.

## Spec lines
173-182 (`:core:ui`) · 184-188 and 192-193 (`:app`) · 238 (Demo) · 260-268 (UX and critique loop; do it once per screen in this project, not twice).

## Done means
`./gradlew :core:ui:testDebugUnitTest :app:assembleDebug` green · APK path recorded · Overview renders Demo through the real pipeline ·
gallery renders light/dark · `diff-reviewer` has no open High/Critical.

## Next
Stage 3 on **Sonnet**. Optional: start it on Opus only if you want the Takeout design planned by Opus; the plan is already in the card.
