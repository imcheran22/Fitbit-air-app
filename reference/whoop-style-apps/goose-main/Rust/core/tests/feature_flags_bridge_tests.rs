// Integration tests for the feature flags bridge methods:
//   capabilities.upsert_feature_flags
//   capabilities.get_feature_flags
//
// All tests use a temporary SQLite database via tempfile::tempdir().

use goose_core::bridge::{BridgeResponse, handle_bridge_request_json};

fn request(value: serde_json::Value) -> BridgeResponse {
    serde_json::from_str(&handle_bridge_request_json(&value.to_string())).unwrap()
}

fn db_path(tempdir: &tempfile::TempDir) -> String {
    tempdir.path().join("goose.sqlite").display().to_string()
}

// ---------------------------------------------------------------------------
// Test 1: upsert then get round-trip (FF-03)
// ---------------------------------------------------------------------------

#[test]
fn test_upsert_and_get_feature_flags() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    let upsert_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "upsert-ff-1",
        "method": "capabilities.upsert_feature_flags",
        "args": {
            "database_path": db,
            "device_id": "device-ff-01",
            "flags": [
                {"index": 1, "value": 10},
                {"index": 2, "value": 20}
            ]
        }
    }));

    assert!(upsert_resp.ok, "upsert failed: {:?}", upsert_resp.error);
    let result = upsert_resp.result.unwrap();
    assert_eq!(result["upserted"], 2, "expected 2 flags upserted");

    // Read back via get_feature_flags
    let get_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "get-ff-1",
        "method": "capabilities.get_feature_flags",
        "args": {
            "database_path": db,
            "device_id": "device-ff-01"
        }
    }));

    assert!(get_resp.ok, "get failed: {:?}", get_resp.error);
    let flags = get_resp.result.unwrap();
    let flags = flags.as_array().unwrap();
    assert_eq!(flags.len(), 2, "expected 2 flags returned");

    // Ordered by flag_index ASC
    assert_eq!(flags[0]["flag_index"], 1);
    assert_eq!(flags[0]["flag_value"], 10);
    assert_eq!(flags[1]["flag_index"], 2);
    assert_eq!(flags[1]["flag_value"], 20);

    // discovered_at should be a non-empty string
    assert!(
        flags[0]["discovered_at"]
            .as_str()
            .map(|s| !s.is_empty())
            .unwrap_or(false),
        "discovered_at should be a non-empty string"
    );
}

// ---------------------------------------------------------------------------
// Test 2: upsert replaces existing flag value (FF-03 D-06)
// ---------------------------------------------------------------------------

#[test]
fn test_upsert_replaces_existing_flag() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    // First upsert: flag index=1, value=10
    let r1 = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "upsert-replace-1",
        "method": "capabilities.upsert_feature_flags",
        "args": {
            "database_path": db,
            "device_id": "device-ff-02",
            "flags": [{"index": 1, "value": 10}]
        }
    }));
    assert!(r1.ok, "first upsert failed: {:?}", r1.error);

    // Second upsert: same index=1, new value=99
    let r2 = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "upsert-replace-2",
        "method": "capabilities.upsert_feature_flags",
        "args": {
            "database_path": db,
            "device_id": "device-ff-02",
            "flags": [{"index": 1, "value": 99}]
        }
    }));
    assert!(r2.ok, "second upsert failed: {:?}", r2.error);

    // Get should return only one flag with the new value
    let get_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "get-replace-1",
        "method": "capabilities.get_feature_flags",
        "args": {
            "database_path": db,
            "device_id": "device-ff-02"
        }
    }));
    assert!(get_resp.ok, "get failed: {:?}", get_resp.error);
    let flags = get_resp.result.unwrap();
    let flags = flags.as_array().unwrap();
    assert_eq!(
        flags.len(),
        1,
        "expected exactly 1 flag (INSERT OR REPLACE)"
    );
    assert_eq!(flags[0]["flag_index"], 1);
    assert_eq!(flags[0]["flag_value"], 99, "value should be updated to 99");
}

// ---------------------------------------------------------------------------
// Test 3: get_feature_flags returns empty for unknown device (FF-03)
// ---------------------------------------------------------------------------

#[test]
fn test_get_feature_flags_empty_for_unknown_device() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    // Insert flags for device-ff-03 first (ensures table exists)
    let _ = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "upsert-empty-1",
        "method": "capabilities.upsert_feature_flags",
        "args": {
            "database_path": db,
            "device_id": "device-ff-03",
            "flags": [{"index": 1, "value": 5}]
        }
    }));

    // Query a different device — should return empty
    let get_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "get-empty-1",
        "method": "capabilities.get_feature_flags",
        "args": {
            "database_path": db,
            "device_id": "device-ff-unknown"
        }
    }));
    assert!(get_resp.ok, "get failed: {:?}", get_resp.error);
    let flags = get_resp.result.unwrap();
    let flags = flags.as_array().unwrap();
    assert_eq!(flags.len(), 0, "expected empty flags for unknown device");
}
