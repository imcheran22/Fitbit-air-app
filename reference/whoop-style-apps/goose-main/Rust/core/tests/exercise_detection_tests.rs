// Integration tests for the exercise detection bridge methods:
//   exercise.detect_sessions
//   exercise.sessions_between
//
// All tests use a temporary SQLite database via tempfile::tempdir().
// Tests exercise the full bridge path: JSON request → dispatch → algorithm → store → JSON response.

use goose_core::bridge::{BridgeResponse, handle_bridge_request_json};

fn request(value: serde_json::Value) -> BridgeResponse {
    serde_json::from_str(&handle_bridge_request_json(&value.to_string())).unwrap()
}

fn db_path(tempdir: &tempfile::TempDir) -> String {
    tempdir.path().join("goose.sqlite").display().to_string()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Build a synthetic HR sample at 1 Hz with bpm=140 starting at ts_start.
/// For resting_hr=50.0 and max_hr=180.0:
///   hrmax effective = max(180, tanaka(30)=187) = 187
///   hrr_pct = (140 - 50) / (187 - 50) * 100 = 90/137 * 100 ≈ 65.7%
///   65.7% >= 50% → zone 2+, passes intensity gate
///   140 > 50 + 30 = 80 → passes HR margin gate
fn build_hr_samples(ts_start: f64, count: usize, bpm: u64) -> serde_json::Value {
    let samples: Vec<serde_json::Value> = (0..count)
        .map(|i| serde_json::json!({ "ts": ts_start + i as f64, "bpm": bpm }))
        .collect();
    serde_json::Value::Array(samples)
}

/// Build gravity rows with active motion (magnitude well above MOTION_THRESHOLD=0.20).
/// x=1.2, y=0.0, z=1.0 → mag = sqrt(1.2^2 + 0 + 1.0^2) - 1.0 = sqrt(2.44) - 1.0 ≈ 0.562
/// After smoothing (rolling mean over all same-magnitude points) ≈ 0.562 > 0.20 ✓
fn build_gravity_rows(ts_start: f64, count: usize, device_id: &str) -> serde_json::Value {
    let rows: Vec<serde_json::Value> = (0..count)
        .map(|i| {
            serde_json::json!({
                "device_id": device_id,
                "ts": ts_start + i as f64,
                "x": 1.2,
                "y": 0.0,
                "z": 1.0
            })
        })
        .collect();
    serde_json::Value::Array(rows)
}

/// Profile that gives definitive zone 2+ sessions:
///   resting_hr=50, max_hr=180 (tanaka(30)=187 > 180, so effective hrmax=187)
///   At bpm=140: HRR% ≈ 65.7% → firmly zone 3, passes Z2+ gate
fn active_profile() -> serde_json::Value {
    serde_json::json!({
        "resting_hr": 50.0,
        "max_hr": 180.0,
        "age": 30,
        "sex": "male",
        "weight_kg": 75.0,
        "height_cm": 175.0,
        "daily_hr_p10": null
    })
}

// ---------------------------------------------------------------------------
// Test 1: Full roundtrip — detect + persist + query
// ---------------------------------------------------------------------------

#[test]
fn test_detect_sessions_roundtrip() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);
    let device_id = "device-exercise-01";

    // 15 minutes at 1 Hz = 900 samples, bpm=140, motion above threshold
    let hr = build_hr_samples(0.0, 900, 140);
    let gravity = build_gravity_rows(0.0, 900, device_id);

    let detect_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "detect-01",
        "method": "exercise.detect_sessions",
        "args": {
            "database_path": db,
            "device_id": device_id,
            "hr_samples": hr,
            "gravity_rows": gravity,
            "profile": active_profile()
        }
    }));

    assert!(detect_resp.ok, "detect failed: {:?}", detect_resp.error);
    let result = detect_resp.result.unwrap();
    let detected = result["sessions_detected"].as_u64().unwrap();
    assert!(
        detected >= 1,
        "expected at least 1 session detected, got {detected}"
    );
    let inserted = result["sessions_inserted"].as_u64().unwrap();
    assert!(
        inserted >= 1,
        "expected at least 1 session inserted, got {inserted}"
    );
    let warnings = result["warnings"].as_array().unwrap();
    assert!(warnings.is_empty(), "unexpected warnings: {:?}", warnings);

    // Query back via exercise.sessions_between
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-01",
        "method": "exercise.sessions_between",
        "args": {
            "database_path": db,
            "device_id": device_id,
            "ts_start": 0.0,
            "ts_end": 1000.0
        }
    }));

    assert!(
        query_resp.ok,
        "sessions_between failed: {:?}",
        query_resp.error
    );
    let qresult = query_resp.result.unwrap();
    let sessions = qresult["sessions"].as_array().unwrap();
    assert!(
        sessions.len() >= 1,
        "expected at least 1 session in query result, got {}",
        sessions.len()
    );
    // Verify session fields are present
    let sess = &sessions[0];
    assert!(
        sess["start_ts"].as_f64().is_some(),
        "start_ts field missing"
    );
    assert!(sess["end_ts"].as_f64().is_some(), "end_ts field missing");
    assert!(
        sess["duration_s"].as_f64().is_some(),
        "duration_s field missing"
    );
    assert!(sess["avg_hr"].as_f64().is_some(), "avg_hr field missing");
}

// ---------------------------------------------------------------------------
// Test 2: Short bout (8 min) below duration threshold — no sessions produced
// ---------------------------------------------------------------------------

#[test]
fn test_detect_sessions_below_duration_threshold() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);
    let device_id = "device-exercise-02";

    // 8 minutes at 1 Hz = 480 samples — below MIN_EXERCISE_MIN=10 min
    let hr = build_hr_samples(0.0, 480, 140);
    let gravity = build_gravity_rows(0.0, 480, device_id);

    let detect_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "detect-short-01",
        "method": "exercise.detect_sessions",
        "args": {
            "database_path": db,
            "device_id": device_id,
            "hr_samples": hr,
            "gravity_rows": gravity,
            "profile": active_profile()
        }
    }));

    assert!(detect_resp.ok, "detect failed: {:?}", detect_resp.error);
    let result = detect_resp.result.unwrap();
    let detected = result["sessions_detected"].as_u64().unwrap();
    assert_eq!(
        detected, 0,
        "8-min bout should be rejected by duration filter (< MIN_EXERCISE_MIN=10), got {detected}"
    );
    let inserted = result["sessions_inserted"].as_u64().unwrap();
    assert_eq!(inserted, 0, "no sessions should be inserted");
}

// ---------------------------------------------------------------------------
// Test 3: Gap merge — two 6-min windows with ~41 s gap → merged into one session
// ---------------------------------------------------------------------------

#[test]
fn test_detect_sessions_gap_merge() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);
    let device_id = "device-exercise-03";

    // Window A: ts 0..=359 (6 min)
    // Gap: ts 360..=400 (41 s, < MERGE_GAP_S=60 s)
    // Window B: ts 401..=760 (6 min)
    // Total active duration: 360 + 360 = 720 samples spanning 760 s
    // After merge: start=0, end=760, duration_s=760 > MIN_EXERCISE_MIN*60=600 ✓

    let mut hr_samples: Vec<serde_json::Value> = Vec::new();
    let mut grav_rows: Vec<serde_json::Value> = Vec::new();

    // Window A
    for i in 0i64..=359 {
        hr_samples.push(serde_json::json!({ "ts": i as f64, "bpm": 140 }));
        grav_rows.push(serde_json::json!({
            "device_id": device_id,
            "ts": i as f64,
            "x": 1.2, "y": 0.0, "z": 1.0
        }));
    }
    // Gap: no data at ts 360..=400 (41 s gap — within MERGE_GAP_S=60)

    // Window B: ts 401..=760
    for i in 401i64..=760 {
        hr_samples.push(serde_json::json!({ "ts": i as f64, "bpm": 140 }));
        grav_rows.push(serde_json::json!({
            "device_id": device_id,
            "ts": i as f64,
            "x": 1.2, "y": 0.0, "z": 1.0
        }));
    }

    let detect_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "detect-gap-01",
        "method": "exercise.detect_sessions",
        "args": {
            "database_path": db,
            "device_id": device_id,
            "hr_samples": hr_samples,
            "gravity_rows": grav_rows,
            "profile": active_profile()
        }
    }));

    assert!(detect_resp.ok, "detect failed: {:?}", detect_resp.error);
    let result = detect_resp.result.unwrap();
    let detected = result["sessions_detected"].as_u64().unwrap();
    assert_eq!(
        detected, 1,
        "two 6-min windows with 41 s gap should merge into 1 session, got {detected}"
    );

    // Verify inserted session has correct duration
    let inserted = result["sessions_inserted"].as_u64().unwrap();
    assert_eq!(inserted, 1, "merged session should be inserted");

    // Query and check duration
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-gap-01",
        "method": "exercise.sessions_between",
        "args": {
            "database_path": db,
            "device_id": device_id,
            "ts_start": 0.0,
            "ts_end": 2000.0
        }
    }));
    assert!(query_resp.ok, "query failed: {:?}", query_resp.error);
    let sessions = query_resp.result.unwrap()["sessions"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(sessions.len(), 1, "expected 1 merged session from query");
    let duration_s = sessions[0]["duration_s"].as_f64().unwrap();
    assert!(
        duration_s >= 700.0,
        "merged session duration should be >= 700s (covers both windows + gap), got {duration_s}"
    );
}

// ---------------------------------------------------------------------------
// Test 4: sessions_between empty range — no sessions in queried window
// ---------------------------------------------------------------------------

#[test]
fn test_sessions_between_empty_range() {
    let tempdir = tempfile::tempdir().unwrap();
    let db = db_path(&tempdir);
    let device_id = "device-exercise-04";

    // No detect call — DB is empty (schema created on first open via bridge)
    // We still need to init the DB; run a detect with empty data to open the store
    let init_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "init-04",
        "method": "exercise.detect_sessions",
        "args": {
            "database_path": db,
            "device_id": device_id,
            "hr_samples": [],
            "gravity_rows": [],
            "profile": active_profile()
        }
    }));
    assert!(init_resp.ok, "init detect failed: {:?}", init_resp.error);

    // Query in a time range far outside any data
    let query_resp = request(serde_json::json!({
        "schema": "goose.bridge.request.v1",
        "request_id": "query-empty-04",
        "method": "exercise.sessions_between",
        "args": {
            "database_path": db,
            "device_id": device_id,
            "ts_start": 9000.0,
            "ts_end": 9100.0
        }
    }));

    assert!(
        query_resp.ok,
        "sessions_between failed: {:?}",
        query_resp.error
    );
    let sessions = query_resp.result.unwrap()["sessions"]
        .as_array()
        .unwrap()
        .clone();
    assert_eq!(
        sessions.len(),
        0,
        "expected empty sessions array for range outside any data, got {}",
        sessions.len()
    );
}
