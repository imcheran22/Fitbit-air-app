# Phase 98: Gen5 Historical Sync Routing Fix + HPS Ring Buffer — Context

**Gathered:** 2026-06-20
**Updated:** 2026-06-20 (post-research corrections)
**Status:** Ready for planning

<domain>
## Phase Boundary

Two complementary fixes for historical sync data reliability on Gen5:

1. **SYNC-08** ✅ ALREADY IMPLEMENTED — The `historicalData` (type 47) + `historicalIMUDataStream` (type 52) guard is committed in `CoreBluetoothBLETransport+PeripheralDelegate.swift:163-170` (added in Phase 89 BLE actor refactor). Plan 98-01 = verify correctness, add D-03 SAFETY comment, confirm `historicalPacketsReceivedThisSync` increments, close issue #24.

2. **SYNC-10** — Parse ring buffer fields (`ring_capacity`, `current_page`, `read_pointer`) from `GET_DATA_RANGE` response. Use them to detect ring wrap-around and compute correct `pages_behind`. Log results via existing `ble.record()` — no SQLite schema migration.

Issues closed: #24 (SYNC-08), #160 (SYNC-10)

</domain>

<decisions>
## Implementation Decisions

### SYNC-08: Dispatch Gate Fix

- **D-01:** Add `historicalData` (`V5PacketType.historicalData = 47`) and `historicalIMUDataStream` (`V5PacketType.historicalIMUDataStream = 52`) to the dispatch gate that routes BLE notifications to the main sync handler. Gate is conditional on `isHistoricalSyncing == true` — live capture keeps the existing performance optimization (packets stay off main thread when not syncing).

- **D-02:** The fix location is in `CoreBluetoothBLETransport` where the notification side-effect dispatch decision is made. `notificationSideEffectSkipCount` / `notificationSideEffectSkipBytes` counters track skipped packets. The gate must be inserted before the skip-counter increment so body packets don't get counted as skipped during an active sync.

- **D-03:** **Threading: read `historicalManager.isHistoricalSyncing` directly — no lock.** Both the setter (set when sync starts/stops) and the dispatch gate reader run on the same CoreBluetooth notification queue. No data race is possible. Add `// SAFETY: isHistoricalSyncing set+read on same CB notification queue` comment at the read site.

- **D-04:** Pattern (from issue #24, verified on device):
  ```swift
  case V5PacketType.historicalData,
       V5PacketType.historicalIMUDataStream:
    if historicalManager.isHistoricalSyncing {
      return true  // route to main handler → handleHistoricalSyncValue
    }
    // fall through to skip-counter path (live capture)
  ```

### SYNC-10: HPS Ring Buffer Parsing

- **D-05:** ⚠️ CORRECTED BY RESEARCH — Parse ring buffer fields in **Swift** (`CoreBluetoothBLETransport+Parsing.swift`), NOT Rust. All GET_DATA_RANGE response parsing lives in Swift. `historical_sync.rs` is a sync state machine only; it does not parse BLE response bytes. Extend the existing Swift parse at the point where `pages_behind` / `pageCurrent` / `pageOldest` are already extracted (~line 753).

- **D-06:** Ring wrap-around detection formula:
  ```rust
  // Ring has wrapped when current_page has cycled past read_pointer
  let ring_wrapped = current_page < read_pointer;
  let pages_behind_corrected = if ring_wrapped {
      (ring_capacity - read_pointer) + current_page
  } else {
      current_page - read_pointer
  };
  ```

- **D-07:** **Storage: log only via `ble.record()` — no SQLite schema migration.** RE analysis of WHOOP Android app confirms WHOOP treats `pages_behind` as a distribution analytics metric (not persisted to device DB). Ring buffer fields are transient sync-session state. Log event format:
  ```
  title: "historical_sync.get_data_range.ring"
  body: "ring_capacity={N} current_page={N} read_pointer={N} ring_wrapped={bool} pages_behind_raw={N} pages_behind_corrected={N}"
  ```

- **D-08:** If the GET_DATA_RANGE response doesn't contain ring buffer fields (older firmware / Gen4 which uses a different response format), fall back to existing `pages_behind` calculation. Add `ring_capacity_present: bool` field to the parse result.

### Claude's Discretion

- Exact byte offset layout of `ring_capacity`/`current_page`/`read_pointer` in the GET_DATA_RANGE response — planner should look at existing `commands.rs` `get_data_range` definition and the `u32_words_from_offset_1` pattern already used in `CoreBluetoothBLETransport+Parsing.swift:753`.
- Whether `handleHistoricalSyncValue` is called directly from the dispatch gate or through `historicalManager` — trace the existing `commandResponse` dispatch path and mirror its structure.

</decisions>

<specifics>
## Specific Ideas

- Issue #24 provides a working, device-verified fix for SYNC-08. The planner should use its exact code pattern as the implementation baseline.
- RE analysis of WHOOP Android (`h12/f.java`, `c82/c.java`) confirms `pages_behind` is a distribution metric posted to analytics — not a behavioral change beyond correcting the count. Our implementation follows the same philosophy: compute correctly, log, don't persist.
- The `notificationSideEffectSkipLogInterval` / `notificationSideEffectSkipLogStride` constants in `CoreBluetoothBLETransport.swift:375-376` suggest the skip-tracking system is mature — be careful not to inflate skip counts with body packets during active sync.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### SYNC-08: Dispatch Gate
- `GooseSwift/CoreBluetoothBLETransport.swift` — contains `V5PacketType` enum (lines ~762-770), `notificationSideEffectSkipCount/Bytes` counters (lines ~311-376), and the `isHistoricalSyncing` check pattern (lines ~927, ~953)
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — contains `handleHistoricalSyncValue` and `historicalPacketsReceivedThisSync &+= 1` (line ~26) — the handler that SYNC-08 must route body packets to
- `GooseSwift/GooseBLEHistoricalManager.swift` — `isHistoricalSyncing: Bool` field (line 8) — the flag read in the dispatch gate
- `GooseSwift/CoreBluetoothBLETransport+DebugAndSync.swift` — dispatch context for commandResponse (lines ~40-41), idle-timer and retry logic

### SYNC-10: Ring Buffer Parse
- `Rust/core/src/historical_sync.rs` — `HistoricalSyncPlanStepKind::GetDataRange` (line ~75, ~1183, ~1305); existing GET_DATA_RANGE handling to extend
- `Rust/core/src/commands.rs` — `get_data_range` command definition (line ~620); response byte layout reference
- `Rust/core/src/store/mod.rs` — `pages_behind: Option<i64>` field (line ~335); `historical_sync` table schema (line ~1965); existing INSERT pattern (line ~2218)
- `GooseSwift/CoreBluetoothBLETransport+Parsing.swift:753` — `u32_words_from_offset_1` pattern already used to parse GET_DATA_RANGE response — exact same parsing approach for ring buffer fields

### RE Reference (gitignored — do not cite in commits/issues)
- `re-assets/whoop-decompiled/sources/h12/f.java` — `bluetooth.strap_backlog.distribution.pages_behind` metric confirms observability-only approach
- `re-assets/whoop-decompiled/sources/c82/c.java:175` — `connectivity.strap.app.sensor_hps.backlog_pages_behind` distribution metric

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **`V5PacketType` constants** (`CoreBluetoothBLETransport.swift:762-770`): `historicalData = 47`, `historicalIMUDataStream = 52` — already defined, reference by name not by raw value.
- **`historicalManager.isHistoricalSyncing`** (`GooseBLEHistoricalManager.swift:8`): plain `var Bool`, set when sync starts/ends on CB queue. Safe to read in dispatch gate.
- **`ble.record()` pattern**: established logging idiom throughout `CoreBluetoothBLETransport+*.swift` — use same source/title/body pattern for ring buffer log events.
- **`u32_words_from_offset_1` pattern** (`CoreBluetoothBLETransport+Parsing.swift:753`): already parses GET_DATA_RANGE `pages_behind` from 4-byte LE words — extend same parse for ring buffer fields at their respective offsets.
- **`HistoricalSyncPlanStepKind::GetDataRange`** (`historical_sync.rs:75, 1183, 1305`): existing Rust step for GET_DATA_RANGE handling — extend response parse here.

### Integration Points

- After SYNC-08 fix: `historicalPacketsReceivedThisSync` will increment during Gen5 sync → idle timer won't fire → `history_complete_metadata_only` path no longer triggered → sync completes → `decoded_frames` rows populated.
- SYNC-10 ring correction feeds into the same `pages_behind` value already logged in `historical_sync.get_data_range` events — extend existing event body, don't create a new one.

### Known Constraints

- Do NOT route `historicalData`/`historicalIMUDataStream` to main handler unconditionally — this would break the live-capture performance optimization. Guard MUST be `isHistoricalSyncing == true`.
- Gen4 uses `61080005` service UUID (different characteristic) — SYNC-08 fix applies only to the Gen5 data characteristic (`FD4B0005`). Planner should verify the dispatch gate is per-characteristic or add characteristic guard.
- Ring buffer fields in GET_DATA_RANGE response may not be present in all firmware versions — fallback to raw `pages_behind` parse if fields absent.

</code_context>
