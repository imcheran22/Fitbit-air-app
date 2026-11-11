---
name: hr-decimation
description: HR sample decimation for HeartRateSeriesStore — prevents memory growth in long sessions and improves chart render performance
metadata:
  type: seed
  trigger_condition: when planning v10.0 milestone scope
  planted_date: 2026-06-11
---

## Idea

Add a decimation layer to `HeartRateSeriesStore` that reduces stored samples based on the active time window, equivalent to `WHPHeartRateDecimator2` in WHOOP v5.37.0.

## Problem

The WHOOP device sends one HR sample per second via BLE. `HeartRateSeriesStore.shared` retains all samples in memory without reduction. Over an overnight session (~8h) this is ~28,800 points. SwiftUI renders all of them when drawing the HR chart, regardless of zoom level.

**Memory growth is already mitigated:** `HeartRateSeriesStores.swift` has `maxSamples = 100_000` + a `prune()` call — so memory explosion is not the real risk.

The remaining problem is **chart render performance at high zoom-out**: when rendering a full overnight or multi-day view, passing 28k+ points to SwiftUI Charts causes dropped frames on older devices. Decimation fixes render cost without touching the persistence layer.

## What to build

A `GooseHRDecimator` that operates on the in-memory series before passing to chart views:

| Time window | Target resolution |
|-------------|------------------|
| < 30 min | Raw (1s) |
| 30 min – 4h | 1 sample/min (60:1) |
| > 4h | 1 sample/5 min (300:1) |

Decimation strategy: LTTB (Largest Triangle Three Buckets) preserves visual shape better than simple averaging — preferred for HR charts.

## Research basis

`WHPHeartRateDecimator2` + Delegate in WHOOP v5.37.0. The `2` suffix suggests an iteration over a first version — WHOOP found this worth building twice.

## Trigger condition

Only build when `HeartRateSeriesStore` growth becomes a measurable problem. Check memory profile in Instruments before prioritising.

## Files to touch

- New: `GooseSwift/GooseHRDecimator.swift`
- Modify: `GooseSwift/HeartRateSeriesStores.swift` (apply decimation before publishing to views)
- Modify: relevant HR chart view (no change needed if decimation is transparent)
