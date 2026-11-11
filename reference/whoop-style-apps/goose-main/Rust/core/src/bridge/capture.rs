use std::{
    collections::BTreeSet,
    path::{Path, PathBuf},
};

use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use super::{
    BridgeRequest, BridgeResponse, CAPTURE_ARRIVAL_PLAN_REPORT_SCHEMA, acquire_bridge_conn,
    bridge_error, bridge_ok, default_capture_sanitize_salt, default_correlation_end,
    default_correlation_start, default_device_type, default_parser_version, default_true,
    open_bridge_store_hot, parse_device_type, parse_event48_battery_from_data, request_args,
};
use crate::{
    GooseError, GooseResult,
    capture_correlation::{
        CaptureCorrelationNextAction, CaptureCorrelationOptions, CaptureCorrelationReport,
        DEFAULT_MIN_OWNED_CAPTURES_PER_SUMMARY, run_capture_correlation_for_store,
    },
    capture_import::{
        CapturedFrameBatchOptions, CapturedFrameBatchOutputOptions, CapturedFrameInput,
        import_captured_frame_batch_with_output_options,
    },
    capture_sanitize::{CaptureSanitizeOptions, sanitize_capture_path},
    historical_sync::{
        HistoricalSyncDryRunInput, HistoricalSyncGeneration, HistoricalSyncPhysicalValidationInput,
        historical_sync_physical_evidence_template, run_historical_sync_dry_run,
        validate_historical_sync_physical_evidence,
    },
    local_health_validation::{
        LocalHealthValidationManifestScaffoldOptions, review_local_health_validation_manifest,
        scaffold_local_health_validation_manifest,
    },
    metric_features::{
        MetricFeatureNextAction, RecoverySensorDiscoveryOptions, RecoverySensorDiscoveryReport,
        run_recovery_sensor_discovery_report_for_store,
    },
    metric_readiness::{
        MetricInputNextAction, MetricInputReadinessOptions, MetricInputReadinessReport,
        run_metric_input_readiness,
    },
    protocol::{
        DataPacketBodySummary, I16SeriesSummary, ParsedFrame, ParsedPayload, parse_frame_hex,
    },
    store::{
        ActivitySessionRow, BackfillReport, CaptureSessionInput, CaptureSessionRow,
        CommandValidationRecord, GooseStore,
    },
    timeline::{observability_timeline_from_rows, packet_timeline_between},
};

pub(crate) fn dispatch_capture(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "capture.import_frame_batch" => request_args::<CaptureImportFrameBatchArgs>(request)
            .and_then(capture_import_frame_batch_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capture.timeline" => request_args::<CaptureTimelineArgs>(request)
            .and_then(capture_timeline_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capture.observability_timeline" => {
            request_args::<CaptureObservabilityTimelineArgs>(request)
                .and_then(capture_observability_timeline_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "capture.start_session" => request_args::<CaptureStartSessionArgs>(request)
            .and_then(capture_start_session_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capture.finish_session" => request_args::<CaptureFinishSessionArgs>(request)
            .and_then(capture_finish_session_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capture.list_sessions" => request_args::<CaptureListSessionsArgs>(request)
            .and_then(capture_list_sessions_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capture.correlation_report" => request_args::<CaptureCorrelationArgs>(request)
            .and_then(capture_correlation_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capture.arrival_plan" => request_args::<CaptureArrivalPlanArgs>(request)
            .and_then(capture_arrival_plan_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "capture.sanitize" => request_args::<CaptureSanitizeArgs>(request)
            .and_then(capture_sanitize_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "protocol.parse_frame_hex" => request_args::<ParseFrameArgs>(request)
            .and_then(parse_frame_hex_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "protocol.parse_frame_hex_batch" => request_args::<ParseFrameBatchArgs>(request)
            .and_then(parse_frame_hex_batch_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "historical_sync.dry_run" => request_args::<HistoricalSyncDryRunInput>(request)
            .and_then(historical_sync_dry_run_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "historical_sync.physical_evidence_template" => {
            request_args::<HistoricalSyncPhysicalEvidenceTemplateArgs>(request)
                .and_then(historical_sync_physical_evidence_template_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "historical_sync.validate_physical_evidence" => {
            request_args::<HistoricalSyncPhysicalValidationInput>(request)
                .and_then(historical_sync_physical_validation_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "sync.mark_synced" => request_args::<SyncMarkSyncedArgs>(request)
            .and_then(sync_mark_synced_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sync.rows_pending_upload" => request_args::<SyncRowsPendingUploadArgs>(request)
            .and_then(sync_rows_pending_upload_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sync.backfill_streams" => request_args::<SyncBackfillStreamsArgs>(request)
            .and_then(sync_backfill_streams_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sync.record_hps_telemetry" => request_args::<SyncRecordHpsTelemetryArgs>(request)
            .and_then(sync_record_hps_telemetry_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_capture called with non-capture method: {}",
            request.method
        ),
    }
}

#[derive(Debug, Clone, Deserialize)]
struct ParseFrameArgs {
    frame_hex: String,
    #[serde(default = "default_device_type")]
    device_type: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ParseFrameBatchArgs {
    frames: Vec<String>,
    #[serde(default = "default_device_type")]
    device_type: String,
    #[serde(default = "default_true")]
    include_result: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureImportFrameBatchArgs {
    database_path: String,
    #[serde(default = "default_parser_version")]
    parser_version: String,
    #[serde(default = "default_true")]
    include_timeline_rows: bool,
    #[serde(default = "default_true")]
    compact_raw_payloads: bool,
    #[serde(default = "default_true")]
    include_results: bool,
    /// Optional CoreBluetooth peripheral UUID supplied by the Swift caller. Written to
    /// capture_sessions.active_device_id for every session referenced in this batch.
    #[serde(default)]
    active_device_id: Option<String>,
    frames: Vec<CapturedFrameInput>,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureTimelineArgs {
    database_path: String,
    start: String,
    end: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureObservabilityTimelineArgs {
    database_path: String,
    start: String,
    end: String,
    start_unix_ms: i64,
    end_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureStartSessionArgs {
    database_path: String,
    session_id: String,
    source: String,
    started_at_unix_ms: i64,
    device_model: String,
    #[serde(default)]
    active_device_id: Option<String>,
    #[serde(default)]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureFinishSessionArgs {
    database_path: String,
    session_id: String,
    ended_at_unix_ms: i64,
    #[serde(default)]
    frame_count: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureListSessionsArgs {
    database_path: String,
    start_unix_ms: i64,
    end_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct HistoricalSyncPhysicalEvidenceTemplateArgs {
    generation: HistoricalSyncGeneration,
    #[serde(default)]
    capture_session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureCorrelationArgs {
    database_path: String,
    #[serde(default = "default_correlation_start")]
    start: String,
    #[serde(default = "default_correlation_end")]
    end: String,
    #[serde(default)]
    min_owned_captures: Option<usize>,
    #[serde(default)]
    require_owned_captures: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureArrivalPlanArgs {
    database_path: String,
    #[serde(default = "default_correlation_start")]
    start: String,
    #[serde(default = "default_correlation_end")]
    end: String,
    #[serde(default)]
    timezone: Option<String>,
    #[serde(default)]
    min_owned_captures: Option<usize>,
    #[serde(default)]
    require_owned_captures: bool,
    #[serde(default)]
    require_scores_ready: bool,
}

#[derive(Debug, Clone, Serialize)]
struct CaptureArrivalPlanReport {
    schema: String,
    generated_by: String,
    pass: bool,
    start: String,
    end: String,
    min_owned_captures: usize,
    require_owned_captures: bool,
    require_scores_ready: bool,
    action_count: usize,
    physical_arrival_row_count: usize,
    physical_arrival_rows: Vec<CaptureArrivalPhysicalRow>,
    #[serde(skip_serializing_if = "Option::is_none")]
    next_capture_focus: Option<CaptureArrivalPlanAction>,
    actions: Vec<CaptureArrivalPlanAction>,
    capture_correlation: CaptureCorrelationReport,
    metric_input_readiness: MetricInputReadinessReport,
    recovery_sensor_discovery: RecoverySensorDiscoveryReport,
    local_health_validation_review: Value,
    issues: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
struct CaptureArrivalPlanAction {
    source: String,
    scope: String,
    reason: String,
    action: String,
    summary: String,
}

#[derive(Debug, Clone, Serialize)]
struct CaptureArrivalPhysicalRow {
    id: String,
    label: String,
    domain: String,
    state: String,
    blocker: String,
    next_action: String,
    evidence: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CaptureSanitizeArgs {
    input_path: String,
    output_path: String,
    #[serde(default = "default_capture_sanitize_salt")]
    salt: String,
}

/// Mark specific rows in a stream table as synced=1 by rowid.
/// Stream name is validated against STREAM_ALLOWLIST in store.mark_synced_rows (T-29-03).
#[derive(Debug, Deserialize)]
struct SyncMarkSyncedArgs {
    database_path: String,
    stream: String,
    row_ids: Vec<i64>,
}

/// Return rows from a stream table where synced=0, ordered by ts.
/// Stream name is validated against STREAM_ALLOWLIST in store.rows_pending_upload.
#[derive(Debug, Deserialize)]
struct SyncRowsPendingUploadArgs {
    database_path: String,
    stream: String,
    limit: i64,
}

/// Populate hr_samples and rr_intervals from decoded_frames for the given device and time window.
#[derive(Debug, Deserialize)]
struct SyncBackfillStreamsArgs {
    database_path: String,
    device_id: String,
    start_ts: f64,
    end_ts: f64,
}

/// SYNC-12: Record HPS burst-level sync quality telemetry in sync_telemetry table.
#[derive(Debug, Clone, Deserialize)]
struct SyncRecordHpsTelemetryArgs {
    database_path: String,
    session_id: String,
    burst_index: i64,
    bytes_received: i64,
    duration_ms: i64,
    missing_packets: i64,
    sequence_gaps: i64,
    result: String,
}

fn parse_frame_hex_bridge(args: ParseFrameArgs) -> GooseResult<serde_json::Value> {
    let device_type = parse_device_type(&args.device_type)?;
    let parsed = parse_frame_hex(device_type, &args.frame_hex)?;
    serde_json::to_value(parsed)
        .map_err(|error| GooseError::message(format!("cannot serialize parsed frame: {error}")))
}

fn parse_frame_hex_batch_bridge(args: ParseFrameBatchArgs) -> GooseResult<serde_json::Value> {
    let device_type = parse_device_type(&args.device_type)?;
    let mut results = Vec::with_capacity(args.frames.len());
    for (index, frame_hex) in args.frames.iter().enumerate() {
        match parse_frame_hex(device_type, frame_hex) {
            Ok(parsed) => {
                let mut item = json!({
                    "index": index,
                    "ok": true,
                    "compact": compact_parsed_frame_summary(&parsed),
                });
                if args.include_result
                    && let Some(obj) = item.as_object_mut()
                {
                    obj.insert("result".to_string(), json!(parsed));
                }
                results.push(item);
            }
            Err(error) => results.push(json!({
                "index": index,
                "ok": false,
                "error": error.to_string(),
            })),
        }
    }

    Ok(json!({
        "frame_count": args.frames.len(),
        "results": results,
    }))
}

fn compact_parsed_frame_summary(parsed: &ParsedFrame) -> serde_json::Value {
    let packet = parsed
        .packet_type
        .map(|value| value.to_string())
        .unwrap_or_else(|| "?".to_string());
    let packet_name = parsed
        .packet_type_name
        .as_deref()
        .unwrap_or("unknown")
        .to_string();
    let packet_type_name = parsed.packet_type_name.as_deref();
    let sequence = parsed
        .sequence
        .map(|value| value.to_string())
        .unwrap_or_else(|| "?".to_string());
    let warning_count = parsed.warnings.len();

    match parsed.parsed_payload.as_ref() {
        Some(ParsedPayload::DataPacket {
            packet_k,
            domain,
            body_hex,
            body_offset,
            body_summary,
            ..
        }) => {
            let packet_k_text = packet_k
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string());
            let domain_text = domain.as_deref().unwrap_or("unknown");
            let body_kind = body_summary_kind(body_summary.as_ref());
            let heart_rate = match body_summary.as_ref() {
                Some(DataPacketBodySummary::RawMotionK10 { heart_rate, .. }) => *heart_rate,
                _ => None,
            };
            let r22_battery_pct: Option<u8> = match body_summary.as_ref() {
                Some(DataPacketBodySummary::R22Whoop5Hr { battery_pct, .. }) => *battery_pct,
                _ => None,
            };
            let movement = compact_k10_movement_summary(body_summary.as_ref());
            // CR-01 fix: when body_hex is suppressed (PERF-05 K10/K21), derive the actual
            // byte count from declared_len rather than from the empty string.
            let body_byte_count = if body_hex.is_empty() {
                parsed.declared_len.saturating_sub(*body_offset)
            } else {
                body_hex.len() / 2
            };
            json!({
                "packet_type": parsed.packet_type,
                "packet_type_name": packet_type_name,
                "sequence": parsed.sequence,
                "warnings_count": warning_count,
                "payload_kind": "data_packet",
                "packet_k": packet_k,
                "domain": domain,
                "body_kind": body_kind,
                "body_byte_count": body_byte_count,
                "heart_rate": heart_rate,
                "r22_battery_pct": r22_battery_pct,
                "movement": movement,
                "summary": format!("packet={packet_name}({packet}) seq={sequence} data.k={packet_k_text} domain={domain_text} body={body_kind} warnings={warning_count}"),
            })
        }
        Some(ParsedPayload::Event {
            event_id,
            event_name,
            data_hex,
            ..
        }) => {
            let event_id_text = event_id
                .map(|value| value.to_string())
                .unwrap_or_else(|| "?".to_string());
            let event_name_text = event_name.as_deref().unwrap_or("unknown");
            // event48_battery_pct: only BATTERY_LEVEL events (event_id == 3) carry a battery
            // raw u16 at data-body offset 5. Other Event-48 types (BOOT=15, CHARGING_ON=7,
            // etc.) have arbitrary bytes at that offset. Null on any failure — the summary
            // builder never propagates errors (matches r22_battery_pct pattern above).
            let event48_battery_pct: Option<u16> = if *event_id == Some(3) {
                hex::decode(data_hex)
                    .ok()
                    .and_then(|data| parse_event48_battery_from_data(&data))
            } else {
                None
            };
            json!({
                "packet_type": parsed.packet_type,
                "packet_type_name": packet_type_name,
                "sequence": parsed.sequence,
                "warnings_count": warning_count,
                "payload_kind": "event",
                "event_id": event_id,
                "event_name": event_name,
                "event_byte_count": data_hex.len() / 2,
                "event48_battery_pct": event48_battery_pct,
                "summary": format!("packet={packet_name}({packet}) seq={sequence} event={event_name_text}({event_id_text}) bytes={} warnings={warning_count}", data_hex.len() / 2),
            })
        }
        Some(payload) => {
            let payload_kind = parsed_payload_kind(payload);
            json!({
                "packet_type": parsed.packet_type,
                "packet_type_name": packet_type_name,
                "sequence": parsed.sequence,
                "warnings_count": warning_count,
                "payload_kind": payload_kind,
                "summary": format!("packet={packet_name}({packet}) seq={sequence} payload={payload_kind} warnings={warning_count}"),
            })
        }
        None => json!({
            "packet_type": parsed.packet_type,
            "packet_type_name": packet_type_name,
            "sequence": parsed.sequence,
            "warnings_count": warning_count,
            "payload_kind": "none",
            "summary": format!("packet={packet_name}({packet}) seq={sequence} warnings={warning_count}"),
        }),
    }
}

fn parsed_payload_kind(payload: &ParsedPayload) -> &'static str {
    match payload {
        ParsedPayload::Command { .. } => "command",
        ParsedPayload::CommandResponse { .. } => "command_response",
        ParsedPayload::Event { .. } => "event",
        ParsedPayload::DataPacket { .. } => "data_packet",
        ParsedPayload::Raw { .. } => "raw",
    }
}

fn body_summary_kind(summary: Option<&DataPacketBodySummary>) -> &'static str {
    match summary {
        Some(DataPacketBodySummary::NormalHistory { .. }) => "normal_history",
        Some(DataPacketBodySummary::R17OpticalOrLabradorFiltered { .. }) => {
            "r17_optical_or_labrador_filtered"
        }
        Some(DataPacketBodySummary::RawMotionK10 { .. }) => "raw_motion_k10",
        Some(DataPacketBodySummary::RawMotionK21 { .. }) => "raw_motion_k21",
        Some(DataPacketBodySummary::V24History { .. }) => "v24_history",
        Some(DataPacketBodySummary::R22Whoop5Hr { .. }) => "r22_whoop5_hr",
        Some(DataPacketBodySummary::V18History { .. }) => "v18_history",
        Some(DataPacketBodySummary::V26PpgWaveform { .. }) => "v26_ppg_waveform",
        Some(DataPacketBodySummary::V20V21OpticalMultiChannel { .. }) => {
            "v20v21_optical_multi_channel"
        }
        Some(DataPacketBodySummary::Unknown { .. }) => "unknown",
        None => "none",
    }
}

fn compact_k10_movement_summary(summary: Option<&DataPacketBodySummary>) -> serde_json::Value {
    let Some(DataPacketBodySummary::RawMotionK10 { axes, .. }) = summary else {
        return serde_json::Value::Null;
    };

    let mut axis_count = 0usize;
    let mut parsed_sample_count = 0usize;
    let mut raw_peak_range = 0.0f64;
    let mut raw_peak_abs = 0.0f64;
    let mut accelerometer_peak_range = 0.0f64;
    let mut gyroscope_peak_range = 0.0f64;
    let mut accelerometer_range_squared_total = 0.0f64;

    for axis in axes {
        let Some((axis_range, axis_abs)) = axis_range_and_abs(axis) else {
            continue;
        };
        axis_count += 1;
        parsed_sample_count += axis.parsed_count;
        raw_peak_range = raw_peak_range.max(axis_range);
        raw_peak_abs = raw_peak_abs.max(axis_abs);
        if axis.name.starts_with("accelerometer_") {
            accelerometer_peak_range = accelerometer_peak_range.max(axis_range);
            accelerometer_range_squared_total += axis_range * axis_range;
        } else if axis.name.starts_with("gyroscope_") {
            gyroscope_peak_range = gyroscope_peak_range.max(axis_range);
        }
    }

    if parsed_sample_count == 0 {
        return serde_json::Value::Null;
    }

    let accelerometer_vector_range = accelerometer_range_squared_total.sqrt();
    let accelerometer_intensity = accelerometer_vector_range / 8192.0;
    let raw_intensity = raw_peak_range / 32767.0;
    let motion_intensity = raw_intensity.max(accelerometer_intensity).clamp(0.0, 1.0);
    json!({
        "axis_count": axis_count,
        "parsed_sample_count": parsed_sample_count,
        "raw_peak_range": raw_peak_range,
        "raw_peak_abs": raw_peak_abs,
        "accelerometer_peak_range": accelerometer_peak_range,
        "gyroscope_peak_range": gyroscope_peak_range,
        "accelerometer_vector_range": accelerometer_vector_range,
        "motion_intensity": motion_intensity,
    })
}

fn axis_range_and_abs(axis: &I16SeriesSummary) -> Option<(f64, f64)> {
    if axis.parsed_count == 0 {
        return None;
    }
    let (Some(minimum), Some(maximum)) = (axis.min, axis.max) else {
        let peak_abs = axis
            .preview
            .iter()
            .map(|value| f64::from(*value).abs())
            .fold(0.0, f64::max);
        return Some((0.0, peak_abs));
    };
    let range = f64::from(maximum) - f64::from(minimum);
    let peak_abs = f64::from(minimum).abs().max(f64::from(maximum).abs());
    Some((range.max(0.0), peak_abs))
}

fn historical_sync_dry_run_bridge(
    args: HistoricalSyncDryRunInput,
) -> GooseResult<serde_json::Value> {
    let report = run_historical_sync_dry_run(&args);
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize historical sync dry-run report: {error}"
        ))
    })
}

fn historical_sync_physical_evidence_template_bridge(
    args: HistoricalSyncPhysicalEvidenceTemplateArgs,
) -> GooseResult<serde_json::Value> {
    let report =
        historical_sync_physical_evidence_template(args.generation, args.capture_session_id);
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize historical sync physical evidence template: {error}"
        ))
    })
}

fn historical_sync_physical_validation_bridge(
    args: HistoricalSyncPhysicalValidationInput,
) -> GooseResult<serde_json::Value> {
    let report = validate_historical_sync_physical_evidence(&args);
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize historical sync physical validation report: {error}"
        ))
    })
}

fn capture_sanitize_bridge(args: CaptureSanitizeArgs) -> GooseResult<serde_json::Value> {
    if args.input_path.trim().is_empty() {
        return Err(GooseError::message("input_path is required"));
    }
    if args.output_path.trim().is_empty() {
        return Err(GooseError::message("output_path is required"));
    }
    let report = sanitize_capture_path(CaptureSanitizeOptions {
        input_path: Path::new(&args.input_path),
        output_path: Path::new(&args.output_path),
        salt: &args.salt,
    })?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!("cannot serialize capture sanitize report: {error}"))
    })
}

fn capture_import_frame_batch_bridge(
    args: CaptureImportFrameBatchArgs,
) -> GooseResult<serde_json::Value> {
    let store = open_bridge_store_hot(&args.database_path)?;
    let report = import_captured_frame_batch_with_output_options(
        &store,
        &args.frames,
        CapturedFrameBatchOptions {
            parser_version: &args.parser_version,
            active_device_id: args.active_device_id.as_deref(),
        },
        CapturedFrameBatchOutputOptions {
            include_timeline_rows: args.include_timeline_rows,
            compact_raw_payloads: args.compact_raw_payloads,
            include_results: args.include_results,
        },
    )?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!("cannot serialize capture import report: {error}"))
    })
}

fn capture_timeline_bridge(args: CaptureTimelineArgs) -> GooseResult<serde_json::Value> {
    if args.start.trim().is_empty() {
        return Err(GooseError::message("start is required"));
    }
    if args.end.trim().is_empty() {
        return Err(GooseError::message("end is required"));
    }
    if args.start >= args.end {
        return Err(GooseError::message("start must be earlier than end"));
    }
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = packet_timeline_between(&store, &args.start, &args.end)?;
    serde_json::to_value(rows)
        .map_err(|error| GooseError::message(format!("cannot serialize capture timeline: {error}")))
}

fn capture_observability_timeline_bridge(
    args: CaptureObservabilityTimelineArgs,
) -> GooseResult<serde_json::Value> {
    if args.start.trim().is_empty() {
        return Err(GooseError::message("start is required"));
    }
    if args.end.trim().is_empty() {
        return Err(GooseError::message("end is required"));
    }
    if args.start >= args.end {
        return Err(GooseError::message("start must be earlier than end"));
    }
    if args.start_unix_ms < 0 {
        return Err(GooseError::message("start_unix_ms must be non-negative"));
    }
    if args.end_unix_ms <= 0 {
        return Err(GooseError::message("end_unix_ms must be positive"));
    }
    if args.start_unix_ms >= args.end_unix_ms {
        return Err(GooseError::message(
            "start_unix_ms must be earlier than end_unix_ms",
        ));
    }

    let store = acquire_bridge_conn(&args.database_path)?;
    let raw_rows = store.raw_evidence_between(&args.start, &args.end)?;
    let packet_rows = packet_timeline_between(&store, &args.start, &args.end)?;
    let debug_rows = store.debug_events_between(args.start_unix_ms, args.end_unix_ms)?;
    let rows = observability_timeline_from_rows(&raw_rows, &packet_rows, &debug_rows)?;
    serde_json::to_value(rows).map_err(|error| {
        GooseError::message(format!("cannot serialize observability timeline: {error}"))
    })
}

fn capture_start_session_bridge(args: CaptureStartSessionArgs) -> GooseResult<serde_json::Value> {
    let store = open_bridge_store_hot(&args.database_path)?;
    let provenance_json = if args.provenance.is_null() {
        "{}".to_string()
    } else {
        if !args.provenance.is_object() {
            return Err(GooseError::message("provenance must be a JSON object"));
        }
        serde_json::to_string(&args.provenance)
            .map_err(|error| GooseError::message(format!("cannot serialize provenance: {error}")))?
    };
    let inserted = store.start_capture_session(CaptureSessionInput {
        session_id: &args.session_id,
        source: &args.source,
        started_at_unix_ms: args.started_at_unix_ms,
        device_model: &args.device_model,
        active_device_id: args.active_device_id.as_deref(),
        provenance_json: &provenance_json,
    })?;
    let session = store.capture_session(&args.session_id)?.ok_or_else(|| {
        GooseError::message(format!("capture session {} not found", args.session_id))
    })?;
    serde_json::to_value(json!({
        "schema": "goose.capture-session-result.v1",
        "inserted": inserted,
        "session": session,
    }))
    .map_err(|error| GooseError::message(format!("cannot serialize capture session: {error}")))
}

fn capture_finish_session_bridge(args: CaptureFinishSessionArgs) -> GooseResult<serde_json::Value> {
    let store = open_bridge_store_hot(&args.database_path)?;
    let session =
        store.finish_capture_session(&args.session_id, args.ended_at_unix_ms, args.frame_count)?;
    serde_json::to_value(json!({
        "schema": "goose.capture-session-result.v1",
        "inserted": false,
        "session": session,
    }))
    .map_err(|error| GooseError::message(format!("cannot serialize capture session: {error}")))
}

fn capture_list_sessions_bridge(args: CaptureListSessionsArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let sessions = store.capture_sessions_between(args.start_unix_ms, args.end_unix_ms)?;
    serde_json::to_value(json!({
        "schema": "goose.capture-session-list.v1",
        "session_count": sessions.len(),
        "sessions": sessions,
    }))
    .map_err(|error| GooseError::message(format!("cannot serialize capture session list: {error}")))
}

fn capture_correlation_bridge(args: CaptureCorrelationArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let report = run_capture_correlation_for_store(
        &store,
        &args.database_path,
        &args.start,
        &args.end,
        CaptureCorrelationOptions {
            min_owned_captures_per_summary: args
                .min_owned_captures
                .unwrap_or(DEFAULT_MIN_OWNED_CAPTURES_PER_SUMMARY),
            require_owned_captures: args.require_owned_captures,
        },
    )?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize capture correlation report: {error}"
        ))
    })
}

fn capture_arrival_plan_bridge(args: CaptureArrivalPlanArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let min_owned_captures = args
        .min_owned_captures
        .unwrap_or(DEFAULT_MIN_OWNED_CAPTURES_PER_SUMMARY);
    let capture_correlation = run_capture_correlation_for_store(
        &store,
        &args.database_path,
        &args.start,
        &args.end,
        CaptureCorrelationOptions {
            min_owned_captures_per_summary: min_owned_captures,
            require_owned_captures: args.require_owned_captures,
        },
    )?;
    let metric_input_readiness = run_metric_input_readiness(
        &capture_correlation,
        MetricInputReadinessOptions {
            require_scores_ready: args.require_scores_ready,
        },
    );
    let recovery_sensor_discovery = run_recovery_sensor_discovery_report_for_store(
        &store,
        &args.database_path,
        &args.start,
        &args.end,
        RecoverySensorDiscoveryOptions {
            min_owned_captures_per_summary: min_owned_captures,
            require_trusted_evidence: args.require_owned_captures,
            min_rr_intervals_to_compute: 2,
        },
    )?;
    let local_health_validation_manifest =
        scaffold_local_health_validation_manifest(&LocalHealthValidationManifestScaffoldOptions {
            database_path: PathBuf::from(&args.database_path),
            manifest_id: "capture-arrival-local-health-validation".to_string(),
            timezone: args.timezone.unwrap_or_else(|| "UTC".to_string()),
            date_key: None,
            database_source_kind: Some("direct_database".to_string()),
            start: Some(args.start.clone()),
            end: Some(args.end.clone()),
            window_source: Some("capture_arrival_plan_window".to_string()),
            raw_export_bundle_path: None,
        })?;
    let local_health_validation_review =
        review_local_health_validation_manifest(&local_health_validation_manifest);
    let actions = capture_arrival_plan_actions(
        &capture_correlation,
        &metric_input_readiness,
        &recovery_sensor_discovery,
        &local_health_validation_review,
    );
    let next_capture_focus = capture_arrival_plan_next_focus(&actions);
    let mut issues = Vec::new();
    issues.extend(
        capture_correlation
            .issues
            .iter()
            .map(|issue| format!("capture_correlation:{issue}")),
    );
    issues.extend(
        metric_input_readiness
            .issues
            .iter()
            .map(|issue| format!("metric_input_readiness:{issue}")),
    );
    issues.extend(
        recovery_sensor_discovery
            .issues
            .iter()
            .map(|issue| format!("recovery_sensor_discovery:{issue}")),
    );
    if local_health_validation_review
        .get("status")
        .and_then(Value::as_str)
        != Some("ready_to_run_validation_suite")
    {
        issues.push("local_health_validation:operator_edits_required".to_string());
    }
    let pass = capture_correlation.pass
        && metric_input_readiness.pass
        && recovery_sensor_discovery.pass
        && local_health_validation_review
            .get("status")
            .and_then(Value::as_str)
            == Some("ready_to_run_validation_suite")
        && actions.is_empty()
        && issues.is_empty();
    let (capture_sessions, activity_sessions) =
        capture_arrival_window_rows(&store, &args.start, &args.end)?;
    let command_validation_records = store.command_validation_records()?;
    let physical_arrival_rows = capture_arrival_physical_rows(
        &capture_correlation,
        &metric_input_readiness,
        &capture_sessions,
        &command_validation_records,
        &activity_sessions,
    );
    let report = CaptureArrivalPlanReport {
        schema: CAPTURE_ARRIVAL_PLAN_REPORT_SCHEMA.to_string(),
        generated_by: "goose-capture-arrival-plan".to_string(),
        pass,
        start: args.start,
        end: args.end,
        min_owned_captures,
        require_owned_captures: args.require_owned_captures,
        require_scores_ready: args.require_scores_ready,
        action_count: actions.len(),
        physical_arrival_row_count: physical_arrival_rows.len(),
        physical_arrival_rows,
        next_capture_focus,
        actions,
        capture_correlation,
        metric_input_readiness,
        recovery_sensor_discovery,
        local_health_validation_review,
        issues,
    };
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!("cannot serialize capture arrival plan: {error}"))
    })
}

fn capture_arrival_physical_rows(
    capture_correlation: &CaptureCorrelationReport,
    metric_input_readiness: &MetricInputReadinessReport,
    capture_sessions: &[CaptureSessionRow],
    command_validation_records: &[CommandValidationRecord],
    activity_sessions: &[ActivitySessionRow],
) -> Vec<CaptureArrivalPhysicalRow> {
    let capture_session_ready = capture_sessions
        .iter()
        .any(|session| session.status == "finished" && session.frame_count > 0);
    let capture_session_started = !capture_sessions.is_empty();
    let capture_observations_ready = !capture_correlation.observations.is_empty();
    let trusted_capture_summary_ready = capture_correlation
        .summaries
        .iter()
        .any(|summary| summary.trusted_metric_ready);
    let historical_summary_observed = capture_correlation
        .summaries
        .iter()
        .any(|summary| summary.body_summary_kind == "normal_history");
    let service_filter_ready = capture_sessions.iter().any(|session| {
        session_json_has_any(
            session,
            &[
                "whoop_scan_targeted",
                "scan_mode",
                "whoop_profile",
                "service_uuids",
                "generation",
            ],
        )
    });
    let role_labels_ready = capture_sessions.iter().any(|session| {
        session_json_has_any(
            session,
            &[
                "roles",
                "whoop_role",
                "command_to_strap",
                "command_from_strap",
                "events_from_strap",
                "data_from_strap",
                "memfault",
            ],
        )
    });
    let notification_subscriptions_ready = capture_sessions.iter().any(|session| {
        session_json_has_any(
            session,
            &[
                "notification_state",
                "is_notifying",
                "subscribed_characteristics",
                "first_notification_timestamp",
                "reconnect_resubscription",
            ],
        )
    });
    let auth_session_ready = capture_sessions.iter().any(|session| {
        session_json_has_any(
            session,
            &[
                "auth",
                "auth_trace",
                "session_log",
                "connect",
                "reconnect",
                "lock",
                "timeout",
                "wake",
                "retry",
            ],
        )
    });
    let sync_metadata_ready = capture_sessions.iter().any(|session| {
        session_json_has_any(
            session,
            &[
                "HistoryStart",
                "HistoryEnd",
                "HistoryComplete",
                "sync_metadata",
                "transfer_state",
                "range_window",
                "completion_reason",
            ],
        )
    });
    let any_command_validation_record = !command_validation_records.is_empty();
    let ready_command_validation_record = command_validation_records
        .iter()
        .any(|record| record.direct_send_ready);
    let any_activity_session = !activity_sessions.is_empty();
    let typed_activity_session = activity_sessions.iter().any(|session| {
        session.activity_type != "unknown"
            && session.confidence > 0.0
            && !matches!(session.sync_status.as_str(), "blocked" | "discarded")
    });
    let activity_boundary_provenance_ready = activity_sessions.iter().any(|session| {
        session.activity_type != "unknown"
            && session_json_has_any(
                session,
                &[
                    "activity_type",
                    "activity_type_provenance",
                    "packet_fields",
                    "activity_start",
                    "activity_end",
                    "confidence",
                ],
            )
    });
    let activity_promotion_ready = metric_input_readiness.activity_session_promotion.pass
        || activity_sessions.iter().any(|session| {
            !matches!(session.sync_status.as_str(), "blocked" | "discarded")
                && matches!(
                    session.detection_method.as_str(),
                    "official_capture"
                        | "imported"
                        | "heuristic_motion"
                        | "heuristic_hr_motion"
                        | "machine_learning"
                )
        });
    let activity_classifier_evidence = metric_input_readiness
        .activity_session_promotion
        .classification_evidence_available;

    let mut rows = Vec::new();
    rows.push(capture_arrival_physical_row(
        "arrival.service_filters",
        "Service filters",
        "gatt",
        arrival_state(service_filter_ready, capture_session_started),
        "No live WHOOP service-filter trace is attached yet.",
        "Record broad versus WHOOP-targeted scan mode, matched Gen4/Gen5 service UUIDs, peripheral id, and inferred generation.",
        "docs/whoop-arrival-checklist.md service filters",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.role_labels",
        "Role labels",
        "gatt",
        arrival_state(role_labels_ready, capture_session_started),
        "No live characteristic role map is attached yet.",
        "Label command_to_strap, command_from_strap, events_from_strap, data_from_strap, memfault, unknown roles, properties, and notifying state.",
        "docs/whoop-arrival-checklist.md role labels",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.notification_subscriptions",
        "Notification subscriptions",
        "gatt",
        arrival_state(notification_subscriptions_ready, capture_session_started),
        "No live subscribe-before-first-frame trace is attached yet.",
        "Record subscribed characteristics, subscription success, first notification timestamp, reconnect resubscription, and silent roles.",
        "docs/whoop-arrival-checklist.md notifications",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.frame_counts",
        "Frame counts",
        "capture",
        arrival_state(capture_session_ready, capture_observations_ready),
        "No first-frame or close-frame count evidence is attached yet.",
        "Record total, per-role, and per-characteristic frame counts at first frame and at close, including zero-frame windows.",
        "docs/whoop-arrival-checklist.md frame counts",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.capture_statuses",
        "Capture statuses",
        "capture",
        arrival_state(
            capture_sessions.iter().any(|session| session.status == "finished"),
            capture_session_started,
        ),
        "No live connect-to-complete status timeline is attached yet.",
        "Record connect, auth, subscribe, transfer, reconnect, abort, and complete statuses from debug stream events and session logs.",
        "docs/whoop-arrival-checklist.md capture statuses",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.command_write_pairs",
        "Command/write pairs",
        "commands",
        arrival_state(ready_command_validation_record, any_command_validation_record),
        "Fixture validation exists, but no official physical request/response pair is attached yet.",
        "Capture official app action, endpoint id, write type, request bytes, response bytes, command name, and local dry-run parity.",
        "docs/whoop-arrival-checklist.md command/write pairs",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.auth.session",
        "Auth / session observations",
        "session",
        arrival_state(auth_session_ready, capture_session_started),
        "No ordered connect/auth/reconnect/lock/timeout trace is attached yet.",
        "Record connect, auth, reconnect, lock, timeout, wake, retry, and required user action in order.",
        "docs/whoop-arrival-checklist.md auth/session",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.history.metadata",
        "Sync metadata",
        "history metadata",
        arrival_state(sync_metadata_ready, historical_summary_observed),
        "No live HistoryStart/HistoryEnd/HistoryComplete timeline is attached yet.",
        "Record range window, transfer-state transitions, retry behavior, abort behavior, and final completion reason.",
        "docs/whoop-arrival-checklist.md sync metadata",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.history.fields",
        "Parser field validation",
        "parser fields",
        arrival_state(capture_correlation.pass && trusted_capture_summary_ready, capture_observations_ready),
        "No physical byte-for-field parser validation is attached yet.",
        "Mark timestamp, BPM, RR, IMU, PPG, SpO2, skin temp, ambient light, respiratory, quality, contact, gravity, and Gen5 fields as matched/candidate/conflicting/missing.",
        "docs/whoop-arrival-checklist.md parser fields",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.activity.boundary_type",
        "Activity boundary/type fields",
        "activity fields",
        arrival_state(activity_boundary_provenance_ready, typed_activity_session),
        "No packet-derived activity boundary or type provenance is attached yet.",
        "Record start, end, pauses, sport/activity type, confidence, and whether type came from WHOOP bytes, app metadata, or Goose inference.",
        "docs/whoop-arrival-checklist.md activity fields",
    ));
    rows.push(capture_arrival_physical_row(
        "arrival.activity.promotion",
        "Activity promotion evidence",
        "activity promotion",
        arrival_state(activity_promotion_ready, any_activity_session || activity_classifier_evidence),
        "No candidate window has been promoted from a physical sync yet.",
        "Record candidate windows, feature evidence, classifier confidence, and user/session approval before activity_session creation.",
        "docs/whoop-arrival-checklist.md activity promotion",
    ));
    rows
}

fn capture_arrival_physical_row(
    id: &str,
    label: &str,
    domain: &str,
    state: &str,
    blocker: &str,
    next_action: &str,
    evidence: &str,
) -> CaptureArrivalPhysicalRow {
    let (blocker, next_action) = match state {
        "physical-validated" => ("", ""),
        "fixture-tested" | "implemented" => (blocker, next_action),
        _ => (blocker, next_action),
    };
    CaptureArrivalPhysicalRow {
        id: id.to_string(),
        label: label.to_string(),
        domain: domain.to_string(),
        state: state.to_string(),
        blocker: blocker.to_string(),
        next_action: next_action.to_string(),
        evidence: evidence.to_string(),
    }
}

fn arrival_state(physical_ready: bool, fixture_or_app_ready: bool) -> &'static str {
    if physical_ready {
        "physical-validated"
    } else if fixture_or_app_ready {
        "fixture-tested"
    } else {
        "blocked"
    }
}

fn capture_arrival_window_rows(
    store: &GooseStore,
    start: &str,
    end: &str,
) -> GooseResult<(Vec<CaptureSessionRow>, Vec<ActivitySessionRow>)> {
    let Some((start_unix_ms, end_unix_ms)) = capture_arrival_window_unix_ms(start, end) else {
        return Ok((Vec::new(), Vec::new()));
    };
    Ok((
        store.capture_sessions_between(start_unix_ms, end_unix_ms)?,
        store.activity_sessions_between(start_unix_ms, end_unix_ms)?,
    ))
}

fn capture_arrival_window_unix_ms(start: &str, end: &str) -> Option<(i64, i64)> {
    let start = capture_arrival_rfc3339_utc_unix_ms(start.trim())?;
    let end = capture_arrival_rfc3339_utc_unix_ms(end.trim())?;
    (start < end).then_some((start, end))
}

fn capture_arrival_rfc3339_utc_unix_ms(value: &str) -> Option<i64> {
    let value = value.strip_suffix('Z')?;
    let (date, time) = value.split_once('T')?;
    let mut date_parts = date.split('-');
    let year = date_parts.next()?.parse::<i32>().ok()?;
    let month = date_parts.next()?.parse::<u32>().ok()?;
    let day = date_parts.next()?.parse::<u32>().ok()?;
    if date_parts.next().is_some() {
        return None;
    }
    let mut time_parts = time.split(':');
    let hour = time_parts.next()?.parse::<u32>().ok()?;
    let minute = time_parts.next()?.parse::<u32>().ok()?;
    let seconds_part = time_parts.next()?;
    if time_parts.next().is_some() {
        return None;
    }
    let (second_text, fraction_text) = seconds_part
        .split_once('.')
        .map_or((seconds_part, ""), |(seconds, fraction)| {
            (seconds, fraction)
        });
    let second = second_text.parse::<u32>().ok()?;
    let millis = capture_arrival_millis_fraction(fraction_text)?;
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || second > 59
    {
        return None;
    }
    let days = capture_arrival_days_from_civil(year, month, day);
    days.checked_mul(86_400_000)?
        .checked_add(i64::from(hour) * 3_600_000)?
        .checked_add(i64::from(minute) * 60_000)?
        .checked_add(i64::from(second) * 1_000)?
        .checked_add(i64::from(millis))
}

fn capture_arrival_millis_fraction(value: &str) -> Option<u32> {
    if value.is_empty() {
        return Some(0);
    }
    if !value.chars().all(|character| character.is_ascii_digit()) {
        return None;
    }
    let mut millis = 0_u32;
    let mut factor = 100_u32;
    for character in value.chars().take(3) {
        millis += character.to_digit(10)? * factor;
        factor /= 10;
    }
    Some(millis)
}

fn capture_arrival_days_from_civil(year: i32, month: u32, day: u32) -> i64 {
    let year = year - i32::from(month <= 2);
    let era = if year >= 0 { year } else { year - 399 } / 400;
    let year_of_era = year - era * 400;
    let month_prime = month as i32 + if month > 2 { -3 } else { 9 };
    let day_of_year = (153 * month_prime + 2) / 5 + day as i32 - 1;
    let day_of_era = year_of_era * 365 + year_of_era / 4 - year_of_era / 100 + day_of_year;
    i64::from(era * 146_097 + day_of_era - 719_468)
}

trait CaptureArrivalProvenance {
    fn provenance_json(&self) -> &str;
}

impl CaptureArrivalProvenance for CaptureSessionRow {
    fn provenance_json(&self) -> &str {
        &self.provenance_json
    }
}

impl CaptureArrivalProvenance for ActivitySessionRow {
    fn provenance_json(&self) -> &str {
        &self.provenance_json
    }
}

fn session_json_has_any<T: CaptureArrivalProvenance>(row: &T, keys: &[&str]) -> bool {
    let Ok(value) = serde_json::from_str::<Value>(row.provenance_json()) else {
        return false;
    };
    keys.iter()
        .any(|key| capture_arrival_json_contains_key(&value, key))
}

fn capture_arrival_json_contains_key(value: &Value, expected: &str) -> bool {
    match value {
        Value::Object(object) => object.iter().any(|(key, child)| {
            key == expected || capture_arrival_json_contains_key(child, expected)
        }),
        Value::Array(values) => values
            .iter()
            .any(|child| capture_arrival_json_contains_key(child, expected)),
        _ => false,
    }
}

fn capture_arrival_plan_actions(
    capture_correlation: &CaptureCorrelationReport,
    metric_input_readiness: &MetricInputReadinessReport,
    recovery_sensor_discovery: &RecoverySensorDiscoveryReport,
    local_health_validation_review: &Value,
) -> Vec<CaptureArrivalPlanAction> {
    let mut actions = Vec::new();
    let mut seen = BTreeSet::new();

    for action in &capture_correlation.next_capture_actions {
        push_capture_arrival_action(&mut actions, &mut seen, "Capture Trust", action);
    }
    for summary in &capture_correlation.summaries {
        if summary.trusted_metric_ready {
            continue;
        }
        for action in &summary.next_capture_actions {
            push_capture_arrival_action(&mut actions, &mut seen, "Capture Trust", action);
        }
    }

    for action in &metric_input_readiness.next_actions {
        push_metric_arrival_action(&mut actions, &mut seen, "Metric Inputs", action);
    }
    for family in &metric_input_readiness.families {
        if family.score_ready {
            continue;
        }
        for action in &family.next_actions {
            push_metric_arrival_action(&mut actions, &mut seen, "Metric Inputs", action);
        }
    }
    for action in &recovery_sensor_discovery.next_actions {
        push_metric_feature_arrival_action(&mut actions, &mut seen, "Recovery Sensors", action);
    }
    push_local_health_validation_arrival_actions(
        &mut actions,
        &mut seen,
        local_health_validation_review,
    );

    actions
}

fn capture_arrival_plan_next_focus(
    actions: &[CaptureArrivalPlanAction],
) -> Option<CaptureArrivalPlanAction> {
    for priority in [
        arrival_action_is_owned_capture_target,
        arrival_action_is_capture_dependency,
        arrival_action_is_local_health_validation,
        arrival_action_is_metric_input_work,
    ] {
        if let Some(action) = actions.iter().find(priority).cloned() {
            return Some(action);
        }
    }
    None
}

fn arrival_action_is_owned_capture_target(action: &&CaptureArrivalPlanAction) -> bool {
    action.source == "Capture Trust"
        && (action.reason.contains("owned_capture")
            || action.action.contains("Capture")
            || action.action.contains("capture")
            || action.scope.contains("r17")
            || action.scope.contains("temperature"))
}

fn arrival_action_is_capture_dependency(action: &&CaptureArrivalPlanAction) -> bool {
    (action.source == "Metric Inputs" || action.source == "Recovery Sensors")
        && (action.scope == "capture_correlation"
            || action.reason.contains("capture")
            || action.action.contains("Capture")
            || action.action.contains("capture"))
}

fn arrival_action_is_local_health_validation(action: &&CaptureArrivalPlanAction) -> bool {
    action.source == "Local Health Validation"
}

fn arrival_action_is_metric_input_work(action: &&CaptureArrivalPlanAction) -> bool {
    action.source == "Metric Inputs" || action.source == "Recovery Sensors"
}

fn push_capture_arrival_action(
    actions: &mut Vec<CaptureArrivalPlanAction>,
    seen: &mut BTreeSet<String>,
    source: &str,
    action: &CaptureCorrelationNextAction,
) {
    push_arrival_action(
        actions,
        seen,
        source,
        &action.scope,
        &action.reason,
        &action.action,
    );
}

fn push_metric_arrival_action(
    actions: &mut Vec<CaptureArrivalPlanAction>,
    seen: &mut BTreeSet<String>,
    source: &str,
    action: &MetricInputNextAction,
) {
    push_arrival_action(
        actions,
        seen,
        source,
        &action.scope,
        &action.reason,
        &action.action,
    );
}

fn push_metric_feature_arrival_action(
    actions: &mut Vec<CaptureArrivalPlanAction>,
    seen: &mut BTreeSet<String>,
    source: &str,
    action: &MetricFeatureNextAction,
) {
    push_arrival_action(
        actions,
        seen,
        source,
        &action.scope,
        &action.reason,
        &action.action,
    );
}

fn push_local_health_validation_arrival_actions(
    actions: &mut Vec<CaptureArrivalPlanAction>,
    seen: &mut BTreeSet<String>,
    review: &Value,
) {
    let Some(cases) = review
        .get("acceptance_evidence_cases")
        .and_then(Value::as_array)
    else {
        return;
    };
    for case in cases {
        let Some(object) = case.as_object() else {
            continue;
        };
        let outstanding_requirements = object
            .get("outstanding_requirements")
            .and_then(Value::as_array)
            .map(|requirements| {
                requirements
                    .iter()
                    .filter_map(Value::as_str)
                    .filter(|requirement| !requirement.trim().is_empty())
                    .map(str::to_string)
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();
        if outstanding_requirements.is_empty() {
            continue;
        }
        let scope = object
            .get("case_id")
            .and_then(Value::as_str)
            .unwrap_or("acceptance_evidence_case");
        let report = object
            .get("report")
            .and_then(Value::as_str)
            .unwrap_or("validation");
        let capture_kind = object
            .get("capture_kind")
            .and_then(Value::as_str)
            .filter(|value| !value.trim().is_empty())
            .unwrap_or("owned_capture");
        let action = object
            .get("collection_action")
            .and_then(Value::as_str)
            .unwrap_or(
                "Collect owned packet evidence and validation labels required by this case.",
            );
        let reason = format!("{}:{}", report, outstanding_requirements.join(","));
        push_arrival_action(
            actions,
            seen,
            "Local Health Validation",
            scope,
            &reason,
            &format!("{action} Capture kind: {capture_kind}."),
        );
    }
}

fn push_arrival_action(
    actions: &mut Vec<CaptureArrivalPlanAction>,
    seen: &mut BTreeSet<String>,
    source: &str,
    scope: &str,
    reason: &str,
    action: &str,
) {
    let key = format!("{source}|{scope}|{reason}|{action}");
    if !seen.insert(key) {
        return;
    }
    let summary = if reason.is_empty() {
        action.to_string()
    } else {
        format!("{reason}: {action}")
    };
    actions.push(CaptureArrivalPlanAction {
        source: source.to_string(),
        scope: scope.to_string(),
        reason: reason.to_string(),
        action: action.to_string(),
        summary,
    });
}

fn sync_mark_synced_bridge(args: SyncMarkSyncedArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let count = store.mark_synced_rows(&args.stream, &args.row_ids)?;
    Ok(json!({"marked": count}))
}

fn sync_rows_pending_upload_bridge(
    args: SyncRowsPendingUploadArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = store.rows_pending_upload(&args.stream, args.limit)?;
    Ok(json!({"rows": rows}))
}

fn sync_backfill_streams_bridge(args: SyncBackfillStreamsArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let report: BackfillReport =
        store.backfill_streams_from_decoded_frames(&args.device_id, args.start_ts, args.end_ts)?;
    Ok(json!({
        "hr_inserted": report.hr_inserted,
        "rr_inserted": report.rr_inserted,
        "events_inserted": report.events_inserted,
        "battery_inserted": report.battery_inserted,
    }))
}

/// SYNC-12: Persist one HPS burst-level telemetry row to sync_telemetry.
fn sync_record_hps_telemetry_bridge(
    args: SyncRecordHpsTelemetryArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    store.insert_sync_telemetry(
        &args.session_id,
        args.burst_index,
        args.bytes_received,
        args.duration_ms,
        args.missing_packets,
        args.sequence_gaps,
        &args.result,
    )?;
    Ok(json!({"ok": true}))
}
