use goose_core::{GooseError, store::GooseStore};

/// SYNC-12: Verify insert_sync_telemetry persists a row that can be read back.
#[test]
fn sync_telemetry_round_trip() {
    let store = GooseStore::open_in_memory().expect("open in-memory store");

    // Insert one telemetry row for a completed HPS burst.
    store
        .insert_sync_telemetry(
            "sess-abc", // session_id
            0,          // burst_index
            4096,       // bytes_received
            320,        // duration_ms
            0,          // missing_packets
            0,          // sequence_gaps
            "ok",       // result
        )
        .expect("insert_sync_telemetry failed");

    // Query back using immediate_transaction (read-only path — no deadlock risk
    // because insert already released the lock before this call).
    let count: i64 = store
        .immediate_transaction(|conn| {
            conn.query_row(
                "SELECT COUNT(*) FROM sync_telemetry WHERE session_id = 'sess-abc'",
                [],
                |row| row.get(0),
            )
            .map_err(|e| GooseError::message(format!("COUNT query failed: {e}")))
        })
        .expect("immediate_transaction failed");

    assert_eq!(
        count, 1,
        "expected 1 sync_telemetry row for sess-abc, got {count}"
    );
}
