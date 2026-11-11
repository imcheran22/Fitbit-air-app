// Integration tests for battery.parse_event48_payload and battery.parse_cmd26_response
// bridge methods (BAT-01). These tests exercise the full JSON dispatch path used by Swift.
//
// The inline unit tests in bridge/mod.rs test the parsing functions directly.
// These integration tests verify the JSON bridge dispatch returns the correct key names
// that Swift reads: "event48_battery_pct" and "battery_pct".

use goose_core::bridge::{BridgeResponse, handle_bridge_request_json};

fn bridge(value: serde_json::Value) -> BridgeResponse {
    serde_json::from_str(&handle_bridge_request_json(&value.to_string())).unwrap()
}

/// Build a 30-byte Event-48 payload with the given raw battery value (u16 LE) at offset 17.
/// Matches the event48_payload() helper in bridge/mod.rs tests.
fn event48_payload_hex(raw_battery: u16) -> String {
    let mut p = vec![0u8; 30];
    p[17] = (raw_battery & 0xFF) as u8;
    p[18] = (raw_battery >> 8) as u8;
    hex::encode(&p)
}

/// Build a cmd-26 response payload with the given raw battery value (u16 LE) at offsets 5-6.
/// Layout: [COMMAND_RESPONSE=36, _, cmd=26, _, SUCCESS=1, lo, hi, ...]
fn cmd26_payload_hex(len: usize, raw_battery: u16) -> String {
    let mut p = vec![0u8; len.max(7)];
    p[0] = 36; // COMMAND_RESPONSE
    p[2] = 26; // GET_BATTERY_LEVEL
    p[4] = 1; // SUCCESS
    p[5] = (raw_battery & 0xFF) as u8;
    p[6] = (raw_battery >> 8) as u8;
    p.truncate(len);
    hex::encode(&p)
}

// BAT-01: valid event-48 payload → bridge returns event48_battery_pct=85
#[test]
fn test_parse_event48_battery_valid() {
    let payload_hex = event48_payload_hex(850); // raw=850 → 850/10=85
    let response = bridge(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "method": "battery.parse_event48_payload",
        "request_id": "test-event48-valid",
        "args": { "payload_hex": payload_hex }
    }));
    assert!(response.ok, "bridge call should succeed");
    let result = response.result.expect("result must be present");
    let pct = result["event48_battery_pct"]
        .as_u64()
        .expect("event48_battery_pct key must be present and integer");
    assert_eq!(pct, 85, "raw=850 / 10 should equal 85");
}

// BAT-01 boundary: raw=1101 exceeds guard (>1100) → bridge returns error
#[test]
fn test_parse_event48_battery_boundary_guard() {
    let payload_hex = event48_payload_hex(1101); // raw=1101 → rejected by guard
    let response = bridge(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "method": "battery.parse_event48_payload",
        "request_id": "test-event48-guard",
        "args": { "payload_hex": payload_hex }
    }));
    assert!(
        !response.ok,
        "raw=1101 should be rejected (exceeds 1100 guard)"
    );
}

// BAT-02: valid cmd-26 response → bridge returns battery_pct=85
#[test]
fn test_parse_cmd26_battery_valid() {
    let payload_hex = cmd26_payload_hex(10, 850); // raw=850 → 850/10=85
    let response = bridge(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "method": "battery.parse_cmd26_response",
        "request_id": "test-cmd26-valid",
        "args": { "payload_hex": payload_hex }
    }));
    assert!(response.ok, "bridge call should succeed");
    let result = response.result.expect("result must be present");
    let pct = result["battery_pct"]
        .as_u64()
        .expect("battery_pct key must be present and integer");
    assert_eq!(pct, 85, "raw=850 / 10 should equal 85");
}

// BAT-02 too-short: payload shorter than 7 bytes → bridge returns error
#[test]
fn test_parse_cmd26_battery_too_short() {
    let payload_hex = cmd26_payload_hex(6, 0); // 6 bytes — too short (need >= 7)
    let response = bridge(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "method": "battery.parse_cmd26_response",
        "request_id": "test-cmd26-too-short",
        "args": { "payload_hex": payload_hex }
    }));
    assert!(
        !response.ok,
        "payload of 6 bytes should be rejected (need >= 7)"
    );
}
