// Integration tests for the optical channel bridge methods:
//   biometrics.insert_v20v21_batch
//   biometrics.insert_v26_batch
//   biometrics.optical_between
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
// Test 1: insert v20/v21 batch and query round-trip (OPT-03)
// ---------------------------------------------------------------------------

#[test]
fn test_insert_v20v21_batch_round_trip() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    let insert_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "insert-v20-1",
        "method": "biometrics.insert_v20v21_batch",
        "args": {
            "database_path": db,
            "device_id": "device-opt-01",
            "packets": [
                {
                    "ts": 1000.0,
                    "packet_k": 20,
                    "version": 20,
                    "channels": [
                        {"index": 0, "samples": [100, 200, 300]},
                        {"index": 1, "samples": [400, 500, 600]}
                    ]
                },
                {
                    "ts": 1001.0,
                    "packet_k": 20,
                    "version": 20,
                    "channels": [
                        {"index": 0, "samples": [700, 800, 900]}
                    ]
                }
            ]
        }
    }));

    assert!(insert_resp.ok, "insert failed: {:?}", insert_resp.error);
    let result = insert_resp.result.unwrap();
    assert_eq!(
        result["inserted"], 3,
        "expected 3 rows (2 channels + 1 channel)"
    );

    // Query back via biometrics.optical_between
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-opt-1",
        "method": "biometrics.optical_between",
        "args": {
            "database_path": db,
            "device_id": "device-opt-01",
            "packet_k": 20,
            "start_ts": 0.0,
            "end_ts": 9999.0
        }
    }));

    assert!(query_resp.ok, "query failed: {:?}", query_resp.error);
    let rows = query_resp.result.unwrap();
    let rows = rows.as_array().unwrap();
    assert_eq!(rows.len(), 3, "expected 3 rows back");

    // First row: ts=1000, channel_index=0
    assert_eq!(rows[0]["ts"], 1000.0);
    assert_eq!(rows[0]["packet_k"], 20);
    assert_eq!(rows[0]["version"], 20);
    assert_eq!(rows[0]["channel_index"], 0);
    let samples: Vec<i64> =
        serde_json::from_str(rows[0]["samples_json"].as_str().unwrap()).unwrap();
    assert_eq!(samples, vec![100, 200, 300]);

    // Second row: ts=1000, channel_index=1
    assert_eq!(rows[1]["channel_index"], 1);
    let samples2: Vec<i64> =
        serde_json::from_str(rows[1]["samples_json"].as_str().unwrap()).unwrap();
    assert_eq!(samples2, vec![400, 500, 600]);

    // Third row: ts=1001, channel_index=0
    assert_eq!(rows[2]["ts"], 1001.0);
    assert_eq!(rows[2]["channel_index"], 0);
}

// ---------------------------------------------------------------------------
// Test 2: insert v26 batch and query round-trip (OPT-03)
// ---------------------------------------------------------------------------

#[test]
fn test_insert_v26_batch_round_trip() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    let insert_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "insert-v26-1",
        "method": "biometrics.insert_v26_batch",
        "args": {
            "database_path": db,
            "device_id": "device-opt-02",
            "packets": [
                {
                    "ts": 2000.0,
                    "packet_k": 26,
                    "version": 26,
                    "ppg": [10, 20, 30, 40],
                    "num_channels": 1
                }
            ]
        }
    }));

    assert!(insert_resp.ok, "insert_v26 failed: {:?}", insert_resp.error);
    let result = insert_resp.result.unwrap();
    assert_eq!(result["inserted"], 1, "expected 1 row inserted");

    // Query back with packet_k=26
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-v26-1",
        "method": "biometrics.optical_between",
        "args": {
            "database_path": db,
            "device_id": "device-opt-02",
            "packet_k": 26,
            "start_ts": 0.0,
            "end_ts": 9999.0
        }
    }));

    assert!(query_resp.ok, "query failed: {:?}", query_resp.error);
    let rows = query_resp.result.unwrap();
    let rows = rows.as_array().unwrap();
    assert_eq!(rows.len(), 1, "expected 1 row back");
    assert_eq!(rows[0]["ts"], 2000.0);
    assert_eq!(rows[0]["packet_k"], 26);
    assert_eq!(rows[0]["version"], 26);
    assert_eq!(rows[0]["channel_index"], 0, "v26 stored as channel_index=0");
    let ppg: Vec<i64> = serde_json::from_str(rows[0]["samples_json"].as_str().unwrap()).unwrap();
    assert_eq!(ppg, vec![10, 20, 30, 40]);
}

// ---------------------------------------------------------------------------
// Test 3: optical_between returns empty for out-of-range query (OPT-03)
// ---------------------------------------------------------------------------

#[test]
fn test_optical_between_empty_range() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    // Insert one packet at ts=1000
    let insert_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "insert-empty-1",
        "method": "biometrics.insert_v20v21_batch",
        "args": {
            "database_path": db,
            "device_id": "device-opt-03",
            "packets": [
                {
                    "ts": 1000.0,
                    "packet_k": 20,
                    "version": 20,
                    "channels": [{"index": 0, "samples": [1, 2, 3]}]
                }
            ]
        }
    }));
    assert!(insert_resp.ok, "insert failed: {:?}", insert_resp.error);

    // Query outside the inserted range
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-empty-1",
        "method": "biometrics.optical_between",
        "args": {
            "database_path": db,
            "device_id": "device-opt-03",
            "packet_k": 20,
            "start_ts": 2000.0,
            "end_ts": 9999.0
        }
    }));

    assert!(query_resp.ok, "query failed: {:?}", query_resp.error);
    let rows = query_resp.result.unwrap();
    let rows = rows.as_array().unwrap();
    assert_eq!(
        rows.len(),
        0,
        "expected empty result for out-of-range query"
    );
}

// ---------------------------------------------------------------------------
// Test 4: idempotent insert — duplicate ignored (OPT-03 D-05)
// ---------------------------------------------------------------------------

#[test]
fn test_insert_v20v21_idempotent() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    let payload = serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "insert-idem-1",
        "method": "biometrics.insert_v20v21_batch",
        "args": {
            "database_path": db,
            "device_id": "device-opt-04",
            "packets": [
                {
                    "ts": 3000.0,
                    "packet_k": 21,
                    "version": 21,
                    "channels": [{"index": 0, "samples": [5, 6, 7]}]
                }
            ]
        }
    });

    // Insert twice
    let r1 = request(payload.clone());
    assert!(r1.ok);
    let r2 = request(payload);
    assert!(r2.ok);

    // Only one row should exist
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-idem-1",
        "method": "biometrics.optical_between",
        "args": {
            "database_path": db,
            "device_id": "device-opt-04",
            "packet_k": 21,
            "start_ts": 0.0,
            "end_ts": 9999.0
        }
    }));
    assert!(query_resp.ok);
    let rows = query_resp.result.unwrap();
    assert_eq!(
        rows.as_array().unwrap().len(),
        1,
        "duplicate insert should be ignored"
    );
}
