---
phase: 17
name: "@Observable Migration"
date: 2026-06-05
status: discussed
---

# Phase 17 Context — @Observable Migration

## Domain

Migrate `GooseAppModel`, `HealthDataStore`, and `GooseBLEClient` from `ObservableObject` + `@Published` to Swift's `@Observable` macro (iOS 17+). Replace `@EnvironmentObject` with `@Environment` in all 26 view files. Eliminates global `objectWillChange` broadcasts — only views accessing a changed property re-render.

## Decisions

### D-01: Migrate all three classes — GooseAppModel, HealthDataStore, GooseBLEClient

**Locked:** All three classes migrate to `@Observable`.

**Per-class changes:**
- `@MainActor final class GooseAppModel: ObservableObject` → `@MainActor @Observable final class GooseAppModel`
- `@MainActor final class HealthDataStore: ObservableObject` → `@MainActor @Observable final class HealthDataStore`
- `final class GooseBLEClient: NSObject, ObservableObject, @unchecked Sendable` → `@Observable final class GooseBLEClient: NSObject, @unchecked Sendable`

**@Published removal:** Remove all `@Published` annotations from stored properties. `@Observable` uses the macro's own property observation (no wrapper needed).

**NSObject + @Observable (GooseBLEClient):** `@Observable` is compatible with `NSObject` subclasses in Swift 5.9+. CoreBluetooth delegate conformances (`CBCentralManagerDelegate`, `CBPeripheralDelegate`) are unaffected. The existing main-thread guards (`if !Thread.isMainThread`) added in Phase 10.1 remain — @Observable does not add thread safety to property mutations.

### D-02: Replace @EnvironmentObject → @Environment in all 26 view files

**Locked:** Per-property tracking only works with `@Environment`, not `@EnvironmentObject`. All occurrences replaced:

```swift
// Before:
@EnvironmentObject private var model: GooseAppModel
// After:
@Environment(GooseAppModel.self) private var model
```

**Injection sites** (GooseSwiftApp.swift and any view that injects model):
```swift
// Before:
.environmentObject(model)
// After:
.environment(model)
```

**@ObservedObject views** (views that receive ble or store as parameter):
- `@ObservedObject var ble: GooseBLEClient` → remove wrapper, access directly
- `@ObservedObject var store: HealthDataStore` → remove wrapper, access directly
- `@StateObject private var healthStore = HealthDataStore()` → `@State private var healthStore = HealthDataStore()`

### D-03: Migration wave order (safe)

**Locked:** Migrate in this order to avoid compile errors:
1. **Wave 1:** `GooseAppModel` class body + all views that `@EnvironmentObject` it (atomic)
2. **Wave 2:** `HealthDataStore` class body + all views that `@ObservedObject` or `@EnvironmentObject` it
3. **Wave 3:** `GooseBLEClient` class body + views that `@ObservedObject var ble`
4. **Wave 4:** Injection sites (GooseSwiftApp, AppShellView) + final build verification

Each wave must compile before the next starts.

## Canonical Refs

- `GooseSwift/GooseAppModel.swift` — primary class (52 @Published)
- `GooseSwift/HealthDataStore.swift` — secondary class (25 @Published)
- `GooseSwift/GooseBLEClient.swift` — tertiary class (68 @Published, NSObject)
- `GooseSwift/GooseSwiftApp.swift` — injection site (.environmentObject → .environment)
- `GooseSwift/AppShellView.swift` — @StateObject healthStore injection
- Apple docs: `@Observable` macro — https://developer.apple.com/documentation/observation

## Success Criteria

1. `GooseAppModel`, `HealthDataStore`, `GooseBLEClient` use `@Observable` (no `ObservableObject` conformance)
2. No `@Published` annotations remain in the three classes
3. All 26 view files use `@Environment(GooseAppModel.self)` (not `@EnvironmentObject`)
4. `Update NavigationRequestObserver tried to update multiple times per frame` eliminated in logs
5. Xcode build succeeds
6. App runtime behaviour unchanged
