---
slug: issue-188-metrics-never-populate
status: awaiting_human_verify
created: 2026-06-27
updated: 2026-06-27
trigger: "WHOOP 5.0 metrics never populate after sync — stuck in 'analysing collected data...' indefinitely"
---

## Resolution

root_cause: After a historical sync completes, GooseAppModel.handleHistoricalSyncProgress (GooseSwift/GooseAppModel+HealthCapture.swift:309) ran ONLY healthStore.runPacketInputs() on terminal non-failed progress. runPacketInputs() (HealthDataStore.swift:299) extracts packet-derived inputs but does NOT compute any scores. Because the scoring half of the pipeline (runDynamicSleepNeed + runPacketScores) was never invoked on the historical-sync path, packetScoreStatus stayed at its initial "Extracting..." value and the UI hero (HealthRecoveryStressViews.swift:41, gated on packetScoreStatus.hasPrefix("Extracting")) showed a spinner forever — "analysing collected data..." never resolved. The band-sleep path (refreshSleepAfterBandSync, HealthDataStore.swift:337) ran the full chain and worked, which is why sleep-from-band populated but historical-sync metrics did not. Note: the original hypothesis ("no trigger fires") was refined — the trigger DOES fire (wired at GooseAppModel.swift:342), it just ran an incomplete pipeline.
fix: 1) Extended handleHistoricalSyncProgress to run the full proven chain after sync: runDynamicSleepNeed() -> runPacketInputs() -> runPacketScores(), mirroring refreshSleepAfterBandSync ordering (dynamic sleep need FIRST, SLP-NEED-03). 2) Added an OSLog Logger (com.goose.app / health.packet_scores) and logged the full untruncated error in runPacketScores' catch block before the 96-char shortError() fallback, so secondary failures are no longer silently masked.
verification: xcodebuild (scheme GooseSwift, generic iOS Simulator destination, CODE_SIGNING_ALLOWED=NO) -> BUILD SUCCEEDED. Confirmed both terminal sync routes (completeHistoricalSync + failHistoricalSync) flow through notifyHistoricalSyncProgress -> onHistoricalSyncProgress, so the single fix point covers all completion cases. Runtime device verification (status transitions Extracting -> scored on real WHOOP 5.0 fw 55.x) still pending user confirmation.
files_changed: [GooseSwift/GooseAppModel+HealthCapture.swift, GooseSwift/HealthDataStore+Snapshots.swift]

## Symptoms

- Device: WHOOP 5.0, fw 55.x
- iOS: 27.0, iPhone 16 Pro
- App: Goose 8.0
- Sync works fine (packets received and stored)
- No metric scores appear — UI stuck in "analysing collected data..." indefinitely
- User re-cloned repo and redeployed — still shows 8.0 (expected: MARKETING_VERSION hardcoded)

## Known Evidence

- `onSyncCompleted` at `CoreBluetoothBLETransport.swift:1075` only sets `lastHistoricalSyncCompletedAt` — does NOT trigger `runPacketInputs()` or `runPacketScores()`
- Band sleep sync (`GooseAppModel+SleepSync.swift`) explicitly calls `runPacketInputs()` → `runPacketScores()` after sync — historical sync does NOT
- Error catch at `HealthDataStore+Snapshots.swift:~61` silences errors with truncated 96-char string
- `min_owned_captures: 2` threshold in `HealthDataStore+Utilities.swift:119`
- Recovery score requires 3+ day HRV/RHR baseline (`+Utilities.swift:150`)

## Hypotheses (ranked)

1. Missing metric scoring trigger after historical sync completes (PRIMARY)
2. Silent error swallowing masking secondary failures
3. Insufficient captured data threshold (first-time user)
4. Missing HRV/RHR baseline for recovery score
5. fw 55.x packet schema incompatibility

## Current Focus

next_action: Apply fix — extend handleHistoricalSyncProgress to run the full score chain after runPacketInputs(), mirroring refreshSleepAfterBandSync ordering. Then xcodebuild verify.
hypothesis: REFINED. The sync-completion trigger DOES fire (GooseAppModel.swift:342 wires ble.onHistoricalSyncProgress -> handleHistoricalSyncProgress, which at HealthCapture.swift:309-312 calls runPacketInputs() on terminal progress). The gap is that it runs ONLY runPacketInputs() and never the scoring half of the pipeline. runPacketInputs() (HealthDataStore.swift:299-323) does NOT chain into scores. The proven working path refreshSleepAfterBandSync (HealthDataStore.swift:337-344) runs runDynamicSleepNeed() -> runPacketInputs() -> runSleepScore() -> runSleepStaging(). UI hero stays on spinner while packetScoreStatus starts with "Extracting" (HealthRecoveryStressViews.swift:41); since scores never run, status never leaves the initial state -> stuck "analysing collected data...".

## Reasoning Checkpoint

hypothesis: handleHistoricalSyncProgress runs runPacketInputs() but never the scoring chain, so packet-derived scores are never computed after a historical sync, leaving the UI loading state permanently active.
confirming_evidence:
  - GooseAppModel.swift:342-346 wires ble.onHistoricalSyncProgress -> handleHistoricalSyncProgress (trigger exists, contradicting original "no trigger" theory)
  - GooseAppModel+HealthCapture.swift:309-312: on terminal non-failed progress, only `Task { await healthStore.runPacketInputs() }` is invoked
  - HealthDataStore.swift:299-323: runPacketInputs() sets packetInputReports/packetInputStatus only; no call to any *Score* function
  - HealthDataStore.swift:337-344: working band-sleep reference runs runDynamicSleepNeed() FIRST then inputs then scores then staging
  - HealthRecoveryStressViews.swift:41: hero ProgressView shows while packetScoreStatus.hasPrefix("Extracting"); runPacketScores()/runSleepScore() are the only writers that clear it
falsification_test: If runPacketInputs() internally chained into runPacketScores(), the fix would be unnecessary and scores would appear. Read of HealthDataStore.swift:299-323 shows it does not — falsification attempt failed, hypothesis stands.
fix_rationale: Mirror the proven refreshSleepAfterBandSync ordering inside handleHistoricalSyncProgress: after runPacketInputs(), run runDynamicSleepNeed() (SLP-NEED-03 ordering) then runPacketScores(). This computes the scores that drive the UI out of the loading state, addressing the root cause (missing score computation) rather than the symptom (spinner). Also improve the silenced catch at HealthDataStore+Snapshots.swift:60 to log the full error before truncating.
blind_spots: fw 55.x packet-schema incompatibility could still yield zero usable records so scores compute but read as empty/calibrating; and first-run data thresholds (min_owned_captures: 2, 3-day baselines) can keep individual scores in a calibrating state even with the trigger fixed. The fix unblocks the pipeline; per-metric calibration is a separate, expected condition. Improved logging will surface any residual bridge errors for follow-up.

## Specialist Review (cross-AI)

Swift specialist dispatch was performed via cross-AI peer review per orchestrator instruction.

### Codex (gpt-5.1-codex-max) — VERDICT: functionally correct for the reported bug
- Confirmed the fix mirrors the proven band-sleep pipeline (dynamic sleep need -> packet inputs -> packet scores) and clears the "analysing..." gate; logging is correctly scoped.
- Flagged 3 robustness gaps:
  1. Re-entrancy: runPacketScores() had no running-guard, so overlapping terminal events could publish scores on stale inputs.
  2. Failure path: when progress.failed, packetScoreStatus was untouched — a FAILED sync would leave the UI stuck on the same "Extracting" spinner (same symptom as #188 on the failure branch).
  3. Logging: privacy: .public on full error — acceptable for diagnostics; verify bridge errors cannot contain PII.

### Gemini — status: timeout_during_agentic_file_read
- Both the file-path invocation and the self-contained-prompt workaround returned empty output (known Gemini CLI failure mode). Proceeded with Codex + Claude per recorded workflow.

### Hardening applied in response to review (re-verified BUILD SUCCEEDED)
- Failure-path fix: handleHistoricalSyncProgress now, on terminal failed sync, clears the stuck "Extracting" gate (only overriding an in-progress Extracting status) so a failed sync no longer leaves the UI spinning. Directly within #188 scope.
- Re-entrancy guard: added packetScoreRunID to HealthDataStore; runPacketScores() takes a fresh run-ID on entry and bails (without publishing) after the bridge await chain if a newer run started, so the latest sync's scores always win.
- PII note: bridge errors are JSON-RPC envelope error strings (method/error text), not raw biometric payloads; privacy: .public retained for diagnostics.

## Resolution

root_cause: handleHistoricalSyncProgress ran only runPacketInputs() after a successful historical sync and never the scoring half of the pipeline (runDynamicSleepNeed -> runPacketScores), so packetScoreStatus never left "Extracting..." and the UI hero (gated on packetScoreStatus.hasPrefix("Extracting")) spun forever.
fix: Extended handleHistoricalSyncProgress to run the full proven pipeline (runDynamicSleepNeed -> runPacketInputs -> runPacketScores) on successful terminal sync; added a failure-branch status clear; added full untruncated error logging in runPacketScores' catch; added a re-entrancy run-ID guard to runPacketScores. Files: GooseAppModel+HealthCapture.swift, HealthDataStore+Snapshots.swift, HealthDataStore.swift. Build verified (BUILD SUCCEEDED, iOS Simulator). Awaiting real WHOOP 5.0 hardware confirmation before final close.
