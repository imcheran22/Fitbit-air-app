# Plan 95-01 Summary — WhoopMg DeviceKind in Rust (MG-01)

**Status:** Complete
**Commits:** `04774f6`, `f730029`

## What Was Built

**Task 1 — DeviceKind::WhoopMg in capabilities.rs:**
- Added `WhoopMg` variant to `DeviceKind` enum with comment `candidate_MG_capabilities_unverified`
- Added `DeviceCapabilities::for_kind(DeviceKind::WhoopMg)` arm — identical to Whoop5 (gen5 wire protocol, stream historical sync, all battery methods) per APK Gen5 protocol analysis
- Added `whoop_mg_capabilities` unit test asserting gen5/stream capabilities
- Added `device_kind_whoop_mg_serde` unit test asserting `"WHOOP_MG"` serialisation
- Updated `bridge/mod.rs` exhaustive matches for `DeviceKind::WhoopMg`

**Task 2 — Maverick remapping in protocol.rs:**
- Split `DeviceType::Maverick | DeviceType::Puffin | DeviceType::Goose => DeviceKind::Whoop5` into two arms
- `DeviceType::Maverick => DeviceKind::WhoopMg` (with identifying comment)
- `DeviceType::Puffin | DeviceType::Goose => DeviceKind::Whoop5` (unchanged)
- Renamed test `device_kind_maverick_is_whoop5` → `device_kind_maverick_is_whoop_mg`

## Files Changed

- `Rust/core/src/capabilities.rs` — WhoopMg variant + for_kind arm + 2 unit tests
- `Rust/core/src/bridge/mod.rs` — exhaustive DeviceKind match updated
- `Rust/core/tests/protocol_tests.rs` — Maverick test renamed/updated
- `Rust/core/src/protocol.rs` — device_kind() remapped

## Verification

- `cargo check --lib` passes clean
- WhoopMg serialises as "WHOOP_MG" (SCREAMING_SNAKE_CASE per serde)
- Whoop4/Whoop5 device kinds unaffected
