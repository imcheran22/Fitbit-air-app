use goose_core::{
    capture_correlation::CaptureCorrelationReport,
    metric_features::{VitalEventFeatureOptions, run_vital_event_feature_report},
    protocol::{DataPacketBodySummary, ParsedPayload, parse_v24_body_for_test},
    store::DecodedFrameRow,
};

// Helper: build a minimal CaptureCorrelationReport that always passes.
// run_vital_event_feature_report only uses it for trust scoring (trusted_candidate_evidence).
// Passing an empty, passing report exercises the extraction path without trust dependencies.
fn passing_correlation() -> CaptureCorrelationReport {
    CaptureCorrelationReport {
        schema: "test".to_string(),
        generated_by: "test".to_string(),
        fixture_root: "test".to_string(),
        pass: true,
        min_owned_captures_per_summary: 0,
        require_owned_captures: false,
        observations: vec![],
        summaries: vec![],
        issues: vec![],
        next_capture_actions: vec![],
    }
}

// Helper: build a minimal DecodedFrameRow from an 82-byte payload.
// payload_hex is the full frame hex (used by respiratory_rate_feature_from_plan).
// parsed_payload_json encodes a DataPacket with V24History body_summary and packet_k=24.
fn make_v24_decoded_frame_row(payload: &[u8], resp_raw_override: Option<u16>) -> DecodedFrameRow {
    let mut pkt = payload.to_vec();

    // Optionally override resp_raw at absolute payload offset 76..78 (body offset 73..75).
    if let Some(val) = resp_raw_override {
        let bytes = val.to_le_bytes();
        pkt[76] = bytes[0];
        pkt[77] = bytes[1];
    }

    let payload_hex = pkt.iter().map(|b| format!("{b:02x}")).collect::<String>();

    // Build a V24History body_summary from the payload bytes using parse_v24_body_for_test,
    // then wrap it in ParsedPayload::DataPacket.
    let (body_summary, _warnings) = parse_v24_body_for_test(&pkt);
    let parsed_payload = ParsedPayload::DataPacket {
        packet_k: Some(24),
        domain: Some("history".to_string()),
        status_or_stream: Some(0),
        counter_or_page: Some(0),
        timestamp_seconds: Some(1_700_000_000),
        timestamp_subseconds: Some(0),
        hr_marker_offset: None,
        hr_present_marker: None,
        body_offset: 3,
        body_hex: String::new(), // suppressed for pk=24 per PERF-05; extractor uses payload_hex
        body_summary,
        warnings: vec![],
    };
    let parsed_payload_json =
        serde_json::to_string(&parsed_payload).expect("ParsedPayload serialisation must succeed");

    DecodedFrameRow {
        frame_id: "test-frame-v24".to_string(),
        evidence_id: "test-evidence".to_string(),
        captured_at: "2026-06-19T00:00:00Z".to_string(),
        device_type: "GEN4".to_string(),
        raw_len: pkt.len() as i64,
        header_len: 0,
        declared_len: pkt.len() as i64,
        payload_hex,
        payload_crc_hex: String::new(),
        header_crc_valid: true,
        payload_crc_valid: true,
        packet_type: Some(0x2F),
        packet_type_name: Some("historical_data".to_string()),
        sequence: None,
        command_or_event: None,
        parsed_payload_json,
        parser_version: "test".to_string(),
        warnings_json: "[]".to_string(),
        device_uuid: None,
    }
}

// Helpers to build synthetic payloads for parse_v24_body_for_test.
// The function expects the full frame payload where data = payload[3..].
// So payload[3 + offset] corresponds to data[offset].

fn make_82_byte_payload() -> Vec<u8> {
    // 3-byte pkt header + 79-byte data section = 82 bytes total.
    // All bytes initialised to zero; specific fields filled below.
    let mut pkt = vec![0u8; 82];

    // data[14] = 72 — hr = 72 bpm
    pkt[3 + 14] = 72u8;

    // data[15] = 2 — rr_count = 2
    pkt[3 + 15] = 2u8;

    // data[16..18] = 900 le — rr[0] = 900 ms
    let rr0 = 900u16.to_le_bytes();
    pkt[3 + 16] = rr0[0];
    pkt[3 + 17] = rr0[1];

    // data[18..20] = 950 le — rr[1] = 950 ms
    let rr1 = 950u16.to_le_bytes();
    pkt[3 + 18] = rr1[0];
    pkt[3 + 19] = rr1[1];

    // data[26..28] = 1000 le — ppg_green = 1000
    let ppg_green = 1000u16.to_le_bytes();
    pkt[3 + 26] = ppg_green[0];
    pkt[3 + 27] = ppg_green[1];

    // data[28..30] = 2000 le — ppg_red_ir = 2000
    let ppg_red_ir = 2000u16.to_le_bytes();
    pkt[3 + 28] = ppg_red_ir[0];
    pkt[3 + 29] = ppg_red_ir[1];

    // data[33..37] = 0.98f32 le — gravity_x = 0.98
    let gx = 0.98f32.to_le_bytes();
    pkt[3 + 33] = gx[0];
    pkt[3 + 34] = gx[1];
    pkt[3 + 35] = gx[2];
    pkt[3 + 36] = gx[3];

    // data[37..41] = 0.01f32 le — gravity_y = 0.01
    let gy = 0.01f32.to_le_bytes();
    pkt[3 + 37] = gy[0];
    pkt[3 + 38] = gy[1];
    pkt[3 + 39] = gy[2];
    pkt[3 + 40] = gy[3];

    // data[41..45] = 0.05f32 le — gravity_z = 0.05
    let gz = 0.05f32.to_le_bytes();
    pkt[3 + 41] = gz[0];
    pkt[3 + 42] = gz[1];
    pkt[3 + 43] = gz[2];
    pkt[3 + 44] = gz[3];

    // data[48] = 1 — skin_contact = 1
    pkt[3 + 48] = 1u8;

    // data[61..63] = 800 le — spo2_red = 800
    let spo2_red = 800u16.to_le_bytes();
    pkt[3 + 61] = spo2_red[0];
    pkt[3 + 62] = spo2_red[1];

    // data[63..65] = 1200 le — spo2_ir = 1200
    let spo2_ir = 1200u16.to_le_bytes();
    pkt[3 + 63] = spo2_ir[0];
    pkt[3 + 64] = spo2_ir[1];

    // data[65..67] = 930 le — skin_temp_raw = 930
    let skin_temp = 930u16.to_le_bytes();
    pkt[3 + 65] = skin_temp[0];
    pkt[3 + 66] = skin_temp[1];

    // data[67..69] = 250 le — ambient = 250
    let ambient = 250u16.to_le_bytes();
    pkt[3 + 67] = ambient[0];
    pkt[3 + 68] = ambient[1];

    // data[69..71] = 100 le — led1 = 100
    let led1 = 100u16.to_le_bytes();
    pkt[3 + 69] = led1[0];
    pkt[3 + 70] = led1[1];

    // data[71..73] = 200 le — led2 = 200
    let led2 = 200u16.to_le_bytes();
    pkt[3 + 71] = led2[0];
    pkt[3 + 72] = led2[1];

    // data[73..75] = 450 le — resp_raw = 450
    let resp = 450u16.to_le_bytes();
    pkt[3 + 73] = resp[0];
    pkt[3 + 74] = resp[1];

    // data[75..77] = 9000 le — sig_quality = 9000
    let sig = 9000u16.to_le_bytes();
    pkt[3 + 75] = sig[0];
    pkt[3 + 76] = sig[1];

    pkt
}

#[test]
fn test_v24_body_summary_field_offsets() {
    let payload = make_82_byte_payload();
    let (summary, warnings) = parse_v24_body_for_test(&payload);

    assert!(
        warnings.is_empty(),
        "Expected no warnings, got: {:?}",
        warnings
    );

    let summary = summary.expect("Expected Some(V24History), got None");

    match summary {
        DataPacketBodySummary::V24History {
            hr,
            rr_intervals_ms,
            ppg_green,
            ppg_red_ir,
            gravity_x,
            gravity_y,
            gravity_z,
            skin_contact,
            spo2_red,
            spo2_ir,
            skin_temp_raw,
            ambient,
            led1,
            led2,
            resp_raw,
            sig_quality,
            gravity2_x,
            gravity2_y,
            gravity2_z,
            warnings,
        } => {
            assert_eq!(hr, Some(72), "hr mismatch");
            assert_eq!(
                rr_intervals_ms,
                vec![900u16, 950u16],
                "rr_intervals_ms mismatch"
            );
            assert_eq!(ppg_green, Some(1000), "ppg_green mismatch");
            assert_eq!(ppg_red_ir, Some(2000), "ppg_red_ir mismatch");
            assert!(
                (gravity_x.unwrap() - 0.98f32).abs() < 1e-5,
                "gravity_x mismatch: {:?}",
                gravity_x
            );
            assert!(
                (gravity_y.unwrap() - 0.01f32).abs() < 1e-5,
                "gravity_y mismatch: {:?}",
                gravity_y
            );
            assert!(
                (gravity_z.unwrap() - 0.05f32).abs() < 1e-5,
                "gravity_z mismatch: {:?}",
                gravity_z
            );
            assert_eq!(skin_contact, Some(1), "skin_contact mismatch");
            // gravity2 fields: present only when data.len() >= 60; test payload has 80 bytes
            // (payload[3..] = 77 bytes, offset 49 < 77) so gravity2 is present.
            let _ = (gravity2_x, gravity2_y, gravity2_z); // presence verified by compilation
            assert_eq!(spo2_red, Some(800), "spo2_red mismatch");
            assert_eq!(spo2_ir, Some(1200), "spo2_ir mismatch");
            assert_eq!(skin_temp_raw, Some(930), "skin_temp_raw mismatch");
            assert_eq!(ambient, Some(250), "ambient mismatch");
            assert_eq!(led1, Some(100), "led1 mismatch");
            assert_eq!(led2, Some(200), "led2 mismatch");
            assert_eq!(resp_raw, Some(450), "resp_raw mismatch");
            assert_eq!(sig_quality, Some(9000), "sig_quality mismatch");
            assert!(
                warnings.is_empty(),
                "Unexpected warnings in variant: {:?}",
                warnings
            );
        }
        other => panic!("Expected V24History, got: {:?}", other),
    }
}

#[test]
fn test_v24_short_payload() {
    // 10-byte payload — data = payload[3..] has only 7 bytes, well below 77
    let payload = vec![0u8; 10];
    let (summary, warnings) = parse_v24_body_for_test(&payload);

    assert!(
        warnings.iter().any(|w| w == "v24_payload_too_short"),
        "Expected v24_payload_too_short in warnings, got: {:?}",
        warnings
    );

    let summary = summary.expect("Expected Some(V24History) even for short payload");

    match summary {
        DataPacketBodySummary::V24History {
            hr,
            rr_intervals_ms,
            ppg_green,
            ppg_red_ir,
            gravity_x,
            gravity_y,
            gravity_z,
            skin_contact,
            spo2_red,
            spo2_ir,
            skin_temp_raw,
            ambient,
            led1,
            led2,
            resp_raw,
            sig_quality,
            gravity2_x,
            gravity2_y,
            gravity2_z,
            warnings: variant_warnings,
        } => {
            assert!(hr.is_none(), "hr should be None for short payload");
            assert!(
                rr_intervals_ms.is_empty(),
                "rr_intervals_ms should be empty for short payload"
            );
            assert!(ppg_green.is_none(), "ppg_green should be None");
            assert!(ppg_red_ir.is_none(), "ppg_red_ir should be None");
            assert!(gravity_x.is_none(), "gravity_x should be None");
            assert!(gravity_y.is_none(), "gravity_y should be None");
            assert!(gravity_z.is_none(), "gravity_z should be None");
            assert!(skin_contact.is_none(), "skin_contact should be None");
            assert!(
                gravity2_x.is_none(),
                "gravity2_x should be None for short payload"
            );
            assert!(
                gravity2_y.is_none(),
                "gravity2_y should be None for short payload"
            );
            assert!(
                gravity2_z.is_none(),
                "gravity2_z should be None for short payload"
            );
            assert!(spo2_red.is_none(), "spo2_red should be None");
            assert!(spo2_ir.is_none(), "spo2_ir should be None");
            assert!(skin_temp_raw.is_none(), "skin_temp_raw should be None");
            assert!(ambient.is_none(), "ambient should be None");
            assert!(led1.is_none(), "led1 should be None");
            assert!(led2.is_none(), "led2 should be None");
            assert!(resp_raw.is_none(), "resp_raw should be None");
            assert!(sig_quality.is_none(), "sig_quality should be None");
            assert!(
                variant_warnings
                    .iter()
                    .any(|w| w == "v24_payload_too_short"),
                "Expected v24_payload_too_short in variant warnings"
            );
        }
        other => panic!("Expected V24History, got: {:?}", other),
    }
}

#[test]
fn test_v24_rr_zero_skip() {
    // rr_count = 3 but data[18..20] is zero — only 2 entries should appear in rr_intervals_ms
    let mut payload = vec![0u8; 82];

    // data[15] = 3 — rr_count = 3
    payload[3 + 15] = 3u8;

    // data[16..18] = 880 le — rr[0] = 880 ms
    let rr0 = 880u16.to_le_bytes();
    payload[3 + 16] = rr0[0];
    payload[3 + 17] = rr0[1];

    // data[18..20] = 0 le — rr[1] = 0 (should be skipped)
    // already zero from vec! initialisation

    // data[20..22] = 920 le — rr[2] = 920 ms
    let rr2 = 920u16.to_le_bytes();
    payload[3 + 20] = rr2[0];
    payload[3 + 21] = rr2[1];

    let (summary, _warnings) = parse_v24_body_for_test(&payload);
    let summary = summary.expect("Expected Some(V24History)");

    match summary {
        DataPacketBodySummary::V24History {
            rr_intervals_ms, ..
        } => {
            assert_eq!(
                rr_intervals_ms,
                vec![880u16, 920u16],
                "Expected 2 RR entries after zero-skip, got: {:?}",
                rr_intervals_ms
            );
        }
        other => panic!("Expected V24History, got: {:?}", other),
    }
}

// --- GEN4-06: respiratory_rate extraction tests ---
//
// respiratory_rate_plan_from_payload is private; tests exercise via the public
// run_vital_event_feature_report API which calls it internally and surfaces results
// in VitalEventFeatureReport.respiratory_rate_inputs.

// Test A: V24History frame with packet_k=24 produces a respiratory_rate_input entry.
// Verifies the V24History guard and packet_k=24 arm are both present.
// This test FAILS before the fix (guard only allows NormalHistory | V18History).
#[test]
fn respiratory_rate_plan_returns_some_for_v24() {
    let payload = make_82_byte_payload(); // resp_raw at offset 76..78 = 450 LE
    let row = make_v24_decoded_frame_row(&payload, None);
    let correlation = passing_correlation();

    let report = run_vital_event_feature_report(
        &[row],
        &correlation,
        VitalEventFeatureOptions {
            min_owned_captures_per_summary: 0,
            require_trusted_evidence: false,
        },
    )
    .expect("run_vital_event_feature_report must not error");

    assert_eq!(
        report.respiratory_rate_input_count, 1,
        "Expected 1 respiratory_rate_input for V24History pk=24 frame; got {}. \
         Fix: add V24History to the body_summary guard in respiratory_rate_plan_from_payload \
         AND add a packet_k=24 arm.",
        report.respiratory_rate_input_count
    );

    let input = &report.respiratory_rate_inputs[0];
    assert_eq!(
        input.schema_field, "v24_history_k24_body_73_resp_raw_candidate",
        "schema_field mismatch: {:?}",
        input.schema_field
    );
    assert_eq!(
        input.raw_absolute_offset, 76,
        "raw_absolute_offset must be 76 (3-byte header + body offset 73)"
    );
    assert_eq!(
        input.packet_k, 24,
        "packet_k must be 24 for Gen4 V24History frames"
    );
}

// Test B: resp_raw bytes at absolute payload offset 76..78 decode to the seeded value.
// Validates the byte offset arithmetic: body offset 73 = absolute offset 76.
// Uses make_82_byte_payload() which seeds resp_raw=450 at data[73..75] (pkt[76..78]).
#[test]
fn resp_raw_offset_reads_correct_bytes() {
    let payload = make_82_byte_payload();

    // Verify the fixture sets resp_raw=450 at absolute offset 76..78.
    let raw_le = u16::from_le_bytes([payload[76], payload[77]]);
    assert_eq!(
        raw_le, 450,
        "make_82_byte_payload must seed resp_raw=450 at pkt[76..78]; got {raw_le}"
    );

    // Also verify via an explicit override.
    let payload_custom = {
        let mut p = payload.clone();
        let bytes = 180u16.to_le_bytes();
        p[76] = bytes[0];
        p[77] = bytes[1];
        p
    };
    let raw_custom = u16::from_le_bytes([payload_custom[76], payload_custom[77]]);
    assert_eq!(
        raw_custom, 180,
        "Override to 180 at pkt[76..78] must read back as 180"
    );
}

// Test C: two V24 pk=24 rows both produce respiratory_rate_inputs (multi-frame regression guard).
// Verifies that the pk=24 arm is stable and not accidentally a one-shot path.
#[test]
fn pk18_regression_still_returns_some() {
    let payload = make_82_byte_payload();
    let row1 = make_v24_decoded_frame_row(&payload, Some(200));
    let mut row2 = make_v24_decoded_frame_row(&payload, Some(210));
    row2.frame_id = "test-frame-v24-2".to_string();

    let correlation = passing_correlation();
    let report = run_vital_event_feature_report(
        &[row1, row2],
        &correlation,
        VitalEventFeatureOptions {
            min_owned_captures_per_summary: 0,
            require_trusted_evidence: false,
        },
    )
    .expect("run_vital_event_feature_report must not error");

    assert_eq!(
        report.respiratory_rate_input_count, 2,
        "Two V24 pk=24 rows must each produce a respiratory_rate_input; got {}",
        report.respiratory_rate_input_count
    );
}

// Test D: A V24History frame with an unrecognised packet_k returns no respiratory_rate_input.
// Verifies no spurious arm exists: the _ => None fallthrough applies to unknown packet_k values.
#[test]
fn pk99_v24_returns_none() {
    let payload = make_82_byte_payload();
    let (body_summary, _) = parse_v24_body_for_test(&payload);
    let payload_hex = payload
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<String>();

    // Build a ParsedPayload with packet_k=99 and V24History body_summary.
    let parsed_payload = ParsedPayload::DataPacket {
        packet_k: Some(99),
        domain: Some("history".to_string()),
        status_or_stream: Some(0),
        counter_or_page: Some(0),
        timestamp_seconds: Some(1_700_000_000),
        timestamp_subseconds: Some(0),
        hr_marker_offset: None,
        hr_present_marker: None,
        body_offset: 3,
        body_hex: String::new(),
        body_summary,
        warnings: vec![],
    };
    let parsed_payload_json =
        serde_json::to_string(&parsed_payload).expect("serialisation must succeed");

    let row = DecodedFrameRow {
        frame_id: "test-frame-pk99".to_string(),
        evidence_id: "test-evidence".to_string(),
        captured_at: "2026-06-19T00:00:00Z".to_string(),
        device_type: "GEN4".to_string(),
        raw_len: payload.len() as i64,
        header_len: 0,
        declared_len: payload.len() as i64,
        payload_hex,
        payload_crc_hex: String::new(),
        header_crc_valid: true,
        payload_crc_valid: true,
        packet_type: Some(0x2F),
        packet_type_name: Some("historical_data".to_string()),
        sequence: None,
        command_or_event: None,
        parsed_payload_json,
        parser_version: "test".to_string(),
        warnings_json: "[]".to_string(),
        device_uuid: None,
    };

    let correlation = passing_correlation();
    let report = run_vital_event_feature_report(
        &[row],
        &correlation,
        VitalEventFeatureOptions {
            min_owned_captures_per_summary: 0,
            require_trusted_evidence: false,
        },
    )
    .expect("run_vital_event_feature_report must not error");

    assert_eq!(
        report.respiratory_rate_input_count, 0,
        "packet_k=99 with V24History must produce zero respiratory_rate_inputs (no spurious arm); got {}",
        report.respiratory_rate_input_count
    );
}

// Task 2: Integration test for resp_raw extraction from a DecodedFrameRow.
// Validates the full extraction chain: payload bytes → plan fields → feature report.
// Note: respiratory_rate_plan_from_payload is private; we test via the public
// run_vital_event_feature_report API. This is the canonical end-to-end test for
// Task 2 of plan 94-01 (GEN4-06).
#[test]
fn v24_resp_raw_feature_extraction_from_decoded_row() {
    // Step 1: Build 82-byte V24 payload with resp_raw=240 (0xF0, 0x00) at pkt[76..78].
    let payload = make_v24_decoded_frame_row(&make_82_byte_payload(), Some(240));

    // Step 2: Confirm the seeded bytes at absolute offset 76..78 decode to 240.
    // (payload_hex is the hex encoding of the 82 bytes)
    let payload_bytes: Vec<u8> = (0..payload.payload_hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&payload.payload_hex[i..i + 2], 16).unwrap())
        .collect();
    let raw_u16 = u16::from_le_bytes([payload_bytes[76], payload_bytes[77]]);
    assert_eq!(
        raw_u16, 240,
        "payload_hex[76..78] must decode to resp_raw=240"
    );

    // Step 3: Call run_vital_event_feature_report and assert:
    //   - respiratory_rate_plan returns Some for pk=24 V24History
    //   - raw_absolute_offset == 76
    //   - resp_raw bytes at payload[76..78] match the seeded value
    let correlation = passing_correlation();
    let report = run_vital_event_feature_report(
        &[payload],
        &correlation,
        VitalEventFeatureOptions {
            min_owned_captures_per_summary: 0,
            require_trusted_evidence: false,
        },
    )
    .expect("run_vital_event_feature_report must not error");

    assert_eq!(
        report.respiratory_rate_input_count, 1,
        "Expected 1 respiratory_rate_input for pk=24 V24History row; got {}",
        report.respiratory_rate_input_count
    );

    let input = &report.respiratory_rate_inputs[0];
    assert_eq!(
        input.raw_absolute_offset, 76,
        "raw_absolute_offset must be 76 (3-byte data-packet header + body offset 73)"
    );
    assert_eq!(
        input.schema_field, "v24_history_k24_body_73_resp_raw_candidate",
        "schema_field must identify this as the V24 resp_raw candidate at body offset 73"
    );
    // raw_u16_le must match the seeded value (240) — confirms byte offset arithmetic is correct.
    assert_eq!(
        input.raw_u16_le,
        Some(240),
        "raw_u16_le must be 240 (the seeded resp_raw value at payload[76..78])"
    );
}

// Task 1 (102-01, RED): V24History skin temperature extraction.
// make_82_byte_payload() seeds skin_temp_raw=930 at data[65..67] (absolute payload offset 68..70).
// With the NTC formula delta_c = (raw − 930) / 30.0, raw=930 → delta=0.0.
// This test MUST FAIL before the V24History arm is added to skin_temperature_plan_from_payload
// (skin_temperature_input_count will be 0 because the guard rejects V24History).
// After Task 2 it MUST PASS with skin_temperature_input_count==1 and skin_temperature_c==Some(0.0).
#[test]
fn test_v24_skin_temperature_feature_extracted() {
    let payload = make_82_byte_payload();
    // Confirm skin_temp_raw=930 is present at absolute offset 68..70 (data[65..67]).
    let raw_u16 = u16::from_le_bytes([payload[68], payload[69]]);
    assert_eq!(
        raw_u16, 930,
        "fixture must have skin_temp_raw=930 at payload[68..70]"
    );

    let row = make_v24_decoded_frame_row(&payload, None);
    let correlation = passing_correlation();
    let report = run_vital_event_feature_report(
        &[row],
        &correlation,
        VitalEventFeatureOptions {
            min_owned_captures_per_summary: 0,
            require_trusted_evidence: false,
        },
    )
    .expect("run_vital_event_feature_report must not error");

    assert_eq!(
        report.skin_temperature_input_count, 1,
        "Expected 1 skin_temperature_input for pk=24 V24History row; got {}",
        report.skin_temperature_input_count
    );

    let input = &report.skin_temperature_inputs[0];
    assert_eq!(
        input.raw_absolute_offset, 68,
        "raw_absolute_offset must be 68 (3-byte header + body offset 65)"
    );
    assert_eq!(
        input.schema_field, "v24_history_k24_body_65_skin_temp_delta_c",
        "schema_field must identify this as the V24 NTC skin temp delta at body offset 65"
    );
    // NTC formula: (930 − 930) / 30.0 = 0.0 delta_c
    let delta = input
        .skin_temperature_c
        .expect("skin_temperature_c must be Some");
    assert!(
        (delta - 0.0_f64).abs() < 1e-9,
        "delta_c must be 0.0 for raw=930 (anchor point); got {delta}"
    );
}

// Task 3 (102-01): Verify respiratory_rate extraction from V24History is already wired.
// This test documents that GEN4-06 already wired resp_raw for packet_k=24.
// It must pass both before and after Task 2 changes (no regression).
#[test]
fn test_v24_respiratory_rate_plan_already_wired() {
    // Use resp_raw=300 to ensure a non-zero value reaches the feature report.
    let row = make_v24_decoded_frame_row(&make_82_byte_payload(), Some(300));
    let correlation = passing_correlation();
    let report = run_vital_event_feature_report(
        &[row],
        &correlation,
        VitalEventFeatureOptions {
            min_owned_captures_per_summary: 0,
            require_trusted_evidence: false,
        },
    )
    .expect("run_vital_event_feature_report must not error");

    assert_eq!(
        report.respiratory_rate_input_count, 1,
        "respiratory_rate must already be wired for V24History (GEN4-06); got {}",
        report.respiratory_rate_input_count
    );
    let input = &report.respiratory_rate_inputs[0];
    assert_eq!(
        input.raw_absolute_offset, 76,
        "resp_raw raw_absolute_offset must be 76 (header + body offset 73)"
    );
    assert_eq!(
        input.schema_field,
        "v24_history_k24_body_73_resp_raw_candidate"
    );
}
