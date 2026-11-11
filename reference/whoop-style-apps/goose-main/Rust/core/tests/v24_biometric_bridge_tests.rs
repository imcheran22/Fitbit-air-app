// Integration tests for the V24 biometric bridge methods:
//   biometrics.insert_v24_batch
//   biometrics.v24_between
//   biometrics.spo2_from_raw
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
// Test 1: insert + query roundtrip (BIO-03, BIO-04 verification)
// ---------------------------------------------------------------------------

#[test]
fn test_v24_bridge_insert_and_query() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    // SpO2: red=800, ir=1200, contact=1 — SpO2 = 110 - 25 * (800/1200) ≈ 93.3 (plausible)
    let insert_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "insert-v24-1",
        "method": "biometrics.insert_v24_batch",
        "args": {
            "database_path": db,
            "device_id": "device-test-01",
            "spo2": [{"ts": 1000.0, "red": 800, "ir": 1200, "contact": 1}],
            "skin_temp": [{"ts": 1000.0, "raw": 930, "contact": 1}],
            "resp": [{"ts": 1000.0, "raw": 450, "contact": 1}],
            "sig_quality": [{"ts": 1000.0, "quality": 9000, "contact": 1}]
        }
    }));

    assert!(insert_resp.ok, "insert failed: {:?}", insert_resp.error);
    let result = insert_resp.result.unwrap();
    assert_eq!(result["inserted"], true, "inserted flag should be true");
    let warnings = result["warnings"].as_array().unwrap();
    assert!(
        warnings.is_empty(),
        "expected no warnings for valid data, got: {:?}",
        warnings
    );

    // Query back via biometrics.v24_between
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-v24-1",
        "method": "biometrics.v24_between",
        "args": {
            "database_path": db,
            "device_id": "device-test-01",
            "start_ts": 0.0,
            "end_ts": 9999.0
        }
    }));

    assert!(query_resp.ok, "query failed: {:?}", query_resp.error);
    let result = query_resp.result.unwrap();

    // SpO2 table
    let spo2 = result["spo2"].as_array().unwrap();
    assert_eq!(spo2.len(), 1, "expected 1 spo2 row");
    assert_eq!(spo2[0]["red"], 800);
    assert_eq!(spo2[0]["ir"], 1200);
    assert_eq!(spo2[0]["contact"], 1);

    // skin_temp table — raw=930 → 33°C which is in [25, 40], stored
    let skin_temp = result["skin_temp"].as_array().unwrap();
    assert_eq!(skin_temp.len(), 1, "expected 1 skin_temp row");
    assert_eq!(skin_temp[0]["raw"], 930);

    // resp table
    let resp = result["resp"].as_array().unwrap();
    assert_eq!(resp.len(), 1, "expected 1 resp row");
    assert_eq!(resp[0]["raw"], 450);

    // sig_quality table
    let sig_quality = result["sig_quality"].as_array().unwrap();
    assert_eq!(sig_quality.len(), 1, "expected 1 sig_quality row");
    assert_eq!(sig_quality[0]["quality"], 9000);
}

// ---------------------------------------------------------------------------
// Test 2: plausibility rejection warning for out-of-range SpO2 raw values
// (BIO-01 plausibility gate)
// SpO2 = 110 - 25 * R; for R > 1.6 → SpO2 < 70 (rejected)
// e.g. red=2000, ir=1000 → R=2.0 → SpO2=60 → rejected with warning
// ---------------------------------------------------------------------------

#[test]
fn test_v24_plausibility_spo2_reject() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    // red=2000, ir=1000 → R=2.0 → SpO2 = 110 - 50 = 60 — outside [70, 100], should be rejected
    let insert_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "insert-v24-plaus-1",
        "method": "biometrics.insert_v24_batch",
        "args": {
            "database_path": db,
            "device_id": "device-plaus-01",
            "spo2": [{"ts": 2000.0, "red": 2000, "ir": 1000, "contact": 1}],
            "skin_temp": [],
            "resp": [],
            "sig_quality": []
        }
    }));

    assert!(insert_resp.ok, "bridge error: {:?}", insert_resp.error);
    let result = insert_resp.result.unwrap();
    let warnings = result["warnings"].as_array().unwrap();
    assert!(
        !warnings.is_empty(),
        "expected at least one plausibility warning"
    );
    let any_spo2_warn = warnings.iter().any(|w| {
        w.as_str()
            .unwrap_or("")
            .contains("spo2_plausibility_reject")
    });
    assert!(
        any_spo2_warn,
        "expected spo2_plausibility_reject in warnings, got: {:?}",
        warnings
    );

    // Verify row was not stored
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-v24-plaus-1",
        "method": "biometrics.v24_between",
        "args": {
            "database_path": db,
            "device_id": "device-plaus-01",
            "start_ts": 0.0,
            "end_ts": 9999.0
        }
    }));
    assert!(query_resp.ok, "query failed: {:?}", query_resp.error);
    let qresult = query_resp.result.unwrap();
    let spo2 = qresult["spo2"].as_array().unwrap();
    assert_eq!(
        spo2.len(),
        0,
        "rejected row should not be stored, got: {:?}",
        spo2
    );
}

// ---------------------------------------------------------------------------
// Test 3: quality_flag == "uncalibrated" in spo2_from_raw response (BIO-04)
// ---------------------------------------------------------------------------

#[test]
fn test_v24_uncalibrated_flag() {
    // Valid SpO2 raw: red=800, ir=1200 → R=0.667 → SpO2 ≈ 93.3 (plausible, in [70,100])
    let resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "spo2-from-raw-1",
        "method": "biometrics.spo2_from_raw",
        "args": {
            "red": 800_u16,
            "ir": 1200_u16
        }
    }));

    assert!(resp.ok, "bridge error: {:?}", resp.error);
    let result = resp.result.unwrap();
    assert_eq!(
        result["quality_flag"], "uncalibrated",
        "quality_flag must always be 'uncalibrated'"
    );
    let spo2_pct = result["spo2_pct"].as_f64().unwrap();
    assert!(
        (93.0..=94.0).contains(&spo2_pct),
        "expected SpO2 near 93.3%, got {spo2_pct}"
    );

    // Also verify that even a rejected (out-of-range) call returns quality_flag="uncalibrated"
    let resp2 = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "spo2-from-raw-2",
        "method": "biometrics.spo2_from_raw",
        "args": {
            "red": 2000_u16,
            "ir": 1000_u16
        }
    }));

    assert!(resp2.ok, "bridge error: {:?}", resp2.error);
    let result2 = resp2.result.unwrap();
    assert_eq!(
        result2["quality_flag"], "uncalibrated",
        "quality_flag must always be 'uncalibrated' even when rejected"
    );
    assert_eq!(
        result2["rejected"], true,
        "rejected flag should be true for out-of-range"
    );
}

// ---------------------------------------------------------------------------
// Test 4: skin_contact=0 rows stored but excluded from spo2 when contact=0
// (BIO-02 skin contact gate)
// ---------------------------------------------------------------------------

#[test]
fn test_v24_skin_contact_gate() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);

    // Insert one row with contact=0 and one with contact=1 (valid SpO2 range)
    let insert_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "insert-contact-gate-1",
        "method": "biometrics.insert_v24_batch",
        "args": {
            "database_path": db,
            "device_id": "device-gate-01",
            "spo2": [
                {"ts": 3000.0, "red": 800, "ir": 1200, "contact": 0},
                {"ts": 3001.0, "red": 810, "ir": 1210, "contact": 1}
            ],
            "skin_temp": [],
            "resp": [],
            "sig_quality": [
                {"ts": 3000.0, "quality": 5000, "contact": 0},
                {"ts": 3001.0, "quality": 8000, "contact": 1}
            ]
        }
    }));

    assert!(insert_resp.ok, "insert failed: {:?}", insert_resp.error);
    let result = insert_resp.result.unwrap();
    // Both rows should be inserted without rejection (contact=0 is stored, just gated downstream)
    let warnings = result["warnings"].as_array().unwrap();
    assert!(
        warnings.is_empty(),
        "no plausibility warnings expected for valid spo2 values, got: {:?}",
        warnings
    );

    // Query back — both rows should be present in the DB (storage does not filter by contact)
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-contact-gate-1",
        "method": "biometrics.v24_between",
        "args": {
            "database_path": db,
            "device_id": "device-gate-01",
            "start_ts": 0.0,
            "end_ts": 9999.0
        }
    }));

    assert!(query_resp.ok, "query failed: {:?}", query_resp.error);
    let qresult = query_resp.result.unwrap();

    let spo2 = qresult["spo2"].as_array().unwrap();
    assert_eq!(
        spo2.len(),
        2,
        "both contact=0 and contact=1 rows should be stored"
    );

    // contact=0 row is stored
    let contact0 = spo2.iter().find(|r| r["contact"] == 0);
    assert!(
        contact0.is_some(),
        "contact=0 row should be present in storage"
    );

    // contact=1 row is stored
    let contact1 = spo2.iter().find(|r| r["contact"] == 1);
    assert!(
        contact1.is_some(),
        "contact=1 row should be present in storage"
    );

    // sig_quality rows — both stored
    let sig_quality = qresult["sig_quality"].as_array().unwrap();
    assert_eq!(
        sig_quality.len(),
        2,
        "both sig_quality rows should be stored"
    );
}
