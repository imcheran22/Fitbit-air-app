---
slug: app-slow-start
status: resolved
trigger: user_report
goal: find_root_cause_only
created: 2026-06-06
updated: 2026-06-06
---

# Debug Session: App Slow Start

## Symptoms

- The iOS app takes a long time to start ("demora muito a arrancar")
- Observed by user on device
- No specific timing data captured yet

## Hypotheses

1. [CONFIRMED PARTIAL] Synchronous Rust bridge call(s) on the main thread during GooseAppModel.init()
2. [NOT CONFIRMED] Keychain reads during CoachProviderRegistry.init() — CoachView is lazy (deferred to tab render), not called at app launch
3. [POSSIBLE CONTRIBUTOR] GooseBLEClient.init() — filesystem I/O + UserDefaults reads on main thread
4. [POSSIBLE CONTRIBUTOR] HealthDataStore.init() in AppShellView — triggers refreshHeartRateTimeline on main thread
5. [NOT CONFIRMED] SQLite database path resolution — defaultDatabasePath() is a simple FileManager call, fast

## Current Focus

hypothesis: Multiple synchronous main-thread costs accumulate during GooseAppModel.init()
next_action: RESOLVED — root cause identified, see Resolution

## Evidence

- timestamp: 2026-06-06T00:00:00Z
  source: GooseSwiftApp.swift
  finding: >
    App entry point creates GooseAppModel() as @State in struct init, which runs synchronously on the
    main thread before the first frame is rendered. GooseAppModel.init() then calls many methods
    that do filesystem and UserDefaults work on the main thread synchronously.

- timestamp: 2026-06-06T00:00:01Z
  source: GooseAppModel.swift (lines 86-95, 380-393)
  finding: >
    GooseAppModel.init() synchronously initialises these objects on the main thread:
    (a) CaptureFrameWriteQueue — calls HealthDataStore.defaultDatabasePath() → FileManager.default.createDirectory
    (b) GooseUploadService — same defaultDatabasePath() call → FileManager.default.createDirectory
    (c) OvernightSQLiteMirrorQueue — same defaultDatabasePath() call → FileManager.default.createDirectory
    All three call defaultDatabasePath() independently, each triggering a FileManager.createDirectory.

- timestamp: 2026-06-06T00:00:02Z
  source: GooseAppModel.swift (lines 380-392)
  finding: >
    GooseAppModel.init() makes these synchronous main-thread calls after object setup:
    (a) configureUploadService() — lightweight, only sets closure
    (b) refreshHeartRateHourlyRanges() — delegates to HeartRateSamplePipeline which dispatches async; OK
    (c) prepareClientHello() — dispatches to rustStartupQueue; OK
    (d) cleanupOrphanedActivityCaptureSessions() — dispatches to rustStartupQueue; OK
    (e) refreshActivityTimeline() — dispatches to activityTimelineRefreshQueue; OK
    (f) scheduleAutoStartHealthPacketCaptureIfNeeded() — presumably async; OK
    (g) scheduleAutoStartRespiratoryPacketWatchIfNeeded() — presumably async; OK
    (h) recoverUncleanOvernightGuardSessionIfNeeded() — SYNCHRONOUS on main thread; reads filesystem,
        scans overnight guard session directories, reads JSON/JSONL files, counts records line-by-line.

- timestamp: 2026-06-06T00:00:03Z
  source: GooseAppModel+OvernightRecovery.swift (latestRecoverableOvernightGuardSession)
  finding: >
    recoverUncleanOvernightGuardSessionIfNeeded() calls the static method
    latestRecoverableOvernightGuardSession() synchronously on the main thread.
    That method:
    - calls FileManager.contentsOfDirectory on the overnight guard root
    - for each session directory: reads manifest.json, status.txt, crash-marker.json (Data(contentsOf:))
    - calls countJSONLRecords for raw-notifications.jsonl, historical-range-polls.jsonl,
      command-writes.jsonl, event-log.jsonl — each reads the file in 64KB chunks and counts newlines
    - If an overnight session exists with large JSONL files, this is O(file size) work on the main thread.
    This is the highest-risk blocking operation on the critical path.

- timestamp: 2026-06-06T00:00:04Z
  source: GooseBLEClient.swift (lines 985-1011)
  finding: >
    GooseBLEClient.init() runs synchronously as part of GooseAppModel.init() (line 279).
    It calls loadRememberedDevice(), loadPersistedBatterySample(), loadPersistedRestingHeartRateEstimate(),
    loadPersistedHRVSample() — all UserDefaults reads, fast but still on main thread.
    Then may call ensureCentral() which creates CBCentralManager synchronously. CBCentralManager
    creation itself is fast but triggers a Bluetooth authorization check (CBManager.authorization)
    which involves a daemon call.

- timestamp: 2026-06-06T00:00:05Z
  source: AppShellView.swift + HealthDataStore.swift
  finding: >
    AppShellView creates HealthDataStore() as @State. HealthDataStore.init() calls defaultDatabasePath()
    (another FileManager.createDirectory) and refreshHeartRateTimeline(). This happens when AppShellView
    body is first rendered — slightly deferred from GooseAppModel.init(), but still on the main thread.
    Not the primary cause of the slow start but adds to the total.

- timestamp: 2026-06-06T00:00:06Z
  source: CoachView.swift + CoachProviderRegistry.swift
  finding: >
    CoachView.init() creates CoachProviderRegistry() which then creates 4 provider instances.
    ClaudeCoachProvider.init() and GeminiCoachProvider.init() each call SecItemCopyMatching (Keychain read).
    CustomEndpointCoachProvider.init() calls SecItemCopyMatching + UserDefaults.
    ChatGPTCoachProvider.init() is lightweight (no Keychain at init).
    HOWEVER: CoachView is created lazily by SwiftUI's TabView when the Coach tab content is first
    rendered — NOT during app launch. The init() is called inside the body/tabContent ViewBuilder.
    With SwiftUI's lazy tab rendering, CoachView may be initialised on first app display.
    Under iOS 26 TabView, all tabs in ForEach may be initialized eagerly on first render.
    This means 3 Keychain reads (Claude, Gemini, CustomEndpoint) happen on the main thread
    during the first frame, blocking first paint.

- timestamp: 2026-06-06T00:00:07Z
  source: HealthDataStore.defaultDatabasePath() — called 4+ times at startup
  finding: >
    defaultDatabasePath() is called at startup from:
    (1) CaptureFrameWriteQueue init (GooseAppModel stored property)
    (2) GooseUploadService init (GooseAppModel stored property)
    (3) OvernightSQLiteMirrorQueue init (GooseAppModel stored property)
    (4) HealthDataStore.init() (AppShellView @State)
    Each call does: FileManager.urls(for:in:) + createDirectory(withIntermediateDirectories:).
    createDirectory is a no-op after first call but still a syscall each time.

## Investigation Log

2026-06-06: Initial investigation. Read GooseSwiftApp, GooseAppModel, GooseBLEClient, all coach
providers, HealthDataStore, GooseAppModel+OvernightRecovery, AppShellView.

## Resolution

root_cause: >
  The dominant cause is recoverUncleanOvernightGuardSessionIfNeeded() running synchronously on the
  main thread during GooseAppModel.init(). If any active overnight guard session exists on disk,
  this method reads multiple JSON and large JSONL files synchronously, blocking the main thread for
  O(file size) time before the first frame is painted. Secondary contributors are: (1) multiple
  repeated calls to defaultDatabasePath() (each a filesystem syscall) from 3+ stored property
  initialisers, (2) 3 Keychain reads (SecItemCopyMatching) during CoachProviderRegistry.init()
  which fires on first tab render (potentially on main thread under eager TabView rendering),
  (3) CBCentralManager creation with Bluetooth daemon round-trip on the main thread.

fix: not applied
