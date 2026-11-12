# Review: AI coach and screens end to end

Read-only review, 2026-11-12, at commit `587dac2`. No code was changed. Scope: the coach (rule-based briefing and
Ask Apex), the 21 routes in `docs/APP_CONTRACT.md`, and a comparison with the Pulse reference
(`reference/design/pulse-mobile-main`, read as data only).

Verdict in one line: the AI path is correct and privacy-tight. Every route renders real pipeline data and every
button is wired. The defects are a handful of correctness bugs (one can silently clear a check-in, one leaves stale
scores after a profile edit, live heart rate has no provenance label) and a lot of computed data that no screen shows.

---

## 1. Bugs, ranked by severity

| # | Sev | Where | What is wrong | Smallest fix |
|---|---|---|---|---|
| 1 | **High** | `app/.../ui/journal/JournalViewModel.kt:27-30, 52-58` | When you step to a day whose stored check-in has the same values as the previous day, `stored` (a `StateFlow`) does not emit again, because equal values are dropped. `setDay` has already reset the draft to 0/0, so the pickers show blank, **Save** is enabled (`canSave` sees draft != stored), and tapping it saves nulls. That deletes the real check-in (`AthleteRepository.saveCheckIn` deletes on null). Habitual ratings make this common. | Put the day into the state, e.g. `StoredCheckIn(day, fatigue, soreness)` or `map { day to it }`, so each day emits. Re-seed when `stored.day == dayFlow.value`. Add a test for two equal days. |
| 2 | **High** | `app/.../ui/profile/ProfileViewModel.kt:62-75`; `core/data/.../repository/AthleteRepository.kt:310` | Saving the profile (birth year, max HR, sex, zone method) never calls `recomputeAll()`. The viewed day recomputes live (`observe` combines `settings.profile`), but the persisted history keeps the old profile: `STRAIN_SCORE`, `DAILY_TRIMP`, ACWR, `RECOVERY_SCORE`. Today's load ratio, sleep-need surcharge, trends and the next morning's recovery (which reads yesterday's `ACWR_UNCOUPLED`) therefore mix two profiles. `recomputeAll`'s own KDoc names this case. | After `settings.updateProfile(profile)`, call `repository.recomputeAll()` (inject the repository), with a progress state. Skip it if only height or weight changed. |
| 3 | Medium | `core/data/.../repository/AthleteRepository.kt:47, 163`; `app/.../ui/common/StateMappers.kt:113-117`; `app/.../ui/overview/OverviewMapping.kt:141`; `app/.../ui/health/HealthUi.kt:204-206` | The live heart-rate number has no provenance. Overview reads `a.provenance[HEART_RATE_AVG]`, but no source writes a daily `HEART_RATE_AVG` row, so the value is always null. `mapper.heartRate()` hard-codes null. The comment at `HealthUi.kt:205` says the intraday store keeps no source, but `IntradayHeartRateEntity.provenance` exists. This breaks "provenance next to every number". | Add `provenance: DataProvenance?` to `HeartRateTick`. Fill it from `lastRow.provenance` and the minute rows. Pass it through `heartRate()` and the Overview mapping. |
| 4 | Medium | `core/data/.../coach/RuleBasedCoachEngine.kt:148` | The fatigue sentence takes `days = maxOf(hrv.consecutiveDays…, rhr.consecutiveDays…)` even when only one signal fired. "Heart rate variability has been below your normal range for 5 days" can carry resting heart rate's count. The numeral is computed, but it is attached to the wrong metric. | Choose `days` by the branch: HRV only, RHR only, or the max when both fired. |
| 5 | Medium | `core/data/.../coach/RuleBasedCoachEngine.kt:94` (and `duration()`, `oneDecimal`) | The briefing hard-codes °C and metric wording, but the Overview and Health screens convert skin temperature to °F for imperial users. "Every sentence restates a number that is on screen" fails for those users, and the same text is sent to Ask Apex. | Pass the unit system (or a small formatter interface) into `briefing()`. Render the temperature slot in the owner's unit. |
| 6 | Medium (privacy) | `app/.../ui/settings/SettingsViewModel.kt:70`; contract in `core/data/.../coach/ask/AiKeyStore.kt:23` | Switching the AI coach off leaves the Anthropic key stored. `AiKeyStore.clear()` documents "the AI coach switch" as one of its callers. Nothing is sent while the switch is off (the client checks `isEnabled`), but the documented promise is not kept. | In `setAiCoachEnabled(false)`, call `aiKeyStore.clear()` (inject it). Or change the KDoc and the Settings copy so they say the key is kept. |
| 7 | Low | `core/data/.../coach/RuleBasedCoachEngine.kt:157, 159` | The fatigue line names "the start of an illness". This contradicts the Ask Apex system prompt ("Do not name medical conditions"), and the same sentence is fed into that prompt. `overview_alert_note` uses the same list without illness. | Use the Overview wording: "hard training, short sleep or alcohol". |
| 8 | Low | `app/.../ui/health/HealthViewModels.kt:35, 39, 100`; `HealthScreen.kt:71-75` | Health and Heart-rate-day keep the previous day's result while the new day loads. For a moment, the new date label sits over the old numbers. Overview guards against this with `epochDay`, and Strain uses `onStart { emit(null) }`. | Add `.onStart { emit(null) }` inside each `flatMapLatest`, or check `analysis.epochDay == day` in `buildHealthUi`. |
| 9 | Low | `core/data/.../repository/AthleteRepository.kt:282-301, 315-316` | `addManualWorkout` returns an id and the screen shows **Saved** even when `write` returned early because the store was not ready. The same silent no-op affects `saveCheckIn` and `deleteWorkout`. | Make `write` return a Boolean, or throw when no store is ready. The VMs already map exceptions to Failed. |
| 10 | Low | `app/.../navigation/ApexNavHost.kt:268` | "Leave demo" on the store-failed screen flips `demoMode` but does not discard the demo store, unlike `SettingsViewModel.turnOffDemo()`. The demo database stays on disk. | Call `container.stores.discardDemo()` after the settings update, as Settings does. |
| 11 | Low | `app/.../ui/coach/CoachScreen.kt:66` | The coach context is fixed to `repository.today()` when the VM is created. A Coach screen left open past midnight keeps yesterday's briefing. Opening Coach from a past day's Overview shows today's briefing, while the Overview coach line shows the selected day's. | Feed a day flow (the host's selected day, or a midnight ticker) into `dashboard()`. |
| 12 | Low | `app/.../ui/coach/CoachViewModel.kt:55, 80`; `EncryptedAiKeyStore.kt:25, 40` | `keys.has()` decrypts with the Android Keystore, and `set()` runs `commit()`, both on the main thread during VM creation and on save. | Move both to `Dispatchers.IO`, or cache a `has` flag in plain prefs. |
| 13 | Low | `core/data/.../coach/ask/NumeralCheck.kt:12`; `AskApexPayload.kt:16` | The no-invented-number check ignores sign, so "−0.3" and "+0.3" match. The strain unit label "0-21" adds `0` and `21` to the allow-list. Numbers written as words are not caught. These are known limits of a lexical check, not a leak. | Keep the sign in `numeral`. Render the strain unit as "out of 21", or exclude unit labels from `allowedSet`. |
| 14 | Info | `core/data/.../coach/ask/AskApexPayload.kt:41`; `AskApexClient.kt:137-138` | The preview says "model: claude-opus-5-5". With `fallbacks: default`, a refused request can be answered by another model. The preview also does not mention the SDK's standard client headers (OS, runtime). Neither carries health data. | Add one line to the preview: "If this model declines, Anthropic may answer with another Claude model." |
| 15 | Info | `app/.../ui/onboarding/OnboardingViewModel.kt:134` | A Health-Connect-only owner gets no immediate sync at the end of onboarding. `MainActivity.onStart` has already run, and the Google path's `syncNow` does not apply. The first pull depends on the periodic work starting promptly (network constraint). | In `finish()`, call `SyncScheduler.syncNow` when not in demo. |
| 16 | Info | `core/data/.../coach/RuleBasedCoachEngine.kt:128-129` | The variable `toLow` and its comment say "lower edge", but the value and the text are minutes to the **upper** edge. The output is correct and the name is misleading. | Rename it to `toTop` and fix the comment. |
| 17 | Known gap | `docs/FORMULAS.md` § "manual workouts and session-RPE" | RPE from Add workout is stored but feeds no score, so a manual workout without heart rate changes nothing on screen. This is already an open point. Listed so the owner knows the Add-workout route has no visible effect. | Keep a separate session-RPE series (Foster), as FORMULAS.md proposes. |

Checked and found correct (no action needed):
- **Model ID.** `claude-opus-5-5` (`AskApexPayload.kt:51`) is the current default model.
- **Request format for anthropic-java 3.3.0.** Verified with `javap` against the cached jar: `MessageCreateParams.builder().model(String).maxTokens().system(String).addUserMessage().outputConfig(OutputConfig.builder().effort(LOW))`, and on the beta endpoint `.addBeta(AnthropicBeta.SERVER_SIDE_FALLBACK_2026_07_01).fallbacksDefault()`. Both exist and are used correctly.
  - No `thinking` field is sent. That is right for Opus 5.5, where disabled thinking and budgets return 400.
  - `stop_reason` is checked before content, `refusal` is handled, and a beta 400/403/404/422 falls back to the standard endpoint.
  - Effort `LOW` and 2000 tokens suit a 150-word answer.
- **No logging.** There is no `Log`, `println`, `Timber` or `printStackTrace` anywhere in `app/` or `core/`, so no health value can reach a log. The exception messages from the client are dropped (`CoachViewModel.kt:116-118`).
- **Sent equals previewed.** `confirmSend()` sends the very `AskApexPayload` instance that was previewed. The client sends `payload.system` and `payload.userMessage` and nothing else from the app. The payload holds a closed set of 10 computed facts plus the briefing text: no dates, ids, samples or names.
- **Degrades cleanly.** Switch off, no key, 401/403, 429, 5xx, offline, empty answer and unknown errors each map to `Unavailable` with calm copy, and the rule-based briefing stays on screen. Nothing is sent without the switch, a key and a confirm tap.
- **Numbers bound to computed values.** The rule-based engine fills only template slots (`CoachLine.numbers`). AI text is checked against the numbers that were sent, and a warning chip shows when an answer contains others. The AI answer is labelled `AI_INTERPRETED` and the briefing `MATHEMATICALLY_DERIVED`.
- **Wording not diagnostic.** No diagnostic wording was found apart from item 7.

---

## 2. Pulse AI and insight features worth adding (ranked by athlete value)

Pulse has a multi-turn, tool-calling chat (`src/coach/tools.ts`: `get_day`, `get_sleep`, `get_trend`,
`get_activities`, `get_activity`, `get_journal_impacts`, `get_health`, `get_report`, `get_profile`), chat history,
starter suggestions, one-tap AI "glances" on a workout, night or nap (`activity.ts`), key testing on save
(`validate.ts`), user notes, and replies in the person's units and language. Apex has one deterministic briefing plus
single-shot Q&A over 10 facts.

**Do not copy tool calling as-is.** Its tools fetch data the owner never previewed, which breaks Apex's
"request contains only what the preview shows" rule. Each feature below is a bounded, previewable digest instead.

| Rank | Feature (Pulse source) | Why it matters to an athlete | Apex data already there | Size |
|---|---|---|---|---|
| 1 | **Journal behaviour impacts** (`core/engine/journal.ts`: next-day recovery, HRV and sleep after a "yes" vs a "no", 90-day window, ≥5 days per arm, pooled-t at 70 %; `screens/journal/insights.tsx`) | Answers "what actually moves my recovery?" from the athlete's own data. This is the most actionable insight in Pulse. | Daily `RECOVERY_SCORE`, `HRV_RMSSD` and `SLEEP_SCORE` rows. Missing: yes/no behaviour tags in the Journal (Apex has only 1-10 fatigue and soreness). | M (tags, a Room table, the engine with tests first, a screen) |
| 2 | **Weekly and monthly report** (`get_report`, `screens/.../reports`: score averages vs the previous period, best and worst day, training balance, summary) | A weekly review is how athletes plan blocks. Deterministic, no AI needed. | Every score and load series is already persisted per day. | M |
| 3 | **Multi-day context and starter questions for Ask Apex** (`trendDigest`: 14 days vs the prior 14; `suggestions.ts`) | Most questions are "why this week?", not "why today?". The current 10 facts are today-only. | `history()` and `trends()` exist. Add 7- or 14-day means vs the previous period as new `AskFactKind`s, and 3 suggested questions from today's signals. | S |
| 4 | **Load-aware guidance and recovery cost per activity type** (`trainingGuidance` with ACWR status; `ActivityCost`) | The rule engine's advice (`RuleBasedCoachEngine.advice`) ignores ACWR and monotony, which are the main overreaching signals. | `a.load.acwrUncoupled`, `monotony`, workouts with derived strain. | S (ACWR line in the briefing), M (cost per activity type) |
| 5 | **Per-workout and per-night glance** (`coach/activity.ts`) | "Explain this run" or "explain last night", with zones, strain and stages. | `WorkoutEntity` derived load, zones, sleep stages. One bounded payload per item, reusing the preview flow. | M |

Small extras: test the key when it is saved (S); answer in the owner's units (S, after bug 5); keep a short
on-device question history (S, in the encrypted store, never sent back).

---

## 3. Screens end to end

All 21 routes follow ViewModel → `AthleteRepository` or the container → pipeline fields → UI. Every navigator
method has at least one caller, so no route is unreachable. Demo vs real store switching is automatic because every
read goes through `stores.status`. Export, import and Takeout refuse Demo, and the sync and alert workers skip it.
No screen shows hard-coded numbers outside `@Preview` blocks.

The **connected path works**:
1. Onboarding Sources → `AuthController.begin` opens the Custom Tab, then `OAuthRedirectActivity` calls `complete`, which calls `syncNow` (not in Demo).
2. Or the Health Connect permission contract runs → `refreshHealthConnect` → `anyChosen` lets you advance.
3. `finish()` sets `onboardingDone`, the host moves to Overview, and `startBackgroundWiring` schedules the periodic sync.
4. The worker calls `stores.notifyChanged()` → `dataVersion` → `dashboard()` re-emits and the Overview fills.

Caveat: the HC-only first pull (item 15).

**Not functional end to end:**
- **Journal** can destroy data in one case (bug 1).
- **Profile** edits leave the history stale (bug 2).
- **Add workout** saves, but the entry affects nothing when the workout has no heart rate (item 17). Every other route is functional.

**Computed but never displayed** (the repository already loads it, so the work is UI only):

| Apex screen | Pulse screen shows | Apex has the data but does not show |
|---|---|---|
| Overview (`home/HomeScreen.tsx`) | My day activity list, Tonight plan, dashboard key stats incl. steps, 14-day Strain & Recovery chart, journal card | `analysis.workouts`, `steps` (`mapper.steps()` is never called), suggested bedtime (`sleepDetail`), recovery and strain history |
| Recovery (`recovery/RecoveryScreen.tsx`) | 14-day recovery chart, behaviour insights | `recoveryHistory`, `hrvHistory`, `restingHeartRateHistory` are queried in `AthleteRepository.kt:171-180` and **never read by any UI**; skin temperature (a recovery input) has no stat row |
| Sleep (`sleep/SleepScreen.tsx`, `SleepCards.tsx`) | Hours vs needed 14-day chart, awake minutes, consistency | `scoreHistory`, `durationHistory` (queried at `:198-199`, never read), `SLEEP_AWAKE` |
| Strain (`strain/StrainScreen.tsx`, `TrainingCards.tsx`) | Today vs prior, steps, weekly strain and steps charts, readiness and status | `strainHistory` (queried at `:220`, never read), `steps`, `remaining.minutesByZone` (only inside one coach sentence), acute and chronic load history |
| Health (`health/*`) | Fitness with load chart, HRV status, trends for every score | Trend detail for `RECOVERY_SCORE`, `STRAIN_SCORE`, `SLEEP_DURATION`, `DAILY_TRIMP`, `STEPS` exists (`TREND_METRICS`) but no screen links to it (`HealthMath.kt:20-27` lists only 6 biometrics). An estimated VO2 max is not persisted, so its trend opens empty. |
| Journal (`journal/History.tsx`, `WeekCard.tsx`, `insights.tsx`) | Check-in history, week card, insights | Past `SUBJECTIVE_FATIGUE` and `SUBJECTIVE_SORENESS` rows; soreness is stored but used by no score or coach line |
| Coach (`screens/coach/*`) | Chat history, suggestions, evidence beside answers | See section 2 |

Pulse features with no Apex data behind them (stress, Energy Bank, Pulse Age, ECG, blood pressure, nutrition, naps)
are out of scope and are not counted as gaps.

Cheapest high-value UI work: one 14-day bar chart component, reused on Recovery, Sleep and Strain, fed by the three
unused history lists (S each); steps on Overview and Strain (S); trend links for the five unreachable metrics (S).

## Fixed (2026-11-13)
1. Journal: the loaded check-in is keyed by its day; a stale or equal value can no longer enable a Save that deletes (`JournalViewModelTest`).
2. Profile: a change to age, sex, measured max HR or zone method recomputes stored history (`profileChangeNeedsRecompute`, `ProfileValidationTest`).
3. Live heart rate carries the minute row's provenance (`HeartRateTick.provenance`).
4. Fatigue sentence counts days from the signal(s) that fired.
5. Briefing writes the skin-temperature difference in the owner's units (°F for imperial; `DemoPipelineTest`).
6. Turning the AI coach off deletes the stored key; Settings copy says so.
7. (a) "illness" wording removed; (b) Health and heart-rate-day screens show loading on day change, never the old day's numbers; (c) saves report failure when the store is not ready; (d) "Leave demo" on the store-failed screen discards the demo store; (e) Coach follows the calendar day; (f) Keystore work runs off the main thread; (g) the number check is sign-aware and unit labels do not widen the allow-list (`NumeralCheckTest`, `AskApexPayloadTest`).
8. Finishing onboarding (not Demo) starts the first sync, so a Health-Connect-only owner gets data at once.
