---
name: backlog-issues-159-169
description: Backlog issues #159-169 with protocol analysis context — consult re-assets/ANALYSIS-features.md before planning any of these
metadata:
  type: seed
  trigger_condition: when defining v14.0+ milestone scope or reviewing backlog
  planted_date: 2026-06-19
---

## Issues and Context

Cross-reference: `re-assets/ANALYSIS-features.md` (gitignored) has full protocol detail per feature.

### P0 — Bug-level gaps

**#159 — BLE: MTU 247 + LE 2M PHY**
- Confirmed: `requestMtu(247)` and `setPreferredPHY(LE_2M)` in GATT manager
- MTU failure non-fatal — connection stays up at negotiated MTU
- CCCD setup on all 4 NOTIFY characteristics follows MTU
- Fix: `CoreBluetoothBLETransport.swift` after connect

**#160 — HPS: ring buffer wrap-around (GET_DATA_RANGE)**
- Label: should be `enhancement` not `bug` (internally filed, not user-reported crash)
- When buffer fills, write pointer overwrites oldest pages
- App must issue `SET_READ_POINTER` (0x21) after consuming pages
- Formula: `pages_behind = W < U ? W + (T - U) : W - U`
- Fields at 4-byte strides in response payload (u32 LE): offset 2=current_page, 3=read_pointer, 5=ring_capacity

### P1

**#161 — Off-wrist detection via 0x54**
- Response payload NOT confirmed from APK
- Better alternative: V24 offset 48 = `skin_contact` u8 (0=off, 1=on) — already in realtime data, no polling
- Gate: 5–45°C applied to skin temp; outside range = off-wrist or sensor error
- Consider: implement skin_contact from V24 rather than polling 0x54

**#162 — HPS sync quality telemetry**
- `c82/c.java` emits all `connectivity.strap.app.sensor_hps.*` metrics
- Throughput formula: `bytes / ((end - cmd_dispatch - first_byte_ms) / 1000)`
- Metrics: throughput_bytes_per_sec, burst_duration_ms, burst_sequence_gaps, burst_missing_packets, burst_packet_delta, session_duration_ms, backlog_pages_behind
- Phase timestamps: session_start → command_dispatch → first_data_byte → flush

**#163 — HISTORICAL_DATA_RESULT 8-byte identity**
- 8-byte field NOT resolved from APK
- APK does NOT cross-check identity against stored serial/MAC
- Identity exchanged at GET_HELLO (0x91) handshake; HPS messages don't re-verify
- Low value: deprioritise

### P2

**#164 — Harvard sleep need model**
- 100% server-side — no local computation in APK
- `HarvardSleepAdviceDto` DTO fields not recovered
- EWMA-based debt accumulation (Czeisler/Harvard model)
- Goose Rust already has `goose.sleep.v0` — distinct algorithm, usable as local approximation
- Implement locally using: `sleep_need = age_baseline + EWMA_debt + strain_factor`

**#165 — BLE feature flags (GET_FF_VALUE 0x80)**
- Two parallel systems: BLE strap flags (0x80) vs server flags (UserBootstrapDto)
- BLE flags: query on demand, no caching observed
- Server flags: fetched on every foreground resume (no TTL)
- Flag index → meaning NOT mapped — requires BLE capture
- Start with read-and-log approach

**#166 — Body composition history**
- Sage → recovery via `physiologicalBaseline` field in `ProfileDto`
- No client-side computation
- HealthKit source: `HKQuantityTypeIdentifierBodyMass` available

### P3

**#167 — UI stealth mode**
- Server-side persistent (`users-service`)
- `StealthModeApi.java` Retrofit interface confirmed (GET/PUT/DELETE per metricType)
- Read on bootstrap, updated on toggle
- For Goose self-hosted: UserDefaults is sufficient (no server round-trip needed)

**#168 — PIP separate upload pipeline**
- Endpoint `pip-metrics-service/v1/pip/upload` confirmed
- Headers: same pattern as `research-metrics-service` (X-WHOOP-HW-Version etc.)
- PIPs arrive on same `charDataFromStrap` characteristic as all other data
- Continuous, not session-gated
- Specific packet types for PIPs not identified — need BLE capture

### Feature requests

**#169 — Android port**
- Rust core already cross-compiles to aarch64-linux-android (ADR exists)
- CI added to release workflow: builds Rust .so for Android targets, attaches to release
- Full Android app: Kotlin/Compose + JNI shim still needed
- Community feature; include in v14.0+ scope discussion

**#153 — TestFlight**
- Explicitly out of scope: requires paid Apple Developer Program ($99/yr)
- Workaround: AltStore sideloading already works
- Close with explanation or defer indefinitely

## Hardware-gated items

These cannot be fully implemented without BLE capture:
- #163 device identity parsing (need capture during sync)
- #165 feature flag indices (need capture with known states)
- #161 0x54 response format (use V24 skin_contact instead)
- #168 PIP packet types (need capture during active wear)
