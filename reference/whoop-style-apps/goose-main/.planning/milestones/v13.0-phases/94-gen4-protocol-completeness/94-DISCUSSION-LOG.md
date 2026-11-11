# Phase 94: Gen4 Protocol Completeness - Discussion Log

> **Audit trail only.**

**Date:** 2026-06-19
**Phase:** 94-gen4-protocol-completeness
**Areas discussed:** Gen4 data quality display, packet47 reassembly error handling

---

## Gen4 metric display

| Option | Selected |
|--------|----------|
| Display as-is, no caveat | ✓ |
| Display with 'WHOOP 4.0' source label | |
| Hide until device RE confirms offsets | |

**Notes:** Show same as WHOOP 5.0. Byte offsets from protocol.rs comments.

---

## packet47 reassembly error

| Option | Selected |
|--------|----------|
| Log warning + continue with partial data | ✓ |
| Discard the whole frame, continue sync | |
| Retry the historical sync request | |

**Notes:** Partial sync > no sync. No BLE retry complexity.

---

## Claude's Discretion

- Exact respiratory_rate byte offset (researcher finds from code)
- Warning log format details
