# Phase 92: Export & Auth Bug Fixes - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-19
**Phase:** 92-export-auth-bug-fixes
**Areas discussed:** Auth prompt UX, Manifest by-reference shape

---

## Auth prompt UX

| Option | Description | Selected |
|--------|-------------|----------|
| Alert sheet | System UIAlertController / SwiftUI .alert — interrupts clearly, user must act. Consistent with iOS convention for unrecoverable states. | ✓ |
| ConnectionView state change | Update connectionState to .authExhausted — ConnectionView shows a prominent button inline. Less intrusive but user might miss it. | |
| Persistent banner in DeviceView | Sticky warning row in DeviceView that persists until user taps 'Reconnect'. Visible in context but requires navigating to Device tab. | |

**User's choice:** Alert sheet (recommended)
**Notes:** User also selected alert action = disconnect + forget (not auto-reconnect, not just dismiss).

---

## Alert action on tap

| Option | Description | Selected |
|--------|-------------|----------|
| Disconnect + forget — user reconnects manually | Calls disconnect(), clears rememberedDeviceID, navigates user back to scan. Clean slate. | ✓ |
| Disconnect only — auto-reconnect starts | Disconnects and immediately starts scanning for the same device again. May loop if root cause persists. | |
| Just dismiss — user decides what to do | Alert closes, retry loop stopped, no further action. User must navigate manually. | |

**User's choice:** Disconnect + forget — user reconnects manually
**Notes:** Clean slate approach preferred. User initiates new connection deliberately.

---

## Manifest by-reference shape

| Option | Description | Selected |
|--------|-------------|----------|
| Pass file URL/path string | validate() takes the URL of the already-written manifest JSON — Rust reads from disk. Swift drops the in-memory dict. | ✓ |
| Pass manifest ID / bundle path only | validate() takes only the bundle directory path; Rust resolves manifest filename internally. | |
| Refactor to lazy load | Keep the dict but make it a class (reference type) wrapped in a box. Heavier change, lower confidence vs. disk approach. | |

**User's choice:** Pass file URL/path string (recommended)
**Notes:** Manifest is already written to disk by writeRawValidationSidecars() before validate() is called — the URL is available, no extra I/O needed.

---

## Claude's Discretion

- Specific wording of alert title/message and button labels (e.g., "Reconnect WHOOP" vs "Device Connection Failed")
- Whether `.authExhausted` connection state case is needed or a boolean published property suffices
- Bridge method name for `manifest_path` argument (update existing method vs. new method)

## Deferred Ideas

None.
