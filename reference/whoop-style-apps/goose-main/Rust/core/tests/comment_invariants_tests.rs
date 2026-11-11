// Phase 91 — COMM-02 / COMM-03 comment invariant tests.
// These tests assert that threading and algorithm bibliographic comments
// added in Phase 91 are present in the source files. They will fail
// if the comments are accidentally removed during refactoring.

use std::fs;

// ── helpers ──────────────────────────────────────────────────────────────────

fn count_occurrences(haystack: &str, needle: &str) -> usize {
    let mut count = 0;
    let mut start = 0;
    while let Some(pos) = haystack[start..].find(needle) {
        count += 1;
        start += pos + needle.len();
    }
    count
}

fn read_file(relative: &str) -> String {
    // Tests run with cwd = Rust/core (cargo test default).
    // The Swift files live two levels up at the project root.
    let manifest = env!("CARGO_MANIFEST_DIR");
    let root = std::path::Path::new(manifest)
        .parent() // Rust/
        .and_then(|p| p.parent()) // project root
        .expect("could not resolve project root");
    let path = root.join(relative);
    fs::read_to_string(&path).unwrap_or_else(|e| panic!("could not read {}: {}", path.display(), e))
}

// ── COMM-02: THREADING: comments in Swift files ───────────────────────────────

#[test]
fn comm_02_goose_rust_bridge_has_threading_comments() {
    let src = read_file("GooseSwift/GooseRustBridge.swift");
    let count = count_occurrences(&src, "// THREADING:");
    assert!(
        count >= 3,
        "GooseRustBridge.swift must have >= 3 '// THREADING:' comments (COMM-02), found {}",
        count
    );
}

#[test]
fn comm_02_capture_frame_write_queue_has_threading_comments() {
    let src = read_file("GooseSwift/CaptureFrameWriteQueue.swift");
    let count = count_occurrences(&src, "// THREADING:");
    assert!(
        count >= 2,
        "CaptureFrameWriteQueue.swift must have >= 2 '// THREADING:' comments (COMM-02), found {}",
        count
    );
}

#[test]
fn comm_02_overnight_sqlite_mirror_queue_has_threading_comment() {
    let src = read_file("GooseSwift/OvernightSQLiteMirrorQueue.swift");
    let count = count_occurrences(&src, "// THREADING:");
    assert!(
        count >= 1,
        "OvernightSQLiteMirrorQueue.swift must have >= 1 '// THREADING:' comment (COMM-02), found {}",
        count
    );
}

#[test]
fn comm_02_goose_app_model_has_threading_comments() {
    let src = read_file("GooseSwift/GooseAppModel.swift");
    let count = count_occurrences(&src, "// THREADING:");
    assert!(
        count >= 2,
        "GooseAppModel.swift must have >= 2 '// THREADING:' comments (COMM-02), found {}",
        count
    );
}

// Behavioural content checks: the comments must explain the key invariants,
// not just be present with the right prefix.

#[test]
fn comm_02_goose_rust_bridge_explains_blocking_ffi_and_main_actor() {
    let src = read_file("GooseSwift/GooseRustBridge.swift");
    assert!(
        src.contains("blocks"),
        "GooseRustBridge.swift THREADING comment must mention that the FFI call blocks (COMM-02)"
    );
    assert!(
        src.contains("@MainActor"),
        "GooseRustBridge.swift THREADING comment must mention @MainActor (COMM-02)"
    );
}

#[test]
fn comm_02_overnight_mirror_queue_explains_serial_queue_confinement() {
    let src = read_file("GooseSwift/OvernightSQLiteMirrorQueue.swift");
    assert!(
        src.contains("serial") || src.contains("Serial"),
        "OvernightSQLiteMirrorQueue.swift THREADING comment must mention serial queue confinement (COMM-02)"
    );
}

// ── COMM-03: ALGO: comments in Rust files ────────────────────────────────────

#[test]
fn comm_03_baselines_has_algo_comment() {
    let src = read_file("Rust/core/src/baselines.rs");
    let count = count_occurrences(&src, "// ALGO:");
    assert!(
        count >= 1,
        "baselines.rs must have >= 1 '// ALGO:' comment (COMM-03), found {}",
        count
    );
}

#[test]
fn comm_03_metrics_has_algo_comments() {
    let src = read_file("Rust/core/src/metrics.rs");
    let count = count_occurrences(&src, "// ALGO:");
    assert!(
        count >= 2,
        "metrics.rs must have >= 2 '// ALGO:' comments (COMM-03), found {}",
        count
    );
}

#[test]
fn comm_03_sleep_staging_has_algo_comment() {
    let src = read_file("Rust/core/src/sleep_staging.rs");
    let count = count_occurrences(&src, "// ALGO:");
    assert!(
        count >= 1,
        "sleep_staging.rs must have >= 1 '// ALGO:' comment (COMM-03), found {}",
        count
    );
}

// Behavioural content checks: the comments must cite the actual literature.

#[test]
fn comm_03_baselines_algo_comment_cites_ewma_derivation() {
    let src = read_file("Rust/core/src/baselines.rs");
    // The comment must contain the half-life formula or the alpha derivation.
    assert!(
        src.contains("0.5") || src.contains("half-life") || src.contains("half_life"),
        "baselines.rs ALGO comment must reference the EWMA half-life derivation (COMM-03)"
    );
}

#[test]
fn comm_03_metrics_algo_comment_cites_banister_b_constants() {
    let src = read_file("Rust/core/src/metrics.rs");
    assert!(
        src.contains("Banister") || src.contains("banister"),
        "metrics.rs ALGO comment must cite Banister for the b-constant (1.92/1.67) (COMM-03)"
    );
}

#[test]
fn comm_03_sleep_staging_algo_comment_cites_cole_1992() {
    let src = read_file("Rust/core/src/sleep_staging.rs");
    assert!(
        src.contains("Cole") && (src.contains("1992") || src.contains("Sleep")),
        "sleep_staging.rs ALGO comment must cite Cole 1992 for the scale factor (COMM-03)"
    );
}
