# Phase 88 Context: Swift Ownership — HealthDataStore

## Phase Goal
GooseAppModel owns HealthDataStore with a strong reference. AppShellView no longer creates the store. Circular back-references eliminated.

## Current State (to be changed)

```swift
// AppShellView.swift:6
@State private var healthStore = HealthDataStore()

// AppShellView sets/unsets weak ref on model:
model.healthStore = healthStore   // on appear
model.healthStore = nil           // on disappear

// GooseAppModel.swift:60 — weak optional, set externally:
weak var healthStore: HealthDataStore?
```

## Target State

```swift
// GooseAppModel — strong owner, initialised in init():
let healthStore: HealthDataStore

// GooseSwiftApp — inject into environment alongside other objects:
.environmentObject(model.healthStore)

// AppShellView — receives via environment, does NOT own:
@EnvironmentObject var healthStore: HealthDataStore
```

## Decisions

### D1: runPacketInputs() trigger
**Decision:** GooseAppModel calls `self.healthStore.runPacketInputs()` directly after sync completes.

Eliminates the callback mechanism. With strong ownership there is no optional unwrap risk.
Existing call site in AppShellView `.task` is removed; GooseAppModel extension that handles sync completion calls the method directly.

### D2: Views filhas
**Decision:** All views that currently take `HealthDataStore` as a parameter (`HealthView`, `CoachView`, `MoreView`, `HealthRouteDestinationView`, and their sub-views) switch to `@EnvironmentObject var healthStore: HealthDataStore`.

Consistent with the top-level pattern. AppShellView passes none of them explicitly.

## Files to Change

| File | Change |
|------|--------|
| `GooseAppModel.swift` | `weak var healthStore: HealthDataStore?` → `let healthStore: HealthDataStore`; init in `init()`; remove weak pattern |
| `AppShellView.swift` | Remove `@State private var healthStore`; remove set/unset lines; remove explicit `healthStore:` params to child views |
| `GooseSwiftApp.swift` | Add `.environmentObject(model.healthStore)` to scene |
| `GooseAppModel+*.swift` | Update any extension that accesses `model.healthStore?` (optional unwrap) → `model.healthStore` (non-optional) |
| `HealthView.swift` + others | Add `@EnvironmentObject var healthStore: HealthDataStore`; remove init parameter |

## Out of Scope
- Changing HealthDataStore internals or GooseRustBridge usage
- BLE actor refactor (Phase 89)
- GooseAppModel decomposition into ViewModels (Phase 90)
