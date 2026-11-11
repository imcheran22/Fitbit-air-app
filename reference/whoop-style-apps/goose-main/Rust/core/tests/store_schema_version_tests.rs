// Nyquist validation test for ARCH-02: SC2
// Requirement: open_existing_current() returns Err when the SQLite user_version
// does not match CURRENT_SCHEMA_VERSION. This is the runtime schema guard introduced
// in the Phase 87 store.rs split.

use rusqlite::Connection;
use tempfile::NamedTempFile;

use goose_core::store::{CURRENT_SCHEMA_VERSION, GooseStore};

/// A database whose user_version is deliberately set to CURRENT_SCHEMA_VERSION - 1
/// must be rejected by open_existing_current().
#[test]
fn open_existing_current_rejects_stale_schema_version() {
    let tmp = NamedTempFile::new().expect("temp file");
    let path = tmp.path();

    // Write a SQLite file with an outdated user_version.
    let stale_version = CURRENT_SCHEMA_VERSION - 1;
    {
        let conn = Connection::open(path).expect("create db");
        conn.execute_batch(&format!("PRAGMA user_version = {stale_version};"))
            .expect("set stale user_version");
    }

    let result = GooseStore::open_existing_current(path);

    assert!(
        result.is_err(),
        "open_existing_current must return Err for schema version {stale_version} \
         (current is {CURRENT_SCHEMA_VERSION}), but it returned Ok"
    );

    let err_msg = format!("{}", result.unwrap_err());
    assert!(
        err_msg.contains("not current") || err_msg.contains("schema"),
        "error message should mention the version mismatch; got: {err_msg}"
    );
}

/// A database whose user_version is CURRENT_SCHEMA_VERSION + 1 (future schema)
/// must also be rejected.
#[test]
fn open_existing_current_rejects_future_schema_version() {
    let tmp = NamedTempFile::new().expect("temp file");
    let path = tmp.path();

    let future_version = CURRENT_SCHEMA_VERSION + 1;
    {
        let conn = Connection::open(path).expect("create db");
        conn.execute_batch(&format!("PRAGMA user_version = {future_version};"))
            .expect("set future user_version");
    }

    let result = GooseStore::open_existing_current(path);

    assert!(
        result.is_err(),
        "open_existing_current must return Err for schema version {future_version} \
         (current is {CURRENT_SCHEMA_VERSION}), but it returned Ok"
    );
}
