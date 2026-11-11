# Deferred Items — Phase 83

## Pre-existing test failures (out of scope)

### export_tests failures
- `exports_sqlite_timeframe_to_jsonl_csv_and_sqlite_bundle` — asserts `sensor_sample_rows == 19` but gets `18`
- `raw_export_can_select_sensor_samples_only` — related count assertion failure

These failures were verified to exist on the base branch (before Plan 02 changes) by running `git stash` + test. Not caused by schema migration step 22. Left for a separate investigation.
