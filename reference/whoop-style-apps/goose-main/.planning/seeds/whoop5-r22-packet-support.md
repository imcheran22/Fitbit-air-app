---
name: whoop5-r22-packet-support
description: WHOOP 5.0 R22 packet parsing support — fixes missing metrics for users with WHOOP 5.0 firmware that streams type 0x10 instead of 0x9a/0x9b
metadata:
  type: seed
  trigger_condition: when planning next milestone (v10.0 or equivalent)
  planted_date: 2026-06-11
  source_issue: "tigercraft4/goose#92 (darylbleach — WHOOP 5.0)"
---

## Problem

WHOOP 5.0 devices (serial prefix `AG`) stream biometric data on GATT handle `0x0022` using
packet type `0x10` (R22). The Goose Rust parser only handles type `0x9a`/`0x9b` (R17,
`r17_optical_or_labrador_filtered`). Users with WHOOP 5.0 receive no metrics — HR, HRV,
and strain are all blank.

Confirmed via BTSnoop HCI capture from issue reporter (WHOOP 5.0, firmware TBD).

## What Goose currently does

1. Subscribes to `fd4b0004-cce1-4033-93ce-002d5875f58a` (Gen5) — so it **does** receive
   R22 notifications from handle `0x0022`.
2. Passes bytes to Rust bridge via `NotificationFrameParser`.
3. Rust parser does not recognise frame type `0x10` → packet discarded silently.

The BLE subscription layer requires **no changes**. The fix is purely in the Rust parser.

## R22 packet format (reverse-engineered from BTSnoop capture)

```
Byte 0:   0x10        — R22 type marker
Byte 1:   battery_pct — battery level 0–100 (%)
Bytes 2–3: hr_milli   — heart rate × 10 in milli-bpm, little-endian (÷10 = BPM)
Bytes 4–5: extra      — optional; present in 6-byte variant (purpose TBD — possibly
                        HRV ms, confidence, or a secondary HR channel)
```

Confirmed sample values (from ~70-second capture):

| Frame hex        | Battery | HR (bpm) |
|------------------|---------|----------|
| `10 50 31 05`   | 80%     | 132.9    |
| `10 50 c2 02`   | 80%     | 70.6     |
| `10 50 8e 03`   | 80%     | 91.0     |
| `10 48 40 06`   | 72%     | 160.0    |
| `10 46 b1 05 7a 02` | 70% | 145.7 + extra `027a` |
| `10 44 f0 02 de 01` | 68% | 75.2  + extra `01de` |

The 4-byte variant appears during resting/recovery. The 6-byte variant appears during
active workout periods. The `extra` field purpose requires further investigation — a second
BTSnoop capture during a known workout with simultaneous WHOOP app data would help.

## Enable commands (already sent by Goose)

The WHOOP firmware requires persistent config key commands to activate R22. The BTSnoop
debug log confirms Goose **already sends** these on connection:

```
BLE_CMD: Send persistent config key, index 2: enable_r22_v2_packets
BLE_CMD: Send persistent config key, index 3: enable_r22_v3_packets
...through index 8 (enable_r22_v8_packets)
BLE_CMD: Send persistent config key, index 8: make_hrfm_visible
BLE_CMD: Send persistent config key, index 9: disable_pip_r26_packets
BLE_CMD: Send persistent config key, index 10: wear_detect_bias
BLE_CMD: Send persistent config key, index 13: hr_ch_switch
```

No BLE-layer changes required.

## What to build

1. **Rust parser** — add `R22` variant to the packet type enum alongside R17:
   - Recognise frame type `0x10` in the notification parser
   - Extract `battery_pct`, `hr_milli_bpm` (÷10), and optional `extra` bytes
   - Map to a new `body_summary_kind`: `"r22_whoop5_hr"` (analogous to
     `"r17_optical_or_labrador_filtered"`)

2. **Metric features** — wire R22 HR samples into the existing HR pipeline:
   - Add `r22_whoop5_hr` as a trusted source alongside R17 in `trusted_frames_for_summary_kinds`
   - Validate RR interval extraction from the optional 6-byte variant once its meaning is confirmed

3. **Debug / More tab** — surface R22 packet count in diagnostics (alongside existing
   R17 counters) so future reporters can confirm R22 is being received.

## Open questions

- What is the `extra` field in the 6-byte variant? Candidate: HRV channel, SpO2, or
  secondary optical sensor. Needs a second capture with known ground truth.
- Does WHOOP 5.0 also send R17 on `0x0027` in parallel? (BTSnoop shows `0x9a`/`0x9b`
  on `0x0027` alongside R22 on `0x0022` — may need to deduplicate.)
- R22 variant numbering (v2–v8 from config keys): do different variants have different
  payload layouts?

## Research assets

- BTSnoop capture: provided by darylbleach via issue #92 (stored locally, not committed)
- Issue: https://github.com/tigercraft4/goose/issues/92
