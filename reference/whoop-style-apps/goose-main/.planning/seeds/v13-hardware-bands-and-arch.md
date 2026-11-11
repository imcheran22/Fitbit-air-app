---
name: v13-hardware-bands-and-arch
description: v13.0 seed — add all hardware bands from Android APK RE (Puffin UUID, Monument, Symphony) + Rust protocol architecture refactor (issue #157)
metadata:
  type: seed
  trigger_condition: when defining v13.0 milestone scope
  planted_date: 2026-06-19
---

## Scope

Two complementary tracks for v13.0:

1. **Hardware bands** — add full BLE support for all hardware variants discovered via Android APK analysis
2. **Rust protocol architecture** — address scale-risk findings from senior Rust review (issue #157)

---

## Track 1: Hardware Bands

### Puffin (WHOOP 5.x variant — highest priority)

**Status:** `DeviceType::Puffin` already exists in Rust with correct Gen5 wire format parsing. Missing: BLE UUID for connection.

**UUID confirmed from APK:**
- Service: `11500001-6215-11ee-8c99-0242ac120002`
- CommandToStrap: `11500002-6215-11ee-8c99-0242ac120002`
- CommandFromStrap: `11500003-6215-11ee-8c99-0242ac120002`
- EventsFromStrap: `11500004-6215-11ee-8c99-0242ac120002`
- DataFromStrap: `11500005-6215-11ee-8c99-0242ac120002`
- Memfault: `11500007-6215-11ee-8c99-0242ac120002`

**Work needed:**
1. Add Puffin UUID constants to `Rust/core/src/openwhoop_reference.rs` (new WhoopGeneration variant or standalone constants)
2. Add Puffin service UUID to `GooseSwift/CoreBluetoothBLETransport.swift` scan list (alongside `fd4b` and `6108`)
3. Add Puffin characteristic UUIDs to write/notify setup
4. Fix `openwhoop_reference.rs:161` — remove `Puffin` from `None` arm, map to Puffin generation
5. Fix protocol.rs Puffin doc comment — remove "likely unshipped" (confirmed shipped by APK)
6. `GooseBLETypes.swift` — add Puffin to `WhoopProtocol` detection logic

**Risk:** Low. Puffin uses Gen5 wire format — Rust parsing already works. Only BLE discovery and connection setup needed.

### Monument (WHOOP castle-pairing variant)

**UUID confirmed from APK (castle-pairing gated):**
- Service: `8a580001-2fe8-4796-9267-b87a2b0c8234`

**Status:** Not in repo. Castle-pairing gated in official app — for standard users.
**Priority:** Low. Add UUID constants for completeness; no BLE scan wiring until castle-pairing flow is understood.

### Symphony (newest hardware variant)

**UUID confirmed from APK (castle-pairing gated):**
- Service: `59830001-5955-419b-bb8d-c8262926af23`

**Status:** Not in repo. Newest variant, castle-pairing gated.
**Priority:** Low. Same as Monument.

---

## Track 2: Rust Protocol Architecture (issue #157)

Full detail in: https://github.com/tigercraft4/goose/issues/157

Priority order for v13.0:

| Item | Effort | Impact |
|------|--------|--------|
| Silent parse drops — explicit warnings for unhandled packet_k | Low | High |
| DeviceType `wire_family()` central method | Low | Medium |
| `CommandDefinition` sync test vs bridge arms | Low | Medium |
| Packet type enum `#[repr(u8)]` + `TryFrom<u8>` | Medium | High |
| Event name debug-string (vs silent None) | Low | Low |
| Domain/parse sync documentation | Low | Low |
| Bridge domain registry | High | Medium |

---

## RE Source

All hardware UUIDs confirmed from Android APK decompilation (jadx).
Full notes: `re-assets/FINDINGS-ble-uuids.md` (gitignored).

---

## Dependencies

- v12.0 must be shipped and archived before v13.0 planning
- Issue #157 open — link phases to it
- `re-assets/` folder with all FINDINGS-*.md files available for implementation reference
