# Usage & Configuration

## Initial setup

1. **Install Health Connect** if you don't have it — [Play Store](https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata).
2. **Grant permissions** — open the app, tap **Grant Permissions**, pick the data types you want, and approve them in Health Connect.
3. **Configure webhooks**
   - Add one or more webhook URLs (must start with `http://` or `https://`).
   - Select which data types to sync.
   - Choose a sync mode:
     - **Interval** — a fixed interval, minimum 15 minutes.
     - **Scheduled** — one or more fixed times of day.
   - Optionally enable the **local HTTP server** and pick a port.
4. **Save configuration** to start automatic syncing.

## Manual sync

Tap **Sync Now** in the Manual Sync section to push all enabled data types immediately.

## Viewing logs

Menu (⋮) → **Webhook Log**. Each entry shows timestamp, status code, and response body.

## Sync modes

| Mode | Engine | Notes |
| --- | --- | --- |
| Interval | WorkManager | Minimum 15 min; 30–60 min suits most cases. |
| Scheduled | AlarmManager | Default 08:00 and 21:00; add/remove/toggle entries. Exact alarms where available (Android 12+), with safe fallback. |

## Local HTTP server

Enable it from the configuration screen to expose Health Connect JSON to tools on
the same network. It runs as a **foreground service** while enabled. **GET only**,
**no authentication** — use on a trusted LAN.

| Endpoint | Returns |
| --- | --- |
| `GET /` | On-demand read from Health Connect. Default 48-hour window; `?days=N` for N full days. |
| `GET /latest` | Last published JSON from a successful `GET /` or webhook sync, or `{"status":"no_data"}`. |
| `GET /ping` | `{"status":"ok"}` health check. |

Default port **8787** (configurable 1024–65535). Example: `http://192.168.1.25:8787/`.
Full reference: [local-http.md](local-http.md).

> Availability depends on Android background execution, Wi-Fi, and battery
> optimization. For best reliability keep the phone awake/charging or exclude HC
> Webhook from aggressive battery optimization.

## Providing feedback

**About** tab → **Provide Feedback**. Submit bugs, ideas, or suggestions in the
bottom sheet; past submissions are stored on-device. **View all feature requests**
opens the public board at [hc-webhook.feedbackjar.com](https://hc-webhook.feedbackjar.com/).
Submissions include device metadata (app version, Android version, screen size,
locale) and the build flavor (`foss` or `playstore`).

## Data privacy

- Health data stays on your device until sent to your configured webhooks.
- The app only reads data types you explicitly grant.
- Nothing is sent to third parties except your configured webhooks.
- With the local HTTP server on, devices on your LAN can request the exposed JSON.
- Revoke permissions any time in Android settings.

## Known limitations

- **Offline** — failed webhooks retry briefly (3 attempts). If still offline, data
  retries on the next successful sync trigger.
- **48-hour lookback** — the app scans a rolling 48-hour window. Older data may be
  missed if the app wasn't running or configured during that time.
- **Local server reliability** — a foreground service, but still affected by Doze
  mode, Wi-Fi sleep, and aggressive OEM battery optimization.

See [features.md](features.md) for the full feature list, supported apps,
languages, and data types.
