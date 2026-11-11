# Phase 101: HPS Telemetry + Coach Crash + Protocol Cleanup - Context

**Gathered:** 2026-06-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Three independent tracks in one phase:
1. **SYNC-12** — HPS sync quality telemetry: real-time OSLog/BLE record per burst + `sync_telemetry` SQLite table (Rust schema migration)
2. **BUG-COACH-01** — Coach crash after setup (issue #170): researcher investigates root cause, then fix
3. **PROTO-08/09/10/11** — Rust protocol cleanup: PACKET_TYPE_* → enum, silent `_ =>` arm removed, `data_packet_domain()` in sync, `CommandDefinition` registry in bridge

Closes: #162, #170, #157; `cargo test --locked` passes clean.

</domain>

<decisions>
## Implementation Decisions

### HPS telemetry (SYNC-12)
- **D-01:** Both tracks delivered — real-time log AND SQLite persistence
  - Real-time: `ble.record(level: .debug, title: "hps.telemetry", body: "bytes=X duration=Yms gaps=Z")` per burst, visible in Debug > Logs
  - Persistence: new `sync_telemetry` SQLite table in Rust (schema migration included); fields per issue #162: `session_id, burst_index, bytes_received, duration_ms, missing_packets, sequence_gaps, result`
- **D-02:** Rust-side instrumentation (historical sync loop already tracks packets); Swift side only reads from Debug log (no new Swift UI beyond existing Debug > Logs view)

### Coach crash (BUG-COACH-01)
- **D-03:** Researcher investigates root cause first — do NOT assume cause; check nil force-unwrap, @MainActor violations, missing API config guard
- **D-04:** Fix must eliminate the crash path, not just add a try?; if cause is nil API key → add explicit guard with user-facing message; if threading → Task/@MainActor fix

### Protocol cleanup (PROTO-08/09/10/11)
- **Claude's Discretion:** Purely Rust; follow existing bridge module conventions; researcher maps exact locations of PACKET_TYPE constants, silent arms, and domain function

</decisions>

<specifics>
## Specific Ideas

- `sync_telemetry` table: per issue #162 schema. Session ID ties to existing historical sync session tracking in Rust.
- Coach crash: issue #170 says "crash or freezing after clicking Coach and trying to connect the Codex" — could be OpenAI client init or network timeout on nil key

</specifics>

<canonical_refs>
## Canonical References

- GitHub issue #162 — HPS sync quality telemetry spec (sync_telemetry table schema)
- GitHub issue #170 — Coach crash reproduction steps
- GitHub issue #157 — Protocol architecture risks (PROTO-08/09/10/11 source)
- `Rust/core/src/bridge/` — protocol parsing, CommandDefinition, PACKET_TYPE constants
- `GooseSwift/GooseAppModel+CoachChat.swift` — coach entry point for crash investigation
- `GooseSwift/CoreBluetoothBLETransport+HistoricalHandlers.swift` — HPS burst loop for telemetry insertion points

</canonical_refs>
