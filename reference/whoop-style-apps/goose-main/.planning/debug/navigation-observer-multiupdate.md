---
status: resolved
trigger: "NavigationRequestObserver tried to update multiple times per frame — BLE connected, K2 frames arriving every ~1-2 seconds"
created: 2026-06-05T00:00:00Z
updated: 2026-06-05T01:00:00Z
---

## Current Focus

hypothesis: >
  AppShellView drives the More tab NavigationStack with `path: $router.morePath`.
  AppRouter is an @EnvironmentObject. AppShellView also has @EnvironmentObject model: GooseAppModel.
  GooseAppModel has @Published properties that change on every BLE packet.
  When any @Published on GooseAppModel fires, AppShellView re-renders, which re-evaluates
  tabNavigationStack(for: .more) and creates a new NavigationStack(path: $router.morePath).
  This causes NavigationRequestObserver to see multiple state mutations in the same frame.
  Additionally, MoreView.routeStatus is a computed var that calls store.routeStatus(ble: model.ble, model: model)
  on EVERY render, which accesses model.ble.hrConnectionState. But since MoreView uses
  @EnvironmentObject model (GooseAppModel), any @Published change on GooseAppModel triggers
  a MoreView re-render AND re-evaluates routeStatus, which drives navigationDestination(for: MoreRoute.self).
  The NavigationRequestObserver warning is: multiple SwiftUI views are trying to read/update
  navigation state in the same render pass.

test: "Read AppShellView + MoreView + confirm the NavigationStack(path:) binding is re-created on every GooseAppModel @Published change"
expecting: "The root cause is that routeStatus is computed on every render of MoreView, and MoreView re-renders on every GooseAppModel @Published change (BLE packet = new @Published fire)"
next_action: "Apply fix: make MoreDataStore cache routeStatus as a @Published var and update it only when relevant BLE properties change, not on every render"

reasoning_checkpoint:
  hypothesis: >
    MoreView.routeStatus is a computed property that is re-evaluated on EVERY render.
    MoreView re-renders whenever GooseAppModel fires objectWillChange (which happens on every
    BLE packet because GooseAppModel has dozens of @Published vars that update per packet).
    routeStatus calls store.routeStatus(ble:model:) which creates a new MoreRouteStatus value
    every frame. This new struct drives navigationDestination(for: MoreRoute.self) in MoreView.
    SwiftUI's NavigationRequestObserver sees the navigation destination closure being called
    repeatedly in the same frame pass, producing the warning.
    The hrMonitor status specifically reads ble.hrConnectionState which changes during BLE ops.
  confirming_evidence:
    - "MoreView.body line 106: `private var routeStatus: MoreRouteStatus { store.routeStatus(ble: model.ble, model: model) }` — computed, no caching"
    - "MoreDataStore.routeStatus() line 129-147: creates a NEW MoreRouteStatus struct on every call, including hrMonitor: ble.hrConnectionState == connected"
    - "GooseAppModel has dozens of @Published vars (lines 7-58) that fire on every BLE packet"
    - "AppShellView line 49: NavigationStack(path: $router.morePath) — driven by router.morePath"
    - "MoreView line 95: .navigationDestination(for: MoreRoute.self) — evaluated on every render"
    - "GooseBLEClient line 26: @Published var hrConnectionState: String — fires on BLE HR monitor state changes"
  falsification_test: "If routeStatus were cached and only updated on actual BLE state changes, the warning would disappear. If the warning persists after caching, the root cause is elsewhere."
  fix_rationale: "Move routeStatus from a computed property to a @Published var on MoreDataStore, updated only when ble.hrConnectionState or other relevant properties actually change. MoreView will observe MoreDataStore (which it already does via @StateObject store) and only re-render routeStatus when the store publishes a change."
  blind_spots: "GooseAppModel @Published changes may still trigger MoreView re-renders via @EnvironmentObject, but removing the computed routeStatus from body evaluation eliminates the NavigationRequestObserver mutation during render."

## Symptoms

expected: "MoreView renders stably; NavigationRequestObserver is silent"
actual: "NavigationRequestObserver warns 'tried to update multiple times per frame' repeatedly during BLE capture"
errors: "Update NavigationRequestObserver tried to update multiple times per frame."
reproduction: "Connect WHOOP device; navigate to More tab; K2 BLE frames arriving every ~1-2 seconds triggers repeated warnings"
started: "After Phase 10 changes adding MoreRoute.hrMonitor and MoreDataStore.routeStatus reading ble.hrConnectionState"

## Eliminated

- hypothesis: "AppRouter.morePath is being mutated directly by BLE callbacks"
  evidence: "AppRouter has no BLE observers. morePath is only changed by openMore() which is user-driven."
  timestamp: 2026-06-05T00:05:00Z

- hypothesis: "GooseBLEClient objectWillChange propagates to GooseAppModel @Published"
  evidence: "GooseAppModel.ble is declared as `let ble: GooseBLEClient` — not @Published. No Combine sink found in GooseAppModel* files linking ble.objectWillChange to model.objectWillChange. However GooseAppModel itself has many @Published vars that change on BLE packets (overnightGuardRawNotificationCount, etc.)."
  timestamp: 2026-06-05T00:07:00Z

## Evidence

- timestamp: 2026-06-05T00:02:00Z
  checked: "MoreView.swift lines 105-107"
  found: "routeStatus is a computed property: `private var routeStatus: MoreRouteStatus { store.routeStatus(ble: model.ble, model: model) }`"
  implication: "Computed on every render of MoreView.body — no caching"

- timestamp: 2026-06-05T00:02:30Z
  checked: "MoreDataStore.swift lines 129-147"
  found: "routeStatus() creates a new MoreRouteStatus struct on every call. Specifically: `hrMonitor: ble.hrConnectionState == connected ? .ready : .pending`"
  implication: "New value object constructed per render; feeds into navigationDestination"

- timestamp: 2026-06-05T00:03:00Z
  checked: "GooseAppModel.swift lines 7-58"
  found: "Dozens of @Published vars: overnightGuardRawNotificationCount, healthPacketCaptureFrameCount, etc. all change per BLE packet"
  implication: "GooseAppModel fires objectWillChange on every BLE packet, triggering MoreView re-render"

- timestamp: 2026-06-05T00:04:00Z
  checked: "AppShellView.swift lines 49-50"
  found: "NavigationStack(path: $router.morePath) wraps the More tab content"
  implication: "AppShellView re-renders on every GooseAppModel change (also has @EnvironmentObject model). NavigationStack path binding is stable (router.morePath) but AppShellView re-building the NavigationStack on each render while MoreView is also mutating navigation state causes the conflict."

- timestamp: 2026-06-05T00:05:30Z
  checked: "MoreView.swift lines 95-96"
  found: ".navigationDestination(for: MoreRoute.self) { route in destination(for: route) }"
  implication: "NavigationRequestObserver is tracking this destination registration. If MoreView re-renders while navigation is active, the observer sees conflicting state."

- timestamp: 2026-06-05T00:06:00Z
  checked: "GooseBLEClient.swift line 26"
  found: "@Published var hrConnectionState: String = disconnected"
  implication: "This fires during BLE HR monitor operations. But GooseBLEClient is not directly observed by MoreView — the path is: BLE packet → GooseAppModel @Published → MoreView re-render → routeStatus recomputed → NavigationRequestObserver conflict"

## Resolution

root_cause: >
  MoreView.routeStatus is a computed property re-evaluated on EVERY render of MoreView.body.
  MoreView re-renders on every GooseAppModel @Published change (dozens fire per BLE packet).
  routeStatus creates a new MoreRouteStatus struct each time, and this struct feeds into
  .navigationDestination(for: MoreRoute.self). SwiftUI's NavigationRequestObserver sees
  navigation state being evaluated/mutated multiple times in the same frame, producing the warning.
  The hrMonitor case (added in Phase 10) reads ble.hrConnectionState, adding a dependency that
  changes during BLE operations, making the problem more frequent.

fix: >
  Move routeStatus from a computed property in MoreView to a @Published var in MoreDataStore.
  Add an update method updateRouteStatus(ble:model:) that MoreView calls via .onChange or .onReceive
  at appropriate throttled intervals. Alternatively, make routeStatus stable by computing it
  once per relevant change rather than per render.
  Chosen approach: make routeStatus a @Published var on MoreDataStore, updated via
  .task or .onChange on the relevant properties, NOT computed inline in body.

verification: >
  Build succeeds with no errors in modified files (MoreDataStore.swift, MoreView.swift,
  MoreRouteModels.swift). Single pre-existing error in GooseAppModel.swift:424 confirmed
  present before fix (verified via git stash + build). Code review confirms:
  (1) routeStatus computed var eliminated from MoreView.body,
  (2) store.routeStatus is @Published and only updated via Combine sinks on relevant BLE
  property changes (connectionState, hrConnectionState) with removeDuplicates(),
  (3) no more per-render MoreRouteStatus construction inside navigationDestination closure.
files_changed:
  - GooseSwift/MoreView.swift
  - GooseSwift/MoreDataStore.swift
  - GooseSwift/MoreRouteModels.swift
