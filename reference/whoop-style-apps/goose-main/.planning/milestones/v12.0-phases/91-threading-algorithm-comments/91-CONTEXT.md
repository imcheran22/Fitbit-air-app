# Phase 91 Context: Threading & Algorithm Comments

## Phase Goal
Add comments at source explaining: Swift threading invariants (GooseRustBridge, NSLock, @MainActor) and Rust algorithm coefficients (eTRIMP, EWMA, Cole-Kripke) with bibliographic references.

## No gray areas — success criteria fully specified in ROADMAP

## COMM-02: Swift Threading Comments

### Target files and comment locations

**GooseRustBridge.swift**:
- At class declaration: synchronous FFI contract (goose_bridge_handle_json blocks calling thread — never call from @MainActor)
- At multiple-instance pattern: each owner (GooseAppModel, HealthDataStore, OvernightSQLiteMirrorQueue, CaptureFrameWriteQueue) holds its own instance — intentional, Rust side is stateless
- At request() method: callers must dispatch to a background queue; return is always on calling thread

**CaptureFrameWriteQueue.swift**:
- At NSLock: explain guard scope — protects batch queue between enqueue (BLE thread) and flush (write queue)
- At @unchecked Sendable: why it's safe (all mutation goes through NSLock)

**OvernightSQLiteMirrorQueue.swift**:
- Same NSLock pattern as CaptureFrameWriteQueue

**GooseAppModel.swift**:
- At notificationIngestQueue / notificationParseQueue: explain BLE → parse → write pipeline threading model
- At @MainActor class: which operations must NOT block this thread (Rust bridge calls)

## COMM-03: Rust Algorithm Comments

### Target: Rust/core/src/store/metrics.rs (or metric_features.rs — check both)

**Banister eTRIMP coefficients (1.92 / 1.67)**:
- Where found: HR zone intensity calculation
- Comment: cite Banister et al. 1991 (orig eTRIMP) + Morton 1990 (aerobic/anaerobic weighting)
- Formula context: aerobic load uses 1.92 exponent (higher HR → disproportionately more load), anaerobic uses 1.67

**EWMA alpha (0.0483 = 14-night half-life)**:
- Where found: recovery/fitness form EWMA
- Comment: α = 1 - exp(-ln2/14) ≈ 0.0483; 14-night half-life matches Banister CTL (Chronic Training Load)
- Cite: Banister et al. 1991; Coggan 2003 (TSS/PMC adaptation)

**Cole-Kripke scale (0.001)**:
- Where found: actigraphy/sleep staging
- Comment: Cole et al. 1992 wrist-actigraphy scale; 0.001 converts raw accelerometer counts to sleep probability
- Original Cole-Kripke: Ps = 1/(1 + exp(-(−4.0 + 0.001*A)))

## Files to modify
| File | Requirement |
|------|-------------|
| GooseSwift/GooseRustBridge.swift | COMM-02 |
| GooseSwift/CaptureFrameWriteQueue.swift | COMM-02 |
| GooseSwift/OvernightSQLiteMirrorQueue.swift | COMM-02 |
| GooseSwift/GooseAppModel.swift | COMM-02 |
| Rust/core/src/store/metrics.rs or metric_features.rs | COMM-03 |

## Constraints
- Comment-only changes — no logic modifications
- iOS build and cargo test --locked must pass (no risk since no code changes)
- Comment style: `// THREADING: ...` for threading, `// ALGO: ...` for algorithm rationale
