use std::{collections::BTreeSet, path::Path};

use super::{
    BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok,
    default_active_status, default_decode_status, default_manual_source, default_overnight_mode,
    default_raw_notification_source, empty_json_object, json_object_string, request_args,
};
use rusqlite::{Connection, OptionalExtension, params};

use crate::{
    GooseError, GooseResult,
    health_sync::{
        ActivityHealthSyncDryRunInput, HealthSyncDryRunInput, run_activity_health_sync_dry_run,
        run_health_sync_dry_run,
    },
    metrics::SleepV1Input,
    sleep_need::compute_sleep_need_with_store,
    sleep_validation::{
        SleepStageLabelValidationOptions, SleepV1EvidenceFolderOptions,
        SleepV1ExplanationStabilityOptions, SleepV1ReleaseGateInput,
        SleepWindowLabelValidationOptions, run_sleep_window_label_validation_for_store,
        validate_sleep_v1_evidence_folder_with_options,
        validate_sleep_v1_explanation_and_stability, validate_sleep_v1_release_gates,
        validate_sleep_v1_stage_labels_for_store,
    },
    store::{
        ExternalSleepSessionInput, ExternalSleepStageInput, OvernightHistoricalRangePollInput,
        OvernightRawNotificationInput, OvernightSyncSessionInput, SleepCorrectionLabelInput,
    },
};
use serde::Deserialize;
use serde_json::json;

pub(crate) fn dispatch_sleep(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "sleep.import_external_history" => request_args::<ExternalSleepHistoryImportArgs>(request)
            .and_then(external_sleep_history_import_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sleep.add_correction_label" => request_args::<SleepCorrectionLabelArgs>(request)
            .and_then(sleep_correction_label_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sleep.compute_need" => request_args::<SleepComputeNeedArgs>(request)
            .and_then(sleep_compute_need_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sleep.list_correction_labels" => request_args::<SleepCorrectionLabelListArgs>(request)
            .and_then(sleep_correction_label_list_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sleep.validate_window_labels" => request_args::<SleepWindowLabelValidationArgs>(request)
            .and_then(sleep_window_label_validation_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sleep.validate_stage_labels" => request_args::<SleepStageLabelValidationArgs>(request)
            .and_then(sleep_stage_label_validation_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sleep.validate_v1_explanation_stability" => {
            request_args::<SleepV1ExplanationStabilityArgs>(request)
                .and_then(sleep_v1_explanation_stability_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "sleep.validate_v1_release_gates" => request_args::<SleepV1ReleaseGateArgs>(request)
            .and_then(sleep_v1_release_gate_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "sleep.validate_v1_evidence_folder" => request_args::<SleepV1EvidenceFolderArgs>(request)
            .and_then(sleep_v1_evidence_folder_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "overnight.mirror_batch" => request_args::<OvernightMirrorBatchArgs>(request)
            .and_then(overnight_mirror_batch_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "overnight.mirror_counts" => request_args::<OvernightMirrorCountsArgs>(request)
            .and_then(overnight_mirror_counts_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "health_sync.dry_run" => request_args::<HealthSyncDryRunInput>(request)
            .and_then(health_sync_dry_run_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "health_sync.activity_dry_run" => request_args::<ActivityHealthSyncDryRunInput>(request)
            .and_then(activity_health_sync_dry_run_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_sleep called with non-sleep method: {}",
            request.method
        ),
    }
}

#[derive(Debug, Clone, Deserialize)]
struct ExternalSleepHistoryImportArgs {
    database_path: String,
    #[serde(default)]
    sessions: Vec<ExternalSleepSessionBridgeInput>,
    #[serde(default)]
    stages: Vec<ExternalSleepStageBridgeInput>,
}

#[derive(Debug, Clone, Deserialize)]
struct ExternalSleepSessionBridgeInput {
    sleep_id: String,
    source: String,
    platform: String,
    #[serde(default)]
    platform_record_id: Option<String>,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
    #[serde(default)]
    timezone: Option<String>,
    #[serde(default = "empty_json_object")]
    stage_summary: serde_json::Value,
    confidence: f64,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct ExternalSleepStageBridgeInput {
    stage_id: String,
    sleep_id: String,
    stage_kind: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
    confidence: f64,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct SleepCorrectionLabelArgs {
    database_path: String,
    label_id: String,
    #[serde(default)]
    sleep_id: Option<String>,
    label_type: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
    #[serde(default = "empty_json_object")]
    value: serde_json::Value,
    #[serde(default = "default_manual_source")]
    source: String,
    #[serde(default)]
    confidence: Option<f64>,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct SleepCorrectionLabelListArgs {
    database_path: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct SleepComputeNeedArgs {
    database_path: String,
    #[serde(default)]
    age_years: Option<u8>,
    #[serde(default)]
    prior_strain: Option<f64>,
}

fn sleep_compute_need_bridge(args: SleepComputeNeedArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let result = compute_sleep_need_with_store(&store, args.age_years, args.prior_strain)?;
    Ok(serde_json::json!({
        "schema": "goose.sleep-need-result.v1",
        "base_need_minutes": result.base_need_minutes,
        "debt_adjustment_minutes": result.debt_adjustment_minutes,
        "strain_adjustment_minutes": result.strain_adjustment_minutes,
        "total_need_minutes": result.total_need_minutes,
    }))
}

#[derive(Debug, Clone, Deserialize)]
struct SleepWindowLabelValidationArgs {
    database_path: String,
    start: String,
    end: String,
    #[serde(default)]
    min_owned_captures: Option<usize>,
    #[serde(default)]
    require_trusted_evidence: bool,
    #[serde(default)]
    sleep_need_minutes: Option<f64>,
    #[serde(default)]
    low_motion_threshold_0_to_1: Option<f64>,
    #[serde(default)]
    disturbance_motion_threshold_0_to_1: Option<f64>,
    #[serde(default)]
    target_midpoint_minutes_since_midnight: Option<f64>,
    #[serde(default)]
    start_tolerance_minutes: Option<f64>,
    #[serde(default)]
    end_tolerance_minutes: Option<f64>,
    #[serde(default)]
    duration_tolerance_minutes: Option<f64>,
    #[serde(default)]
    min_label_confidence: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct SleepStageLabelValidationArgs {
    database_path: String,
    input: SleepV1Input,
    #[serde(default)]
    min_label_confidence: Option<f64>,
    #[serde(default)]
    min_overlap_fraction: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct SleepV1ExplanationStabilityArgs {
    input: SleepV1Input,
    #[serde(default)]
    max_repeated_run_delta: Option<f64>,
    #[serde(default)]
    max_small_perturbation_delta: Option<f64>,
    #[serde(default)]
    perturb_sleep_duration_minutes: Option<f64>,
    #[serde(default)]
    min_v1_component_count: Option<usize>,
    #[serde(default)]
    min_explanation_quality_signal_count: Option<usize>,
}

#[derive(Debug, Clone, Deserialize)]
struct SleepV1ReleaseGateArgs {
    input: SleepV1ReleaseGateInput,
}

#[derive(Debug, Clone, Deserialize)]
struct SleepV1EvidenceFolderArgs {
    evidence_dir: String,
    #[serde(default)]
    expected_manifest_sha256: Option<String>,
}
#[derive(Debug, Clone, Deserialize)]
struct OvernightMirrorBatchArgs {
    database_path: String,
    #[serde(default)]
    sessions: Vec<OvernightMirrorSessionArgs>,
    #[serde(default)]
    raw_notifications: Vec<OvernightMirrorRawNotificationArgs>,
    #[serde(default)]
    historical_range_polls: Vec<OvernightMirrorHistoricalRangePollArgs>,
}

#[derive(Debug, Clone, Deserialize)]
struct OvernightMirrorCountsArgs {
    database_path: String,
    session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct OvernightMirrorSessionArgs {
    session_id: String,
    started_at: String,
    #[serde(default)]
    ended_at: Option<String>,
    #[serde(default)]
    band_identifier: Option<String>,
    #[serde(default)]
    app_version: Option<String>,
    #[serde(default = "default_overnight_mode")]
    mode: String,
    #[serde(default = "default_active_status")]
    final_status: String,
    #[serde(default)]
    raw_frame_count: i64,
    #[serde(default)]
    historical_frame_count: i64,
    #[serde(default)]
    k18_count: i64,
    #[serde(default)]
    k24_count: i64,
    #[serde(default)]
    k25_count: i64,
    #[serde(default)]
    k26_count: i64,
    #[serde(default)]
    packet47_count: i64,
    #[serde(default)]
    event17_count: i64,
    #[serde(default)]
    event29_count: i64,
    #[serde(default)]
    metadata49_count: i64,
    #[serde(default)]
    metadata56_count: i64,
    #[serde(default)]
    range_poll_count: i64,
    #[serde(default)]
    successful_range_poll_count: i64,
    #[serde(default)]
    event_log_count: i64,
    #[serde(default)]
    readiness_status: Option<String>,
    #[serde(default)]
    readiness: Option<String>,
    #[serde(default)]
    error_count: i64,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct OvernightMirrorRawNotificationArgs {
    session_id: String,
    captured_at: String,
    #[serde(default = "default_raw_notification_source")]
    source: String,
    #[serde(default)]
    device_id: Option<String>,
    #[serde(default)]
    active_device_name: Option<String>,
    #[serde(default)]
    connection_state: Option<String>,
    #[serde(default)]
    service_uuid: Option<String>,
    characteristic_uuid: String,
    #[serde(default)]
    device_type: Option<String>,
    #[serde(default)]
    command_or_event: Option<i64>,
    #[serde(default)]
    packet_type: Option<i64>,
    #[serde(default)]
    k_revision: Option<i64>,
    #[serde(default)]
    sequence: Option<i64>,
    frame_hex: String,
    #[serde(default)]
    payload_hex: Option<String>,
    byte_count: i64,
    #[serde(default = "default_decode_status")]
    decode_status: String,
}

#[derive(Debug, Clone, Deserialize)]
struct OvernightMirrorHistoricalRangePollArgs {
    session_id: String,
    captured_at: String,
    status: String,
    command_sequence: i64,
    result_code: i64,
    result_name: String,
    raw_payload_hex: String,
    raw_body_hex: String,
    #[serde(default)]
    revision_or_status: Option<i64>,
    #[serde(default)]
    page_current: Option<i64>,
    #[serde(default)]
    page_oldest: Option<i64>,
    #[serde(default)]
    page_end: Option<i64>,
    #[serde(default)]
    pages_behind: Option<i64>,
    #[serde(default)]
    pending_response_count: i64,
    #[serde(default)]
    retry_count: i64,
    #[serde(default)]
    notes: String,
}
fn activity_health_sync_dry_run_bridge(
    args: ActivityHealthSyncDryRunInput,
) -> GooseResult<serde_json::Value> {
    let report = run_activity_health_sync_dry_run(&args);
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize activity health sync dry-run report: {error}"
        ))
    })
}
fn health_sync_dry_run_bridge(input: HealthSyncDryRunInput) -> GooseResult<serde_json::Value> {
    let report = run_health_sync_dry_run(&input);
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize health sync dry-run report: {error}"
        ))
    })
}
fn overnight_mirror_batch_bridge(args: OvernightMirrorBatchArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let sessions: Vec<OvernightSyncSessionInput<'_>> = args
        .sessions
        .iter()
        .map(|session| OvernightSyncSessionInput {
            session_id: &session.session_id,
            started_at: &session.started_at,
            ended_at: session.ended_at.as_deref(),
            band_identifier: session.band_identifier.as_deref(),
            app_version: session.app_version.as_deref(),
            mode: &session.mode,
            final_status: &session.final_status,
            raw_frame_count: session.raw_frame_count,
            historical_frame_count: session.historical_frame_count,
            k18_count: session.k18_count,
            k24_count: session.k24_count,
            k25_count: session.k25_count,
            k26_count: session.k26_count,
            packet47_count: session.packet47_count,
            event17_count: session.event17_count,
            event29_count: session.event29_count,
            metadata49_count: session.metadata49_count,
            metadata56_count: session.metadata56_count,
            range_poll_count: session.range_poll_count,
            successful_range_poll_count: session.successful_range_poll_count,
            event_log_count: session.event_log_count,
            readiness_status: session.readiness_status.as_deref(),
            readiness: session.readiness.as_deref(),
            error_count: session.error_count,
            notes: session.notes.as_deref(),
        })
        .collect();
    let raw_notifications: Vec<OvernightRawNotificationInput<'_>> = args
        .raw_notifications
        .iter()
        .map(|notification| OvernightRawNotificationInput {
            session_id: &notification.session_id,
            captured_at: &notification.captured_at,
            source: &notification.source,
            device_id: notification.device_id.as_deref(),
            active_device_name: notification.active_device_name.as_deref(),
            connection_state: notification.connection_state.as_deref(),
            service_uuid: notification.service_uuid.as_deref(),
            characteristic_uuid: &notification.characteristic_uuid,
            device_type: notification.device_type.as_deref(),
            command_or_event: notification.command_or_event,
            packet_type: notification.packet_type,
            k_revision: notification.k_revision,
            sequence: notification.sequence,
            frame_hex: &notification.frame_hex,
            payload_hex: notification.payload_hex.as_deref(),
            byte_count: notification.byte_count,
            decode_status: &notification.decode_status,
        })
        .collect();
    let historical_range_polls: Vec<OvernightHistoricalRangePollInput<'_>> = args
        .historical_range_polls
        .iter()
        .map(|poll| OvernightHistoricalRangePollInput {
            session_id: &poll.session_id,
            captured_at: &poll.captured_at,
            status: &poll.status,
            command_sequence: poll.command_sequence,
            result_code: poll.result_code,
            result_name: &poll.result_name,
            raw_payload_hex: &poll.raw_payload_hex,
            raw_body_hex: &poll.raw_body_hex,
            revision_or_status: poll.revision_or_status,
            page_current: poll.page_current,
            page_oldest: poll.page_oldest,
            page_end: poll.page_end,
            pages_behind: poll.pages_behind,
            pending_response_count: poll.pending_response_count,
            retry_count: poll.retry_count,
            notes: &poll.notes,
        })
        .collect();
    let report =
        store.mirror_overnight_batch(&sessions, &raw_notifications, &historical_range_polls)?;
    serde_json::to_value(report)
        .map_err(|error| GooseError::message(format!("cannot serialize overnight mirror: {error}")))
}

fn overnight_mirror_counts_bridge(
    args: OvernightMirrorCountsArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let counts = store.overnight_mirror_counts(&args.session_id)?;
    serde_json::to_value(counts).map_err(|error| {
        GooseError::message(format!("cannot serialize overnight mirror counts: {error}"))
    })
}
fn external_sleep_history_import_bridge(
    args: ExternalSleepHistoryImportArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let (inserted_sessions, unchanged_sessions, inserted_stages, unchanged_stages) = store
        .immediate_transaction(|conn| {
            let mut inserted_sessions = 0usize;
            let mut unchanged_sessions = 0usize;
            for session in &args.sessions {
                let stage_summary_json =
                    json_object_string("stage_summary", &session.stage_summary)?;
                if !session
                    .stage_summary
                    .get("minutes_by_stage")
                    .is_some_and(serde_json::Value::is_object)
                {
                    return Err(GooseError::message(
                        "stage_summary_json must contain minutes_by_stage object".to_string(),
                    ));
                }
                let provenance_json = json_object_string("provenance", &session.provenance)?;
                if insert_external_sleep_session_conn(
                    conn,
                    ExternalSleepSessionInput {
                        sleep_id: &session.sleep_id,
                        source: &session.source,
                        platform: &session.platform,
                        platform_record_id: session.platform_record_id.as_deref(),
                        start_time_unix_ms: session.start_time_unix_ms,
                        end_time_unix_ms: session.end_time_unix_ms,
                        timezone: session.timezone.as_deref(),
                        stage_summary_json: &stage_summary_json,
                        confidence: session.confidence,
                        provenance_json: &provenance_json,
                    },
                )? {
                    inserted_sessions += 1;
                } else {
                    unchanged_sessions += 1;
                }
            }

            let mut inserted_stages = 0usize;
            let mut unchanged_stages = 0usize;
            for stage in &args.stages {
                let provenance_json = json_object_string("provenance", &stage.provenance)?;
                let Some(stage_kind) = canonical_external_sleep_stage_row(&stage.stage_kind) else {
                    return Err(GooseError::message(format!(
                        "external sleep stage {} kind {} is not recognized",
                        stage.stage_id, stage.stage_kind
                    )));
                };
                if insert_external_sleep_stage_conn(
                    conn,
                    ExternalSleepStageInput {
                        stage_id: &stage.stage_id,
                        sleep_id: &stage.sleep_id,
                        stage_kind,
                        start_time_unix_ms: stage.start_time_unix_ms,
                        end_time_unix_ms: stage.end_time_unix_ms,
                        confidence: stage.confidence,
                        provenance_json: &provenance_json,
                    },
                )? {
                    inserted_stages += 1;
                } else {
                    unchanged_stages += 1;
                }
            }

            Ok((
                inserted_sessions,
                unchanged_sessions,
                inserted_stages,
                unchanged_stages,
            ))
        })?;

    Ok(json!({
        "schema": "goose.external-sleep-history-import-result.v1",
        "generated_by": "goose-bridge",
        "session_count": args.sessions.len(),
        "stage_count": args.stages.len(),
        "inserted_session_count": inserted_sessions,
        "unchanged_session_count": unchanged_sessions,
        "inserted_stage_count": inserted_stages,
        "unchanged_stage_count": unchanged_stages,
        "import_policy": "external_history_context_only",
    }))
}

fn sleep_correction_label_bridge(args: SleepCorrectionLabelArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let value_json = json_object_string("value", &args.value)?;
    let provenance_json = json_object_string("provenance", &args.provenance)?;
    let inserted = store.insert_sleep_correction_label(SleepCorrectionLabelInput {
        label_id: &args.label_id,
        sleep_id: args.sleep_id.as_deref(),
        label_type: &args.label_type,
        start_time_unix_ms: args.start_time_unix_ms,
        end_time_unix_ms: args.end_time_unix_ms,
        value_json: &value_json,
        source: &args.source,
        confidence: args.confidence,
        provenance_json: &provenance_json,
    })?;
    let label = store
        .sleep_correction_label(&args.label_id)?
        .ok_or_else(|| GooseError::message("sleep correction label was not stored"))?;
    Ok(json!({
        "schema": "goose.sleep-correction-label-result.v1",
        "generated_by": "goose-bridge",
        "inserted": inserted,
        "label": label,
        "storage_policy": "manual_corrections_are_labels_not_raw_packet_edits",
    }))
}

fn sleep_correction_label_list_bridge(
    args: SleepCorrectionLabelListArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let labels =
        store.sleep_correction_labels_between(args.start_time_unix_ms, args.end_time_unix_ms)?;
    let sleep_window_label_count = labels
        .iter()
        .filter(|label| label.label_type == "sleep_window")
        .count();
    let sleep_stage_label_count = labels
        .iter()
        .filter(|label| label.label_type == "sleep_stage")
        .count();
    let nap_label_count = labels
        .iter()
        .filter(|label| label.label_type == "nap")
        .count();
    let distinct_sleep_window_sleep_id_count = labels
        .iter()
        .filter(|label| label.label_type == "sleep_window")
        .filter_map(|label| label.sleep_id.as_deref())
        .filter(|sleep_id| !sleep_id.trim().is_empty())
        .collect::<BTreeSet<_>>()
        .len();
    Ok(json!({
        "schema": "goose.sleep-correction-label-list.v1",
        "generated_by": "goose-bridge",
        "label_count": labels.len(),
        "sleep_window_label_count": sleep_window_label_count,
        "sleep_stage_label_count": sleep_stage_label_count,
        "nap_label_count": nap_label_count,
        "distinct_sleep_window_sleep_id_count": distinct_sleep_window_sleep_id_count,
        "labels": labels,
        "storage_policy": "manual_corrections_are_labels_not_raw_packet_edits",
    }))
}

fn sleep_window_label_validation_bridge(
    args: SleepWindowLabelValidationArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let defaults = SleepWindowLabelValidationOptions::default();
    let report = run_sleep_window_label_validation_for_store(
        &store,
        &args.database_path,
        &args.start,
        &args.end,
        SleepWindowLabelValidationOptions {
            min_owned_captures_per_summary: args
                .min_owned_captures
                .unwrap_or(defaults.min_owned_captures_per_summary),
            require_trusted_evidence: args.require_trusted_evidence,
            sleep_need_minutes: args
                .sleep_need_minutes
                .unwrap_or(defaults.sleep_need_minutes),
            low_motion_threshold_0_to_1: args
                .low_motion_threshold_0_to_1
                .unwrap_or(defaults.low_motion_threshold_0_to_1),
            disturbance_motion_threshold_0_to_1: args
                .disturbance_motion_threshold_0_to_1
                .unwrap_or(defaults.disturbance_motion_threshold_0_to_1),
            target_midpoint_minutes_since_midnight: args
                .target_midpoint_minutes_since_midnight
                .unwrap_or(defaults.target_midpoint_minutes_since_midnight),
            start_tolerance_minutes: args
                .start_tolerance_minutes
                .unwrap_or(defaults.start_tolerance_minutes),
            end_tolerance_minutes: args
                .end_tolerance_minutes
                .unwrap_or(defaults.end_tolerance_minutes),
            duration_tolerance_minutes: args
                .duration_tolerance_minutes
                .unwrap_or(defaults.duration_tolerance_minutes),
            min_label_confidence: args
                .min_label_confidence
                .unwrap_or(defaults.min_label_confidence),
        },
    )?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize sleep window label validation report: {error}"
        ))
    })
}

fn sleep_stage_label_validation_bridge(
    args: SleepStageLabelValidationArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let defaults = SleepStageLabelValidationOptions::default();
    let report = validate_sleep_v1_stage_labels_for_store(
        &store,
        &args.input,
        SleepStageLabelValidationOptions {
            min_label_confidence: args
                .min_label_confidence
                .unwrap_or(defaults.min_label_confidence),
            min_overlap_fraction: args
                .min_overlap_fraction
                .unwrap_or(defaults.min_overlap_fraction),
        },
    )?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize sleep stage label validation report: {error}"
        ))
    })
}

fn sleep_v1_explanation_stability_bridge(
    args: SleepV1ExplanationStabilityArgs,
) -> GooseResult<serde_json::Value> {
    let defaults = SleepV1ExplanationStabilityOptions::default();
    let report = validate_sleep_v1_explanation_and_stability(
        &args.input,
        SleepV1ExplanationStabilityOptions {
            max_repeated_run_delta: args
                .max_repeated_run_delta
                .unwrap_or(defaults.max_repeated_run_delta),
            max_small_perturbation_delta: args
                .max_small_perturbation_delta
                .unwrap_or(defaults.max_small_perturbation_delta),
            perturb_sleep_duration_minutes: args
                .perturb_sleep_duration_minutes
                .unwrap_or(defaults.perturb_sleep_duration_minutes),
            min_v1_component_count: args
                .min_v1_component_count
                .unwrap_or(defaults.min_v1_component_count),
            min_explanation_quality_signal_count: args
                .min_explanation_quality_signal_count
                .unwrap_or(defaults.min_explanation_quality_signal_count),
        },
    );
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize sleep v1 explanation stability report: {error}"
        ))
    })
}

fn sleep_v1_release_gate_bridge(args: SleepV1ReleaseGateArgs) -> GooseResult<serde_json::Value> {
    let report = validate_sleep_v1_release_gates(&args.input);
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize sleep v1 release gate report: {error}"
        ))
    })
}

fn sleep_v1_evidence_folder_bridge(
    args: SleepV1EvidenceFolderArgs,
) -> GooseResult<serde_json::Value> {
    let report = validate_sleep_v1_evidence_folder_with_options(
        Path::new(&args.evidence_dir),
        SleepV1EvidenceFolderOptions {
            expected_evidence_manifest_sha256: args.expected_manifest_sha256,
        },
    )?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize sleep v1 evidence folder report: {error}"
        ))
    })
}

/// Insert an external sleep session using a raw `&Connection` (for use inside
/// `immediate_transaction` where the store mutex is already held).
/// Mirrors the logic of `GooseStore::insert_external_sleep_session` but operates
/// on the already-locked connection rather than re-acquiring the mutex.
fn insert_external_sleep_session_conn(
    conn: &Connection,
    input: ExternalSleepSessionInput<'_>,
) -> GooseResult<bool> {
    // Check for an existing row with the same sleep_id.
    let existing: Option<(
        String,
        String,
        String,
        Option<String>,
        i64,
        i64,
        Option<String>,
        String,
        f64,
        String,
    )> = conn
        .query_row(
            r#"
            SELECT
                sleep_id, source, platform, platform_record_id,
                start_time_unix_ms, end_time_unix_ms,
                timezone, stage_summary_json, confidence, provenance_json
            FROM external_sleep_sessions
            WHERE sleep_id = ?1
            "#,
            params![input.sleep_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, i64>(5)?,
                    row.get::<_, Option<String>>(6)?,
                    row.get::<_, String>(7)?,
                    row.get::<_, f64>(8)?,
                    row.get::<_, String>(9)?,
                ))
            },
        )
        .optional()
        .map_err(GooseError::from)?;

    if let Some((
        ex_sleep_id,
        ex_source,
        ex_platform,
        ex_platform_record_id,
        ex_start,
        ex_end,
        ex_timezone,
        ex_stage_summary,
        ex_confidence,
        ex_provenance,
    )) = existing
    {
        let same = ex_sleep_id == input.sleep_id
            && ex_source == input.source
            && ex_platform == input.platform
            && ex_platform_record_id == input.platform_record_id.map(str::to_string)
            && ex_start == input.start_time_unix_ms
            && ex_end == input.end_time_unix_ms
            && ex_timezone == input.timezone.map(str::to_string)
            && ex_stage_summary == input.stage_summary_json
            && (ex_confidence - input.confidence).abs() < f64::EPSILON
            && ex_provenance == input.provenance_json;
        if same {
            return Ok(false);
        }
        return Err(GooseError::message(format!(
            "external sleep session {} already exists with different metadata",
            input.sleep_id
        )));
    }

    conn.execute(
        r#"
        INSERT INTO external_sleep_sessions (
            sleep_id, source, platform, platform_record_id,
            start_time_unix_ms, end_time_unix_ms, duration_ms,
            timezone, stage_summary_json, confidence, provenance_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
        "#,
        params![
            input.sleep_id,
            input.source,
            input.platform,
            input.platform_record_id,
            input.start_time_unix_ms,
            input.end_time_unix_ms,
            input.end_time_unix_ms - input.start_time_unix_ms,
            input.timezone,
            input.stage_summary_json,
            input.confidence,
            input.provenance_json,
        ],
    )?;
    Ok(true)
}

/// Insert an external sleep stage using a raw `&Connection` (for use inside
/// `immediate_transaction` where the store mutex is already held).
/// Mirrors the logic of `GooseStore::insert_external_sleep_stage`.
fn insert_external_sleep_stage_conn(
    conn: &Connection,
    input: ExternalSleepStageInput<'_>,
) -> GooseResult<bool> {
    // Validate that the parent session exists and capture its time range.
    let parent_range: Option<(i64, i64)> = conn
        .query_row(
            "SELECT start_time_unix_ms, end_time_unix_ms FROM external_sleep_sessions WHERE sleep_id = ?1",
            params![input.sleep_id],
            |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)),
        )
        .optional()
        .map_err(GooseError::from)?;

    let Some((parent_start, parent_end)) = parent_range else {
        return Err(GooseError::message(format!(
            "external sleep session {} not found",
            input.sleep_id
        )));
    };

    // Stages must fall entirely within the parent session's time range.
    if input.start_time_unix_ms < parent_start || input.end_time_unix_ms > parent_end {
        return Err(GooseError::message(format!(
            "external sleep stage {} must be within parent sleep session {}",
            input.stage_id, input.sleep_id
        )));
    }

    // Check for an existing row with the same stage_id.
    let existing: Option<(String, String, String, i64, i64, f64, String)> = conn
        .query_row(
            r#"
            SELECT
                stage_id, sleep_id, stage_kind,
                start_time_unix_ms, end_time_unix_ms,
                confidence, provenance_json
            FROM external_sleep_stages
            WHERE stage_id = ?1
            "#,
            params![input.stage_id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, i64>(3)?,
                    row.get::<_, i64>(4)?,
                    row.get::<_, f64>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )
        .optional()
        .map_err(GooseError::from)?;

    if let Some((
        ex_stage_id,
        ex_sleep_id,
        ex_stage_kind,
        ex_start,
        ex_end,
        ex_confidence,
        ex_provenance,
    )) = existing
    {
        let same = ex_stage_id == input.stage_id
            && ex_sleep_id == input.sleep_id
            && ex_stage_kind == input.stage_kind
            && ex_start == input.start_time_unix_ms
            && ex_end == input.end_time_unix_ms
            && (ex_confidence - input.confidence).abs() < f64::EPSILON
            && ex_provenance == input.provenance_json;
        if same {
            return Ok(false);
        }
        return Err(GooseError::message(format!(
            "external sleep stage {} already exists with different metadata",
            input.stage_id
        )));
    }

    conn.execute(
        r#"
        INSERT INTO external_sleep_stages (
            stage_id, sleep_id, stage_kind,
            start_time_unix_ms, end_time_unix_ms, duration_ms,
            confidence, provenance_json
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
        "#,
        params![
            input.stage_id,
            input.sleep_id,
            input.stage_kind,
            input.start_time_unix_ms,
            input.end_time_unix_ms,
            input.end_time_unix_ms - input.start_time_unix_ms,
            input.confidence,
            input.provenance_json,
        ],
    )?;
    Ok(true)
}

fn canonical_external_sleep_stage(stage: &str) -> Option<&'static str> {
    match stage
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '-'], "_")
        .as_str()
    {
        "awake" | "asleep_awake" | "sleep_awake" | "out_of_bed" => Some("awake"),
        "asleep" | "asleep_unspecified" | "core" | "light" | "asleep_core" | "sleep_light" => {
            Some("core")
        }
        "deep" | "asleep_deep" | "sleep_deep" => Some("deep"),
        "rem" | "asleep_rem" | "sleep_rem" => Some("rem"),
        "in_bed" | "inbed" => None,
        _ => None,
    }
}

fn canonical_external_sleep_stage_row(stage: &str) -> Option<&'static str> {
    match stage
        .trim()
        .to_ascii_lowercase()
        .replace([' ', '-'], "_")
        .as_str()
    {
        "in_bed" | "inbed" => Some("in_bed"),
        "unknown" => Some("unknown"),
        "not_applicable" | "not_applicable_sleep" => Some("not_applicable"),
        value => canonical_external_sleep_stage(value),
    }
}
