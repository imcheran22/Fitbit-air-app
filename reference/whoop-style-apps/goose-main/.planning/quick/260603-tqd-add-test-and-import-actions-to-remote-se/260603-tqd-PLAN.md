---
phase: quick
plan: 260603-tqd
type: execute
wave: 1
depends_on: []
files_modified:
  - GooseSwift/GooseAppModel.swift
  - GooseSwift/GooseAppModel+Upload.swift
  - GooseSwift/MoreRemoteServerViews.swift
  - Rust/core/src/bridge.rs
autonomous: true
requirements: []

must_haves:
  truths:
    - "Status section shows a 'Test Connection' button that reports reachability + auth validity inline"
    - "Status section shows an 'Import from Server' button, only visible when uploadIsActive"
    - "Test button hits /healthz then GET /v1/devices (auth-gated) and displays success or specific error inline"
    - "Import button fetches all 8 stream kinds for the active device over the last 7 days and writes them to local SQLite via a new upload.ingest_fetched_streams Rust bridge method"
    - "Import progress and completion are shown inline in the Status section"
    - "Both actions run on a background queue — @MainActor never blocks"
  artifacts:
    - path: "GooseSwift/GooseAppModel.swift"
      provides: "connectionTestResult, connectionTestRunning, importStatus, importRunning @Published vars"
    - path: "GooseSwift/GooseAppModel+Upload.swift"
      provides: "testServerConnection() and importFromServer() methods"
    - path: "GooseSwift/MoreRemoteServerViews.swift"
      provides: "Test Connection and Import from Server rows inside Section(Status)"
    - path: "Rust/core/src/bridge.rs"
      provides: "upload.ingest_fetched_streams bridge method that bulk-inserts fetched stream rows"
  key_links:
    - from: "MoreRemoteServerView"
      to: "GooseAppModel.testServerConnection()"
      via: "Button action on @MainActor model"
    - from: "GooseAppModel.importFromServer()"
      to: "upload.ingest_fetched_streams bridge method"
      via: "GooseRustBridge().request() on background DispatchQueue"
    - from: "import bridge method"
      to: "decoded_frames SQLite table"
      via: "store.insert_decoded_frame() — synthetic frame rows representing imported samples"
---

<objective>
Add Test Connection and Import from Server actions to the Remote Server settings screen
(More > Remote Server > Status section).

Purpose: Users need explicit verification that their API key is valid (not just background
/healthz reachability), and a way to pull historical data back to iOS after a device change
or data loss.

Output:
- Four new @Published properties on GooseAppModel
- Two new methods in GooseAppModel+Upload.swift (testServerConnection, importFromServer)
- Two new UI rows in MoreRemoteServerView's Status section
- One new Rust bridge method (upload.ingest_fetched_streams) that writes server-fetched stream
  rows into local SQLite as synthetic decoded frames
</objective>

<execution_context>
@/Users/francisco/Documents/goose/.planning/quick/260603-tqd-add-test-and-import-actions-to-remote-se/260603-tqd-PLAN.md
</execution_context>

<context>
@/Users/francisco/Documents/goose/GooseSwift/GooseAppModel.swift
@/Users/francisco/Documents/goose/GooseSwift/GooseAppModel+Upload.swift
@/Users/francisco/Documents/goose/GooseSwift/GooseUploadService.swift
@/Users/francisco/Documents/goose/GooseSwift/MoreRemoteServerViews.swift
@/Users/francisco/Documents/goose/GooseSwift/RemoteServerPersistence.swift
@/Users/francisco/Documents/goose/Rust/core/src/bridge.rs
@/Users/francisco/Documents/goose/Rust/core/src/store.rs
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Rust bridge method upload.ingest_fetched_streams</name>
  <files>Rust/core/src/bridge.rs</files>
  <action>
Add a new bridge method "upload.ingest_fetched_streams" to bridge.rs that writes
server-fetched stream rows back into local SQLite.

The method accepts these args (define a new Serde-deserializable struct IngestFetchedStreamsArgs):
  - database_path: String
  - device_id: String (UUID string of the device)
  - streams: serde_json::Value (object with keys hr, rr, events, battery, spo2, skin_temp, resp, gravity,
    each being an array of objects matching the server's GET /v1/streams/{kind} response —
    each row has at least a "ts" field as a float Unix timestamp, plus kind-specific fields like "bpm" for hr)

Implementation strategy: store each fetched row as a synthetic decoded frame via
store.insert_decoded_frame(). Build a minimal DecodedFrameInput per row:
  - frame_id: generate a deterministic UUID string from "import-\(device_id)-\(kind)-\(ts)" using SHA-256
    or simply generate via uuid crate if available; check Cargo.toml for uuid crate — if not present,
    derive a pseudo-unique ID as format!("imp-{}-{}-{:.0}", device_id, kind, ts)
  - evidence_id: use a static string "server_import"
  - device_type: "IMPORT"
  - raw_len, header_len, declared_len: 0
  - payload_hex: empty string ""
  - payload_crc_hex: empty string ""
  - header_crc_valid: true
  - payload_crc_valid: true
  - packet_type: 0
  - packet_type_name: kind (e.g. "hr", "rr")
  - sequence: 0
  - command_or_event: false
  - parsed_payload_json: serialize the original row dict back to a JSON string, wrapped in the
    same ParsedPayload shape the bridge uses. Since the import rows are pre-decoded (not raw BLE),
    use a simple wrapper: serde_json::json!({"ImportedSample": {"kind": kind, "ts": ts, "data": row}}).to_string()

For each of the 8 kinds, iterate the array in the JSON, extract each row, call
store.insert_decoded_frame(). Count successful inserts per kind.

Return a JSON object: {"inserted": {"hr": N, "rr": N, "events": N, ...}}.

Register the method in the dispatch match block alongside the other "upload.*" arm
("upload.ingest_fetched_streams" => ...), following the exact same pattern as
"upload.get_recent_decoded_streams" (request_args + bridge_fn + map to bridge_ok + unwrap_or bridge_error).

NOTE: If DecodedFrameInput fields are not all public or the struct requires builder pattern,
check store.rs insert_decoded_frame signature and adapt. The key constraint is that
insert_decoded_frame uses INSERT OR IGNORE so duplicate frame_ids are safe (idempotent).

Build and verify with: cargo build --manifest-path Rust/core/Cargo.toml 2>&1 | tail -20
  </action>
  <verify>
    <automated>cd /Users/francisco/Documents/goose && cargo build --manifest-path Rust/core/Cargo.toml 2>&1 | grep -E "error\[|warning\[|Finished|error:" | tail -20</automated>
  </verify>
  <done>
Rust/core/src/bridge.rs has a registered "upload.ingest_fetched_streams" method.
cargo build completes with no errors (warnings are acceptable).
  </done>
</task>

<task type="auto">
  <name>Task 2: Add @Published state and methods to GooseAppModel</name>
  <files>GooseSwift/GooseAppModel.swift, GooseSwift/GooseAppModel+Upload.swift</files>
  <action>
Step A — GooseAppModel.swift: In the @Published block (currently ending at line 57 with
lastSyncedCount), append four new published properties immediately after lastSyncedCount:
  @Published var connectionTestResult: String? = nil
  @Published var connectionTestRunning: Bool = false
  @Published var importStatus: String? = nil
  @Published var importRunning: Bool = false

Step B — GooseAppModel+Upload.swift: Append two new methods to the existing extension.
Do NOT modify any of the four existing methods (configureUploadService, triggerManualUpload,
triggerUpload, triggerHealthCheckIfNeeded).

--- testServerConnection() ---

Mark @MainActor. Read serverURL from UserDefaults key RemoteServerStorage.serverURL and
token from RemoteServerKeychain.loadToken(). If either is empty, set
connectionTestResult = "No server URL or token configured" and return immediately.

Set connectionTestRunning = true and connectionTestResult = nil.

Dispatch to DispatchQueue.global(qos: .utility). Use the semaphore pattern from
triggerHealthCheckIfNeeded (URLSession.shared.dataTask + DispatchSemaphore(value: 0)):

Step 1: GET serverURL + "/healthz" with timeoutInterval = 5.
  - On error or statusCode != 200: set result = "Server unreachable — " + (error?.localizedDescription ?? "HTTP \(code)")
    then dispatch to @MainActor: connectionTestResult = result, connectionTestRunning = false. Return.

Step 2: GET serverURL + "/v1/devices" with timeoutInterval = 8 and header
  "Authorization: Bearer \(token)".
  - HTTP 200: parse JSON as [[String: Any]]. Set result = "Connected — auth valid, \(array.count) device(s)"
  - HTTP 401: result = "Auth failed — API key rejected (401)"
  - HTTP 403: result = "Auth failed — forbidden (403)"
  - Network error or other code: result = "Server reachable but read failed — " + (error?.localizedDescription ?? "HTTP \(code)")

Dispatch result back: Task { @MainActor in self.connectionTestResult = result; self.connectionTestRunning = false }.

--- importFromServer() ---

Mark @MainActor. Read serverURL and token as above. If either empty, set
importStatus = "No server URL or token configured" and return.

Read deviceID: let deviceID = ble.activeDeviceIdentifier ?? UUID() — use the same pattern
as triggerManualUpload. If ble.activeDeviceIdentifier is nil, set
importStatus = "No active device — connect WHOOP first" and return.

Set importRunning = true, importStatus = "Connecting to server..."

Compute time range: let startTs = Int(Date().addingTimeInterval(-7 * 24 * 3600).timeIntervalSince1970)
and let endTs = Int(Date().timeIntervalSince1970).

Dispatch to DispatchQueue.global(qos: .utility).

Step 1: GET serverURL + "/v1/devices" (auth header, timeout 8s).
  - Parse JSON as [[String: Any]]. Find entry where ($0["id"] as? String)?.lowercased() == deviceID.uuidString.lowercased().
  - If not found, publish importStatus = "Device not found on server — upload some data first", importRunning = false. Return.

Step 2: Declare let kinds = ["hr", "rr", "events", "battery", "spo2", "skin_temp", "resp", "gravity"].
Declare var allStreams: [String: [[String: Any]]] = [:].

For each kind:
  Build URL: serverURL + "/v1/streams/\(kind)?device=\(deviceID.uuidString)&from=\(startTs)&to=\(endTs)&limit=50000"
  GET with auth header, timeout 30s.
  On success (200): parse JSON as [[String: Any]], store in allStreams[kind].
  On failure: log via OSLog (create a Logger(subsystem: "com.goose.swift", category: "import") locally)
    and continue (partial import is acceptable).
  After each kind, update importStatus on @MainActor:
    Task { @MainActor in self.importStatus = "Importing \(kind)... (\(rows.count) rows)" }

Step 3: Build the args dict for the Rust bridge call. The streams value must be JSON-serializable:
  convert allStreams to [String: Any] for JSONSerialization. Build args:
    ["database_path": databasePath, "device_id": deviceID.uuidString, "streams": streamsAsAny]
  where databasePath = HealthDataStore.defaultDatabasePath().

  Create let bridge = GooseRustBridge() (fresh instance per call — matches existing pattern).
  Call bridge.request(method: "upload.ingest_fetched_streams", args: args).
  On success: parse result["inserted"] as [String: Int], compute totalInserted = values.reduce(0, +).
    Set importStatus = "Import complete — \(totalInserted) records written to local DB"
  On error: let totalFetched = allStreams.values.map { $0.count }.reduce(0, +)
    Set importStatus = "Fetched \(totalFetched) rows — write failed: \(error.localizedDescription)"

  Set importRunning = false via Task { @MainActor in ... }.

Thread safety rules (same as existing code):
  - All URLSession calls use DispatchSemaphore pattern (dataTask + semaphore.wait()) — no async/await
  - GooseRustBridge() created inside the background dispatch block, used and discarded there
  - @MainActor state updates always via Task { @MainActor in ... }
  - HealthDataStore.defaultDatabasePath() is a static func — safe to call from any thread
  </action>
  <verify>
    <automated>cd /Users/francisco/Documents/goose && xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -E "^.*error:|BUILD SUCCEEDED|BUILD FAILED" | tail -20</automated>
  </verify>
  <done>
GooseAppModel.swift has the four new @Published properties.
GooseAppModel+Upload.swift has testServerConnection() and importFromServer() methods.
Xcode build succeeds with no errors.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add Test Connection and Import rows to MoreRemoteServerView</name>
  <files>GooseSwift/MoreRemoteServerViews.swift</files>
  <action>
In MoreRemoteServerView, inside the "if uploadIsActive { Section("Status") { ... } }" block,
add two new rows after the existing three rows (reachability label, "Last sync" LabeledContent,
"Batches pendentes" LabeledContent) and before the closing brace of the Section.

Row 4 — Test Connection:
Add an HStack containing a conditional ProgressView (when model.connectionTestRunning) and a
Button labelled "Testing..." when connectionTestRunning else "Test Connection". The button's
action calls model.testServerConnection(). Disable the button when model.connectionTestRunning.
Apply .buttonStyle(.bordered) and .controlSize(.small). Below the HStack, conditionally show
model.connectionTestResult as a Text with .font(.caption). Color the text .green when the result
string starts with "Connected", .red otherwise.

Row 5 — Import from Server:
Add an HStack containing a conditional ProgressView (when model.importRunning) and a Button
labelled "Importing..." when importRunning else "Import from Server". Action calls
model.importFromServer(). Disable when model.importRunning. Apply .buttonStyle(.bordered)
and .controlSize(.small). Below the HStack, conditionally show model.importStatus as a Text
with .font(.caption) and .foregroundStyle(.secondary).

Use 2-space indentation throughout. Add a brief comment before each HStack ("// Row 4: ..."
and "// Row 5: ...") matching the style of the existing row comments.

Do not change any other part of the file. The three preview blocks at the bottom remain untouched.
  </action>
  <verify>
    <automated>cd /Users/francisco/Documents/goose && xcodebuild -project GooseSwift.xcodeproj -scheme GooseSwift -destination 'platform=iOS Simulator,name=iPhone 16' build 2>&1 | grep -E "^.*error:|BUILD SUCCEEDED|BUILD FAILED" | tail -10</automated>
  </verify>
  <done>
MoreRemoteServerView Status section has Test Connection and Import from Server rows.
Both rows only appear when uploadIsActive. Build is clean with no errors.
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| iOS app -> self-hosted server | Bearer token in Authorization header; server validates it |
| Server JSON response -> iOS SQLite | Response dicts parsed and stored via Rust bridge |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-tqd-01 | Information Disclosure | Bearer token in URLRequest Authorization header | accept | Same exposure surface as the existing upload path; token already sent on every POST /v1/ingest-decoded |
| T-tqd-02 | Tampering | Server JSON response stored in local SQLite via bridge | mitigate | Bridge method iterates only the 8 known stream kind keys; arbitrary keys in the server JSON are ignored; each row is serialised as opaque JSON string (not interpolated into SQL) |
| T-tqd-03 | Denial of Service | Import fetches up to 50000 rows x 8 kinds | mitigate | All network I/O dispatched to DispatchQueue.global(qos:.utility) with 30s timeout per request; @MainActor never blocks; each kind's semaphore.wait() is bounded by the timeout |
| T-tqd-04 | Spoofing | TLS certificate on personal server | accept | User-configured endpoint; RemoteServerURLValidator accepts http:// for local servers; the user manages their own cert |
| T-tqd-SC | Tampering | No new npm/pip/cargo installs | accept | No new Cargo dependencies introduced; bridge method uses existing rusqlite + serde_json already in Cargo.toml |
</threat_model>

<verification>
1. cargo build Rust/core/Cargo.toml succeeds with no errors
2. xcodebuild GooseSwift.xcodeproj succeeds with no errors
3. More > Remote Server shows Test Connection and Import from Server buttons when URL + token are set and upload is enabled
4. Tapping Test Connection: spinner appears, then inline result (green "Connected — auth valid, N device(s)" or red error)
5. Tapping Import from Server: status updates per kind, ends with "Import complete — N records" or a clear error
6. Both buttons are disabled while their respective operation is running
7. With no URL/token configured, both methods set an inline error and return immediately
</verification>

<success_criteria>
- Rust bridge method upload.ingest_fetched_streams registered and cargo build clean
- GooseAppModel has connectionTestResult, connectionTestRunning, importStatus, importRunning
- testServerConnection() hits /healthz then /v1/devices and publishes result inline
- importFromServer() fetches 8 stream kinds for last 7 days, calls bridge, publishes row count
- MoreRemoteServerView shows both action rows inside the existing Status section
- Full Xcode build succeeds with no errors
</success_criteria>

<output>
Create .planning/quick/260603-tqd-add-test-and-import-actions-to-remote-se/260603-tqd-SUMMARY.md when done
</output>
