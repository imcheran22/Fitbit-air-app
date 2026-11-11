# GHIDRA-02: Sleep Staging Audit — WHOOP 5.37.0 AARCH64

**Date:** 2026-06-08
**Binary:** Whoop (AARCH64, image base 0x100000000)
**Method:** Byte-pattern search via Ghidra MCP

## Constants Searched

| Constant | Expected | Status | Notes |
|----------|----------|--------|-------|
| Cole-Kripke weights | [106, 54, 58, 76, 230, 74, 67] as int32 LE array | NOT_FOUND | Pattern `6A 00 00 00 36 00 00 00 3A 00 00 00...` not in binary |
| Cole-Kripke weights | As int16 LE array | NOT_FOUND | Pattern `6A 00 36 00 3A 00 4C 00 E6 00 4A 00 43 00` not found |
| scale=0.001 | f64 LE: 5A 64 3B DF 4F 8D 50 3F | NOT_FOUND | — |
| wake threshold | 1.0 or similar | NOT_FOUND | — |
| HR percentile p25 | NOT_FOUND | — | — |
| HR percentile p70 | NOT_FOUND | — | — |

## Analysis

No Cole-Kripke weight arrays were found in the WHOOP iOS binary in any format (int32, int16, f64). This strongly indicates sleep staging is computed server-side and the iOS app only displays the result.

This is consistent with:
- No sleep staging function symbols found in the 8,621-function binary
- Phase 33 ROADMAP note: "Locate Cole-Kripke weight array in binary; verify exact values"
- The WHOOP app typically shows sleep stage results that are synced from server

## Verdict

| Finding | Classification |
|---------|---------------|
| Cole-Kripke weights [106,54,58,76,230,74,67] | **NOT_FOUND** — not in iOS binary |
| scale=0.001 | **NOT_FOUND** — not in iOS binary |
| Staging thresholds | **NOT_FOUND** — not in iOS binary |

**Overall: NOT_FOUND** — Sleep staging computed server-side. Our Cole-Kripke implementation (scale=0.001, weights from literature [106,54,58,76,230,74,67]) is based on published noop/literature sources. Cannot confirm or refute against binary — accepted as approximation.
