# BLE Frame Decode Status

Complete inventory of all known WHOOP BLE packet types, subtypes, and fields — with their current decode state in the Goose Rust core.

**Status legend**: `DECODED` — production-ready extraction · `PARTIAL` — structure known, fields incomplete · `CANDIDATE` — data present, blocked by metric_readiness or calibration · `NOT_DECODED` — no field-level parsing · `RAW_ONLY` — packet_type captured, payload opaque

**Sources**: `Rust/core/src/protocol.rs`, `Rust/core/src/bridge.rs`, `Rust/core/src/store.rs`

---

## 1. Packet Types

| Byte | Name | State | Extracted | Missing |
|------|------|-------|-----------|---------|
| 35 (0x23) | COMMAND | PARTIAL | type, seq, cmd, cmd_name | per-command payload structures |
| 36 (0x24) | COMMAND_RESPONSE | PARTIAL | type, seq, origin_seq, result_code | response data payloads |
| 37 (0x25) | PUFFIN_COMMAND | RAW_ONLY | packet_type only | full command structure |
| 38 (0x26) | PUFFIN_COMMAND_RESPONSE | RAW_ONLY | packet_type only | full response structure |
| 40 (0x28) | REALTIME_DATA | PARTIAL | packet_k, domain, timestamp, body_summary (K10/K17/K21) | other K-values, V24 fields |
| 43 (0x2B) | REALTIME_RAW_DATA | PARTIAL | packet_k, domain, timestamp, body_summary (K10/K17/K21) | other K-values |
| 47 (0x2F) | HISTORICAL_DATA | PARTIAL | packet_k, domain, timestamp, hr_marker; body_summary (K9/K12/K18/K24/K10/K21/K17); V24 biometrics: spo2, skin_temp, resp, sig_quality, skin_contact (Phase 27, v5.0) | RR from V24 direct fields; ppg_flags; ambient/LED channels; unmapped bytes 30–32, 45–47 |
| 48 (0x30) | EVENT | PARTIAL | event_id, event_name, timestamp_s, timestamp_subsec | all event payload structures |
| 49 (0x31) | METADATA | RAW_ONLY | packet_type only | full metadata structure (offload control) |
| 50 (0x32) | CONSOLE_LOGS | RAW_ONLY | packet_type only | log content parsing |
| 51 (0x33) | REALTIME_IMU_DATA_STREAM | PARTIAL | packet_k, domain, timestamp, body_summary (K10/K21) | other K-values |
| 52 (0x34) | HISTORICAL_IMU_DATA_STREAM | PARTIAL | packet_k, domain, timestamp, body_summary (K10/K21) | other K-values |
| 53 (0x35) | RELATIVE_PUFFIN_EVENTS | RAW_ONLY | packet_type only | event structure |
| 54 (0x36) | PUFFIN_EVENTS_FROM_STRAP | RAW_ONLY | packet_type only | event structure |
| 55 (0x37) | RELATIVE_BATTERY_PACK_CONSOLE_LOGS | RAW_ONLY | packet_type only | log parsing |
| 56 (0x38) | PUFFIN_METADATA | RAW_ONLY | packet_type only | metadata structure |

---

## 2. Data Packet Subtypes (packet_k)

Applies to packet types 40, 43, 47, 51, 52.

| K | Domain | HR Marker Offset | State | Extracted | Not Extracted |
|---|--------|-----------------|-------|-----------|---------------|
| 7 | legacy_raw_or_research_counted | payload+27 | PARTIAL | k, domain, timestamp, hr_present | raw data fields |
| 9 | normal_history_with_hr_marker | payload+17 | PARTIAL | k, domain, timestamp, hr_present | V24 biometric suite |
| 10 | raw_motion_stream_result | — | **DECODED** | hr@+17, accel XYZ (100 samples @85/285/485), gyro XYZ (100 samples @688/888/1088) | axis calibration metadata |
| 11 | raw_stream_counted | — | NOT_DECODED | k, domain, timestamp | raw data fields |
| 12 | normal_history_with_hr_marker | payload+17 | PARTIAL | k, domain, timestamp, hr_present | V24 biometric suite |
| 16 | raw_ecg_labrador | — | NOT_DECODED | k, domain, timestamp | ECG samples, channel info |
| 17 | r17_optical_or_labrador_filtered | — | PARTIAL | flags (@13), flag_bit_9, flag_bit_11, channels_or_gain (@15-20), sample_count (@24), i16 samples (@26+) | PPG channel interpretation, sample rate |
| 18 | normal_history_with_hr_marker | payload+14 | PARTIAL | k, domain, timestamp, hr_present | V24 biometric suite |
| 19 | research_packet | — | NOT_DECODED | k, domain, timestamp | research-specific fields |
| 20 | raw_or_research_counted | — | NOT_DECODED | k, domain, timestamp | counted raw/research data |
| 21 | raw_motion_stream_result | — | **DECODED** | field_x (@14), group_1_count (@16), group_2_count (@622), 6 variable-length axes | group semantics, field_x meaning |
| 22 | research_packet | — | NOT_DECODED | k, domain, timestamp | research-specific fields |
| 24 | normal_history_with_hr_marker | payload+17 | PARTIAL | k, domain, timestamp, hr_present | V24 full biometric suite (priority target) |
| 25 | pulse_information_packet | — | NOT_DECODED | k, domain, timestamp | pulse information fields |
| 26 | pulse_information_packet | — | NOT_DECODED | k, domain, timestamp | pulse information fields |

---

## 3. V24 Historical Data Fields

**Applies to**: packet_type=47 (HISTORICAL_DATA), k=9/12/18/24 — the primary biometric history packet.

Offsets are **payload-relative** (`data = pkt[3:]`, i.e. after the 3-byte BLE inner header). Frame-absolute offset = data offset + 7.

Offsets verified against real V24 captures. See `Rust/core/tests/v24_biometric_protocol_tests.rs` for synthetic payload tests.

| Field | data[] offset | Frame offset | Type | State | Goose output |
|-------|-------------|-------------|------|-------|-------------|
| unix_ts | 4–7 | 11–14 | u32 LE | **DECODED** | Unix seconds |
| sensor_m | 12 | 19 | u8 | NOT_DECODED | sensor status/mode |
| sensor_n | 13 | 20 | u8 | NOT_DECODED | sensor config |
| **hr** | 14 | 21 | u8 | **DECODED** | BPM (via hr_marker) |
| **rr_count** | 15 | 22 | u8 | CANDIDATE | number of RR intervals (0–4) |
| **rr[0]** | 16–17 | 23–24 | u16 LE | CANDIDATE | RR interval ms |
| **rr[1]** | 18–19 | 25–26 | u16 LE | CANDIDATE | RR interval ms |
| **rr[2]** | 20–21 | 27–28 | u16 LE | CANDIDATE | RR interval ms |
| **rr[3]** | 22–23 | 29–30 | u16 LE | CANDIDATE | RR interval ms (skip zeros) |
| ppg_flags | 24–25 | 31–32 | u16 LE | NOT_DECODED | PPG config/flags |
| **ppg_green** | 26–27 | 33–34 | u16 LE | CANDIDATE | PPG green channel raw ADC |
| **ppg_red_ir** | 28–29 | 35–36 | u16 LE | CANDIDATE | PPG red/IR combined raw ADC |
| unmapped | 30–32 | 37–39 | ??? | NOT_DECODED | unknown |
| **gravity_x** | 33–36 | 40–43 | f32 LE | CANDIDATE | g units (already converted, no LSB needed) |
| **gravity_y** | 37–40 | 44–47 | f32 LE | CANDIDATE | g units |
| **gravity_z** | 41–44 | 48–51 | f32 LE | CANDIDATE | g units |
| unmapped | 45–47 | 52–54 | ??? | NOT_DECODED | unknown |
| **skin_contact** | 48 | 55 | u8 | **DECODED/GATED** | 0 = off-wrist, non-0 = on-wrist; stored as `contact` column in all V24 tables; contact=0 samples stored but excluded from unit conversion |
| **gravity2_x** | 49–52 | 56–59 | f32 LE | **DECODED** | second gravity triplet — extracted via `protocol.rs` offsets 49/53/57; written to `gravity2_samples` via `store.insert_gravity2_batch` |
| **gravity2_y** | 53–56 | 60–63 | f32 LE | **DECODED** | second gravity triplet |
| **gravity2_z** | 57–60 | 64–67 | f32 LE | **DECODED** | second gravity triplet |
| unmapped | 61–67 | 68–74 | ??? | NOT_DECODED | unknown |
| **spo2_red** | 61–62 | 68–69 | u16 LE | **DECODED** | SpO2 red channel raw ADC — `spo2_samples.red` |
| **spo2_ir** | 63–64 | 70–71 | u16 LE | **DECODED** | SpO2 IR channel raw ADC — `spo2_samples.ir` |
| **skin_temp_raw** | 65–66 | 72–73 | u16 LE | **DECODED** | thermistor raw ADC — `skin_temp_samples.raw` |
| ambient | 67–68 | 74–75 | u16 LE | NOT_DECODED | ambient light raw ADC |
| led_drive_1 | 69–70 | 76–77 | u16 LE | NOT_DECODED | LED drive current 1 |
| led_drive_2 | 71–72 | 78–79 | u16 LE | NOT_DECODED | LED drive current 2 |
| **resp_raw** | 73–74 | 80–81 | u16 LE | **DECODED** | respiratory movement raw ADC — `resp_samples.raw` |
| **sig_quality** | 75–76 | 82–83 | u16 LE | **DECODED** | firmware signal quality score — `sig_quality_samples.quality` |

> **Note on gravity**: V24 gravity fields are already in **g units** (f32). No LSB conversion needed. This is different from K=10/K=21 raw motion packets (type 43), where axes are i16 raw values requiring `÷ IMU_LSB_PER_G` conversion.

> **Note on offsets**: `frame_offset = data_offset + 7` (3-byte BLE inner header + 4-byte outer header).

---

## 4. Raw Motion Payload Details

### K=10 — Raw Motion Stream Result (types 40, 43, 47, 51, 52)

| Field | Payload offset | Type | Count | State |
|-------|---------------|------|-------|-------|
| heart_rate | +17 | u8 | 1 | DECODED |
| accelerometer_x | +85 | i16 LE | 100 samples | DECODED |
| accelerometer_y | +285 | i16 LE | 100 samples | DECODED |
| accelerometer_z | +485 | i16 LE | 100 samples | DECODED |
| gyroscope_x | +688 | i16 LE | 100 samples | DECODED |
| gyroscope_y | +888 | i16 LE | 100 samples | DECODED |
| gyroscope_z | +1088 | i16 LE | 100 samples | DECODED |

Scale factors: accel = `1/4096` g/LSB · gyro = `0.06104` deg/s/LSB. Goose uses `÷ IMU_LSB_PER_G` for gravity extraction.

### K=21 — Raw Motion Stream Result, Variable (types 40, 43, 47, 51, 52)

| Field | Payload offset | Type | State |
|-------|---------------|------|-------|
| field_x | +14 | u16 | DECODED (semantics unknown) |
| group_1_count | +16 | u16 | DECODED |
| group_2_count | +622 | u16 | DECODED |
| group_1_axis_0 | +20 | i16[group_1_count] | DECODED |
| group_1_axis_1 | +220 | i16[group_1_count] | DECODED |
| group_1_axis_2 | +420 | i16[group_1_count] | DECODED |
| group_2_axis_0 | +632 | i16[group_2_count] | DECODED |
| group_2_axis_1 | +832 | i16[group_2_count] | DECODED |
| group_2_axis_2 | +1032 | i16[group_2_count] | DECODED |

Semantics of group_1 vs group_2 and `field_x` are unknown.

### K=17 — Optical / Labrador Filtered (types 40, 43, 47, 51, 52)

| Field | Payload offset | Type | State |
|-------|---------------|------|-------|
| flags | +13 | u16 | DECODED |
| flag_bit_9 | (flags bit 9) | bool | DECODED |
| flag_bit_11 | (flags bit 11) | bool | DECODED |
| channels_or_gain | +15–20 | u8[6] | DECODED (semantics unknown) |
| sample_count | +24 | u16 | DECODED |
| i16_samples | +26 | i16[sample_count] | DECODED (interpretation unknown) |

RR intervals are treated as CANDIDATE from this stream — preliminary, not a fully decoded strap-history field.

---

## 5. Event Types

| ID | Name | Payload Decoded | Notes |
|----|------|----------------|-------|
| 0 | UNDEFINED | NO | — |
| 1 | ERROR | NO | error code/message |
| 2 | CONSOLE_OUTPUT | NO | log string/buffer |
| 3 | BATTERY_LEVEL | NO | percentage / voltage |
| 4 | SYSTEM_CONTROL | NO | control opcode |
| 7 | CHARGING_ON | NO | — |
| 8 | CHARGING_OFF | NO | — |
| 9 | WRIST_ON | NO | — |
| 10 | WRIST_OFF | NO | — |
| 11 | BLE_CONNECTION_UP | NO | — |
| 12 | BLE_CONNECTION_DOWN | NO | — |
| 13 | RTC_LOST | NO | — |
| 14 | DOUBLE_TAP | NO | — |
| 15 | BOOT | NO | boot reason / FW version |
| 16 | SET_RTC | NO | — |
| **17** | **TEMPERATURE_LEVEL** | **CANDIDATE** | temperature value; feeds `event_temperature_level` candidate path in metric_readiness |
| 18 | PAIRING_MODE | NO | pairing parameters |
| 28 | FLASH_INIT_COMPLETE | NO | status code |
| 29 | STRAP_CONDITION_REPORT | NO | condition flags/metrics |
| 33 | BLE_REALTIME_HR_ON | NO | — |
| 34 | BLE_REALTIME_HR_OFF | NO | — |
| 56 | STRAP_DRIVEN_ALARM_SET | NO | alarm parameters |
| 57 | STRAP_DRIVEN_ALARM_EXECUTED | NO | — |
| 58 | APP_DRIVEN_ALARM_EXECUTED | NO | — |
| 59 | STRAP_DRIVEN_ALARM_DISABLED | NO | — |
| 60 | HAPTICS_FIRED | NO | haptic pattern ID |
| 63 | EXTENDED_BATTERY_INFORMATION | NO | SOH, cycles, voltage |
| 96 | HIGH_FREQ_SYNC_PROMPT | NO | sync trigger flags |
| 97 | HIGH_FREQ_SYNC_ENABLED | NO | — |
| 98 | HIGH_FREQ_SYNC_DISABLED | NO | — |
| 100 | HAPTICS_TERMINATED | NO | — |
| 109 | BATTERY_PACK_INFO | NO | pack battery metrics |
| 123 | GENERIC_FIRMWARE_EVENT | NO | FW event opcode/data |

---

## 6. History Field Status

Applies to Gen4 and Gen5 WHOOP devices unless noted.

| Field | Gen4 | Gen5 | Goose Summary Kind | Status | Notes |
|-------|------|------|--------------------|--------|-------|
| BPM | ✓ | ✓ | `normal_history` | **DECODED** | hr_marker byte promoted to heart_rate_bpm |
| RR intervals | ✓ | ✓ | `r17_optical_or_labrador_filtered` | **CANDIDATE** | Treated as preliminary; Phase 22 added segment-aware RMSSD |
| IMU | ✓ | ✓ | `raw_motion_k10`, `raw_motion_k21` | **DECODED** | K10/K21 raw motion summaries; full i16 samples via `full_samples` |
| PPG | ✓ | ✓ | `r17_optical_or_labrador_filtered` | **CANDIDATE** | Optical stream as r17; no dedicated PPG field |
| Raw SpO2 red/IR | ✓ | ✓ | `spo2_samples` | **DECODED** | Phase 27 (v5.0) — `insert_v24_biometric_batch` |
| Raw skin temp | ✓ | ✓ | `skin_temp_samples` | **DECODED** | Phase 27 (v5.0) — V24 field at data[65] |
| Respiratory raw | ✓ | ✓ | `resp_samples` | **DECODED** | Phase 27 (v5.0) — data[73] |
| Signal quality | ✓ | ✓ | `sig_quality_samples` | **DECODED** | Phase 27 (v5.0) |
| Skin contact | ✓ | ✓ | `contact` column (all V24 tables) | **DECODED/GATED** | Phase 27 (v5.0) — contact=0 stored but excluded from unit conversion |
| Gravity (K10/K21) | ✓ | ✓ | `raw_motion_k10`, `raw_motion_k21` | **DECODED** | Signed i16 axes stored in `gravity` table |
| Gen5 SpO2 % | ✗ | ✓ | — | **NOT_DECODED** | Gen5-only computed value; no decoder |

---

## 7. Frame Envelope (by Device Generation)

See [`ble-protocol-reference.md#frame-protocol`](ble-protocol-reference.md#frame-protocol) for the full frame layout, header bytes, CRC types, and Gen4 vs Gen5 differences.

---

## 8. Decode Gaps — Priority Order

| Gap | Priority | Effort | Roadmap phase |
|-----|----------|--------|--------------|
| V24 biometric full extraction (spo2, skin_temp, resp, sig_quality, skin_contact) | ~~HIGH~~ **COMPLETE** | — | Phase 27 (v5.0) — shipped |
| Skin contact gate (prerequisite for all V24 biometrics) | ~~HIGH~~ **COMPLETE** | — | Phase 27 (v5.0) — shipped |
| Physical unit conversions (SpO2 ratio-of-ratios, skin temp slope, resp Welch) | ~~HIGH~~ **COMPLETE** | — | Phase 27 (v5.0) — shipped |
| gravity2 second triplet (data[49-60]) | ~~HIGH~~ **COMPLETE** | — | Shipped — `store.insert_gravity2_batch`, `store.gravity2_samples_between` |
| gravity2 second triplet full extraction into gravity2_samples | ~~MEDIUM~~ **COMPLETE** | — | Shipped — fully extracted via `protocol.rs` + `store.rs` |
| EVENT 17 (TEMPERATURE_LEVEL) payload structure | MEDIUM | Low | — |
| EXTENDED_BATTERY_INFORMATION payload (ID 63) | MEDIUM | Low | — |
| K=25/26 pulse information packets | MEDIUM | High | — |
| METADATA (type 49) offload control structure | MEDIUM | Medium | — |
| K=7/11/16/19/20/22 unknown packets | LOW | High | — |
| PUFFIN_* types (53-56) | LOW | High | — |
| Unmapped V24 ranges (bytes 30-32, 45-47) | LOW | High | — |

---

## 9. Swift Bridge Exposure

Fields exposed to Swift via `ParsedFrame` JSON (bridge.rs):

| Field | Exposed | Notes |
|-------|---------|-------|
| `packet_type`, `packet_type_name` | ✓ | all packets |
| `body_summary.kind` | ✓ | `normal_history`, `r17_optical_or_labrador_filtered`, `raw_motion_k10`, `raw_motion_k21` |
| `body_summary.hr_present`, `marker_value` | ✓ | normal_history only |
| `body_summary.axes[].full_samples` | ✓ | K10/K21; full i16 array (Phase 21) |
| `body_summary.axes[].min/max/sum/preview` | ✓ | K10/K21 stats |
| `body_summary.heart_rate` | ✓ | K10 only |
| `body_summary.flags`, `flag_bit_9`, `flag_bit_11` | ✓ | K17 |
| `body_summary.samples` | ✓ | K17 i16 series with stats |
| V24 biometric fields | ✓ | exposed via `biometrics.insert_v24_batch` + `biometrics.v24_between` bridge methods (Phase 27, v5.0) |
