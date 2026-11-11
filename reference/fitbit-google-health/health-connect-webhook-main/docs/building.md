# Building from Source

## Prerequisites

- Android Studio (Arctic Fox or later)
- JDK 17
- Android SDK with API 26+

## Build

```bash
git clone https://github.com/mcnaveen/health-connect-webhook
cd health-connect-webhook
```

Open the project in Android Studio and sync Gradle, or build from the CLI:

```bash
./gradlew assembleDebug     # app/build/outputs/apk/debug/app-debug.apk
./gradlew assembleRelease   # release build
```

## Project Structure

```
docs/
├── features.md        # Feature list, supported apps, languages, data types
├── usage.md           # Setup, sync modes, local server, limitations
├── api-reference.md   # Integration specs overview
├── webhook.md         # JSON + gRPC webhook reference
├── local-http.md      # Local HTTP GET API
├── building.md        # This file
proto/
└── hcwebhook/v1/health_payload.proto   # Published gRPC schema
server/example/
├── README.md               # Docker, auth, TLS, troubleshooting
├── docker-compose.yml
├── python/ typescript/ go/ php/
app/
├── src/
│   ├── main/
│   │   ├── assets/health_payload.proto  # Bundled for Share schema
│   │   ├── proto/                       # protoc input (mirrors repo proto/)
│   │   ├── java/com/hcwebhook/app/
│   │   │   ├── MainActivity.kt
│   │   │   ├── SyncManager.kt
│   │   │   ├── WebhookManager.kt        # JSON HTTP client
│   │   │   ├── GrpcWebhookClient.kt     # gRPC client
│   │   │   ├── ProtobufPayloadBuilder.kt
│   │   │   ├── ProtoSchemaExporter.kt
│   │   │   ├── screens/                 # Includes WebhooksScreen delivery UI
│   │   │   └── …
│   │   └── res/
└── build.gradle.kts
```

## Architecture

- **Language**: Kotlin
- **UI Framework**: Jetpack Compose (Material 3)
- **Health Data**: Health Connect SDK (AndroidX)
- **Background Work**: WorkManager (interval sync)
- **Scheduled Alarms**: AlarmManager (exact alarms where available)
- **Networking**: OkHttp (JSON webhooks) + gRPC OkHttp / Android channel (Protobuf delivery)
- **Feedback**: [FeedbackJar Android SDK](https://central.sonatype.com/artifact/com.feedbackjar/sdk) (`com.feedbackjar:sdk`)
- **Local Server**: Foreground service with a lightweight HTTP socket listener
- **Serialization**: Kotlinx Serialization (JSON) + Protocol Buffers lite (gRPC)

## Key Components

- `MainActivity` — Main entry point and navigation host
- `HealthConnectManager` — Health Connect data reading
- `SyncManager` — Data synchronization logic
- `SyncWorker` — Background worker for periodic syncing
- `ScheduledSyncManager` — AlarmManager schedules for fixed-time syncing
- `ScheduledSyncReceiver` — Receives alarm broadcasts and triggers scheduled syncs
- `WebhookManager` — JSON webhook HTTP requests
- `GrpcWebhookClient` — Protobuf / gRPC `HealthWebhook.Deliver`
- `ProtobufPayloadBuilder` — Maps Health Connect data to the published protobuf schema
- `ProtoSchemaExporter` — Shares the bundled `.proto` from app assets
- `LocalHttpServerService` — Foreground service that keeps the local HTTP server running
- `LocalHttpServerManager` — Local HTTP socket binding, request parsing, JSON responses
- `PreferencesManager` — App configuration and preferences
- `ConfigurationScreen` — Main settings UI
- `LogsScreen` — Webhook request/response logs
- `AboutScreen` — App info, feedback entry point, settings export/import
- `FeedbackSheet` — Bottom sheet for submitting feedback and viewing local history
- `FeedbackSubmitter` — Adds build flavor to FeedbackJar metadata
- `LocalFeedbackEntry` — On-device record of submitted feedback

## Permissions

- Health Connect read permissions (per selected data type)
- `READ_HEALTH_DATA_IN_BACKGROUND` — Background data access
- `READ_HEALTH_DATA_HISTORY` — Historical records within the supported lookback window
- `INTERNET` — Webhook delivery and local HTTP server access
- `FOREGROUND_SERVICE` / `FOREGROUND_SERVICE_DATA_SYNC` — Keep the local HTTP server active
- `RECEIVE_BOOT_COMPLETED` — Restore scheduled syncs after reboot / app update
- `SCHEDULE_EXACT_ALARM` — Accurate scheduled sync times on supported Android versions

## Contributing

Contributions are welcome.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'feat: add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request
