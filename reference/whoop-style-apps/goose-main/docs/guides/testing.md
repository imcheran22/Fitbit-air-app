<!-- generated-by: gsd-doc-writer -->
# Testing

Goose has three independent test surfaces: the **Rust core** (47 integration test files, runs on Linux and macOS), the **server stack** (pytest suite against FastAPI + TimescaleDB), and the **iOS app** (XCTest unit suite in `GooseSwiftTests/` with 16 test files and 69 test functions, plus 3 shared mock helpers, plus manual verification with a physical WHOOP device).

---

## Rust Core

### Test framework

Cargo's built-in test runner. Integration tests live in `Rust/core/tests/` (47 files). Unit tests are collocated with source modules in `Rust/core/src/`. The crate ships many binaries used by integration tests as CLI fixtures, including `goose-fixture-index`, `goose-parser-fixture-runner`, `goose-capture-import`, `goose-capture-sqlite-import`, `goose-local-health-validation-suite`, `goose-reference-algo-runner`, `goose-property-test-suite`, and others defined in `Rust/core/Cargo.toml`.

A `Rust/core/fixtures/` directory provides golden hex frames and synthetic capture data (under `fixtures/owned/` and `fixtures/synthetic/`) consumed by tests such as `fixture_tests.rs`, `capture_import_tests.rs`, and `protocol_tests.rs`.

Several integration tests (notably `reference_tests.rs` and `reference_runner_cli_tests.rs`) shell out to `python3` for the external reference adapters in `Rust/core/tools/reference/`. These adapters fall back to hand-derived values when optional science packages (neurokit2, pyHRV, pyactigraphy) are absent, so `python3` must be on `PATH` but a full Python environment is not required.

### Running tests

From the `Rust/core` directory:

```bash
# Full suite — all integration and unit tests (preferred form)
cargo test -p goose-core --locked

# Keep going on failure instead of stopping at the first error
cargo test -p goose-core --locked --no-fail-fast

# Library unit tests only (no integration test files)
cargo test --lib --locked

# A single integration test file
cargo test --test bridge_tests --locked

# A single test by name (substring match)
cargo test --locked bridge_returns_core_version_payload
```

Build all targets (library + binaries + tests) without running:

```bash
cargo build --all-targets --locked
```

### Integration test file reference

| File | What it covers |
|------|----------------|
| `bridge_tests.rs` | C FFI bridge contract; `goose_bridge_handle_json` / `goose_bridge_free_string` |
| `v24_biometric_bridge_tests.rs` | v24 biometric data through the bridge layer |
| `v24_biometric_protocol_tests.rs` | v24 BLE protocol parsing for biometric packets |
| `protocol_tests.rs` | WHOOP GATT protocol frame parsing |
| `heart_rate_gatt_protocol_tests.rs` | Heart rate GATT characteristic parsing |
| `command_tests.rs` | BLE command framing and validation |
| `exercise_detection_tests.rs` | Passive exercise session detection heuristics |
| `activity_candidates_tests.rs` | Activity candidate identification |
| `activity_identity_tests.rs` | Activity type identity resolution |
| `capture_correlation_tests.rs` | Frame capture correlation across sources |
| `capture_import_tests.rs` | Hex frame import pipeline |
| `capture_sanitize_tests.rs` | Frame sanitization before import |
| `fixture_tests.rs` | Golden-file regression across all fixture frames |
| `store_tests.rs` | SQLite persistence: schema, upsert, hypertable counts |
| `storage_check_tests.rs` | Database storage integrity checks |
| `metrics_tests.rs` | Metric computation pipeline end-to-end |
| `metric_features_tests.rs` | Feature extraction for metric inputs |
| `metric_readiness_tests.rs` | Metric input readiness gating |
| `reference_tests.rs` | Algorithm output vs. Python reference adapters |
| `algorithm_compare_tests.rs` | Cross-algorithm accuracy comparisons |
| `algo_benchmark_tests.rs` | Performance budget for algorithm runs |
| `perf_budget_tests.rs` | Latency and memory budgets |
| `calibration_tests.rs` | Per-user calibration pipeline |
| `energy_rollup_tests.rs` | Calorie and energy rollup computation |
| `sleep_validation_tests.rs` | Sleep window detection and staging validation |
| `health_sync_tests.rs` | Health data sync pipeline |
| `history_sync_tests.rs` | Historical sync import |
| `ios_healthkit_boundary_tests.rs` | HealthKit boundary conditions |
| `step_counter_tests.rs` | Step count accumulation |
| `step_motion_estimator_tests.rs` | Motion-based step estimation |
| `step_packet_discovery_tests.rs` | Step packet identification |
| `timeline_tests.rs` | Event timeline construction |
| `export_tests.rs` | Raw data export (zip + SHA-256 integrity) |
| `property_tests.rs` | Property-based correctness tests |
| `privacy_lint_tests.rs` | PII / privacy lint checks |
| `ui_coverage_tests.rs` | UI surface coverage audit |
| `debug_ws_tests.rs` | WebSocket debug server contract |
| `fake_ble_peripheral_tests.rs` | Simulated BLE peripheral for offline tests |
| `comment_invariants_tests.rs` | THREADING: and SAFETY: invariant comment presence audit |
| `tooling_inventory_tests.rs` | CLI tooling presence verification |
| `store_schema_version_tests.rs` | SQLite schema version assertions |
| `capture_arrival_plan_cli_tests.rs` | `goose-capture-arrival-plan` CLI output |
| `command_capture_plan_cli_tests.rs` | `goose-command-capture-plan` CLI output |
| `local_health_validation_suite_cli_tests.rs` | `goose-local-health-validation-suite` CLI |
| `metric_feature_report_cli_tests.rs` | `goose-metric-feature-report` CLI |
| `metric_input_readiness_cli_tests.rs` | `goose-metric-input-readiness` CLI |
| `reference_runner_cli_tests.rs` | `goose-reference-algo-runner` CLI |

### Writing new tests

- Integration tests go in `Rust/core/tests/` following the `<domain>_tests.rs` naming pattern (e.g., `store_tests.rs`, `protocol_tests.rs`).
- Unit tests go inside `src/<module>.rs` under a `#[cfg(test)]` block.
- Tests that exercise the C bridge use the two-symbol FFI pair: `goose_bridge_handle_json` / `goose_bridge_free_string`. See `tests/bridge_tests.rs` for the pattern.
- Tests requiring a real SQLite database use `tempfile::NamedTempFile` (already a dev dependency) to create a throwaway path.
- Hex frame fixtures go in `Rust/core/fixtures/`; owned device captures under `fixtures/owned/`, synthetic data under `fixtures/synthetic/`. Document additions in `fixtures/README.md`.

### Coverage

No coverage threshold is configured. CI runs `cargo build --lib` and `cargo test --lib` as blocking gates (see `rust-core.yml`). The full integration test suite (`cargo test -p goose-core --locked`) runs locally but is not part of the CI blocking check.

---

## Server (FastAPI + TimescaleDB)

### Test framework

pytest >= 9.0 with httpx >= 0.28 as the FastAPI `TestClient` transport. Test files are in `server/ingest/tests/`. Install test dependencies separately from the production image:

```bash
cd server/ingest
pip install -r requirements-dev.txt   # includes -r requirements.txt
```

`requirements-dev.txt` adds `pytest>=9.0.3` and `httpx>=0.28.1` on top of the production stack.

### Running tests

From `server/ingest`:

```bash
# Full suite
pytest tests/

# A single file
pytest tests/test_ingest_decoded_api.py

# A single test by name
pytest tests/test_store.py::test_upsert_hr_sample -v

# Skip tests that need Docker (unit-only run)
pytest tests/ -m "not docker"
```

### Integration tests and Docker

Tests that exercise the real TimescaleDB schema (test files such as `test_e2e.py`, `test_ingest_decoded_api.py`, `test_read_api.py`, `test_store.py`) use the `timescale_dsn` and `clean_db` fixtures defined in `tests/conftest.py`. These fixtures:

1. Pull and start `timescale/timescaledb:2.17.2-pg16` in a throwaway container.
2. Apply `server/db/init.sql` to create the schema.
3. Truncate all data tables before each test for isolation.
4. Remove the container on teardown.

Tests that require Docker are decorated with `@requires_docker` and are skipped automatically if `docker` is not on `PATH` or `docker info` returns a non-zero exit code. You do not need to start the server manually — `TestClient` runs the FastAPI app in-process.

Docker must be running for the integration suite:

```bash
docker info   # verify Docker daemon is reachable
pytest tests/ # integration tests self-manage the TimescaleDB container
```

### Test file reference

| File | What it covers |
|------|---------------|
| `test_ingest_decoded_api.py` | `/v1/ingest-decoded` endpoint contract |
| `test_ingest_api.py` | General ingest endpoint contract including auth and archive-only mode |
| `test_ingest_frames_api.py` | `POST /v1/ingest-frames` round-trip, auth, and idempotency (requires Docker) |
| `test_read_api.py` | Read endpoints, pagination, filtering |
| `test_read.py` | Lower-level read helpers: device listing, stream queries, downsampling |
| `test_ingest_pipeline.py` | Full ingest pipeline including stream routing |
| `test_e2e.py` | End-to-end: decode → ingest → compute → read → idempotency |
| `test_store.py` | Database upsert and hypertable row counts |
| `test_daily.py`, `test_daily_alg.py` | `/v1/compute-daily` and derived metrics |
| `test_sleep.py`, `test_recovery.py`, `test_strain.py` | Metric-specific endpoint responses |
| `test_hrv.py`, `test_baselines.py`, `test_calories_rmr.py` | Algorithm accuracy checks |
| `test_validation.py` | Schema validation and error response shapes |
| `test_archive.py` | Raw frame archive storage and retrieval |
| `test_units.py` | Unit-level helpers (no Docker required) |
| `test_activity.py`, `test_exercise.py` | Activity and exercise session endpoints |
| `test_whoop_api.py` | WHOOP OAuth client: offline mock transport, token refresh lifecycle |
| `test_profile_calories_workouts.py` | Profile storage, `/v1/profile`, and calorie estimation for bouts |
| `../client/test_uploader.py` | `server/client/uploader.py` frame loading and batching logic |

### Writing new tests

- Place new files in `server/ingest/tests/` using the `test_<area>.py` naming convention.
- Unit tests (no DB needed) can run without the `clean_db` fixture.
- Integration tests that touch TimescaleDB must use the `client` fixture (which calls `clean_db`) so the container is set up and data is truncated before each test.
- Set required environment variables via `monkeypatch.setenv` — do not rely on a real `.env` file in tests.
- Synthetic fixture data lives in `server/ingest/tests/fixtures/`; the `hist_biometric.bin` binary is a 762-record synthetic capture used by `test_e2e.py`.

---

## iOS App

### Test framework

XCTest. The `GooseSwiftTests` unit test target is registered in `GooseSwift.xcodeproj` (product type `com.apple.product-type.bundle.unit-test`). Test files live in `GooseSwiftTests/` — 16 test files and 3 shared mock helpers, 69 test functions as of the current revision.

### Running tests

From Xcode: select the `GooseSwift` scheme, choose a simulator destination, and press **Cmd-U** (Product > Test).

From the command line:

```bash
xcodebuild test \
  -project GooseSwift.xcodeproj \
  -scheme GooseSwift \
  -destination 'platform=iOS Simulator,name=iPhone 16' \
  -derivedDataPath /tmp/goose-swift-deriveddata
```

### Test file reference

| File | What it covers |
|------|----------------|
| `GooseBLETypesTests.swift` | GATT generation derivation from service UUIDs; connection state helpers |
| `WearableDescriptorTests.swift` | `WearableDescriptor` command/notification UUID matching for Gen4 and Gen5 |
| `GooseUploadServiceTests.swift` | `GooseUploadService.buildUploadPayload` — generation field mapping, device-class presence |
| `HRMonitorStateTests.swift` | HR monitor state transitions |
| `CoachProviderTests.swift` | `CoachProvider` protocol shape; all-providers registry coverage |
| `CoachProviderRegistryTests.swift` | `CoachProviderRegistry` provider enumeration and lookup |
| `ClaudeProviderTests.swift` | Claude provider configuration and authentication state |
| `GeminiProviderTests.swift` | Gemini provider configuration and authentication state |
| `CustomEndpointProviderTests.swift` | Custom endpoint provider URL validation |
| `CoachKeychainTests.swift` | Coach OAuth token Keychain read/write lifecycle |
| `BaselineProgressTests.swift` | `BaselineProgress` pending/mapped/fallback states and `allReady` logic |
| `HistoricalRangeParsingTests.swift` | `RangePageState` parsing: empty ranges, wrapped page windows, short body |
| `TemperatureFormattingTests.swift` | Temperature unit conversion and delta formatting (°C / °F) |
| `TrendsFetchTests.swift` | `TrendsFetch` calls correct bridge metric series query |
| `WorkoutEntryTests.swift` | `WorkoutEntry` submit path and disabled-when-zero-duration guard |
| `WorkoutLiveActivityAttributesTests.swift` | `WorkoutLiveActivityAttributes.ContentState` encode/decode round-trip |
| `MockBLEClient.swift` | Test double for `GooseBLEManaging` (shared helper, no test functions) |
| `MockHealthStore.swift` | Test double for `HealthDataStoring`; delegates to `MockRustBridge` (shared helper) |
| `MockRustBridge.swift` | Test double for `GooseRustBridging`; records last method called (shared helper) |

### Writing new tests

- Place new files in `GooseSwiftTests/` using the `<TypeName>Tests.swift` naming convention.
- Each file contains a single `final class <TypeName>Tests: XCTestCase`.
- Use `@testable import GooseSwift` to access internal types.
- Tests that require `@MainActor` isolation annotate the class with `@MainActor`.
- Avoid network calls, BLE, and Rust bridge calls in unit tests — use dependency injection or pure-function entry points.

### Build verification

The minimum check before a PR is a clean Xcode build for the target destination:

```bash
# Simulator
xcodebuild \
  -project GooseSwift.xcodeproj \
  -scheme GooseSwift \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath /tmp/goose-swift-deriveddata \
  build

# Physical device
xcodebuild \
  -project GooseSwift.xcodeproj \
  -scheme GooseSwift \
  -configuration Debug \
  -destination 'platform=iOS,id=<device-id>' \
  -derivedDataPath /tmp/goose-swift-deriveddata-device \
  -allowProvisioningUpdates \
  build
```

### Manual BLE and upload testing

Testing BLE capture and server upload requires a physical WHOOP device (5.0 or 4.0) and a physical iPhone running iOS 26.

**Device connection**

1. Build and install the app on a physical device (see README.md for `xcrun devicectl` commands).
2. Open the app and complete onboarding.
3. Navigate to the Home tab; tap **Scan** to start a CoreBluetooth scan.
4. Select your WHOOP device from the discovered list.
5. Verify the connection state indicator turns active and heart rate values appear in real time.

**BLE capture verification**

1. Navigate to **More > Debug** after connecting.
2. Confirm that live packet counts are incrementing.
3. Use **More > Capture** to start a capture session. Let it run for at least 60 seconds.
4. Verify the capture session status shows received frame counts.

**Server upload flow**

Prerequisites: the self-hosted server must be running (see `server/README.md`).

1. Configure the server URL and Bearer token in **More > Remote Server**.
   - URL example: `http://goose.local:8770` (use a hostname, not a bare IP address).
   - Token: the `GOOSE_API_KEY` value from your server `.env`.
   - Enable the **Upload** toggle.
2. With a WHOOP device connected, data should upload automatically after a sync.
3. Verify delivery by checking the server health and querying a read endpoint:

   ```bash
   curl -s localhost:8770/healthz
   # → {"status":"ok"}

   curl -s -H "Authorization: Bearer <your-key>" \
     "localhost:8770/v1/daily?device_id=<device-id>&limit=1"
   ```

4. Check the More > Remote Server status indicator in the app for upload confirmation or error messages.

**Empty and error state verification**

- Check each metric view (Sleep, Recovery, Strain, Stress, Cardio, Energy) in both populated and empty states.
- Verify that metric rows and trend sheets show the data source label when available.
- Disconnect the WHOOP device and confirm the UI gracefully shows unavailable or stale states rather than crashing.

---

## CI

Eight workflow files cover automated test and quality gates: `rust-core.yml`, `swift-build.yml`, `server-ci.yml`, `zizmor.yml`, `security.yml`, `codeql.yml`, `cargo-audit.yml`, and `android-core.yml`. The first four produce the named gate jobs that must pass before a PR can merge. The remaining workflows are either advisory, scheduled-only, or release-triggered.

The four required status checks are: **rust/gate**, **swift/gate**, **server/gate**, and **zizmor/gate**.

### `rust-core.yml` — Format, build, test (MSRV matrix)

Runs on `ubuntu-latest` and `macos-15` against Rust 1.96 (MSRV). Triggered by pushes to `main` that touch `Rust/**`, on all PRs, and on `workflow_dispatch`.

Jobs:
- **fmt** — `cargo fmt --all -- --check` (blocking)
- **build-test** (matrix: ubuntu-latest, macos-15):
  1. Install Rust 1.96 via rustup.
  2. `cargo build --lib --verbose`
  3. `cargo test --lib --verbose`
- **clippy** — `cargo clippy --lib --no-deps -- -D warnings` (advisory, `continue-on-error: true`)
- **rust-gate** — aggregates fmt + build-test results; fails if either job fails or is cancelled

### `security.yml` — Dependency audit and filesystem scan

Runs on a weekly schedule (Mondays, 07:00 UTC) and on pushes/PRs that touch dependency manifests (`Cargo.toml`, `Cargo.lock`, `Dockerfile`, `requirements.txt`).

- **cargo-audit** — audits `Rust/core/Cargo.lock` against the RustSec advisory database using `cargo audit --deny warnings`; fails on any known-vulnerable dependency.
- **trivy-fs** — filesystem scan for vulnerable dependencies, secrets, and misconfigurations across Rust, Python, and workflow files; fails on HIGH or CRITICAL findings.

### `cargo-audit.yml` — Rust dependency advisory check (PR-integrated)

A separate Rust advisory workflow that runs on pushes and PRs touching `Cargo.lock` or `Cargo.toml`, plus a weekly schedule (Mondays, 06:17 UTC). Uses `rustsec/audit-check` to post advisory results directly as PR checks. This workflow is distinct from the `cargo-audit` job in `security.yml`.

### `codeql.yml` — Static analysis

Runs on every push and PR to `main`, and weekly (Mondays, 08:00 UTC).

- Covers Swift (`GooseSwift/`) and Python (`server/`) source.
- Swift job runs on `macos-26` (Xcode 26.4.1, iOS 26.x SDKs) to match the project's `IPHONEOS_DEPLOYMENT_TARGET = 26.0`.
- Rust is excluded from CodeQL; advisories are handled by `cargo-audit`.

The iOS XCTest suite (`GooseSwiftTests`) is not run in CI. Running `xcodebuild test` requires a booted iOS simulator, which is not provisioned in the GitHub Actions environment used by `swift-build.yml`. The `codeql.yml` workflow does perform static analysis of Swift source on `macos-26` (see above), but does not execute the unit tests.

### `swift-build.yml` — Swift compile check

Runs on `macos-15`. Triggered by pushes to `main` that touch `GooseSwift/**`, `GooseWorkoutLiveActivityExtension/**`, or `GooseSwift.xcodeproj/**`, on all PRs, and on `workflow_dispatch`.

Steps:
1. Select Xcode 26.3 (`xcode-select`).
2. Install stable Rust toolchain and the `aarch64-apple-ios-sim` target (needed by the Xcode build phase that cross-compiles the Rust core).
3. Cache `~/.cargo/registry`, `~/.cargo/git`, and `Rust/core/target`.
4. `xcodebuild … -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build` (blocking)
5. **swift-gate** — aggregates the build result; fails if the build step fails or is cancelled.

### `server-ci.yml` — Server pytest suite

Runs on `ubuntu-latest`. Triggered by pushes and PRs that touch `server/**`.

Steps:
1. Set up Python 3.12.
2. Install `server/packages/whoop-protocol` as a local editable package.
3. Install `server/ingest/requirements-dev.txt`.
4. Confirm the Docker daemon is reachable (`docker info`).
5. `pytest tests/ -v --tb=short` — all tests; the `conftest.py` fixtures self-manage the TimescaleDB container.
6. **server-gate** — aggregates the pytest result; fails if the job fails or is cancelled.

### `android-core.yml` — Android Rust core build (release-triggered)

Triggered on version tags (`v*`) and `workflow_dispatch`. Builds the Rust core for Android targets (`arm64-v8a`, `armeabi-v7a`, `x86_64`) using `cargo-ndk` and attaches the resulting `.tar.gz` archive to the GitHub release. Does not gate PRs.
