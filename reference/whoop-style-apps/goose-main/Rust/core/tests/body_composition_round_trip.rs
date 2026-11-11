// Integration tests for body_composition store methods (BODY-01).
// These tests call the store layer directly and cover:
//   - upsert basic round-trip
//   - upsert replace (same source+date updates existing row)
//   - history_between date range filtering across sources
//   - history_between sort order ascending (D-01)

use goose_core::store::{BodyCompositionRow, GooseStore};

fn open_in_memory() -> GooseStore {
    GooseStore::open_in_memory().expect("open in-memory store")
}

// ---------------------------------------------------------------------------
// Test 1: upsert a single row and read it back
// ---------------------------------------------------------------------------

#[test]
fn body_composition_upsert() {
    let store = open_in_memory();

    store
        .upsert_body_composition(
            "2026-06-01",
            "manual",
            Some(80.0),
            Some(23.5),
            Some(18.0),
            Some(65.0),
            Some(60.0),
        )
        .expect("upsert_body_composition failed");

    let rows = store
        .body_composition_history_between("2026-06-01", "2026-06-01")
        .expect("body_composition_history_between failed");

    assert_eq!(rows.len(), 1, "expected 1 row");
    let r = &rows[0];
    assert_eq!(r.date, "2026-06-01");
    assert_eq!(r.source, "manual");
    assert_eq!(r.weight_kg, Some(80.0));
    assert_eq!(r.bmi, Some(23.5));
    assert_eq!(r.body_fat_pct, Some(18.0));
    assert_eq!(r.muscle_mass_kg, Some(65.0));
    assert_eq!(r.water_pct, Some(60.0));
}

// ---------------------------------------------------------------------------
// Test 2: upsert same (source, date) twice — second write must replace
// ---------------------------------------------------------------------------

#[test]
fn body_composition_upsert_replace() {
    let store = open_in_memory();

    store
        .upsert_body_composition("2026-06-01", "manual", Some(80.0), None, None, None, None)
        .expect("first upsert failed");

    store
        .upsert_body_composition("2026-06-01", "manual", Some(81.0), None, None, None, None)
        .expect("second upsert failed");

    let rows = store
        .body_composition_history_between("2026-06-01", "2026-06-01")
        .expect("history_between failed");

    assert_eq!(
        rows.len(),
        1,
        "INSERT OR REPLACE must produce exactly 1 row"
    );
    assert_eq!(
        rows[0].weight_kg,
        Some(81.0),
        "weight_kg must reflect the second upsert"
    );
}

// ---------------------------------------------------------------------------
// Test 3: history_between returns all sources; narrower range filters correctly
// ---------------------------------------------------------------------------

#[test]
fn body_composition_history_between() {
    let store = open_in_memory();

    // Three rows across 2 sources and 3 dates
    store
        .upsert_body_composition("2026-06-01", "manual", Some(80.0), None, None, None, None)
        .expect("upsert row 1 failed");
    store
        .upsert_body_composition(
            "2026-06-03",
            "healthkit",
            None,
            Some(24.0),
            None,
            None,
            None,
        )
        .expect("upsert row 2 failed");
    store
        .upsert_body_composition(
            "2026-06-05",
            "scale",
            Some(79.5),
            None,
            Some(17.8),
            None,
            None,
        )
        .expect("upsert row 3 failed");

    // Wide range: all 3 rows returned across all sources (D-01)
    let all = store
        .body_composition_history_between("2026-06-01", "2026-06-05")
        .expect("wide range query failed");
    assert_eq!(all.len(), 3, "expected 3 rows in wide range");

    let sources: Vec<&str> = all.iter().map(|r| r.source.as_str()).collect();
    assert!(sources.contains(&"manual"), "manual source must be present");
    assert!(
        sources.contains(&"healthkit"),
        "healthkit source must be present"
    );
    assert!(sources.contains(&"scale"), "scale source must be present");

    // Narrow range: only the middle row
    let narrow = store
        .body_composition_history_between("2026-06-02", "2026-06-04")
        .expect("narrow range query failed");
    assert_eq!(narrow.len(), 1, "expected 1 row in narrow range");
    assert_eq!(narrow[0].date, "2026-06-03");
    assert_eq!(narrow[0].source, "healthkit");
}

// ---------------------------------------------------------------------------
// Test 4: history_between returns rows sorted by date ascending (D-01)
// ---------------------------------------------------------------------------

#[test]
fn body_composition_history_sorted() {
    let store = open_in_memory();

    // Insert out of date order
    store
        .upsert_body_composition("2026-06-10", "manual", Some(82.0), None, None, None, None)
        .expect("upsert row A failed");
    store
        .upsert_body_composition("2026-06-05", "manual", Some(81.0), None, None, None, None)
        .expect("upsert row B failed");
    store
        .upsert_body_composition(
            "2026-06-08",
            "healthkit",
            None,
            None,
            None,
            Some(66.0),
            None,
        )
        .expect("upsert row C failed");

    let rows = store
        .body_composition_history_between("2026-06-01", "2026-06-30")
        .expect("history_between failed");

    assert_eq!(rows.len(), 3, "expected 3 rows");
    assert!(
        rows[0].date <= rows[1].date && rows[1].date <= rows[2].date,
        "rows must be sorted by date ascending (D-01): {:?}",
        rows.iter().map(|r| &r.date).collect::<Vec<_>>()
    );
    assert_eq!(rows[0].date, "2026-06-05");
    assert_eq!(rows[1].date, "2026-06-08");
    assert_eq!(rows[2].date, "2026-06-10");
}
