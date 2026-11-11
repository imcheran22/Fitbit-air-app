<!-- generated-by: gsd-doc-writer -->
# Getting Started

This guide walks you from zero to a running Goose build with a connected WHOOP device. The iOS app is the core of Goose and works fully offline — the self-hosted server is optional.

---

## Prerequisites

### Required — iOS app

| Tool | Version | Notes |
|---|---|---|
| macOS with Xcode | Xcode 26.5+ (local); CI uses Xcode 26.3 on macos-15 | Required to build the app |
| iOS 26 SDK | 26.0 | Must be installed inside Xcode |
| Apple Developer account | Any (free or paid) | Required for signing; bundle ID defaults to `com.goose.app` |
| Rust toolchain | MSRV 1.96 | Install via [rustup.rs](https://rustup.rs) |
| Cargo | Comes with rustup | Used by the Xcode build phase |
| iOS Rust targets | See below | Three targets required |
| iOS device or simulator | iOS 26.0+ | WHOOP BLE pairing requires a physical device |

Install the three required Rust cross-compilation targets:

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
```

### Optional — self-hosted server

| Tool | Notes |
|---|---|
| Docker with Docker Compose | Runs the FastAPI + TimescaleDB stack |

---

## Clone the repository

```bash
git clone https://github.com/tigercraft4/goose.git
cd goose
```

---

## Build the iOS app

### Build in Xcode (recommended)

1. Open `GooseSwift.xcodeproj` in Xcode.
2. Select the `GooseSwift` scheme.
3. Choose a simulator or connected iOS 26 device as the run destination.
4. Press **Run** (⌘R).

The Xcode build phase `Scripts/build_ios_rust.sh` runs automatically before the Swift compile step. It cross-compiles `Rust/core` for the active platform and places the static library at `Rust/$(PLATFORM_NAME)/libgoose_core.a`. Cargo's build output lands in `build/rust-target/goose-core/` (overridable via `CARGO_TARGET_DIR`). This takes a few minutes on the first build; subsequent builds are incremental — the script skips the rebuild if no source files under `Rust/core/` have changed.

To skip the Rust build entirely during development (e.g., when iterating on Swift-only changes), set the environment variable before building:

```bash
GOOSE_SKIP_RUST_CORE_BUILD=1 xcodebuild ...
```

This is not recommended if you have modified any Rust source files.

### Signing configuration

The committed `Config/Signing.xcconfig` sets `APP_BUNDLE_ID = com.goose.app`. To use your own bundle ID and team, create `Config/Local.xcconfig` (gitignored) with:

```
DEVELOPMENT_TEAM = YOUR_TEAM_ID
APP_BUNDLE_ID = com.yourname.goose
```

Both targets (main app and Live Activity extension) derive their bundle IDs from `APP_BUNDLE_ID` automatically.

### Build from the command line

Simulator (Apple Silicon Mac):

```bash
xcodebuild \
  -project GooseSwift.xcodeproj \
  -scheme GooseSwift \
  -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17' \
  -derivedDataPath /tmp/goose-swift-deriveddata \
  build
```

Physical device (find your device ID first with `xcrun devicectl list devices`):

```bash
xcodebuild \
  -project GooseSwift.xcodeproj \
  -scheme GooseSwift \
  -configuration Debug \
  -destination 'platform=iOS,id=<device-id>' \
  -derivedDataPath /tmp/goose-swift-deriveddata-device \
  -allowProvisioningUpdates \
  build
```

Install and launch on device after a successful build:

```bash
xcrun devicectl device install app \
  --device <device-id> \
  /tmp/goose-swift-deriveddata-device/Build/Products/Debug-iphoneos/GooseSwift.app

xcrun devicectl device process launch \
  --device <device-id> \
  --terminate-existing \
  com.goose.app
```

---

## Install via AltStore (no Xcode required)

If you do not have a Mac with Xcode, you can sideload Goose using [AltStore](https://altstore.io). This does not require a paid Apple Developer account.

### Prerequisites

- iPhone running iOS 17+ (iOS 26 recommended for full feature parity)
- A computer (Mac or Windows) with **AltServer** installed — [download at altstore.io](https://altstore.io)
- AltStore installed on your iPhone via AltServer

### 1. Add the Goose source in AltStore

1. Open **AltStore** on your iPhone.
2. Tap **Browse** at the bottom.
3. Tap **Sources** (top right) → tap **+**.
4. Enter the source URL:
   ```
   https://raw.githubusercontent.com/tigercraft4/goose/main/altstore-source.json
   ```
5. Tap **Add Source**.

Goose will appear in the Browse tab under the added source.

### 2. Install

Tap **Goose** → **Free** → enter your Apple ID credentials when prompted. AltStore re-signs the IPA with your personal Apple ID and installs it.

### 3. Keep the app active

Apps installed via a free Apple ID expire after **7 days**. To refresh:

- Open AltStore while your iPhone is on the same Wi-Fi network as AltServer, or connect via USB.
- Tap **My Apps** → **Refresh All**.

A paid Apple Developer account ($99/year) eliminates the 7-day limit.

#### Free Apple ID feature restrictions

Some Goose features require entitlements that Apple's provisioning does not grant to free-account sideloads:

| Feature | Free Apple ID | Paid account |
|---|---|---|
| Bluetooth (WHOOP data) | Works | Works |
| HealthKit read (sleep, HR) | May be restricted | Works |
| HealthKit write (workout export) | May be restricted | Works |
| Live Activity / Dynamic Island | May not appear | Works |

If HealthKit access is refused at the permission prompt or the Live Activity does not show after a workout starts, this is an Apple signing constraint — not a Goose bug. Building from source with your own paid account resolves it.

### Manual install (without a source)

You can also install any release IPA directly:

1. Download `GooseSwift-<version>-unsigned.ipa` from the [Releases page](https://github.com/tigercraft4/goose/releases).
2. Transfer it to your iPhone via AirDrop or the Files app.
3. Tap the `.ipa` file and choose **Open in AltStore**.

---

## First run — onboarding and permissions

On first launch, Goose walks you through:

1. **Profile setup** — enter your name, height, weight, and other biometric details.
2. **Permissions** — grant Bluetooth access (required for WHOOP), HealthKit access (optional, for Apple Health sleep/workout import), and notification permission (optional).

Bluetooth permission is mandatory. Without it the app cannot scan for or connect to WHOOP devices.

---

## Connecting to your WHOOP device

Goose supports **WHOOP 5.0**, **WHOOP 4.0**, and **WHOOP MG**. Other WHOOP generations are not supported.

1. Open the **Home** tab.
2. Tap **Scan** in the device panel.
3. Make sure your WHOOP band is on your wrist and its companion app is closed or backgrounded.
4. Goose discovers nearby WHOOP devices and connects automatically.
5. Once the status reads **ready**, the app starts receiving biometric data over BLE.

The connection is maintained in the background while the app is running. Auto-reconnect is attempted if the band goes out of range and comes back.

---

## Self-hosted server setup (optional)

The server persists decoded biometric streams from your iPhone in a TimescaleDB database. Skip this section if you want to use the app standalone.

### 1. Configure environment variables

```bash
cd server
cp .env.example .env
```

Open `.env` and set the two required values:

```bash
# A secret shared between the server and the iOS app.
# Generate a strong value: openssl rand -hex 32
GOOSE_API_KEY=change_me

# PostgreSQL password for the goose database user.
GOOSE_DB_PASSWORD=change_me
```

The `.env.example` file documents all available variables. The defaults for `GOOSE_DB_NAME`, `GOOSE_DB_USER`, and `GOOSE_INGEST_PORT` (8770) are suitable for a single-user self-hosted deployment.

### 2. Start the Docker stack

```bash
cd server
docker compose up -d --build
```

This starts two containers:
- `goose-db` — TimescaleDB 2.17.2-pg16 (PostgreSQL 16) with hypertables for biometric stream data.
- `goose-ingest` — FastAPI ingest service built from `server/ingest/Dockerfile`, published on host port `8770` by default.

The schema is bootstrapped automatically on first start via `server/db/init.sql` and idempotently re-applied by the ingest service on each startup. Verify the stack is healthy:

```bash
curl -s localhost:8770/healthz
```

Expected response: `{"status":"ok"}`

### 3. Configure the iOS app

In Goose, go to **More > Remote Server** and fill in:

| Field | Value |
|---|---|
| Server URL | Base URL of your server (e.g. `https://goose.example.com`, `http://goose.local:8770`, or `http://192.168.1.10:8770`). Must include a scheme (`http://` or `https://`). Public hostnames require `https://`; private IP ranges (RFC 1918) and `.local`/`localhost` hostnames allow `http://`. |
| Bearer token | The `GOOSE_API_KEY` value from your `.env` file. |
| Enable Upload | Toggle on. |

The screen shows **Server reachable** when the app can reach `/healthz` on the configured URL. Uploads begin automatically after each BLE data batch is written to local SQLite.

For the full list of server environment variables and iOS configuration options, see [docs/guides/configuration.md](configuration.md).

---

## Common setup issues

**Rust build fails with "target not found"**
Run `rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios` and rebuild.

**Xcode cannot find `libgoose_core.a`**
The static libraries at `Rust/iphoneos/` and `Rust/iphonesimulator/` are gitignored and never committed. After a fresh clone, Xcode must build the project at least once so `Scripts/build_ios_rust.sh` (the Xcode build phase) compiles the Rust core and places the `.a` files in the correct output directories. If the error persists, clean the build folder (⇧⌘K) and rebuild.

**App does not scan for Bluetooth devices**
Bluetooth permission must be granted. Go to **Settings > Privacy & Security > Bluetooth** and confirm Goose is listed and enabled.

**Server URL is rejected by the iOS app**
The URL must include a scheme (`http://` or `https://`) and a host. Private IP addresses (RFC 1918: `10.x.x.x`, `172.16-31.x.x`, `192.168.x.x`) are allowed with `http://`. Public hostnames require `https://` to satisfy App Transport Security. `.local` and `localhost` hostnames work with `http://`.

**`docker compose up` fails with "GOOSE_DB_PASSWORD is not set"**
Copy `.env.example` to `.env` in the `server/` directory and set at minimum `GOOSE_API_KEY` and `GOOSE_DB_PASSWORD`.

**Metrics show as empty after connecting**
The app needs time to accumulate data. Packet data flows into local SQLite as BLE notifications arrive. Health metric views update as the Rust core processes incoming frames. Leave the app connected with the screen on for a few minutes.

---

## Next steps

- [docs/guides/configuration.md](configuration.md) — all server environment variables and iOS runtime settings.
- [docs/architecture/overview.md](../architecture/overview.md) — system architecture, data flow, and component responsibilities.
- [docs/api/reference.md](../api/reference.md) — server REST API endpoints, Rust bridge FFI API, request/response formats, and authentication.
- `server/README.md` — database schema and end-to-end verification steps.
- `README.md` — project overview, contributing guidelines, and data privacy notes.
