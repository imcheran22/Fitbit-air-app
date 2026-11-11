---
slug: packet-type-name-fix
created: 2026-06-19
status: in_progress
---

# Fix Silent packet_type_name() Wildcard

## Goal
packet_type_name() returns None for unknown packet types — silently drops them.
Change wildcard arm to surface the raw byte value so callers can log it.

## Change

File: Rust/core/src/protocol.rs ~line 474

Read function signature. If returns Option<&'static str>:
- Change `_ => None` to `_ => Some("unknown")` is NOT enough — loses the byte
- Better: return the string via a thread_local or just change signature

Actually simplest: keep Option<&'static str> return type, but callers that get None
should warn. Add a companion pub fn packet_type_label(t: u8) -> String that always
returns a string including the hex byte for unknown types.

OR — safest non-breaking change: add a separate pub fn:
```rust
pub fn packet_type_debug_name(packet_type: u8) -> String {
    packet_type_name(packet_type)
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("unknown_0x{:02x}", packet_type))
}
```

This doesn't change existing callers, adds visibility for debug/log paths.

## Verification
cargo check must pass.

## Commit
"fix: add packet_type_debug_name for unknown packet type visibility"
