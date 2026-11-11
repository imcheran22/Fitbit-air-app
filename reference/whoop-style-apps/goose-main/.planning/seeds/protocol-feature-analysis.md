---
name: protocol-feature-analysis
description: Protocol implementation details pre-researched for 10 features (issues #159-168) — consult re-assets/ before planning any of these
metadata:
  type: seed
  trigger_condition: when planning any of issues #159 #160 #161 #162 #163 #164 #165 #166 #167 #168
  planted_date: 2026-06-19
---

## What this is

Protocol-level implementation details for 10 features are already documented and ready for planning. Before writing a PLAN.md for any of these issues, read the relevant section in `re-assets/ANALYSIS-features.md` (gitignored, local only).

## Features covered

| Issue | Feature | Confidence | Notes |
|-------|---------|------------|-------|
| #159 | MTU 247 + LE 2M PHY explicit connect | HIGH | Connection sequence fully documented, class-level detail available |
| #160 | Ring buffer parsing (ring_capacity, wrap-around formula) | HIGH | Exact formula documented; Goose must compute locally |
| #161 | Off-wrist detection via 0x54 | LOW | Response payload not confirmed; V24 skin_contact at offset 48 is an alternative |
| #162 | HPS sync quality telemetry | HIGH | All metric names and computation formulas documented |
| #163 | HISTORICAL_DATA_RESULT 8-byte identity | MEDIUM | Likely frame header bytes, not device serial; requires hardware validation |
| #164 | Harvard sleep need model | MEDIUM | Server-side only; no local fallback; DTO interface confirmed |
| #165 | Feature flags read (0x80) | LOW | Protocol confirmed; flag index → meaning mapping requires BLE capture |
| #166 | Body composition history | LOW | Endpoints confirmed; DTO fields not recovered |
| #167 | Stealth metrics | MEDIUM | Full API interface recovered; metricType values need hardware confirmation |
| #168 | PIP separate pipeline | MEDIUM | Endpoint confirmed; PIPs on same BLE characteristic as HPS; continuous not session-gated |

## How to use

1. Pick the issue to implement
2. Read the relevant section in `re-assets/ANALYSIS-features.md`
3. Note the confidence level — LOW confidence items need a hardware validation gate before full implementation
4. For LOW confidence features: implement read-and-log first, validate, then complete

## Hardware gates remaining

- #161 off-wrist: V24 skin_contact offset 48 can be used instead of 0x54 polling
- #163 identity bytes: requires BLE capture during real sync
- #165 flag indices: requires BLE capture with known device states
