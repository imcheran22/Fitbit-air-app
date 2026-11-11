<!-- generated-by: gsd-doc-writer -->
# Configuration

Goose has two independently configurable components: the **iOS app** and the **server stack** (FastAPI + TimescaleDB). Neither component requires the other to be running — you can use the iOS app without a server, or run the server standalone.

---

## iOS App

All iOS configuration is done at runtime through the app UI or, for developer builds, through Xcode launch arguments and environment variables. There is no build-time configuration file that affects runtime behaviour.

### Where to find the settings

**More > Remote Server** (navigates to `MoreRemoteServerView`)

### Configurable fields

| Field | Storage | Key / Service | Description |
|---|---|---|---|
| Server URL | `UserDefaults` | `goose.remote.serverURL` | Base URL of your self-hosted server. Must use `https://` or `http://`. Private-range and loopback IP addresses are accepted over `http://`; public addresses require `https://`. Example: `https://goose.example.com` or `http://192.168.1.10:8770` |
| Bearer token | iOS Keychain | service `goose.remote`, account `apiKey` | The `GOOSE_API_KEY` value configured on the server. Stored with `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`. |
| Enable Upload | `UserDefaults` | `goose.remote.uploadEnabled` | Toggle that gates all outbound uploads. Upload is only attempted when this is `true`, the URL is non-empty, and a token is present. |

### Validation rules

- The server URL must have an `http` or `https` scheme and a non-empty hostname.
- Private-range IP addresses (RFC 1918: `10.x.x.x`, `172.16–31.x.x`, `192.168.x.x`) and loopback addresses (`127.x.x.x`) are allowed over `http://`. Public IP addresses and public hostnames require `https://` to satisfy App Transport Security. Local hostnames (`localhost`, `*.local`) are allowed over `http://` via `NSAllowsLocalNetworking`.

### Status indicators

When upload is enabled and a URL is configured, the **More > Remote Server** screen shows:

- **Server reachable** — result of a `GET /healthz` check. Runs once automatically per app session when upload is enabled; also runs immediately when the user taps **Save**.
- **Test Connection** — manual button that hits `GET /healthz` then `GET /v1/devices` (auth-gated) and reports inline: connected with device count, auth failure (401/403), or server unreachable.
- **Last sync** — timestamp of the most recent successful batch upload, plus the count of records acknowledged by the server. A **Now** button triggers an immediate manual upload.
- **Pending batches** — count of batches queued but not yet delivered.
- **Sync pendente** — count of `hr_samples` rows not yet marked synced. A **Backfill** button replays `sync.backfill_streams` over decoded frames and then uploads.
- **Import do servidor** — imports raw BLE frames from the server into local SQLite via `capture.import_frame_batch`, rebuilding the trust chain on a fresh install without a BLE reconnection. The iOS app pages through `GET /v1/export/frames/{deviceID}` (5,000 frames per page) and the **Import** button in **More > Remote Server** triggers `importHistoricalDataFromServer()`.

### Upload retry behaviour

Each upload batch is attempted up to **7 times** (1 initial attempt + 6 retries) with exponential backoff capped at 60 s: delays between attempts are 1 s, 2 s, 4 s, 8 s, 16 s, 32 s, 60 s. 4xx client errors abort the retry loop immediately and are not retried. After all attempts fail, `uploadErrorState` is set to a human-readable error string and the pending batch count is decremented. The decoded-streams upload endpoint is `POST /v1/ingest-decoded`. On a successful upload, raw BLE frames are also sent to `POST /v1/ingest-frames` (no additional retry loop — a single attempt).

### Debug WebSocket

The app opens a local WebSocket connection to `ws://127.0.0.1:8765` for debug validation sessions. This connection is initiated from **More > Debug** and is allowed by `NSAllowsLocalNetworking: true` in `GooseSwift/Info.plist`. The current status is shown in **More > Debug > WebSocket**.

---

## iOS Developer Configuration

### Build-time signing (Xcode)

Signing identity is controlled by xcconfig files:

| File | Committed | Purpose |
|---|---|---|
| `Config/Signing.xcconfig` | Yes | Shared defaults; sets `APP_BUNDLE_ID = com.goose.app` |
| `Config/SigningExtension.xcconfig` | Yes | Extension target; derives bundle ID from `APP_BUNDLE_ID` |
| `Config/Local.xcconfig` | No (gitignored) | Per-developer overrides: `DEVELOPMENT_TEAM` and `APP_BUNDLE_ID` |
| `Config/Local.xcconfig.template` | Yes | Template to copy when setting up a new dev machine |

To build on your own device, copy the template and fill in your values:

```bash
cp Config/Local.xcconfig.template Config/Local.xcconfig
```

Then edit `Config/Local.xcconfig`:

```
DEVELOPMENT_TEAM = YOUR_TEAM_ID
APP_BUNDLE_ID = com.yourname.goose
```

Find your team ID at developer.apple.com → Membership Details. Both targets (main app and `WorkoutLiveActivityExtension`) derive their bundle IDs from `APP_BUNDLE_ID` automatically.

### Launch arguments (Xcode scheme / `xcodebuild`)

These flags are read at startup via `ProcessInfo.processInfo.arguments`. Pass them in the Xcode scheme editor under **Run > Arguments Passed On Launch**, or as `-arg` entries to `xcodebuild`.

| Argument | Description |
|---|---|
| `--goose-start-health-packet-capture` | Auto-start health packet capture on BLE connection |
| `--goose-start-temperature-packet-capture` | Auto-start temperature packet capture on BLE connection |
| `--goose-start-physiology-packet-capture` | Auto-start physiology packet capture on BLE connection |
| `--goose-start-respiratory-packet-watch` | Auto-start respiratory packet watch on BLE connection |
| `--goose-start-physiology-capture` | Alias: starts physiology + enables historical sync |
| `--goose-auto-historical-sync` | Trigger historical sync automatically after connection |
| `--goose-auto-band-sleep-sync` | Trigger band sleep sync automatically on the health tab |
| `--goose-sync-history-during-physiology-capture` | Also run historical sync while physiology capture runs |
| `--goose-enable-diagnostics` | Force diagnostic BLE logging on |
| `--goose-disable-diagnostics` | Force diagnostic BLE logging off |
| `--goose-console-capture-status` | Print capture status snapshots to the console |
| `--goose-afc-capture-status` | Write capture status to `Documents/GooseSwift/capture-status.txt` |
| `--goose-afc-diagnostic-mirror` | Enable AFC diagnostic mirror mode |
| `--goose-send-debug-skin-temp-command` | Send debug skin temperature command after connection |
| `--goose-force-debug-menu-write` | Force a debug menu write command after connection |
| `--goose-health-packet-capture-duration=N` | Override health capture duration (seconds; default 1800) |
| `--goose-temperature-packet-capture-duration=N` | Override temperature capture duration (seconds; default 600) |
| `--goose-physiology-packet-capture-duration=N` | Override physiology capture duration (seconds; default 1800) |
| `--goose-respiratory-packet-watch-duration=N` | Override respiratory watch duration (seconds; default 600) |

### Environment variables (Xcode scheme / `xcodebuild`)

Most launch arguments have an equivalent environment variable. Set these under **Run > Environment Variables** in the Xcode scheme, or pass them to `xcodebuild` with `-e KEY=VALUE`.

| Variable | Equivalent argument | Values |
|---|---|---|
| `GOOSE_START_HEALTH_PACKET_CAPTURE` | `--goose-start-health-packet-capture` | `1` to enable |
| `GOOSE_START_TEMPERATURE_PACKET_CAPTURE` | `--goose-start-temperature-packet-capture` | `1` to enable |
| `GOOSE_START_PHYSIOLOGY_PACKET_CAPTURE` | `--goose-start-physiology-packet-capture` | `1` to enable |
| `GOOSE_START_RESPIRATORY_PACKET_WATCH` | `--goose-start-respiratory-packet-watch` | `1` to enable |
| `GOOSE_AUTO_HISTORICAL_SYNC` | `--goose-auto-historical-sync` | `1` to enable |
| `GOOSE_AUTO_BAND_SLEEP_SYNC` | `--goose-auto-band-sleep-sync` | `1` to enable |
| `GOOSE_SYNC_HISTORY_DURING_PHYSIOLOGY_CAPTURE` | `--goose-sync-history-during-physiology-capture` | `1` to enable |
| `GOOSE_DIAGNOSTIC_LOGGING` | `--goose-enable-diagnostics` / `--goose-disable-diagnostics` | `1` = on, `0` = off |
| `GOOSE_CONSOLE_CAPTURE_STATUS` | `--goose-console-capture-status` | `1` to enable |
| `GOOSE_AFC_CAPTURE_STATUS` | `--goose-afc-capture-status` | `1` to enable |
| `GOOSE_AFC_DIAGNOSTIC_MIRROR` | `--goose-afc-diagnostic-mirror` | `1` to enable |
| `GOOSE_SEND_DEBUG_SKIN_TEMP_COMMAND` | `--goose-send-debug-skin-temp-command` | `1` to enable |
| `GOOSE_FORCE_DEBUG_MENU_WRITE` | `--goose-force-debug-menu-write` | `1` to enable |
| `GOOSE_DEBUG_MENU_COMMAND` | — | Raw text command to send to debug menu after connection |
| `GOOSE_DEBUG_MENU_COMMAND_HEX` | — | Hex-encoded command to send to debug menu after connection |
| `GOOSE_HEALTH_PACKET_CAPTURE_DURATION_SECONDS` | `--goose-health-packet-capture-duration=N` | Integer seconds |
| `GOOSE_TEMPERATURE_PACKET_CAPTURE_DURATION_SECONDS` | `--goose-temperature-packet-capture-duration=N` | Integer seconds |
| `GOOSE_PHYSIOLOGY_PACKET_CAPTURE_DURATION_SECONDS` | `--goose-physiology-packet-capture-duration=N` | Integer seconds |
| `GOOSE_RESPIRATORY_PACKET_WATCH_DURATION_SECONDS` | `--goose-respiratory-packet-watch-duration=N` | Integer seconds |

### UserDefaults reference

All persistent iOS state uses `UserDefaults.standard` with dot-namespaced reverse-DNS keys. The following table covers the keys that are most relevant to developers.

#### Remote server

| Key | Type | Description |
|---|---|---|
| `goose.remote.serverURL` | String | Base URL of the self-hosted server |
| `goose.remote.uploadEnabled` | Bool | Upload gate toggle |

The bearer token is **not** in UserDefaults. It is stored in the iOS Keychain under service `goose.remote`, account `apiKey`, with accessibility `kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly`.

#### BLE device identity

| Key | Type | Description |
|---|---|---|
| `goose.swift.rememberedDeviceID` | String | Persisted WHOOP device hardware ID |
| `goose.swift.rememberedDeviceName` | String | Persisted WHOOP device display name |
| `goose.swift.device_uuid_map` | Data (JSON) | CoreBluetooth UUID → hardware ID mapping |
| `goose.swift.rememberedDeviceValidatedWhoop` | Bool | Whether the remembered device passed WHOOP validation |
| `goose.swift.ble.bondingState` | String | BLE bonding state machine value |
| `goose.swift.ble.bondingDeviceID` | String | Device ID currently undergoing bonding |

#### Live HRV (inter-session cache)

| Key | Type | Description |
|---|---|---|
| `goose.swift.liveHRVRMSSD` | Double | Most recent live RMSSD value |
| `goose.swift.liveHRVRRIntervalCount` | Int | RR interval sample count for current RMSSD |
| `goose.swift.liveHRVRMSSDSampleCount` | Int | Total RMSSD sample count |
| `goose.swift.liveHRVUpdatedAt` | Date | Timestamp of last live HRV update |
| `goose.swift.liveHRVSource` | String | Source identifier for the HRV reading |

#### Resting heart rate estimate

| Key | Type | Description |
|---|---|---|
| `goose.swift.restingHeartRateEstimateBPM` | Double | Estimated resting HR in BPM |
| `goose.swift.restingHeartRateEstimateSampleCount` | Int | Sample count for the estimate |
| `goose.swift.restingHeartRateEstimateUpdatedAt` | Date | Timestamp of last estimate update |
| `goose.swift.restingHeartRateEstimateSource` | String | Source identifier (BLE, HealthKit, etc.) |

#### Battery

| Key | Type | Description |
|---|---|---|
| `goose.swift.lastBatteryPercent` | Int | Last known device battery percentage |
| `goose.swift.lastBatteryCapturedAt` | Date | When the battery reading was taken |
| `goose.swift.inferredBatteryChargingUntil` | Date | Inferred end of charging window |

#### Sync watermarks

| Key | Type | Description |
|---|---|---|
| `goose.swift.upload.rawFramesWatermark` | — | Watermark for raw BLE frame upload progress |
| `goose.swift.upload.decodedStreamsWatermark` | — | Watermark for decoded stream upload progress |
| `goose.swift.lastHistorySyncAt` | Date | Last historical BLE sync timestamp |
| `goose.swift.last_band_sleep_sync_date` | Date | Last band sleep sync timestamp |

#### Coach

| Key | Type | Description |
|---|---|---|
| `goose.coach.activeProviderId` | String | Active AI coach provider ID |
| `goose.coach.modelPreset` | String | Selected model preset for the coach |
| `goose.coach.conversation.v1` | Data (JSON) | Persisted coach conversation history |
| `goose.coach.journal.entries` | Data (JSON) | Coach journal entries |
| `goose.coach.gemini.oauthClientId` | String | Gemini OAuth client ID (if Gemini provider is used) |
| `goose.coach.custom.baseURL` | String | Base URL for custom endpoint coach provider |
| `goose.coach.custom.modelID` | String | Model ID for custom endpoint coach provider |

#### User profile (set during onboarding)

| Key | Type | Description |
|---|---|---|
| `goose.swift.onboardingComplete` | Bool | Whether onboarding has been completed |
| `goose.swift.onboardingRedoRequested` | Bool | Whether the user has requested to redo onboarding |
| `goose.swift.onboarding.persistedState` | Data (JSON) | Persisted onboarding wizard state |
| `goose.swift.profile.firstName` | String | User's first name |
| `goose.swift.profile.dateOfBirth` | String | Date of birth (ISO 8601) |
| `goose.swift.profile.unitSystem` | String | `"metric"` or `"imperial"` |
| `goose.swift.profile.gender` | String | Gender for biometric calculations |
| `goose.swift.profile.heightMm` | Int | Height in millimetres |
| `goose.swift.profile.heightInput` | String | Raw height input string (metric) |
| `goose.swift.profile.heightFeetInput` | String | Raw feet component (imperial) |
| `goose.swift.profile.heightInchesInput` | String | Raw inches component (imperial) |
| `goose.swift.profile.weightGrams` | Int | Weight in grams |
| `goose.swift.profile.weightInput` | String | Raw weight input string |
| `goose.swift.profile.timezoneID` | String | User's timezone identifier |
| `goose.swift.profile.createdAtUnixMs` | Int | Profile creation timestamp (Unix ms) |

#### Activity

| Key | Type | Description |
|---|---|---|
| `goose.swift.activity.recentWorkouts` | String (JSON) | Recently detected workout sessions |
| `goose.swift.activity.lockHintSeen` | Bool | Whether the activity lock hint has been shown |

#### Keychain services (iOS)

| Service | Account | Contents |
|---|---|---|
| `goose.remote` | `apiKey` | Remote server bearer token |
| `com.goose.swift.claude` | — | Claude API key (Claude coach provider) |
| `com.goose.swift.codex` | — | Codex embedded auth token |
| `com.goose.swift.gemini` | — | Gemini OAuth token |
| `com.goose.swift.custom-endpoint` | — | Custom endpoint auth token |
| `com.goose.swift.onboarding` | — | Onboarding-related secrets |

---

## Server

The server stack is configured entirely through environment variables. All variables use the `GOOSE_` prefix. Configuration is loaded from a `.env` file that you create by copying `.env.example`.

### Setup

```bash
cd server/
cp .env.example .env
# Edit .env and fill in GOOSE_API_KEY and GOOSE_DB_PASSWORD
docker compose up -d
```

### Environment variables

#### `.env` file (host-side, read by Docker Compose)

| Variable | Required | Default | Description |
|---|---|---|---|
| `GOOSE_API_KEY` | **Required** | — | Shared secret used for Bearer authentication on every `/v1/*` endpoint. Must match the token entered in the iOS app. Generate with `openssl rand -hex 32`. |
| `GOOSE_DB_PASSWORD` | **Required** | — | PostgreSQL password for the `goose` database user. |
| `GOOSE_DB_NAME` | Optional | `goose` | PostgreSQL database name created on first init. |
| `GOOSE_DB_USER` | Optional | `goose` | PostgreSQL user name created on first init. |
| `GOOSE_INGEST_PORT` | Optional | `8770` | Host port the ingest API is published on. The container always listens on port `8000`; this maps it to the host. |
| `TZ` | Optional | `UTC` | Timezone for both containers. |

#### Variables injected into the `goose-ingest` container

These are constructed by Docker Compose from the `.env` values above. You do not set them directly.

| Variable | Value (from Compose) | Description |
|---|---|---|
| `GOOSE_DB_DSN` | `postgresql://<user>:<password>@goose-db:5432/<name>` | Full PostgreSQL DSN. Hard-coded to point at the `goose-db` container on the internal Docker network. |
| `GOOSE_RAW_ROOT` | `/data/raw` | Directory inside the container where raw BLE frame archives are stored. Backed by the `goose-raw-data` named volume. |

### Required vs optional

The ingest service (`server/ingest/app/config.py`) raises `RuntimeError` on startup if either of these is absent:

- `GOOSE_API_KEY` — startup fails with `"GOOSE_API_KEY is required"`
- `GOOSE_DB_DSN` — startup fails with `"GOOSE_DB_DSN is required"`

All other variables have defaults and will not prevent startup if omitted.

### Docker Compose services

Defined in `server/docker-compose.yml`:

| Service | Container | Image | Role |
|---|---|---|---|
| `goose-db` | `goose-db` | `timescale/timescaledb:2.17.2-pg16` | TimescaleDB (PostgreSQL 16) datastore |
| `goose-ingest` | `goose-ingest` | Built from `server/ingest/Dockerfile` | FastAPI ingest service; runs as non-root user (`appuser`) |

### Named volumes

| Volume | Mount point | Contents |
|---|---|---|
| `goose-db-data` | `/var/lib/postgresql/data` (goose-db) | PostgreSQL data directory |
| `goose-raw-data` | `/data/raw` (goose-ingest) | Raw BLE frame archives (ZIP files) |

### Database schema bootstrap

The schema is applied in two ways (both are idempotent):

1. `server/db/init.sql` is mounted into the `goose-db` container and runs once on first initialization of an empty data directory.
2. The ingest service calls `db.bootstrap_schema()` on every startup, so schema changes apply even after the data directory already exists.

### Health check

```
GET /healthz
```

Returns `{"status": "ok"}` when the ingest service can reach the database. Returns HTTP 503 if the database is unavailable. This endpoint requires no authentication and is used by the iOS app to verify connectivity.

### Per-environment overrides

The server has no built-in multi-environment mechanism. Use separate `.env` files or your deployment platform's secret manager to supply different values for development and production.

<!-- VERIFY: If you expose the ingest port through a reverse proxy (nginx, Caddy, Traefik), set GOOSE_INGEST_PORT to a non-public port and configure the proxy to terminate TLS before forwarding to the container. -->
