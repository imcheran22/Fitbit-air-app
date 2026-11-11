<!-- generated-by: gsd-doc-writer -->
# App Tabs — Feature Overview

Goose organises its interface into four tabs defined in `GooseSwift/AppShellView.swift` as `GooseAppTab`:
`home`, `health`, `coach`, and `more`. All four tabs share a single `HealthDataStore` instance owned by
`GooseAppModel` and receive it via the SwiftUI environment.

---

## Home tab

**Entry point:** `GooseSwift/HomeDashboardView.swift`  
**Navigation title:** Today

The Home tab is the primary daily summary screen. It presents a scrollable `LazyVStack` of widgets, each
tapping through to a dedicated Health route. A floating action button in the bottom-right corner starts or
opens an activity session (`LiveActivityView`).

### Widgets (top to bottom)

| Widget | Description | Deep-links to |
|---|---|---|
| `HomeDailyScoreCard` | Three score dials for Sleep, Recovery, and Strain alongside a `CoachTipCard` inline suggestion | `HealthRoute.sleep`, `.recovery`, `.strain` |
| `HomeStressEnergySection` | Two metric cells for Stress and Energy Bank | `HealthRoute.stress` |
| `HomeCardioLoadWidget` | Sparkline of weekly cardio load; tapping opens a sheet | `CardioLoadSheet` |
| `HomeHealthMonitorSection` | Up to 4 vital snapshots; tapping a resting-HR entry shows a trend sheet | `HealthRoute.healthMonitor` |
| `HomeTimelineSection` | Chronological list of Sleep summary, Recovery update, and recorded activities | `HealthRoute.sleep`, `.recovery`, `.strain` |

### Toolbar

- **Principal (centre):** `ScoreDateTitleButton` — opens `ScoreDatePickerSheet` so the user can scroll back
  through historical daily scores for Sleep, Recovery, and Strain.
- **Trailing:** WHOOP device icon — tints green when `connectionState == "ready"` or `"connected"`,
  otherwise red. Taps through to `DeviceView`.

### Data sources

The Home tab reads from `HealthDataStore` via two helpers:

- `healthStore.landingSnapshots(liveHeartRateBPM:liveHeartRateSource:liveHeartRateUpdatedAt:stableDailyMetrics:)` —
  provides the metric snapshot array used by the score dials and secondary widgets.
- `healthStore.cardioLoadWeeklyPoints()` — supplies the 7-day sparkline for `HomeCardioLoadWidget`.
- `healthStore.healthMonitorSnapshots(allowLiveFallbacks:)` — supplies up to 4 vitals for
  `HomeHealthMonitorSection`.
- `model.homeActivityTimelineItems` — published array of `ActivityTimelineItem` shown in the timeline.
- `model.ble.liveHeartRateBPM` — triggers a 500 ms debounced snapshot refresh when a new BLE heart rate
  arrives.

### Date selection

The currently selected date is a `@State var selectedDate: Date` owned by `AppShellView` and passed to
`HomeDashboardView` as a binding. Changing the date re-runs `model.refreshActivityTimeline(for:)` and
`refreshSnapshots()`. The same date binding is shared with the `HealthRouteDestinationView` navigation
stack embedded in the Home tab so that health detail pages opened from Home reflect the same date.

---

## Health tab

**Entry point:** `GooseSwift/HealthView.swift`  
**Navigation title:** Health

The Health tab is the full metric exploration hub. Its root screen shows a status header, activity summary,
vitals preview, and shortcut cards. Every item navigates into a dedicated detail page via
`NavigationDestination(for: HealthRoute.self)`.

### Root screen sections

| Section | View | Description |
|---|---|---|
| Status header | `HealthDashboardStatusHeader` | Shows `catalogStatus` and a Live/Preview badge |
| Activity overview | `HealthActivityOverviewSection` | Steps, active calories, and live heart rate |
| Vitals preview | `HealthVitalsPreviewSection` | First 4 results from `healthMonitorSnapshots()` |
| Explore shortcuts | `HealthRouteShortcutSection` | Cards for Stress, Cardio Load, and Energy Bank |

A refresh button in the trailing toolbar calls `store.refreshBridgeCatalogs()`,
`store.refreshHeartRateTimeline()`, and `store.refreshPacketInputsIfNeeded()`.

### Health routes (detail pages)

All detail pages are reached via `HealthRoute` values pushed onto the navigation stack.

| Route | Title | Key views |
|---|---|---|
| `.healthMonitor` | Health Monitor | Vitals snapshot grid; HRV, resting HR, SpO2, skin temp; trend sheets |
| `.sleep` | Sleep | Sleep overview, bevel analysis, trend charts, schedule, insights |
| `.recovery` | Recovery | Hero score dial, calibration state, HRV and resting-HR breakdown |
| `.strain` | Strain | Workout strain score, activity metric family breakdown |
| `.stress` | Stress | Stress and recovery-stress balance metrics |
| `.cardioLoad` | Cardio Load | Weekly cumulative load with 7-day sparkline |
| `.energyBank` | Energy Bank | Energy reserve metric derived from sleep and strain |
| `.packetInputs` | Packet Inputs | BLE packet readiness, input coverage, and next-action guidance |
| `.algorithms` | Algorithms | Registered algorithm catalog; algorithm score inputs and outputs |
| `.referenceComparisons` | Reference Comparisons | Side-by-side comparison against reference benchmark values |
| `.calibration` | Calibration | Calibration progress and required data thresholds |

Key view files for the Health tab:
- `HealthDashboardViews.swift` — root section components
- `HealthSleepOverviewViews.swift`, `SleepDetailViews.swift`, `SleepV2*.swift` — sleep detail views
- `HealthRecoveryStressViews.swift` — recovery and stress detail views
- `HealthMetricFamilyStrainViews.swift` — strain detail views
- `HealthCardioViews.swift` — cardio load detail views
- `HealthSupplementalViews.swift` — packet inputs, algorithms, calibration detail views
- `HealthScoreDateViews.swift` — shared score date picker sheet

### Data sources

The Health tab reads exclusively from `HealthDataStore`:

- `store.landingSnapshots(...)` — metric snapshot array for the entire tab
- `store.healthMonitorSnapshots()` — vital sign snapshots (HRV, resting HR, SpO2, skin temp)
- `store.whoopStepsDisplayText()`, `store.whoopActiveCaloriesDisplayText()` — activity summary row
- `store.heartRateTimelineStatus` — status string for live heart rate fallback
- `store.catalogStatus`, `store.usesSampleData` — drives the status header badge
- `model.ble.liveHeartRateBPM` — triggers a 500 ms debounced snapshot refresh

---

## Coach tab

**Entry point:** `GooseSwift/CoachView.swift`  
**Navigation title:** Coach

The Coach tab surfaces AI-assisted analysis of the user's current health data. The tab root shows a
scrollable overview screen (`CoachOverviewScreen`). A full chat session opens modally as a sheet.

### Overview screen sections

| Section | View | Description |
|---|---|---|
| Recommendation card | `CoachRecommendationCard` | Primary focus title, guidance message, evidence bullets, and an "Ask About This" button |
| Chat status card | `CoachOverviewChatCard` | Shows signed-in state and an Open / Sign In button |
| Metric highlights grid | `CoachMetricHighlightCard` (2-column grid) | Cards for Sleep, Recovery, Strain, Stress, HRV, and Live HR |
| Data gaps | `CoachDataGapCard` | Up to 5 actionable gap items linking to the relevant Health or More page |

### Chat sheet

Opened by tapping "Open" on the chat card, or by receiving a deep-link prompt from another tab.

- **Signed in:** renders `CoachChatScreen` — a message list with a `CoachComposer` input bar and
  three built-in prompt suggestions ("Find blockers", "Read recovery", "Next capture").
- **Signed out:** renders `CoachSignInScreen` — displays a device code and verification URL for
  OAuth device-flow sign-in.

### AI providers

The `CoachProviderRegistry` (`GooseSwift/CoachProviderProtocol.swift`) holds the active provider. Model
selection is available via the `CoachProfileMenu` (person icon in the toolbar when signed in):

- GPT-5.5 (low, medium, high)
- Claude Opus 4.8, Sonnet 4.6, Haiku 4.5
- Gemini 2.5 Pro, Gemini 2.5 Flash

If no provider is configured, tapping "Open Chat" redirects to `CoachSettingsSheet` instead of the chat.

### Settings sheet

Opened from the gear icon in the toolbar. Contains provider selection and related options via
`CoachSettingsSheet`.

### Data sources

`CoachOverviewSnapshot.make(healthStore:appModel:)` assembles the snapshot on every refresh:

- `healthStore.snapshot(for:)` — Sleep, Recovery, Strain, Stress
- `healthStore.metricInputReadinessSummary()` / `metricInputReadinessNextActionSummary()` — readiness text
- `healthStore.packetDerivedFeatureNextActionSummary()` / `packetDerivedScoreNextActionSummary()` — feature/score gap text
- `healthStore.hrvFeatureSummary()` / `latestHeartRateSummary(...)` — HRV and live-HR highlight values
- `healthStore.calibrationNextActionSummary()` — calibration gap
- `model.ble.liveHeartRateBPM`, `liveHeartRateSource`, `liveHeartRateUpdatedAt` — live heart rate highlight
- `CoachTipFactory.homeTip(healthStore:appModel:)` — pre-built prompt for the recommendation card

---

## More tab

**Entry point:** `GooseSwift/MoreView.swift`  
**Navigation title:** More

The More tab is an `insetGrouped` List of navigation links organised into labelled sections. Each row
navigates to a dedicated destination view. A `MoreDataStore` (`@StateObject`) drives status badges and
bridge data.

### Top-level sections

| Section | Routes |
|---|---|
| (profile header) | Profile |
| Device | Device |
| App | Apple Health Profile |
| Apple Health | Import from Apple Health (inline button) |
| Settings | Privacy, Remote Server |
| Support | Support, About |
| Developer | Developer (gateway to internal tools) |

### Route destinations

#### Profile — `MoreProfileView`
Personal details used by health algorithms: first name, date of birth, gender, height, weight, and unit
system (imperial or metric). Supports autofill from Apple Health (`HealthKitProfileImporter`). Data is
persisted to `UserDefaults` via `@AppStorage` keys in `OnboardingStorage`.

#### Device — `DeviceView`
WHOOP band connection status, battery, device name, and pairing actions. Exposes the BLE connection
diagnostic surface.

#### Apple Health Profile — `MoreHealthSyncView`
Configures which HealthKit metric families to sync and the backfill date window. Shows adapter status,
HealthKit authorisation state, existing Goose records, and imported sleep history. Does not perform a live
metric sync — it configures the profile import scope for body mass autofill only.

#### Apple Health import (inline button)
Triggers `healthStore.importAllFromHealthKit()` directly from the More list. Shows a spinner while running
and reports the import status below the button.

#### Privacy — `MorePrivacyView`
Shows local database path, latest raw bundle path, privacy lint status, and sanitised privacy status.
Links to the raw export and data deletion flows.

#### Remote Server — `MoreRemoteServerView`
Configures the self-hosted server upload integration:

- **Server URL** field (`https://hostname:8770` format; validated by `RemoteServerURLValidator`).
- **Bearer token** field (stored in iOS Keychain via `RemoteServerKeychain`).
- **Enable Upload** toggle.
- **Status section** (visible only when upload is active): server reachability indicator, manual connection
  test, last sync timestamp with acknowledged record count, pending batch count, rows pending sync with a
  Backfill button, and a server import control to pull historical frames from the server.

Settings are saved with a "Save" button that also triggers `model.checkServerHealth()`.

#### Support — `MoreSupportView`
Shows paths to the support bundle directory, log export, latest local data file, and latest raw zip.
Provides "Save Local Data File" and AirDrop actions.

#### About — `MoreAboutView`
Displays app marketing version + build number, Rust core version (from the bridge), SQLite schema version,
active device name, and the last `GET_HELLO` response.

#### Developer — `MoreDeveloperView`
Gateway page listing the developer tool routes. Routes included:

| Tool route | Title | Destination |
|---|---|---|
| `.connectionLab` | Connection Lab | `ConnectionView` — low-level BLE, hello, and event diagnostics |
| `.capture` | Capture | `MoreCaptureView` — BLE capture sessions and overnight guard |
| `.localStore` | Local Store | `MoreLocalStoreView` — SQLite path, schema, storage check |
| `.rawExport` | Raw Export | `MoreRawExportView` — bundle export, filters, validation |
| `.algorithms` | Algorithms | `MoreAlgorithmsView` — algorithm family preferences |
| `.debug` | Debug | `MoreDebugView` — Rust bridge, parser, packet capture, debug commands |

#### Capture — `MoreCaptureView`

Two main surfaces under one view:

**Capture session panel:**
- Start/stop a BLE notification capture session.
- Shows live notification count, selected device, and recent session IDs.
- Lists recent capture sessions for quick reference.

**Overnight guard panel:**
Manages the `OvernightGuard` that continuously mirrors raw BLE notifications to SQLite while the device is
worn overnight. Status rows include: guard active state, sleep readiness, raw notification count, range
poll counts, command write count, packet family targets, historical order, spool path, SQLite mirror queue
health, power mode, watchdog, event log count, and export state. Actions: Start Guard, Final Sync,
AirDrop Final Bundle, AirDrop Export Manifest, Export Last Guard, Stop Guard.

#### Debug — `MoreDebugView`

A detailed diagnostic surface organised into sections:

- **Rust And Parser:** Rust core version, frame parse result, CRC status, payload decode, warnings, and
  timeline. A "Run Parser Probe" button triggers a live parse test.
- **Debug Session:** WebSocket status (`ws://127.0.0.1:8765`), next action, Start/Refresh buttons.
- **Health Packet Capture:** Connection and session state, capture targets, last packet summary, live data
  signal, historical sync status, RR packet watch. Action buttons: Start Walk Capture (30-minute movement +
  HR + GPS session), Start Physiology Capture (K10/K11/R17/R21/K25/K26 streams), Start Temperature Capture
  (Event 17 + K18/K24 history), Watch K18 RR Packets. Decoded packet families listed with counts.
- **WHOOP Movement Test:** Last movement packet, passive activity detector status, Run Movement Packet Test
  button.
- **WHOOP Event Signals:** Latest event, skin temperature candidate, data packet, physiology capture
  status, high-frequency sync, history temperature, history RR, pulse info, optical, raw/research K20,
  realtime status K2. Actions: Start/Stop Movement + HR Capture, Enter/Exit High Frequency Sync mode.
- **Research BT Commands:** Lists `GooseDebugCommandDefinition` entries with send buttons for read-safe
  commands and URL-based remote trigger info for others. Responses shown in a compact list.
- **Diagnostics:** UI coverage, deferred surfaces, property suite, perf budget — with audit run buttons.
- **Command Evidence:** Import status, gate sweep, capture plan — with load and run buttons.
- **Command Shortcuts:** `MoreCommandGroup` rows for Identity, Battery, Historical Sync, Haptics, Sensors,
  Config, Firmware, Reboot.
- **Protected Controls:** Destructive commands are gated behind an alert confirmation.

#### Raw Export — `MoreRawExportView`

Configures and runs a raw data export from `goose.sqlite`:

- Date window fields (Start/End ISO 8601 text inputs).
- Filter fields: capture sessions, packet types, sensor signals, metric families, algorithm IDs, algorithm
  versions, include raw bytes toggle.
- Data family toggles (from `MoreDataStore.rawFamilies`).
- Recent capture session shortcuts to populate the session filter quickly.
- Export actions: Save Local Data File, Export (produces a zip bundle), Validate Export And Lint.
- AirDrop links for local data file, export manifest, zip bundle, validation manifest, validation review,
  and validation runbook once generated.
- Status rows: export status, local file path, bundle path, zip path, row counts, validation results,
  privacy lint, and sanitised privacy status.

#### Algorithms — `MoreAlgorithmsView`

Picker controls for each algorithm family registered in `healthStore.algorithmFamilies`. Selecting a
different algorithm ID persists the preference and updates `healthStore.selectedAlgorithmByFamily`. A
"Defaults" button restores recommended defaults via `store.applyRecommendedAlgorithmDefaults`. Reference
benchmark definitions from `healthStore.referenceDefinitions` are shown in a read-only section. A link
button navigates to Health > Algorithms for metric-level context.
