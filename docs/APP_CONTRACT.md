# App contract (`:app`) for screen builders

Written by the app-shell work. Every screen is built from this file. The shell (`MainActivity`,
`ApexNavHost`, `AppContainer`, `ui/common`, `ui/debug`) is already in `app/`; do not edit it. If something
here is wrong or missing, report it instead of working around it.

## 1. Where things go

- One package per area under `app/src/main/kotlin/com/apex/athlete/ui/<area>/`. You own only your area.
- Copy lives in `app/src/main/res/values/strings_<area>.xml` (decision D4). String names are prefixed with the area:
  `overview_...`, `recovery_...`, `datasources_...`. Shared copy is in `strings_common.xml` (read-only for you).
  Never put literals in composables. English only. No em dashes, sentence case, never diagnostic (DESIGN_SYSTEM section 6).
- Tests for an area: `app/src/test/kotlin/com/apex/athlete/ui/<area>/` (Robolectric, `@Config(sdk = [35])`).
- UI uses only `ApexTheme.colors/type`, `ApexShapes`, `ApexSpacing`, and the `:core:ui` kit. Every number renders
  through `MetricState`. 48 dp targets, TalkBack descriptions, 200 percent font, reduced motion.

## 2. Route entry points (the screen agents implement these exact signatures)

`navigator` is `com.apex.athlete.navigation.ApexNavigator`. `day` is a `java.time.LocalDate`.
`onDayChange` is how the date pill steps days: call it, never navigate to change the day.
`contentPadding` (tab roots only) already clears the floating tab bar: apply it to the scroll content's bottom.
Detail routes get the navigation-bar inset applied by the host; they own their own top inset (`DetailHeader` does).
Every function is `@Composable` and takes no other parameters.

| Destination | Package | Signature |
|---|---|---|
| Overview (tab) | `com.apex.athlete.ui.overview` | `OverviewRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit, contentPadding: PaddingValues)` |
| Health (tab; monitor, trends list, fitness) | `com.apex.athlete.ui.health` | `HealthRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit, contentPadding: PaddingValues)` |
| Journal (tab; check-in) | `com.apex.athlete.ui.journal` | `JournalRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit, contentPadding: PaddingValues)` |
| More (tab) | `com.apex.athlete.ui.more` | `MoreRoute(navigator: ApexNavigator, contentPadding: PaddingValues)` |
| Recovery detail | `com.apex.athlete.ui.recovery` | `RecoveryRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit)` |
| Strain detail | `com.apex.athlete.ui.strain` | `StrainRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit)` |
| Sleep detail | `com.apex.athlete.ui.sleep` | `SleepRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit)` |
| Heart rate (day) | `com.apex.athlete.ui.health` | `HeartRateDayRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit)` |
| Trend detail | `com.apex.athlete.ui.health` | `TrendDetailRoute(navigator: ApexNavigator, metric: MetricType)` |
| Workout detail | `com.apex.athlete.ui.workout` | `WorkoutDetailRoute(navigator: ApexNavigator, workoutId: String)` |
| Add workout (RPE, USER_REPORTED) | `com.apex.athlete.ui.workout` | `AddWorkoutRoute(navigator: ApexNavigator, day: LocalDate)` |
| Data Sources and Diagnostics | `com.apex.athlete.ui.datasources` | `DataSourcesRoute(navigator: ApexNavigator)` |
| Takeout import | `com.apex.athlete.ui.takeout` | `TakeoutImportRoute(navigator: ApexNavigator)` |
| Settings | `com.apex.athlete.ui.settings` | `SettingsRoute(navigator: ApexNavigator)` |
| Profile | `com.apex.athlete.ui.profile` | `ProfileRoute(navigator: ApexNavigator)` |
| How Apex works | `com.apex.athlete.ui.howitworks` | `HowItWorksRoute(navigator: ApexNavigator)` |
| Export / import / delete | `com.apex.athlete.ui.exportdelete` | `ExportDeleteRoute(navigator: ApexNavigator)` |
| Licences | `com.apex.athlete.ui.licences` | `LicencesRoute(navigator: ApexNavigator)` |
| Privacy ("How Apex uses your data"; also the Health Connect rationale target) | `com.apex.athlete.ui.privacy` | `PrivacyRoute(navigator: ApexNavigator)` |
| Coach (floating action) | `com.apex.athlete.ui.coach` | `CoachRoute(navigator: ApexNavigator)` |
| Onboarding (owns its internal steps) | `com.apex.athlete.ui.onboarding` | `OnboardingRoute(navigator: ApexNavigator)` |
| Gallery (debug only) | `com.apex.athlete.ui.debug` | `GalleryScreen(navigator: ApexNavigator)` (already written) |

Onboarding finishes by `container.settings.update { it.copy(onboardingDone = true, ...) }`. The host then moves to
Overview by itself. Choosing Demo sets `demoMode = true` and `onboardingDone = true` (the host shows
a progress overlay while the demo store is built). "Delete all my data" resets `onboardingDone = false` and the host returns to Onboarding.

Navigator methods: `openRecovery(day) openStrain(day) openSleep(day) openHeartRateDay(day) openTrend(metric) openWorkout(id)
openAddWorkout(day) openCoach() openDataSources() openTakeoutImport() openSettings() openProfile() openHowItWorks()
openExportDelete() openLicences() openPrivacy() openGallery() back()`. Tabs are switched by the bar only; there is no `openOverview`.
After saving in AddWorkout call `navigator.back()`.

## 3. ViewModels

```kotlin
class RecoveryViewModel(private val repository: AthleteRepository, private val handle: SavedStateHandle) : ViewModel() { ... }

@Composable
fun RecoveryRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle -> RecoveryViewModel(container.repository, handle) }
    val state by vm.state.collectAsStateWithLifecycle()
    ...
}
```

- `apexViewModel` is in `com.apex.athlete.ui.common`. The ViewModel is scoped to the navigation entry. Pass `key = ...` for a second instance.
- Keep UI-only state (selected range, expanded sections, text fields) in `SavedStateHandle` or `rememberSaveable` so it survives process death.
- The day comes in as a parameter. Feed it to the ViewModel with `vm.setDay(day)` (a `MutableStateFlow<Long>` of epoch days) and `flatMapLatest` onto the repository flow; do not read it once in the constructor.
- Convert with `.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)`. A repository state of `null` means "not loaded or store not ready": render `MetricState.Loading`.
- Pure mapping goes in the ViewModel or composable with `MetricStateMapper(formatter)` (section 5). Do not put copy or `Context` in a ViewModel: map to string resource ids or to `MetricState`, and format in the composable with `LocalFormatter.current`.
- Use the container only through `apexViewModel`'s first argument. `LocalAppContainer.current` is available in composables when a plain launcher needs it.

## 4. What the container offers (`AppContainer`; it implements `DataGraph`)

| Member | Use |
|---|---|
| `settings: SettingsStore` | `settings: Flow<AppSettings>`, `profile: Flow<UserProfile>`, `update { copy }`, `updateProfile(profile)`, `currentSettings()`. Settings hold no tokens. `googleClientId` is the runtime client ID (wins over the build one). |
| `stores: ApexStores` | `status: StateFlow<StoreStatus>`, `dataVersion`, `notifyChanged()`, `discardDemo()`, `resetRealStore()`. Failed / PreparingDemo are shown by the host; you do not handle them. |
| `repository: AthleteRepository` | Reads: `dashboard(day: Long)`, `recoveryDetail(day)`, `sleepDetail(day)`, `strainLoad(day)`, `trends(asOfDay, rangeDays)`, `trend(metric, asOfDay, rangeDays)`, `workout(id)`, `recentWorkouts(limit)`, `dataSources()`, `storeStatus`, `today()`. `day` is `LocalDate.toEpochDay()`. Writes: `saveCheckIn(day, fatigue, soreness)`, `addManualWorkout(startMillis, durationMinutes, name, type, rpe): String`, `deleteWorkout(id)`, `recomputeAll(onProgress)`. All writes go to the active store (demo or real) behind the write mutex. |
| `syncOrchestrator` | Used by workers; screens trigger sync through `SyncScheduler.syncNow(context)` and observe `SyncScheduler.observe(context): Flow<SyncRunState>` (`com.apex.athlete.core.data.worker`). |
| `googleHealth: StateFlow<GoogleHealthNetwork>` | `NotConfigured` or `Ready` (rate limiter, auth state). Rebuilt when the client ID changes. |
| `auth: AuthController` | `authState: Flow<AuthState>`, `state: StateFlow<SignInUiState>` (progress of one attempt), `begin(activity)`, `complete(uri)` (the redirect activity calls it), `signOut()`, `dismiss()`, `isConfigured`. `SignInUiState.RedirectSchemeMismatch` means a client ID pasted in Settings needs a rebuild (explain; see docs/SETUP.md). |
| `healthConnectAvailability` | `suspend status(): HealthConnectStatus` (`sdk`, `missingRecordPermissions`, `toRequest()`, history and background flags). Request with `rememberLauncherForActivityResult(HealthConnectPermissions.requestContract())`, input `status.toRequest()` or `HealthConnectPermissions.requestable { ... }`. Read-only; Apex never writes to Health Connect. |
| `formatter: Flow<ApexFormatter>` | Same formatter as `LocalFormatter`, for ViewModels that must format. |
| `tokenStore`, `appScope`, `healthConnectSource` | Rarely needed by screens. |

Added by the main session after the data-layer work landed:

| Member | Use |
|---|---|
| `dataExporter(): DataExporter` | `suspend exportJson(out: OutputStream)`, `suspend exportCsvZip(out)` → `ExportReport(counts, format)`; does not close the stream; throws `DemoStoreRefusedException` in Demo mode. Write through `ActivityResultContracts.CreateDocument`. |
| `dataImporter(): DataImporter` | `suspend import(input: InputStream, onProgress)` → `ImportReport(status: COMPLETED/PARTIAL/NOT_AN_EXPORT/NEWER_VERSION, quarantined, ingested, replayedDays, declaredCounts, ...)`. Read through `OpenDocument`. |
| `dataDeletion(): DataDeletion` | `suspend deleteEverything(): DeletionReport` (every step runs; the report lists failed steps by type). Afterwards set nothing: settings are cleared, so `onboardingDone` is false and the host returns to Onboarding. |
| `aiKeyStore: AiKeyStore` | `has()`, `set(key)`, `clear()`. Never display the key back; show only "saved". |
| `askApexClient: AskApexClient` | `suspend ask(payload, fallbackBriefing)` → `Answer` / `Refused` / `Unavailable(reason, message, fallback)`. Build the payload with `AskApexPayload.build(question, briefing, dayAnalysis.toAskFacts(), model)`; show `payload.preview` before sending. Answers are `AI_INTERPRETED`; show `unverifiedNumerals` as a warning chip. |

Not in the container yet: the Takeout importer start (added when the Takeout engine lands).

`AppSettings` fields: `onboardingDone, demoMode, theme (ThemeChoice), units (UnitSystem), clock24h, notificationsEnabled, notifyRecovery,
notifyFatigue, notifyStale, quietStartMinute, quietEndMinute, backgroundSync, aiCoachEnabled, takeoutNudgeDays, lastTakeoutImportMillis,
lastSyncMillis, lastAlertDay, googleClientId`.

## 5. Shared helpers (`com.apex.athlete.ui.common`)

- `LocalAppContainer`, `LocalFormatter` (provided by `MainActivity`).
- `ApexFormatter`: `dayLabel(day)`, `shortDate`, `relativeTime(millis?)`, `syncedAgo(millis?)`, `isStale(millis)`, `duration(minutes?)`,
  `clockTime(minuteOfDay?)`, `clockTime(epochMillis, offsetSeconds?)`, `number(v?, decimals)`, `distance(m?)`, `weight(kg?)`, `height(cm?)`,
  `temperatureDeviation(c?)`, `temperatureDeltaUnit()`. Missing input always gives `--`.
- `MetricStateMapper(formatter)`: `recovery(DayAnalysis)`, `strain(a)`, `sleep(a)`, `workloadRatio(TrainingLoadResult)`, `intelligence(i, metric, provenance, observedAtMillis?)`,
  `calibrationDaysLeft(i)`, `heartRate(tick)`, `vo2Max(a)`, `steps(a)`, `value(...)`, `missing(MissingReason?)`, `fatigueLevelText`, `fatigueSignalText`, `loadCaveatText`.
  Rules: missing is Unavailable or Calibrating, never 0; provenance passes through; today's strain and steps are provisional; a shown reading older than
  36 h is Stale; skin temperature follows the units setting. `T?.toStateOrLoading { }` turns a not-yet-loaded repository result into Loading.
- `StoreFailedScreen`, `PreparingDemoScreen`: used by the host only.
- Banners: `ConnectionBanner(kind, title, modifier, description = ..., ...)`. `modifier` is the third parameter, so always pass `description =` by name.

## 6. Behaviour every route must have

Loading, empty, partial, calibrating, stale, offline and error states; process-death safety; "how this is calculated" matching `docs/FORMULAS.md`;
provenance beside every number. The Demo banner is drawn by the host; screens do not draw it. Demo data never leaves the demo store: do not offer
export or Takeout import while `demoMode` is on.

## 7. LocalExtras (schema v4, local-only features)

`com.apex.athlete.core.data.extras.LocalExtras(stores: ApexStores)`: build once next to `AthleteRepository`
(`val localExtras = LocalExtras(stores)`). Reads are Flows of the active store (real or Demo; the demo store has no rows, built-in
behaviours are listed with no values; emits the empty value while the store opens). Every write runs under `stores.writeMutex`, throws
`DemoWriteRefusedException` in Demo mode (hide the controls instead), `IllegalStateException` when no store is ready, and
`IllegalArgumentException` for invalid input (nothing is written). Entries are `USER_REPORTED` unless stated.

| Property | API |
|---|---|
| `behaviours` | `observeBehaviours(includeArchived = false): Flow<List<Behaviour>>` (built-in factors ids `journal_alcohol`, `journal_late_caffeine`, `journal_late_meal`, `journal_stressful_day`, `journal_travel` plus `custom:<uuid>`), `observeDay(epochDay, includeArchived = false): Flow<List<BehaviourValue>>` (`value` null = not logged), `observeEntries(fromDay, toDay): Flow<List<BehaviourDayEntry>>`, `suspend setValue(epochDay, behaviourId, value: Double?)` (yes/no 0.0 or 1.0, scale whole 0.0 to 4.0, null removes), `suspend add(name, kind, iconKey): String`, `rename(id, name)`, `setArchived(id, archived)`, `reorder(orderedIds)` (pass every id) |
| `quickLog` | `observeDay(day)`, `observeRecent(limit = 50)`, `observeWaterMl(day): Flow<Double?>`, `suspend add(kind, epochMillis = now, numericValue, label, text): String`, `addWater(ml, epochMillis)`, `update(entry)`, `delete(id)`. Text over `ExtrasLimits.MAX_NOTE_CHARS` (500) is rejected, never cut: cap the input field |
| `goals` | `observeAll()`, `suspend get(id)`, `add(kind, target, enabled = true, reminderEnabled = false): String`, `update(id, target?, enabled?, reminderEnabled?)`, `delete(id)` (CRUD only; progress comes later) |
| `food` | `observeDay(day)`, `observeRecent(limit)`, `suspend add(mealKind, name, epochMillis, kcal?, proteinG?, carbsG?, fatG?, fibreG?, source = MANUAL, id? = null): String`, `update(entry)`, `delete(id)`. Provenance follows the source; unknown nutrients stay null |
| `bloodPressure` | `observeRecent(limit)`, `observeDays(fromDay, toDay)`, `suspend add(systolic, diastolic, pulse?, epochMillis, source = MANUAL, id? = null): String` (40-300 / 20-200, diastolic below systolic, pulse 25-240), `update(entry)`, `delete(id)` |
| `breathe` | `observeRecent(limit)`, `observeDay(day)`, `suspend add(startMillis, plannedSeconds, completedSeconds, patternKey, avgHeartRate? = null): String`, `delete(id)` |
| `coachChats` | `observeThreads()`, `observeMessages(threadId)`, `suspend createThread(title, topic = GENERAL): String`, `renameThread`, `deleteThread` (cascade), `appendUserMessage(threadId, text)`, `appendCoachMessage(threadId, text, fromModel, unverifiedNumerals = emptyList())` (`fromModel` true = `AI_INTERPRETED`, false = `MATHEMATICALLY_DERIVED`) |

Export, import and "Delete all my data" cover all nine tables (no screen change needed): the JSON and CSV exports gain the extras tables, the
import report gains `extrasWritten` and quarantine reasons `UNKNOWN_KIND` and `NOT_STORED`, and deletion removes the database file.

## 8. Health detail routes (activity, body, stress, energy, fitness, monitor, trends, naps)

Added after the first screen pass. Every route below is reachable in two taps or fewer, is built from the kit with tokens only, keeps its UI
state (range, chosen figure, selected day) in `SavedStateHandle` or `rememberSaveable`, and works in Demo mode (it reads the active store through
`AthleteRepository`, never a DAO). Day routes use the host's `DayDetail` wrapper, so they take `(navigator, day, onDayChange)` like section 2.
`d` is `yyyy-MM-dd`; absent or unreadable means the selected day. New navigator methods: `openActivity(day) openBody(day) openStress(day)
openEnergy(day) openFitness(day) openMonitor(day) openTrends(first: MetricType? = null) openNap(id)`.

| Route string | Composable (package) | Reached from | What it shows | Day nav |
|---|---|---|---|---|
| `activity?d={d}` | `ActivityDetailRoute(navigator, day, onDayChange)` (`ui.activity`) | `ApexNavigator.openActivity`; a tapped chart point on the trends overlay | Steps, calories (total, active), distance, floors, active zone minutes, active minutes by level, sedentary time; 7/30/90 day history of any figure | date pill; a tapped chart day opens that day |
| `body?d={d}` | `BodyRoute(navigator, day, onDayChange)` (`ui.body`) | Health tab, Body section ("Body details"); overlay | Weight, body fat, BMI (BMI needs a height: link to Profile), 7/30/90/180 day history; empty state names Takeout import as the only source of body data (no link in Demo mode) | date pill; tapped chart day |
| `health/stress?d={d}` | `StressRoute(navigator, day, onDayChange)` (`ui.stress`) | Overview Stress card; Energy screen link | Minute strip, level, minutes low/medium/high, calibrating or missing reason, calm-heart-rate baseline, 14 day history, "how this is estimated"; always tagged Estimate | date pill; tapped history day |
| `health/energy?d={d}` | `EnergyRoute(navigator, day, onDayChange)` (`ui.energy`) | Overview Energy card; Stress screen link | Energy curve, now/lowest/start, what drained and charged it (basal, activity, stress, calm rest, nap), unscored minutes, missing reason; always tagged Estimate | date pill |
| `health/fitness?d={d}` | `FitnessRoute(navigator, day, onDayChange)` (`ui.fitness`) | Health tab, Cardio fitness section | VO2 max (Estimated tag and method when estimated), FRIEND category, fitness age, 90 day VO2 trend | date pill; tapped trend day |
| `health/monitor?d={d}` | `MonitorRoute(navigator, day, onDayChange)` (`ui.monitor`) | Health tab, Monitor section ("See every vital") | The five monitor readings and every overnight vital, each with its 30 day band, an above/below/within flag (text, not colour only) and a link to its trend | date pill |
| `trends?a={a}` | `TrendsBrowserRoute(navigator, first: MetricType?)` (`ui.trends`) | Health tab, Trends section ("Browse all trends"); "Compare with another figure" on every `trend/{metric}` | Every metric with data grouped by category, 7/30/90/180 day switch, overlay of two chosen figures on separate scales (no correlation is computed; the caption says so), tap a day to open it in the screen that owns the metric | none (ends today); `a` is a metric storage key preselecting the first overlay figure |
| `sleep/nap?id={id}` | `NapDetailRoute(navigator, napId)` (`ui.nap`) | Nap list on the Sleep screen | Start, end (in the recorded offset), time in bed, asleep, awake, time to fall asleep, stages when scored, provenance; "no longer in your data" when the id is gone | none |

Notes
- `sleep/nap` takes the id as a query argument (`?id=`), URL-encoded, not as a path segment: sleep session ids contain `:` and `/` (the same reason `workout?id=` does).
- The nap list is `NapsSectionRoute(navigator, day)` in `ui.nap`; `SleepScreen` receives it through its optional `napsSection` slot.
- `trend/{metric}` is extended, not replaced: its chart now selects a day on tap and offers a button that opens that day's screen (`dayTargetOf(metric)`), and a link to the overlay.
- New read flows live in `core/data/.../repository/NapReads.kt` (`NapReads(stores)`: `naps(day)`, `nap(id)`). It is built from `container.stores` where it is used; nothing is added to `AppContainer`.
- Shared pieces: `ui.detail` (load state, `DayLoadViewModel`, `StatBlock`, `SeriesChartCard`, `DayBanner`), `:core:ui` `DaySeriesChart` (one or two daily series, hoisted day selection) and `ChoiceRow` / `ChoiceScrollRow`.
