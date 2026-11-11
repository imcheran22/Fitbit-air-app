---
phase: 87-store-rs-split
plan: 05
subsystem: database
tags: [rust, sqlite, store, refactor, activity, domain-split]

requires:
  - phase: 87-01
    provides: store/ skeleton, mod activity declared, Arc<Mutex<Connection>> pattern established

provides:
  - store/activity.rs with all 49 activity domain methods as impl GooseStore
  - store/mod.rs trimmed to 7 infrastructure pub fn only

affects: [87-06, bridge/activity.rs callers, any future store domain additions]

tech-stack:
  added: []
  patterns:
    - "Domain split: private row-mapper fns and validators co-located in domain file"
    - "Child module can access private parent fns — no pub(super) required for internal helpers"

key-files:
  created:
    - Rust/core/src/store/activity.rs
  modified:
    - Rust/core/src/store/mod.rs

key-decisions:
  - "validate_positive defined locally in activity.rs (private fn) — no conflict with mod.rs private fn of same name"
  - "Row mapper fns (activity_session_from_row etc.) duplicated as private fns in activity.rs — cleaner than pub(super) export"
  - "insert_exercise_session and insert_exercise_sessions_batch: removed spurious conn.lock() before immediate_transaction call to prevent mutex deadlock"
  - "BTreeSet imported at top of activity.rs — local use std::collections::BTreeSet in insert_activity_metrics removed"

patterns-established:
  - "Activity domain file: all private helpers (validators, row mappers) defined locally within the domain module"

requirements-completed: [ARCH-02]

duration: 35min
completed: 2026-06-15
---

# Phase 87 Plan 05: Activity Domain Split Summary

**All 49 activity-domain methods moved from store/mod.rs to store/activity.rs; store/mod.rs now contains only 7 infrastructure pub fn.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-06-15T00:00Z
- **Completed:** 2026-06-15T00:35Z
- **Tasks:** 1/1
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

### Task 1: Move 49 activity methods from store/mod.rs to store/activity.rs

Created `Rust/core/src/store/activity.rs` containing a single `impl GooseStore` block with all activity domain methods grouped into sections:

- **Activity sessions (11 methods):** `insert_activity_session`, `update_activity_session`, `delete_activity_session`, `activity_session`, `activity_sessions_between`, `activity_sessions_by_type`, `activity_sessions_by_source`, `activity_sessions_by_sync_status`, `activity_sessions_by_custom_label`, `activity_sessions_by_external_activity_type_code`, `activity_sessions_by_external_activity_type_name`
- **Activity metrics (8 methods):** `insert_activity_metric`, `insert_activity_metrics`, `insert_activity_metric_without_session_check` (private), `activity_metric`, `activity_metrics_for_session`, `activity_metrics_for_sessions`, `activity_metrics_by_name`, `activity_metrics_for_session_in_window`, `activity_metrics_in_window`
- **Activity intervals (4 methods):** `insert_activity_interval`, `activity_interval`, `activity_intervals_for_session`, `activity_intervals_in_window`
- **Activity labels (4 methods):** `insert_activity_label`, `activity_label`, `activity_labels_for_session`, `activity_labels_by_type`
- **Debug sessions (3 methods):** `insert_debug_session`, `debug_session`, `debug_sessions_between`
- **Debug commands (4 methods):** `insert_debug_command`, `debug_command`, `debug_commands_for_session`, `debug_commands_between`
- **Debug events (5 methods):** `next_debug_event_sequence`, `insert_debug_event`, `debug_events_for_session`, `debug_events_between`, `debug_events_after_sequence`
- **Table introspection (4 methods):** `table_count`, `table_columns`, `foreign_keys_enabled`, `integrity_check`
- **Exercise sessions (3 methods):** `insert_exercise_session`, `insert_exercise_sessions_batch`, `exercise_sessions_between`
- **Journal/Workout/Apple Daily (3 methods):** `insert_journal`, `insert_workout`, `insert_apple_daily`

## Verification

```
grep -c 'fn insert_activity_session' Rust/core/src/store/activity.rs  → 1
grep -c 'fn insert_activity_session' Rust/core/src/store/mod.rs        → 0
grep -c '^    pub fn' Rust/core/src/store/mod.rs                       → 7
cargo build --lib → 0 errors
```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed deadlock-causing conn.lock() before immediate_transaction**
- **Found during:** Step 1 (threat model T-87-05 review)
- **Issue:** Original mod.rs `insert_exercise_session` acquired `let conn = self.conn.lock()` at entry AND then called `self.immediate_transaction(|conn| ...)` which also locks the same mutex — guaranteed deadlock on any call
- **Fix:** Removed the leading `let conn = self.conn.lock()` from both `insert_exercise_session` and `insert_exercise_sessions_batch` before the `immediate_transaction` call. The validation (`validate_required`) was moved before the transaction call.
- **Files modified:** Rust/core/src/store/activity.rs
- **Commit:** f913f85

**2. [Rule 2 - Cleanup] Removed redundant local BTreeSet import**
- **Found during:** Code review of insert_activity_metrics
- **Issue:** `insert_activity_metrics` had a local `use std::collections::BTreeSet` shadowing the top-level import
- **Fix:** Removed the local import; top-level `use std::collections::BTreeSet` in activity.rs already covers it
- **Files modified:** Rust/core/src/store/activity.rs
- **Commit:** f913f85

## Known Stubs

None.

## Threat Flags

None — no new network endpoints, auth paths, or trust boundary changes introduced. The deadlock fix (T-87-05) was caught and resolved as specified in the threat model.

## Self-Check: PASSED

- `/Users/francisco/Documents/goose/Rust/core/src/store/activity.rs` — EXISTS
- `/Users/francisco/Documents/goose/Rust/core/src/store/mod.rs` — EXISTS (modified)
- Commit `f913f85` — EXISTS (`git log --oneline -5` confirmed)
- `cargo build --lib` — 0 errors
- `grep -c '^    pub fn' mod.rs` — 7 (infrastructure only)
