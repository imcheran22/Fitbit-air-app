# Phase 62: Upload Watermark per Sensor - Context

**Gathered:** 2026-06-11
**Status:** Ready for planning
**Mode:** Auto-generated (infrastructure phase — discuss skipped)

<domain>
## Phase Boundary

Track the last successfully uploaded timestamp per data type (raw frames, processed metrics) so restarts and partial uploads never re-send data already in TimescaleDB. Matches WHOOP's WHPStrapLatestUploadedMetricDateKey / per-sensor high-water-mark pattern. Watermarks persisted to UserDefaults or SQLite; updated atomically on upload success; reset path for logout/device swap. Server-side deduplication (reject or ignore frames below committed watermark). No UI changes.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion
All implementation choices at Claude's discretion — pure infrastructure phase.

Key constraints from ROADMAP:
- Watermark persisted per upload type (raw frames, daily metrics)
- Updated atomically on upload success
- After crash mid-upload, next launch resumes from watermark (no duplicate rows in TimescaleDB)
- Server-side POST /v1/ingest-frames rejects or deduplicates frames below committed watermark
- `clearAllWatermarks()` reset path for logout / device swap
- Match WHOOP shape: `watermarksByRevision: [Int: Date]` pattern — but simpler binary watermark (timestamp per type) is acceptable given Goose's upload model

Preferred storage: UserDefaults (same as bondingState, simple, no SQLite dependency for this metadata).
Preferred key namespace: `goose.swift.upload.*` (consistent with `goose.swift.ble.*`).

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `GooseBLEBondingManager` — exact analog: UserDefaults persistence pattern, static key constants, `clearAll`-style reset
- `GooseAppModel+Upload.swift` — where upload logic lives; watermark reads/writes go here
- `GooseAppModel+BandFirstSync.swift` — foreground trigger that fires upload; watermark gate inserted here

### Established Patterns
- `goose.swift.*` UserDefaults key prefix
- `static let` for key constants on the owning type
- No external dependencies (URLSession only)

### Integration Points
- `GooseAppModel+Upload.swift` — wrap upload call with watermark check (skip if below) and update on success
- Server `POST /v1/ingest-frames` — add `since` query param or server-side dedup
- `MoreDebugViews.swift` or `GooseAppModel` — expose watermark state for debug visibility

</code_context>

<specifics>
## Specific Ideas

Watermark types: `rawFrames` (timestamp of last uploaded frame) and `dailyMetrics` (timestamp of last uploaded day). No per-revision complexity — simpler than WHOOP's `[Int: Date]` dict; a single `Date?` per type suffices given Goose's append-only upload model.

</specifics>

<deferred>
## Deferred Ideas

- Per-revision watermarks matching WHOOP's full `watermarksByRevision: [Int: Date]` — stretch goal
- RuntimeWaterMarkReporter (reporting watermark state to server analytics) — out of scope

</deferred>
