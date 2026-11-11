use std::collections::BTreeMap;

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    GooseError, GooseResult,
    activity_sessions::{
        ActivitySessionCorrectionKind, activity_session_correction_plans,
        append_activity_session_correction_history,
    },
    store::{
        ActivityIntervalInput, ActivityMetricInput, ActivityMetricRow, ActivitySessionInput,
        GooseStore,
    },
    timeline::packet_timeline_from_decoded_frames,
};

use super::{
    BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok, empty_json_array,
    empty_json_object, json_object_string, request_args,
};

// ── Args structs ───────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
struct TimelineArgs {
    decoded_frames: Vec<crate::store::DecodedFrameRow>,
}

#[derive(Debug, Clone, Deserialize)]
struct JournalUpsertArgs {
    database_path: String,
    date: String,
    source: String,
    behaviors_json: String,
    #[serde(default)]
    notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct WorkoutUpsertArgs {
    database_path: String,
    date: String,
    source: String,
    sport: String,
    start_time: String,
    end_time: String,
    duration_s: f64,
    #[serde(default)]
    activity_session_id: Option<String>,
    #[serde(default)]
    avg_hr_bpm: Option<f64>,
    #[serde(default)]
    max_hr_bpm: Option<f64>,
    #[serde(default)]
    strain: Option<f64>,
    #[serde(default)]
    calories_kcal: Option<f64>,
    #[serde(default)]
    distance_m: Option<f64>,
    #[serde(default)]
    notes: Option<String>,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct AppleDailyUpsertArgs {
    database_path: String,
    date: String,
    source: String,
    #[serde(default)]
    steps: Option<i64>,
    #[serde(default)]
    active_kcal: Option<f64>,
    #[serde(default)]
    basal_kcal: Option<f64>,
    #[serde(default)]
    avg_hr_bpm: Option<f64>,
    #[serde(default)]
    max_hr_bpm: Option<f64>,
    #[serde(default)]
    vo2max: Option<f64>,
    #[serde(default)]
    weight_kg: Option<f64>,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivitySessionUpsertArgs {
    database_path: String,
    session_id: String,
    source: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
    activity_type: String,
    #[serde(default)]
    external_activity_type_code: Option<String>,
    #[serde(default)]
    external_activity_type_name: Option<String>,
    #[serde(default)]
    custom_label: Option<String>,
    confidence: f64,
    detection_method: String,
    sync_status: String,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivitySessionLookupArgs {
    database_path: String,
    session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivitySessionListArgs {
    database_path: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivitySessionCorrectionArgs {
    database_path: String,
    session_id: String,
    kind: ActivitySessionCorrectionKind,
    #[serde(default)]
    activity_type: Option<String>,
    #[serde(default)]
    start_time_unix_ms: Option<i64>,
    #[serde(default)]
    end_time_unix_ms: Option<i64>,
    #[serde(default)]
    external_activity_type_code: Option<String>,
    #[serde(default)]
    external_activity_type_name: Option<String>,
    #[serde(default)]
    custom_label: Option<String>,
    #[serde(default = "empty_json_object")]
    details: serde_json::Value,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivityMetricAttachArgs {
    database_path: String,
    metric_id: String,
    activity_session_id: String,
    metric_name: String,
    value: f64,
    unit: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
    #[serde(default = "empty_json_array")]
    quality_flags: serde_json::Value,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivityMetricAttachBatchArgs {
    database_path: String,
    metrics: Vec<ActivityMetricAttachInputArgs>,
    #[serde(default = "super::default_true")]
    include_metrics: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivityMetricAttachInputArgs {
    metric_id: String,
    activity_session_id: String,
    metric_name: String,
    value: f64,
    unit: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
    #[serde(default = "empty_json_array")]
    quality_flags: serde_json::Value,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

struct SerializedActivityMetricAttachArg<'a> {
    metric: &'a ActivityMetricAttachInputArgs,
    quality_flags_json: String,
    provenance_json: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivityMetricListArgs {
    database_path: String,
    activity_session_id: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivityMetricWindowArgs {
    database_path: String,
    activity_session_id: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivityIntervalAttachArgs {
    database_path: String,
    interval_id: String,
    activity_session_id: String,
    interval_type: String,
    start_time_unix_ms: i64,
    end_time_unix_ms: i64,
    sequence: i64,
    #[serde(default = "empty_json_object")]
    metadata: serde_json::Value,
    #[serde(default = "empty_json_object")]
    provenance: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct ActivityIntervalListArgs {
    database_path: String,
    activity_session_id: String,
}

// ── Dispatcher ─────────────────────────────────────────────────────────────────

pub(crate) fn dispatch_activity(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        "journal.upsert" => request_args::<JournalUpsertArgs>(request)
            .and_then(journal_upsert_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "workout.upsert" => request_args::<WorkoutUpsertArgs>(request)
            .and_then(workout_upsert_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "apple_daily.upsert" => request_args::<AppleDailyUpsertArgs>(request)
            .and_then(apple_daily_upsert_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.create_session" => request_args::<ActivitySessionUpsertArgs>(request)
            .and_then(activity_create_session_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.get_session" => request_args::<ActivitySessionLookupArgs>(request)
            .and_then(activity_get_session_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.list_sessions" => request_args::<ActivitySessionListArgs>(request)
            .and_then(activity_list_sessions_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.list_sessions_with_metrics" => request_args::<ActivitySessionListArgs>(request)
            .and_then(activity_list_sessions_with_metrics_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.update_session" => request_args::<ActivitySessionUpsertArgs>(request)
            .and_then(activity_update_session_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.correction_plans" => activity_correction_plans_bridge()
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.apply_correction" => request_args::<ActivitySessionCorrectionArgs>(request)
            .and_then(activity_apply_correction_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.delete_session" => request_args::<ActivitySessionLookupArgs>(request)
            .and_then(activity_delete_session_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.attach_metric" => request_args::<ActivityMetricAttachArgs>(request)
            .and_then(activity_attach_metric_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.attach_metrics" => request_args::<ActivityMetricAttachBatchArgs>(request)
            .and_then(activity_attach_metrics_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.list_metrics" => request_args::<ActivityMetricListArgs>(request)
            .and_then(activity_list_metrics_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.attach_interval" => request_args::<ActivityIntervalAttachArgs>(request)
            .and_then(activity_attach_interval_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.list_intervals" => request_args::<ActivityIntervalListArgs>(request)
            .and_then(activity_list_intervals_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "activity.metrics_for_session_in_window" => {
            request_args::<ActivityMetricWindowArgs>(request)
                .and_then(activity_metrics_for_session_in_window_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "timeline.from_decoded_frames" => request_args::<TimelineArgs>(request)
            .and_then(timeline_from_decoded_frames_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        _ => unreachable!(
            "dispatch_activity called with non-activity method: {}",
            request.method
        ),
    }
}

// ── Bridge helpers ─────────────────────────────────────────────────────────────

fn timeline_from_decoded_frames_bridge(args: TimelineArgs) -> GooseResult<serde_json::Value> {
    let rows = packet_timeline_from_decoded_frames(&args.decoded_frames)?;
    serde_json::to_value(rows)
        .map_err(|error| GooseError::message(format!("cannot serialize timeline rows: {error}")))
}

fn journal_upsert_bridge(args: JournalUpsertArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let inserted = store.insert_journal(
        &args.date,
        &args.source,
        &args.behaviors_json,
        args.notes.as_deref(),
    )?;
    Ok(json!({
        "schema": "goose.journal-upsert-result.v1",
        "generated_by": "goose-bridge",
        "inserted": inserted,
    }))
}

fn workout_upsert_bridge(args: WorkoutUpsertArgs) -> GooseResult<serde_json::Value> {
    let provenance_json = json_object_string("provenance", &args.provenance)?;
    let store = acquire_bridge_conn(&args.database_path)?;
    let inserted = store.insert_workout(
        &args.date,
        &args.source,
        &args.sport,
        &args.start_time,
        &args.end_time,
        args.duration_s,
        args.activity_session_id.as_deref(),
        args.avg_hr_bpm,
        args.max_hr_bpm,
        args.strain,
        args.calories_kcal,
        args.distance_m,
        args.notes.as_deref(),
        &provenance_json,
    )?;
    Ok(json!({
        "schema": "goose.workout-upsert-result.v1",
        "generated_by": "goose-bridge",
        "inserted": inserted,
    }))
}

fn apple_daily_upsert_bridge(args: AppleDailyUpsertArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let inserted = store.insert_apple_daily(
        &args.date,
        &args.source,
        args.steps,
        args.active_kcal,
        args.basal_kcal,
        args.avg_hr_bpm,
        args.max_hr_bpm,
        args.vo2max,
        args.weight_kg,
    )?;
    Ok(json!({
        "schema": "goose.apple-daily-upsert-result.v1",
        "generated_by": "goose-bridge",
        "inserted": inserted,
    }))
}

fn activity_create_session_bridge(
    args: ActivitySessionUpsertArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let provenance_json = json_object_string("provenance", &args.provenance)?;
    let inserted = store.insert_activity_session(ActivitySessionInput {
        session_id: &args.session_id,
        source: &args.source,
        start_time_unix_ms: args.start_time_unix_ms,
        end_time_unix_ms: args.end_time_unix_ms,
        activity_type: &args.activity_type,
        external_activity_type_code: args.external_activity_type_code.as_deref(),
        external_activity_type_name: args.external_activity_type_name.as_deref(),
        custom_label: args.custom_label.as_deref(),
        confidence: args.confidence,
        detection_method: &args.detection_method,
        sync_status: &args.sync_status,
        provenance_json: &provenance_json,
    })?;
    let session = store.activity_session(&args.session_id)?.ok_or_else(|| {
        GooseError::message(format!("activity session {} not found", args.session_id))
    })?;
    Ok(json!({
        "schema": "goose.activity-session-result.v1",
        "generated_by": "goose-bridge",
        "inserted": inserted,
        "session": session,
    }))
}

fn activity_get_session_bridge(args: ActivitySessionLookupArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let session = store.activity_session(&args.session_id)?.ok_or_else(|| {
        GooseError::message(format!("activity session {} not found", args.session_id))
    })?;
    Ok(json!({
        "schema": "goose.activity-session-result.v1",
        "generated_by": "goose-bridge",
        "session": session,
    }))
}

fn activity_list_sessions_bridge(args: ActivitySessionListArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let sessions =
        store.activity_sessions_between(args.start_time_unix_ms, args.end_time_unix_ms)?;
    Ok(json!({
        "schema": "goose.activity-session-list.v1",
        "generated_by": "goose-bridge",
        "start_time_unix_ms": args.start_time_unix_ms,
        "end_time_unix_ms": args.end_time_unix_ms,
        "session_count": sessions.len(),
        "sessions": sessions,
    }))
}

fn activity_list_sessions_with_metrics_bridge(
    args: ActivitySessionListArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let sessions =
        store.activity_sessions_between(args.start_time_unix_ms, args.end_time_unix_ms)?;
    let session_ids = sessions
        .iter()
        .map(|session| session.session_id.clone())
        .collect::<Vec<_>>();
    let metrics = store.activity_metrics_for_sessions(&session_ids)?;
    let mut metrics_by_session: BTreeMap<String, Vec<ActivityMetricRow>> = BTreeMap::new();
    for metric in metrics {
        metrics_by_session
            .entry(metric.activity_session_id.clone())
            .or_default()
            .push(metric);
    }

    Ok(json!({
        "schema": "goose.activity-session-list-with-metrics.v1",
        "generated_by": "goose-bridge",
        "start_time_unix_ms": args.start_time_unix_ms,
        "end_time_unix_ms": args.end_time_unix_ms,
        "session_count": sessions.len(),
        "sessions": sessions,
        "metrics_by_session": metrics_by_session,
    }))
}

fn activity_update_session_bridge(
    args: ActivitySessionUpsertArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let provenance_json = json_object_string("provenance", &args.provenance)?;
    let updated = store.update_activity_session(ActivitySessionInput {
        session_id: &args.session_id,
        source: &args.source,
        start_time_unix_ms: args.start_time_unix_ms,
        end_time_unix_ms: args.end_time_unix_ms,
        activity_type: &args.activity_type,
        external_activity_type_code: args.external_activity_type_code.as_deref(),
        external_activity_type_name: args.external_activity_type_name.as_deref(),
        custom_label: args.custom_label.as_deref(),
        confidence: args.confidence,
        detection_method: &args.detection_method,
        sync_status: &args.sync_status,
        provenance_json: &provenance_json,
    })?;
    let session = store.activity_session(&args.session_id)?.ok_or_else(|| {
        GooseError::message(format!("activity session {} not found", args.session_id))
    })?;
    Ok(json!({
        "schema": "goose.activity-session-result.v1",
        "generated_by": "goose-bridge",
        "updated": updated,
        "session": session,
    }))
}

fn activity_correction_plans_bridge() -> GooseResult<serde_json::Value> {
    let plans = activity_session_correction_plans();
    Ok(json!({
        "schema": "goose.activity-correction-plans.v1",
        "generated_by": "goose-bridge",
        "plan_count": plans.len(),
        "plans": plans,
    }))
}

fn activity_apply_correction_bridge(
    args: ActivitySessionCorrectionArgs,
) -> GooseResult<serde_json::Value> {
    if !args.details.is_object() {
        return Err(GooseError::message("details must be a JSON object"));
    }
    if !args.provenance.is_object() {
        return Err(GooseError::message("provenance must be a JSON object"));
    }

    let store = acquire_bridge_conn(&args.database_path)?;
    let existing = store.activity_session(&args.session_id)?.ok_or_else(|| {
        GooseError::message(format!("activity session {} not found", args.session_id))
    })?;

    let previous_provenance =
        serde_json::from_str::<Value>(&existing.provenance_json).map_err(|error| {
            GooseError::message(format!(
                "activity session {} provenance_json is invalid: {error}",
                existing.session_id
            ))
        })?;

    let mut start_time_unix_ms = existing.start_time_unix_ms;
    let mut end_time_unix_ms = existing.end_time_unix_ms;
    let mut activity_type = existing.activity_type.clone();
    let mut external_activity_type_code = existing.external_activity_type_code.clone();
    let mut external_activity_type_name = existing.external_activity_type_name.clone();
    let mut custom_label = existing.custom_label.clone();

    match args.kind {
        ActivitySessionCorrectionKind::ChangeActivityType => {
            activity_type = args.activity_type.clone().ok_or_else(|| {
                GooseError::message(
                    "activity_type is required for change_activity_type corrections",
                )
            })?;
            if args.external_activity_type_code.is_some() {
                external_activity_type_code = args.external_activity_type_code.clone();
            }
            if args.external_activity_type_name.is_some() {
                external_activity_type_name = args.external_activity_type_name.clone();
            }
            if args.custom_label.is_some() {
                custom_label = args.custom_label.clone();
            }
        }
        ActivitySessionCorrectionKind::TrimStart => {
            start_time_unix_ms = args.start_time_unix_ms.ok_or_else(|| {
                GooseError::message("start_time_unix_ms is required for trim_start corrections")
            })?;
        }
        ActivitySessionCorrectionKind::TrimEnd => {
            end_time_unix_ms = args.end_time_unix_ms.ok_or_else(|| {
                GooseError::message("end_time_unix_ms is required for trim_end corrections")
            })?;
        }
        ActivitySessionCorrectionKind::Split
        | ActivitySessionCorrectionKind::Merge
        | ActivitySessionCorrectionKind::FalsePositive => {}
    }

    let mut details = args.details.as_object().cloned().unwrap_or_default();
    details.insert(
        "previous_start_time_unix_ms".to_string(),
        json!(existing.start_time_unix_ms),
    );
    details.insert(
        "previous_end_time_unix_ms".to_string(),
        json!(existing.end_time_unix_ms),
    );
    details.insert(
        "previous_activity_type".to_string(),
        json!(existing.activity_type.clone()),
    );
    details.insert(
        "updated_start_time_unix_ms".to_string(),
        json!(start_time_unix_ms),
    );
    details.insert(
        "updated_end_time_unix_ms".to_string(),
        json!(end_time_unix_ms),
    );
    details.insert(
        "updated_activity_type".to_string(),
        json!(activity_type.clone()),
    );
    details.insert("request_provenance".to_string(), args.provenance.clone());

    let corrected_provenance = append_activity_session_correction_history(
        &previous_provenance,
        args.kind,
        Value::Object(details),
    );
    let provenance_json = json_object_string("provenance", &corrected_provenance)?;

    let updated = store.update_activity_session(ActivitySessionInput {
        session_id: &existing.session_id,
        source: &existing.source,
        start_time_unix_ms,
        end_time_unix_ms,
        activity_type: &activity_type,
        external_activity_type_code: external_activity_type_code.as_deref(),
        external_activity_type_name: external_activity_type_name.as_deref(),
        custom_label: custom_label.as_deref(),
        confidence: existing.confidence,
        detection_method: args.kind.detection_method(),
        sync_status: args.kind.sync_status(),
        provenance_json: &provenance_json,
    })?;
    let session = store.activity_session(&args.session_id)?.ok_or_else(|| {
        GooseError::message(format!("activity session {} not found", args.session_id))
    })?;
    Ok(json!({
        "schema": "goose.activity-correction-result.v1",
        "generated_by": "goose-bridge",
        "session_id": args.session_id,
        "kind": args.kind,
        "updated": updated,
        "session": session,
    }))
}

fn activity_delete_session_bridge(
    args: ActivitySessionLookupArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let deleted = store.delete_activity_session(&args.session_id)?;
    Ok(json!({
        "schema": "goose.activity-session-delete-result.v1",
        "generated_by": "goose-bridge",
        "session_id": args.session_id,
        "deleted": deleted,
    }))
}

fn activity_attach_metric_bridge(args: ActivityMetricAttachArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let provenance_json = json_object_string("provenance", &args.provenance)?;
    let quality_flags_json = serde_json::to_string(&args.quality_flags)
        .map_err(|error| GooseError::message(format!("cannot serialize quality_flags: {error}")))?;
    let inserted = store.insert_activity_metric(ActivityMetricInput {
        metric_id: &args.metric_id,
        activity_session_id: &args.activity_session_id,
        metric_name: &args.metric_name,
        value: args.value,
        unit: &args.unit,
        start_time_unix_ms: args.start_time_unix_ms,
        end_time_unix_ms: args.end_time_unix_ms,
        quality_flags_json: &quality_flags_json,
        provenance_json: &provenance_json,
    })?;
    let metric = store.activity_metric(&args.metric_id)?.ok_or_else(|| {
        GooseError::message(format!("activity metric {} not found", args.metric_id))
    })?;
    Ok(json!({
        "schema": "goose.activity-metric-result.v1",
        "generated_by": "goose-bridge",
        "inserted": inserted,
        "metric": metric,
    }))
}

fn activity_attach_metrics_bridge(
    args: ActivityMetricAttachBatchArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let serialized = args
        .metrics
        .iter()
        .map(|metric| {
            Ok(SerializedActivityMetricAttachArg {
                metric,
                quality_flags_json: serde_json::to_string(&metric.quality_flags).map_err(
                    |error| GooseError::message(format!("cannot serialize quality_flags: {error}")),
                )?,
                provenance_json: json_object_string("provenance", &metric.provenance)?,
            })
        })
        .collect::<GooseResult<Vec<_>>>()?;
    let inputs = serialized
        .iter()
        .map(|serialized| ActivityMetricInput {
            metric_id: &serialized.metric.metric_id,
            activity_session_id: &serialized.metric.activity_session_id,
            metric_name: &serialized.metric.metric_name,
            value: serialized.metric.value,
            unit: &serialized.metric.unit,
            start_time_unix_ms: serialized.metric.start_time_unix_ms,
            end_time_unix_ms: serialized.metric.end_time_unix_ms,
            quality_flags_json: &serialized.quality_flags_json,
            provenance_json: &serialized.provenance_json,
        })
        .collect::<Vec<_>>();
    let (inserted, existing) = store.insert_activity_metrics(&inputs)?;
    let metrics = if args.include_metrics {
        args.metrics
            .iter()
            .map(|metric| {
                store.activity_metric(&metric.metric_id)?.ok_or_else(|| {
                    GooseError::message(format!("activity metric {} not found", metric.metric_id))
                })
            })
            .collect::<GooseResult<Vec<_>>>()?
    } else {
        Vec::new()
    };

    Ok(json!({
        "schema": "goose.activity-metric-batch-result.v1",
        "generated_by": "goose-bridge",
        "metric_count": args.metrics.len(),
        "inserted": inserted,
        "existing": existing,
        "metrics": metrics,
    }))
}

fn activity_list_metrics_bridge(args: ActivityMetricListArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let metrics = store.activity_metrics_for_session(&args.activity_session_id)?;
    Ok(json!({
        "schema": "goose.activity-metric-list.v1",
        "generated_by": "goose-bridge",
        "activity_session_id": args.activity_session_id,
        "metric_count": metrics.len(),
        "metrics": metrics,
    }))
}

fn activity_metrics_for_session_in_window_bridge(
    args: ActivityMetricWindowArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let metrics = store.activity_metrics_for_session_in_window(
        &args.activity_session_id,
        args.start_time_unix_ms,
        args.end_time_unix_ms,
    )?;
    Ok(json!({
        "schema": "goose.activity-metric-window.v1",
        "generated_by": "goose-bridge",
        "activity_session_id": args.activity_session_id,
        "start_time_unix_ms": args.start_time_unix_ms,
        "end_time_unix_ms": args.end_time_unix_ms,
        "metric_count": metrics.len(),
        "metrics": metrics,
    }))
}

fn activity_attach_interval_bridge(
    args: ActivityIntervalAttachArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let metadata_json = json_object_string("metadata", &args.metadata)?;
    let provenance_json = json_object_string("provenance", &args.provenance)?;
    let inserted = store.insert_activity_interval(ActivityIntervalInput {
        interval_id: &args.interval_id,
        activity_session_id: &args.activity_session_id,
        interval_type: &args.interval_type,
        start_time_unix_ms: args.start_time_unix_ms,
        end_time_unix_ms: args.end_time_unix_ms,
        sequence: args.sequence,
        metadata_json: &metadata_json,
        provenance_json: &provenance_json,
    })?;
    let interval = store.activity_interval(&args.interval_id)?.ok_or_else(|| {
        GooseError::message(format!("activity interval {} not found", args.interval_id))
    })?;
    Ok(json!({
        "schema": "goose.activity-interval-result.v1",
        "generated_by": "goose-bridge",
        "inserted": inserted,
        "interval": interval,
    }))
}

fn activity_list_intervals_bridge(
    args: ActivityIntervalListArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let intervals = store.activity_intervals_for_session(&args.activity_session_id)?;
    Ok(json!({
        "schema": "goose.activity-interval-list.v1",
        "generated_by": "goose-bridge",
        "activity_session_id": args.activity_session_id,
        "interval_count": intervals.len(),
        "intervals": intervals,
    }))
}

// ── Internal helpers used by activity_attach_metrics_bridge ───────────────────

#[allow(dead_code)]
fn insert_activity_metrics_in_store(
    store: &GooseStore,
    inputs: &[ActivityMetricInput<'_>],
) -> GooseResult<(usize, usize)> {
    store.insert_activity_metrics(inputs)
}
