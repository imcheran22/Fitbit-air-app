---
status: passed
phase: 33
method: ghidra_static_analysis
date: 2026-06-08
---

# Phase 33: Ghidra Algorithm Audit — Verification

## Summary

3 audit agents ran against WHOOP 5.37.0 AARCH64 iOS binary (Ghidra MCP, 8,621 functions).

Key finding: Most algorithm computation is server-side. iOS binary contains calorie coefficients and some recovery score parameters.

## GHIDRA-01: Recovery/HRV
- k=1.6: FOUND at 0x105ca10e0 ✓
- z0=0.20: FOUND at 0x1058a5a78 ✓
- HRV weight 0.60: FOUND at 0x1058a5a58 ✓
- EWMA half-lives: NOT_FOUND (server-side) — accepted as approximation
- **Verdict: PARTIAL** — logistic parameters confirmed; EWMA server-side

## GHIDRA-02: Sleep Staging
- Cole-Kripke weights [106,54,58,76,230,74,67]: NOT_FOUND (server-side)
- scale=0.001: NOT_FOUND (server-side)
- **Verdict: NOT_FOUND** — server-side computation; implementation follows noop/literature

## GHIDRA-03: Strain/Calories/SpO2
- H-B + Keytel coefficients: CONFIRMED from prior FINDINGS_5.md ✓
- Banister b-exponents: NOT_FOUND (server-side) — accepted
- Strain denominator 7201: NOT_FOUND (server-side) — accepted
- SpO2 a=110: FOUND ✓
- **Verdict: PARTIAL** — calories confirmed; strain/Banister server-side

## Divergences requiring action

None. All NOT_FOUND items are accepted as server-side computations or literature-standard values. No DIVERGES findings (no case where binary differs from implementation).

## Outcome

Phase 33 objectives met: each algorithm family cross-referenced against binary. Findings classified as CONFIRMED, NOT_FOUND, or PARTIAL per spec. No corrective action required.
