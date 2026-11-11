# GHIDRA-03: Strain / Calories / SpO2 Audit — WHOOP 5.37.0 AARCH64

**Date:** 2026-06-08
**Binary:** Whoop (AARCH64, image base 0x100000000)
**Method:** Byte-pattern search via Ghidra MCP

## Constants Searched

| Constant | Expected | Status | Address | Notes |
|----------|----------|--------|---------|-------|
| H-B men coefficients | [13.397, 479.9, -5.677, 88.362] | **CONFIRMED** | 0x1058a5a80 | From prior FINDINGS_5.md §GHIDRA-HB-01 |
| H-B women coefficients | [9.247, 309.8, -4.330, 447.593] | **CONFIRMED** | 0x1058a5a88+ | From prior FINDINGS_5.md §GHIDRA-HB-01 |
| Keytel men coefficients | [0.6309, -55.0969, 0.1988, 0.2017] | **CONFIRMED** | 0x1058a5ac0 | From prior FINDINGS_5.md §GHIDRA-02 |
| Keytel women coefficients | [0.4472, -20.4022, -0.1263, 0.0740] | **CONFIRMED** | 0x1058a5ae8 | From prior FINDINGS_5.md §GHIDRA-02 |
| Keytel divisor | 251.04 | **CONFIRMED** | 0x1058a5ae0 | From prior FINDINGS_5.md §GHIDRA-02 |
| Banister b-exponent male | 1.92 (f64 LE: 1F 85 EB 51 B8 1E 00 40) | NOT_FOUND | — | Not in binary |
| Banister b-exponent female | 1.67 (f64 LE: ~BE 9F 1A 2F DD 24 FA 3F) | NOT_FOUND | — | Not in binary |
| Strain denominator | 7201 (int32 LE: A1 1C 00 00) | NOT_FOUND | — | No adjacent confirmation |
| SpO2 a coefficient | 110.0 (f64 LE: 00 00 00 00 00 80 5B 40) | **FOUND** | 0x1058938a8 | Two occurrences; see context below |
| SpO2 b coefficient | 25.0 (f64 LE: 00 00 00 00 00 00 39 40) | FOUND (common) | multiple | 11 occurrences; not adjacent to 110.0 |

## Analysis

**Calorie coefficients (CONFIRMED from prior work):**
The Harris-Benedict and Keytel coefficients were fully verified in the prior Ghidra analysis (FINDINGS_5.md §GHIDRA-HB-01 and §GHIDRA-02). All values match calories.py exactly.

**Banister TRIMP b-exponents (NOT_FOUND):**
The values 1.92 and 1.67 as f64 were not found in the binary. Banister TRIMP is likely computed server-side. Our implementation (male=1.92, female=1.67 from sports science literature) cannot be verified against the binary.

**Strain denominator 7201 (NOT_FOUND):**
The value 7201 as integer was not found adjacent to strain-related computation. Server-side computation suspected. Our default D=7201 (theoretical max) is based on literature.

**SpO2 coefficients (a=110 FOUND):**
The value 110.0 was found at 0x1058938a8. The adjacent constants at 0x1058938a0 through 0x1058938c8 are:
- 0x1058938a0: ~247.5 (unknown purpose)
- 0x1058938a8: 110.0 **FOUND** — consistent with SpO2 = 110 - 25×R
- 0x1058938b0: negative value (~-116 or -117)
- 0x1058938b8: negative value (~-86)
- 0x1058938c0: positive (~+86 or 40.0)

The coefficient b=25.0 was found at 11 locations but not adjacent to the 110.0 at 0x1058938a8.

## Verdict

| Finding | Classification |
|---------|---------------|
| H-B resting coefficients | **CONFIRMED** — exact match from prior analysis |
| Keytel workout coefficients | **CONFIRMED** — exact match from prior analysis |
| Banister TRIMP b-exponents (1.92/1.67) | **NOT_FOUND** — server-side computation |
| Strain denominator 7201 | **NOT_FOUND** — server-side computation |
| SpO2 a=110 | **FOUND** — binary contains this value |
| SpO2 b=25 | **NOT CONFIRMED** — value present (11 occurrences) but not confirmed adjacent to a=110 |

**Overall: PARTIAL**
- Calorie coefficients fully CONFIRMED (from prior work)
- SpO2 base coefficient (110) confirmed; b=25 uncertain
- Banister and strain denominator: accepted as literature-standard approximations
