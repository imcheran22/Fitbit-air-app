# Sync reminder and background refresh so the data is fresh when the app opens

Labels: must-have, sync

Wearable apps only push to Health Connect when they run: "data only appears after I open [the companion] app". v0.5 adds a "Data up to" line and a sync button; this issue is the rest.

**What to build**
- Morning notification (opt-in) at a chosen time when the latest data is older than N hours: "Your watch has not synced since 11 PM. Open Fitbit to sync." Tapping opens the companion app, and fitdash refreshes when the user returns.
- Background refresh of the cache every few hours with `READ_HEALTH_DATA_IN_BACKGROUND`, so a cold open shows last night without waiting.
- Both behind switches in Settings, both documented in the privacy page.

Source: https://forum.urbandroid.org/t/health-connect-sync-not-working-for-hrv-and-spo2/12000
