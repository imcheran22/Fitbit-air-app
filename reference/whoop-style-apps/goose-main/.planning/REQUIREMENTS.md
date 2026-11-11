# Requirements — v17.0 Algorithm Depth & Noop Feature Parity

*Milestone:* v17.0  
*Created:* 2026-06-28  
*Status:* Active

---

## Active Requirements

### Algorithms (Rust Core)

- [ ] **ALG-BASE-01**: User's personal metric baselines are computed with EWMA (14-night half-life, Winsor ±3σ clamping) and persisted in SQLite so recovery and stress scores are personalised to the individual
- [ ] **ALG-BASE-02**: Baseline tracker shows tiered confidence state — Calibrating (<4 nights), Building (4-13 nights), Solid (≥14 nights) — surfaced in UI
- [ ] **ALG-HRV-10**: HRV computation applies Malik ectopic filter (drop beats deviating >20% from 5-beat local median) before RMSSD, eliminating false readings from premature beats
- [ ] **ALG-HRV-11**: HRV pipeline also computes SDNN and pNN50 and exposes them via bridge for display in detail views
- [ ] **ALG-HRV-12**: HRV spot-reading is rejected when >35% of intervals were discarded (sufficiency gate), preventing unreliable readings from appearing in the UI
- [ ] **ALG-STR-01**: Strain score is computed with Karvonen %HRR intensity model and Edwards 5-zone TRIMP weighting (zones 1-5 at 50/60/70/80/90% HRR cut-offs), producing a 0-100 strain score per workout
- [ ] **ALG-STR-02**: Tanaka HRmax estimation (208 − 0.7 × age) is used when observed HRmax is unavailable, requiring age in user profile
- [ ] **ALG-REC-01**: Recovery score is computed as a 2-factor z-score composite (HRV weight 0.55, RHR weight 0.45) against personal EWMA baselines, squashed via logistic function to 0-100
- [ ] **ALG-REC-02**: Recovery score displays a "calibrating" state when baseline history < 4 nights rather than showing an arbitrary number
- [ ] **ALG-DST-01**: Daytime stress is computed per waking hour as HR + RMSSD z-scored against the same day's quietest hour (same-day baseline, no personal history needed), mapped to 0-3 scale
- [ ] **ALG-DST-02**: Sustained high stress flag fires when most recent 3 consecutive hours all score ≥2.0

### UI — Visual Components

- [ ] **UI-VIZ-01**: Health tab Recovery card shows a circular gauge (Recovery Ring) colour-coded green/orange/red/teal that replaces the plain text number
- [ ] **UI-VIZ-02**: Strain card shows a horizontal gauge (Strain Gauge) with zone colour bands (Low/Moderate/High/Extreme) matching the 0-100 scale
- [ ] **UI-VIZ-03**: Every Health metric card shows a 14-day sparkline (mini line chart) inline below the current value, giving trend context without opening a separate screen

### UI — Sleep

- [ ] **UI-SLP-01**: Sleep detail view shows a hypnogram — a horizontal timeline with colour-coded phase bands (Deep/Light/REM/Awake) for each night
- [ ] **UI-SLP-02**: Sleep view shows 14-night sleep debt ledger — daily bars showing slept vs sleep need, with a running balance summary
- [ ] **UI-SLP-03**: User can navigate to previous nights via forward/back controls in the sleep view, browsing up to 30 nights of history

### UI — Workouts

- [ ] **UI-WRK-01**: During an active workout session, the in-app view shows a large current HR, current zone number (1-5), live effort gauge, and elapsed time — not only the lock-screen Live Activity
- [ ] **UI-WRK-02**: Tapping a past workout in the workout list opens a detail view with an HR curve chart, zone time breakdown (%), peak HR, average HR, duration, and effort score

### UI — Data Exploration

- [ ] **UI-EXP-01**: User can open a Metric Explorer from the Health tab, select any available metric (HRV, HR, Recovery, Strain, Stress, etc.), pick a date range, and view a full-screen chart with min/max/mean stats
- [ ] **UI-EXP-02**: Metric Explorer includes a Compare mode where the user can overlay 2-4 metrics on a shared timeline to discover correlations

### BLE Protocol

- [ ] **BLE-EXT-01**: App sends and parses cmd `0x62` (getExtendedBatteryInfo) to retrieve detailed battery state beyond the basic GATT battery level
- [ ] **BLE-EXT-02**: App sends cmd `0x07` (reportVersionInfo) during the BLE handshake and stores the result, making firmware info more reliable than GATT Device Information alone
- [ ] **BLE-EXT-03**: App sends cmd `0x7A` (stopHaptics) when a haptic pattern must be cancelled mid-sequence (e.g., workout ends while buzz is active)
- [ ] **BLE-EXT-04**: Gen5/MG alarm payload uses the confirmed 20-byte format with waveform + loop control fields, replacing the current opaque format
- [ ] **BLE-R22-01**: For Gen5/MG devices only, app sends the R22 Deep Stream Unlock sequence (15 flags via cmd `0x78`, gated by `DeviceCatalog.isGen5orMG`) to enable deep biometric streaming (PPG/IMU)
- [ ] **BLE-R22-02**: R22 unlock is never sent to Gen4 devices; DeviceCatalog gate is enforced before any `0x78` write

### Notifications & Haptics

- [ ] **HAP-NOTIF-01**: When an incoming phone call is detected via CTCallCenter, the connected WHOOP strap buzzes (3 loops) as a wrist notification
- [ ] **HAP-NOTIF-02**: User can configure which Goose internal events trigger a strap buzz (HR spike, HRV dip, daytime stress sustained high), with per-event toggles and threshold settings in More → Settings
- [ ] **HAP-NOTIF-03**: A test buzz button in strap notification settings lets the user verify haptic output without waiting for an event

---

## Future Requirements (Deferred from v17.0)

- Sleep staging 4-class (wake/light/deep/REM) — blocked by gravity/accel data unavailability on Gen4 BLE
- Respiration rate pipeline — blocked by R22 availability; defer to after BLE-R22-01 ships
- Full Rest Score composite (efficiency + restorative share + consistency) — depends on sleep staging
- Sedentary detection — no accel source on Gen4
- Workout auto-detection dual-gate (HR + gravity) — no gravity on Gen4
- Calorie estimation (Keytel) — low priority; add after StrainScorer ships
- Correlation Engine / Behaviour Effects (Cohen's d) — consumer analytics, needs behaviour logging first
- Fitness Age / VO2max modeling — speculative, defer
- PDF export / trends view — lower priority UX
- Apple Health reconciliation UI — lower priority

---

## Out of Scope (v17.0)

- Frequency-domain HRV (LF/HF/HF-norm) — requires FFT pipeline; not planned
- Server-side push notifications — no APNs infrastructure
- Third-party app notification mirroring (WhatsApp, SMS) — iOS sandbox prevents interception
- CallKit VoIP integration — no VoIP feature planned
- Android UI parity for new screens — v16.0 scope; defer v17.0 UI additions to v18.0 Android parity
- Redesign of existing tab layout — additive changes only

---

## Traceability (Roadmap)

| REQ-ID | Phase |
|--------|-------|
| ALG-BASE-01 | Phase 140 |
| ALG-BASE-02 | Phase 140 |
| ALG-HRV-10 | Phase 141 |
| ALG-HRV-11 | Phase 141 |
| ALG-HRV-12 | Phase 141 |
| ALG-STR-01 | Phase 142 |
| ALG-STR-02 | Phase 142 |
| ALG-REC-01 | Phase 143 |
| ALG-REC-02 | Phase 143 |
| ALG-DST-01 | Phase 143 |
| ALG-DST-02 | Phase 143 |
| UI-VIZ-01 | Phase 144 |
| UI-VIZ-02 | Phase 144 |
| UI-VIZ-03 | Phase 144 |
| UI-SLP-01 | Phase 145 |
| UI-SLP-02 | Phase 145 |
| UI-SLP-03 | Phase 145 |
| UI-WRK-01 | Phase 146 |
| UI-WRK-02 | Phase 146 |
| UI-EXP-01 | Phase 147 |
| UI-EXP-02 | Phase 147 |
| BLE-EXT-01 | Phase 148 |
| BLE-EXT-02 | Phase 148 |
| BLE-EXT-03 | Phase 148 |
| BLE-EXT-04 | Phase 148 |
| BLE-R22-01 | Phase 149 |
| BLE-R22-02 | Phase 149 |
| HAP-NOTIF-01 | Phase 150 |
| HAP-NOTIF-02 | Phase 150 |
| HAP-NOTIF-03 | Phase 150 |
