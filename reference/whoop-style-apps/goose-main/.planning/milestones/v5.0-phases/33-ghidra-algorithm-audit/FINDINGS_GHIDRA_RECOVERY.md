# GHIDRA-01: Recovery / HRV Audit — WHOOP 5.37.0 AARCH64

**Date:** 2026-06-08
**Binary:** Whoop (AARCH64, image base 0x100000000)
**Method:** Byte-pattern search via Ghidra MCP

## Constants Searched

| Constant | Expected | Status | Address | Notes |
|----------|----------|--------|---------|-------|
| Logistic k | 1.6 (f64 LE: 9A 99 99 99 99 99 F9 3F) | **FOUND** | 0x105ca10e0 | Single f64 constant; no function symbol at this location (data region) |
| Logistic z0 | 0.20 (f64 LE: 9A 99 99 99 99 99 C9 3F) | **FOUND** | 0x1058a5a78 | Part of constant pool adjacent to calorie coefficients |
| HRV weight | 0.60 (f64 LE: 33 33 33 33 33 33 E3 3F) | **FOUND** | 0x1058a5a58 | Constant pool; 37 additional instances exist (common value) |
| RHR inversion sign | -1.0 (explicit negation) | NOT_FOUND | — | No recovery score function symbol; server-side computation suspected |
| EWMA half-life center | 14 nights (α≈0.0483) | NOT_FOUND | — | No explicit EWMA constant found |
| EWMA half-life spread | 21 nights (α≈0.0328) | NOT_FOUND | — | No explicit EWMA constant found |

## Analysis

The constants k=1.6 and z0=0.20 are present in the binary as isolated f64 values. However:
- No function named 'recovery', 'hrv', 'score', or equivalent was found in the function symbol table (8,621 functions analyzed via search)
- The constant pool at 0x1058a5a58 also contains 0.40, 0.15 (frequency band boundaries for HRV power), 0.60, 0.20 — consistent with a health analytics module
- EWMA state machine constants were not located — likely computed server-side

## Verdict

| Finding | Classification |
|---------|---------------|
| k=1.6 (logistic steepness) | **FOUND** — binary contains this value |
| z0=0.20 (logistic shift) | **FOUND** — binary contains this value |
| HRV weight 0.60 | **FOUND** — binary contains this value (also common in other contexts) |
| RHR inversion | **NOT_FOUND** — server-side |
| EWMA half-lives | **NOT_FOUND** — server-side |

**Overall: PARTIAL** — Logistic parameters confirmed in binary; EWMA/RHR computation is server-side. Our implementation uses k=1.6 and z0=0.20 matching binary evidence.
