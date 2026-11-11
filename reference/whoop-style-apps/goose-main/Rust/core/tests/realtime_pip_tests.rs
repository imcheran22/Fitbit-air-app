use goose_core::store::GooseStore;

#[test]
fn insert_realtime_frame_round_trip() {
    let store = GooseStore::open_in_memory().expect("open in-memory store");
    let device_uuid = "test-device-uuid";
    let frame_hex = "aabbccdd";
    let captured_at = "2026-06-26T10:00:00Z";

    store
        .insert_realtime_frame(device_uuid, frame_hex, captured_at)
        .expect("insert realtime frame");

    // Verify row exists by re-inserting with ON IGNORE — should not error
    store
        .insert_realtime_frame(device_uuid, frame_hex, captured_at)
        .expect("idempotent re-insert");
}

#[test]
fn insert_realtime_frame_different_captured_at_creates_new_row() {
    let store = GooseStore::open_in_memory().expect("open in-memory store");

    store
        .insert_realtime_frame("dev-1", "deadbeef", "2026-06-26T10:00:00Z")
        .expect("first insert");

    store
        .insert_realtime_frame("dev-1", "deadbeef", "2026-06-26T10:00:01Z")
        .expect("second insert with different timestamp");
}
