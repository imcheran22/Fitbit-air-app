use std::fs;
use std::path::{Path, PathBuf};

use serde::Deserialize;
use serde_json::{Value, json};

use crate::{
    GooseError, GooseResult,
    capabilities::{DeviceCapabilities, DeviceKind},
    commands::{
        COMMAND_DEFINITIONS, CommandEmulatorLogEvidenceOptions, CommandEvidence,
        CommandLocalFrameCandidate, CommandValidationResult, command_capture_plan_from_results,
        command_evidence_from_emulator_log_text, command_evidence_template,
        command_evidence_with_local_frame_matches, command_result_from_report_json,
        direct_send_gate_from_result, direct_send_preflight_from_gate, validate_commands,
    },
    debug_ws::{
        DebugBridgeConfig, DebugCommandEnvelope, DebugCommandFinishInput, DebugCommandStartInput,
        DebugEventInput, DebugSessionStartInput, append_debug_event, debug_session_snapshot,
        finish_debug_command, start_debug_command, start_debug_session,
    },
    export::{RawExportFilters, RawExportOptions, export_raw_timeframe, validate_export_bundle},
    local_health_validation::{
        LocalHealthValidationManifestScaffoldOptions,
        local_health_validation_manifest_runbook_markdown, review_local_health_validation_manifest,
        scaffold_local_health_validation_manifest,
    },
    metrics::default_algorithm_preferences_for_scope,
    privacy_lint::lint_privacy_path,
    protocol::{DataPacketBodySummary, ParsedPayload},
    storage_check::{StorageCheckOptions, check_storage_database},
    store::{
        AlgorithmPreferenceRecord, CommandValidationRecord, GooseStore, GravityRow,
        StepCounterSampleInput,
    },
    ui_coverage::{UiCoverageAuditInput, run_ui_coverage_audit},
};

use super::{
    BridgeRequest, BridgeResponse, acquire_bridge_conn, bridge_error, bridge_ok,
    default_algorithm_scope, default_raw_export_app_version, default_raw_export_core_version,
    default_true, empty_json_object, register_built_in_definitions, request_args,
};

// ---------------------------------------------------------------------------
// Local helpers (copied from original bridge.rs — private there, duplicated here)
// ---------------------------------------------------------------------------

/// IMU LSB-to-g conversion factor for K10 raw motion accelerometer axes.
/// WHOOP 5 IMU full-scale ±16 g, 16-bit signed — 32768 / 16 = 2048... but
/// empirical capture shows 3900 LSB/g. Mirror the value used in metrics.rs.
const IMU_LSB_PER_G: f64 = 3900.0;

/// Parse an ISO-8601 UTC string to unix seconds (f64).
/// Format: "YYYY-MM-DDTHH:MM:SS.mmmZ". Returns None on malformed input.
fn unix_from_iso8601(s: &str) -> Option<f64> {
    if s.len() < 19 {
        return None;
    }
    let year: u32 = s[0..4].parse().ok()?;
    let month: u32 = s[5..7].parse().ok()?;
    let day: u32 = s[8..10].parse().ok()?;
    let hour: u32 = s[11..13].parse().ok()?;
    let minute: u32 = s[14..16].parse().ok()?;
    let sec: u32 = s[17..19].parse().ok()?;
    let millis: f64 = if s.len() > 20 && s.as_bytes().get(19) == Some(&b'.') {
        let frac: &str = s[20..].trim_end_matches('Z');
        let frac_digits: &str = frac
            .split_once(|c: char| !c.is_ascii_digit())
            .map_or(frac, |(d, _)| d);
        if frac_digits.is_empty() {
            0.0
        } else {
            let raw: f64 = frac_digits.parse().ok()?;
            raw / 10f64.powi(frac_digits.len() as i32 - 3)
        }
    } else {
        0.0
    };
    if !(1..=12).contains(&month)
        || !(1..=31).contains(&day)
        || hour > 23
        || minute > 59
        || sec > 59
    {
        return None;
    }
    // Days since Unix epoch (1970-01-01)
    let days = days_since_epoch(year, month, day) as f64;
    let time_secs = hour as f64 * 3600.0 + minute as f64 * 60.0 + sec as f64 + millis / 1000.0;
    Some(days * 86400.0 + time_secs)
}

fn days_since_epoch(year: u32, month: u32, day: u32) -> u32 {
    // Days from 1970-01-01 to year-month-day using Julian day number arithmetic.
    let a = (14 - month) / 12;
    let y = year + 4800 - a;
    let m = month + 12 * a - 3;
    let jdn = day + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045;
    // Julian day number of 1970-01-01 is 2440588
    jdn.saturating_sub(2_440_588)
}

fn iso8601_to_unix(s: &str) -> f64 {
    // Expected format: "2024-01-15T12:30:45.123Z" (26 chars minimum)
    let s = s.trim_end_matches('Z');
    let parts: Vec<&str> = s.splitn(2, 'T').collect();
    if parts.len() != 2 {
        return 0.0;
    }
    let date_parts: Vec<&str> = parts[0].splitn(3, '-').collect();
    let time_parts: Vec<&str> = parts[1].splitn(2, '.').collect();
    let hms: Vec<&str> = time_parts[0].splitn(3, ':').collect();
    if date_parts.len() != 3 || hms.len() != 3 {
        return 0.0;
    }
    let (Ok(y), Ok(mo), Ok(d)) = (
        date_parts[0].parse::<u32>(),
        date_parts[1].parse::<u32>(),
        date_parts[2].parse::<u32>(),
    ) else {
        return 0.0;
    };
    let (Ok(h), Ok(min), Ok(sec)) = (
        hms[0].parse::<u64>(),
        hms[1].parse::<u64>(),
        hms[2].parse::<u64>(),
    ) else {
        return 0.0;
    };
    let ms: u64 = time_parts.get(1).and_then(|s| s.parse().ok()).unwrap_or(0);
    let days = ymd_to_days(y, mo, d) as u64;
    let unix_secs = days * 86400 + h * 3600 + min * 60 + sec;
    unix_secs as f64 + ms as f64 / 1000.0
}

fn ymd_to_days(year: u32, month: u32, day: u32) -> u32 {
    let jd = {
        let a = (14u32.wrapping_sub(month)) / 12;
        let y = year as i64 + 4800 - a as i64;
        let m = month as i64 + 12 * a as i64 - 3;
        day as i64 + (153 * m + 2) / 5 + 365 * y + y / 4 - y / 100 + y / 400 - 32045
    };
    (jd - 2440588) as u32
}

fn days_to_ymd(days: u32) -> (u32, u32, u32) {
    let jd = days + 2440588;
    let l = jd + 68569;
    let n = 4 * l / 146097;
    let l = l - (146097 * n).div_ceil(4);
    let i = 4000 * (l + 1) / 1461001;
    let l = l - 1461 * i / 4 + 31;
    let j = 80 * l / 2447;
    let day = l - 2447 * j / 80;
    let l = j / 11;
    let month = j + 2 - 12 * l;
    let year = 100 * (n - 49) + i + l;
    (year, month, day)
}

fn chrono_from_unix(ts: f64) -> String {
    let ts = ts.max(0.0);
    let secs = ts as i64;
    let nanos = ((ts - secs as f64) * 1_000_000_000.0) as u32;
    let dt = std::time::UNIX_EPOCH + std::time::Duration::new(secs as u64, nanos);
    let elapsed = dt.duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
    let total_secs = elapsed.as_secs();
    let ms = elapsed.subsec_millis();
    let h = total_secs / 3600;
    let m = (total_secs % 3600) / 60;
    let s = total_secs % 60;
    let days_since_epoch = total_secs / 86400;
    let (year, month, day) = days_to_ymd(days_since_epoch as u32);
    format!(
        "{year:04}-{month:02}-{day:02}T{h:02}:{m:02}:{s:02}.{ms:03}Z",
        h = h % 24
    )
}

fn chrono_now() -> String {
    let since_epoch = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    chrono_from_unix(since_epoch.as_secs_f64())
}

fn default_ui_coverage_map_path() -> PathBuf {
    Path::new(env!("CARGO_MANIFEST_DIR")).join("../apk-ui-inventory/coverage-map.json")
}

// ---------------------------------------------------------------------------
// export.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct RawExportArgs {
    database_path: String,
    output_dir: String,
    #[serde(default)]
    zip_output_path: Option<String>,
    start: String,
    end: String,
    #[serde(default = "default_raw_export_app_version")]
    app_version: String,
    #[serde(default = "default_raw_export_core_version")]
    core_version: String,
    #[serde(default)]
    include_sqlite: bool,
    #[serde(default)]
    data_families: Vec<String>,
    #[serde(default = "default_true")]
    include_raw_bytes: bool,
    #[serde(default)]
    capture_session_ids: Vec<String>,
    #[serde(default)]
    packet_type_names: Vec<String>,
    #[serde(default)]
    sensor_source_signals: Vec<String>,
    #[serde(default)]
    metric_families: Vec<String>,
    #[serde(default)]
    algorithm_ids: Vec<String>,
    #[serde(default)]
    algorithm_versions: Vec<String>,
}

fn raw_export_bridge(args: RawExportArgs) -> GooseResult<serde_json::Value> {
    if args.output_dir.trim().is_empty() {
        return Err(GooseError::message("output_dir is required"));
    }
    let store = acquire_bridge_conn(&args.database_path)?;
    let database_path = Path::new(&args.database_path);
    let sqlite_source_path = if args.include_sqlite {
        Some(database_path)
    } else {
        None
    };
    let report = export_raw_timeframe(
        &store,
        RawExportOptions {
            output_dir: Path::new(&args.output_dir),
            start: &args.start,
            end: &args.end,
            app_version: &args.app_version,
            core_version: &args.core_version,
            data_families: args.data_families,
            filters: RawExportFilters {
                include_raw_bytes: args.include_raw_bytes,
                capture_session_ids: args.capture_session_ids,
                packet_type_names: args.packet_type_names,
                sensor_source_signals: args.sensor_source_signals,
                metric_families: args.metric_families,
                algorithm_ids: args.algorithm_ids,
                algorithm_versions: args.algorithm_versions,
            },
            sqlite_source_path,
            zip_output_path: args.zip_output_path.as_deref().map(Path::new),
        },
    )?;
    serde_json::to_value(report)
        .map_err(|error| GooseError::message(format!("cannot serialize export report: {error}")))
}

#[derive(Debug, Clone, Deserialize)]
struct ExportValidateBundleArgs {
    path: String,
}

fn export_validate_bundle_bridge(args: ExportValidateBundleArgs) -> GooseResult<serde_json::Value> {
    if args.path.trim().is_empty() {
        return Err(GooseError::message("path is required"));
    }
    let report = validate_export_bundle(Path::new(&args.path))?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize export validation report: {error}"
        ))
    })
}

// ---------------------------------------------------------------------------
// validation.* / local_health.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct LocalHealthValidationManifestScaffoldArgs {
    database_path: String,
    #[serde(default)]
    manifest_id: Option<String>,
    #[serde(default)]
    timezone: Option<String>,
    #[serde(default)]
    date_key: Option<String>,
    #[serde(default)]
    start: Option<String>,
    #[serde(default)]
    end: Option<String>,
    #[serde(default)]
    database_source_kind: Option<String>,
    #[serde(default)]
    window_source: Option<String>,
    #[serde(default)]
    raw_export_bundle_path: Option<String>,
}

fn local_health_validation_manifest_scaffold_bridge(
    args: LocalHealthValidationManifestScaffoldArgs,
) -> GooseResult<serde_json::Value> {
    if args.database_path.trim().is_empty() {
        return Err(GooseError::message("database_path is required"));
    }
    scaffold_local_health_validation_manifest(&LocalHealthValidationManifestScaffoldOptions {
        database_path: PathBuf::from(&args.database_path),
        manifest_id: args
            .manifest_id
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "local-health-capture-validation-scaffold".to_string()),
        timezone: args
            .timezone
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| "UTC".to_string()),
        date_key: args.date_key,
        database_source_kind: args
            .database_source_kind
            .filter(|value| !value.trim().is_empty())
            .or_else(|| Some("direct_database".to_string())),
        start: args.start,
        end: args.end,
        window_source: args.window_source,
        raw_export_bundle_path: args
            .raw_export_bundle_path
            .filter(|value| !value.trim().is_empty())
            .map(PathBuf::from),
    })
}

#[derive(Debug, Clone, Deserialize)]
struct LocalHealthValidationManifestRunbookArgs {
    #[serde(default)]
    manifest: Option<serde_json::Value>,
    #[serde(default)]
    manifest_path: Option<String>,
}

fn local_health_validation_manifest_runbook_bridge(
    args: LocalHealthValidationManifestRunbookArgs,
) -> GooseResult<serde_json::Value> {
    let manifest = if let Some(path) = args.manifest_path {
        let raw = fs::read_to_string(&path)
            .map_err(|e| GooseError::message(format!("manifest_path read failed: {e}")))?;
        serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|e| GooseError::message(format!("manifest_path parse failed: {e}")))?
    } else if let Some(m) = args.manifest {
        m
    } else {
        return Err(GooseError::message("manifest or manifest_path is required"));
    };
    if !manifest.is_object() {
        return Err(GooseError::message("manifest object is required"));
    }
    let markdown = local_health_validation_manifest_runbook_markdown(&manifest);
    let manifest_schema = manifest
        .get("schema")
        .and_then(serde_json::Value::as_str)
        .unwrap_or("unknown");
    Ok(json!({
        "schema": "goose.local-health-validation-runbook.v1",
        "manifest_schema": manifest_schema,
        "markdown_report_path": manifest
            .get("run_validation")
            .and_then(|value| value.get("markdown_report_path"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("local-health-validation-report.md"),
        "json_report_path": manifest
            .get("run_validation")
            .and_then(|value| value.get("json_report_path"))
            .and_then(serde_json::Value::as_str)
            .unwrap_or("local-health-validation-report.json"),
        "markdown": markdown
    }))
}

#[derive(Debug, Clone, Deserialize)]
struct LocalHealthValidationManifestReviewArgs {
    #[serde(default)]
    manifest: Option<serde_json::Value>,
    #[serde(default)]
    manifest_path: Option<String>,
}

fn local_health_validation_manifest_review_bridge(
    args: LocalHealthValidationManifestReviewArgs,
) -> GooseResult<serde_json::Value> {
    let manifest = if let Some(path) = args.manifest_path {
        let raw = fs::read_to_string(&path)
            .map_err(|e| GooseError::message(format!("manifest_path read failed: {e}")))?;
        serde_json::from_str::<serde_json::Value>(&raw)
            .map_err(|e| GooseError::message(format!("manifest_path parse failed: {e}")))?
    } else if let Some(m) = args.manifest {
        m
    } else {
        return Err(GooseError::message("manifest or manifest_path is required"));
    };
    if !manifest.is_object() {
        return Err(GooseError::message("manifest object is required"));
    }
    Ok(review_local_health_validation_manifest(&manifest))
}

// ---------------------------------------------------------------------------
// privacy.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct PrivacyLintArgs {
    path: String,
}

fn privacy_lint_bridge(args: PrivacyLintArgs) -> GooseResult<serde_json::Value> {
    if args.path.trim().is_empty() {
        return Err(GooseError::message("path is required"));
    }
    let report = lint_privacy_path(Path::new(&args.path))?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!("cannot serialize privacy lint report: {error}"))
    })
}

// ---------------------------------------------------------------------------
// ui_coverage.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct UiCoverageAuditArgs {
    #[serde(default)]
    coverage_map_path: Option<String>,
}

fn ui_coverage_audit_bridge(args: UiCoverageAuditArgs) -> GooseResult<serde_json::Value> {
    use std::fs;
    let input_path = args
        .coverage_map_path
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(default_ui_coverage_map_path);
    let input_raw =
        fs::read_to_string(&input_path).map_err(|source| GooseError::io(&input_path, source))?;
    let input: UiCoverageAuditInput =
        serde_json::from_str(&input_raw).map_err(|source| GooseError::json(&input_path, source))?;
    let base_dir = input_path.parent().unwrap_or_else(|| Path::new("."));
    let report = run_ui_coverage_audit(&input, base_dir)?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize UI coverage audit report: {error}"
        ))
    })
}

// ---------------------------------------------------------------------------
// workout.*
// ---------------------------------------------------------------------------

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

fn workout_upsert_bridge(args: WorkoutUpsertArgs) -> GooseResult<serde_json::Value> {
    let provenance_json = super::json_object_string("provenance", &args.provenance)?;
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

// ---------------------------------------------------------------------------
// commands.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct CommandValidateEvidenceArgs {
    #[serde(default)]
    database_path: Option<String>,
    #[serde(default)]
    persist: bool,
    evidence: Vec<CommandEvidence>,
}

#[derive(Debug, Clone, Deserialize)]
struct CommandEvidenceFromEmulatorLogArgs {
    log_text: String,
    #[serde(default)]
    source_log: Option<String>,
    #[serde(default)]
    write_type: Option<String>,
    #[serde(default)]
    visible_user_intent: bool,
    #[serde(default)]
    triggering_ui_action: Option<String>,
    #[serde(default)]
    visible_confirmation: bool,
    #[serde(default)]
    rollback_plan: bool,
    #[serde(default)]
    explicit_approval: bool,
    #[serde(default)]
    mirror_local_frame: bool,
    #[serde(default)]
    capture_app: Option<String>,
    #[serde(default)]
    capture_kind: Option<String>,
    #[serde(default)]
    owner: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct CommandPromoteLocalFrameMatchesArgs {
    evidence: Vec<CommandEvidence>,
    candidates: Vec<CommandLocalFrameCandidate>,
}

#[derive(Debug, Clone, Deserialize)]
struct CommandDirectSendGateArgs {
    database_path: String,
    command: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CommandDirectSendPreflightArgs {
    database_path: String,
    command: String,
    now_unix_ms: u64,
    #[serde(default)]
    override_expires_at_unix_ms: Option<u64>,
    #[serde(default)]
    visible_user_intent: bool,
    #[serde(default)]
    dry_run_bytes_shown: bool,
    #[serde(default)]
    dry_run_frame_hex: Option<String>,
    #[serde(default)]
    dry_run_service_uuid: Option<String>,
    #[serde(default)]
    dry_run_characteristic_uuid: Option<String>,
    #[serde(default)]
    dry_run_write_type: Option<String>,
    #[serde(default)]
    session_log_ready: bool,
    #[serde(default)]
    connection_state: Option<String>,
    #[serde(default)]
    active_device_id: Option<String>,
    #[serde(default)]
    critical_visible_confirmation: bool,
    #[serde(default)]
    critical_explicit_approval: bool,
    #[serde(default)]
    critical_rollback_or_restore_acknowledged: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct ListCommandValidationRecordsArgs {
    database_path: String,
}

#[derive(Debug, Clone, Deserialize)]
struct CommandCapturePlanArgs {
    database_path: String,
    #[serde(default)]
    commands: Vec<String>,
}

#[derive(Debug, Clone, Deserialize)]
struct ImportCommandValidationRecordsArgs {
    database_path: String,
    records: Vec<ImportedCommandValidationRecord>,
}

#[derive(Debug, Clone, Deserialize)]
struct ImportedCommandValidationRecord {
    command: String,
    risk_gate: String,
    direct_send_ready: bool,
    report_json: Value,
}

fn command_validate_evidence_bridge(
    args: CommandValidateEvidenceArgs,
) -> GooseResult<serde_json::Value> {
    let report = validate_commands(&args.evidence);
    if args.persist {
        let database_path = args
            .database_path
            .as_deref()
            .ok_or_else(|| GooseError::message("database_path is required when persist is true"))?;
        let store = acquire_bridge_conn(database_path)?;
        persist_command_validation_results(&store, &report.commands)?;
    }
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize command validation report: {error}"
        ))
    })
}

fn command_evidence_from_emulator_log_bridge(
    args: CommandEvidenceFromEmulatorLogArgs,
) -> GooseResult<serde_json::Value> {
    let defaults = CommandEmulatorLogEvidenceOptions::default();
    let source_log = args
        .source_log
        .as_deref()
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("app-selected-emulator-log");
    let report = command_evidence_from_emulator_log_text(
        source_log,
        &args.log_text,
        &CommandEmulatorLogEvidenceOptions {
            write_type: args.write_type.unwrap_or(defaults.write_type),
            visible_user_intent: args.visible_user_intent,
            triggering_ui_action: args.triggering_ui_action,
            visible_confirmation: args.visible_confirmation,
            rollback_plan: args.rollback_plan,
            explicit_approval: args.explicit_approval,
            mirror_local_frame: args.mirror_local_frame,
            capture_app: args.capture_app.unwrap_or(defaults.capture_app),
            capture_kind: args.capture_kind.unwrap_or(defaults.capture_kind),
            owner: args.owner.unwrap_or(defaults.owner),
        },
    )?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize command emulator-log evidence report: {error}"
        ))
    })
}

fn command_promote_local_frame_matches_bridge(
    args: CommandPromoteLocalFrameMatchesArgs,
) -> GooseResult<serde_json::Value> {
    let report = command_evidence_with_local_frame_matches(&args.evidence, &args.candidates);
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize command local-frame match report: {error}"
        ))
    })
}

fn command_direct_send_gate_bridge(
    args: CommandDirectSendGateArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let result = match store.command_validation_record(&args.command)? {
        Some(record) => Some(command_result_from_report_json(&record.report_json)?),
        None => None,
    };
    let gate = direct_send_gate_from_result(&args.command, result.as_ref());
    serde_json::to_value(gate)
        .map_err(|error| GooseError::message(format!("cannot serialize command gate: {error}")))
}

fn command_direct_send_preflight_bridge(
    args: CommandDirectSendPreflightArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let result = match store.command_validation_record(&args.command)? {
        Some(record) => Some(command_result_from_report_json(&record.report_json)?),
        None => None,
    };
    let gate = direct_send_gate_from_result(&args.command, result.as_ref());
    let input = crate::commands::CommandDirectSendPreflightInput {
        command: args.command,
        now_unix_ms: args.now_unix_ms,
        override_expires_at_unix_ms: args.override_expires_at_unix_ms,
        visible_user_intent: args.visible_user_intent,
        dry_run_bytes_shown: args.dry_run_bytes_shown,
        dry_run_frame_hex: args.dry_run_frame_hex,
        dry_run_service_uuid: args.dry_run_service_uuid,
        dry_run_characteristic_uuid: args.dry_run_characteristic_uuid,
        dry_run_write_type: args.dry_run_write_type,
        session_log_ready: args.session_log_ready,
        connection_state: args.connection_state,
        active_device_id: args.active_device_id,
        critical_visible_confirmation: args.critical_visible_confirmation,
        critical_explicit_approval: args.critical_explicit_approval,
        critical_rollback_or_restore_acknowledged: args.critical_rollback_or_restore_acknowledged,
    };
    let preflight = direct_send_preflight_from_gate(&input, gate);
    serde_json::to_value(preflight).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize command preflight result: {error}"
        ))
    })
}

fn command_capture_plan_bridge(args: CommandCapturePlanArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let records = store.command_validation_records()?;
    let mut results = Vec::new();
    let mut parse_issues = Vec::new();
    for record in records {
        match command_result_from_report_json(&record.report_json) {
            Ok(result) => results.push(result),
            Err(error) => parse_issues.push(format!(
                "command_validation_record_parse_failed:{}:{error}",
                record.command
            )),
        }
    }
    let mut report = command_capture_plan_from_results(&results, &args.commands);
    report.issues.extend(parse_issues);
    report.pass = report.pass && report.issues.is_empty();
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!("cannot serialize command capture plan: {error}"))
    })
}

fn command_list_validation_records_bridge(
    args: ListCommandValidationRecordsArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let records = store.command_validation_records()?;
    serde_json::to_value(records).map_err(|error| {
        GooseError::message(format!(
            "cannot serialize command validation records: {error}"
        ))
    })
}

fn command_import_validation_records_bridge(
    args: ImportCommandValidationRecordsArgs,
) -> GooseResult<serde_json::Value> {
    let record_count = args.records.len();
    let mut issues = Vec::new();
    if record_count == 0 {
        issues.push("records_required".to_string());
    }

    let mut records = Vec::new();
    let mut record_summaries = Vec::new();
    for (index, row) in args.records.into_iter().enumerate() {
        let command = row.command.trim().to_string();
        let risk_gate = row.risk_gate.trim().to_string();
        let mut row_issues = Vec::new();
        if command.is_empty() {
            row_issues.push("command_required".to_string());
        }
        if risk_gate.is_empty() {
            row_issues.push("risk_gate_required".to_string());
        }

        let report_json = match command_validation_report_json_string(&row.report_json) {
            Ok(report_json) => report_json,
            Err(issue) => {
                row_issues.push(issue);
                String::new()
            }
        };

        let result = if report_json.is_empty() {
            None
        } else {
            match command_result_from_report_json(&report_json) {
                Ok(result) => Some(result),
                Err(error) => {
                    row_issues.push(format!("report_json_parse_failed: {error}"));
                    None
                }
            }
        };

        if let Some(result) = result {
            let result_risk_gate = command_risk_gate_name(&result.risk_gate);
            if result.command != command {
                row_issues.push("report_json_command_mismatch".to_string());
            }
            if result_risk_gate != risk_gate {
                row_issues.push("report_json_risk_gate_mismatch".to_string());
            }
            if result.direct_send_ready != row.direct_send_ready {
                row_issues.push("report_json_direct_send_ready_mismatch".to_string());
            }
            if row.direct_send_ready {
                row_issues.extend(command_validation_import_provenance_issues(&result));
            }
        }

        if row_issues.is_empty() {
            record_summaries.push(json!({
                "command": command,
                "risk_gate": risk_gate,
                "direct_send_ready": row.direct_send_ready,
            }));
            records.push(CommandValidationRecord {
                command,
                risk_gate,
                direct_send_ready: row.direct_send_ready,
                report_json,
            });
        } else {
            issues.extend(
                row_issues
                    .into_iter()
                    .map(|issue| format!("records[{index}].{issue}")),
            );
        }
    }

    let mut inserted_count = 0usize;
    let mut ready_count = 0usize;
    let mut blocked_count = 0usize;
    if issues.is_empty() {
        let store = acquire_bridge_conn(&args.database_path)?;
        for record in &records {
            store.upsert_command_validation_record(record)?;
        }
        inserted_count = records.len();
        ready_count = records
            .iter()
            .filter(|record| record.direct_send_ready)
            .count();
        blocked_count = records.len() - ready_count;
    }

    Ok(json!({
        "schema": "goose.command-validation-import-report.v1",
        "generated_by": "goose-command-validation-import",
        "pass": issues.is_empty(),
        "record_count": record_count,
        "validated_record_count": records.len(),
        "inserted_count": inserted_count,
        "ready_count": ready_count,
        "blocked_count": blocked_count,
        "records": record_summaries,
        "issues": issues,
    }))
}

fn persist_command_validation_results(
    store: &GooseStore,
    results: &[CommandValidationResult],
) -> GooseResult<()> {
    for result in results {
        store.upsert_command_validation_record(&CommandValidationRecord {
            command: result.command.clone(),
            risk_gate: command_risk_gate_name(&result.risk_gate).to_string(),
            direct_send_ready: result.direct_send_ready,
            report_json: serde_json::to_string(result).map_err(|error| {
                GooseError::message(format!("cannot serialize command result: {error}"))
            })?,
        })?;
    }
    Ok(())
}

fn command_validation_report_json_string(report_json: &Value) -> Result<String, String> {
    match report_json {
        Value::String(text) if !text.trim().is_empty() => Ok(text.clone()),
        Value::String(_) => Err("report_json_required".to_string()),
        Value::Object(_) => serde_json::to_string(report_json)
            .map_err(|error| format!("report_json_serialize_failed: {error}")),
        _ => Err("report_json_object_or_string_required".to_string()),
    }
}

fn command_validation_import_provenance_issues(result: &CommandValidationResult) -> Vec<String> {
    const TRUSTED_SOURCES: &[&str] = &[
        "user_owned_official_capture",
        "passive_official_capture",
        "official_app_capture",
        "official_app_to_macos_emulator",
    ];
    const TRUSTED_CAPTURE_KINDS: &[&str] = &[
        "official_app_to_macos_emulator",
        "passive_ble_observation",
        "user_owned_official_capture",
        "owned_device_passive_capture",
    ];

    let mut issues = Vec::new();
    let source = result
        .validated_evidence_source
        .as_deref()
        .map(str::trim)
        .unwrap_or_default();
    if source.is_empty() {
        issues.push("validated_evidence_source_required".to_string());
    } else if !TRUSTED_SOURCES.contains(&source) {
        issues.push("validated_evidence_source_trusted".to_string());
    }

    let capture_kind = result
        .validated_capture_kind
        .as_deref()
        .map(str::trim)
        .unwrap_or_default();
    if capture_kind.is_empty() {
        issues.push("validated_capture_kind_required".to_string());
    } else if !TRUSTED_CAPTURE_KINDS.contains(&capture_kind) {
        issues.push("validated_capture_kind_trusted".to_string());
    }

    let owner = result
        .validated_owner
        .as_deref()
        .map(str::trim)
        .unwrap_or_default();
    if owner != "user" {
        issues.push("validated_owner_user_required".to_string());
    }

    let provenance_json = result
        .validated_provenance_json
        .as_deref()
        .map(str::trim)
        .unwrap_or_default();
    let provenance = if provenance_json.is_empty() {
        issues.push("validated_provenance_json_required".to_string());
        None
    } else {
        match serde_json::from_str::<Value>(provenance_json) {
            Ok(Value::Object(object)) if !object.is_empty() => Some(object),
            Ok(Value::Object(_)) => {
                issues.push("validated_provenance_non_empty_object".to_string());
                None
            }
            Ok(_) => {
                issues.push("validated_provenance_json_object".to_string());
                None
            }
            Err(_) => {
                issues.push("validated_provenance_json_object".to_string());
                None
            }
        }
    };

    if let Some(provenance) = provenance.as_ref() {
        if bridge_provenance_string(provenance, "owner") != Some("user") {
            issues.push("validated_provenance_owner_user".to_string());
        }
        if bridge_provenance_string(provenance, "capture_app") != Some("whoop_official") {
            issues.push("validated_provenance_capture_app_official".to_string());
        }
        match bridge_provenance_string(provenance, "capture_kind") {
            Some(kind) if TRUSTED_CAPTURE_KINDS.contains(&kind) => {
                if !capture_kind.is_empty() && kind != capture_kind {
                    issues.push("validated_provenance_capture_kind_match".to_string());
                }
            }
            Some(_) => issues.push("validated_provenance_capture_kind_trusted".to_string()),
            None => issues.push("validated_provenance_capture_kind_required".to_string()),
        }
    }
    if result.direct_send_ready
        && !matches!(result.risk_gate, crate::commands::CommandRiskGate::ReadOnly)
        && result
            .validated_triggering_ui_action
            .as_deref()
            .map(str::trim)
            .unwrap_or_default()
            .is_empty()
    {
        issues.push("validated_triggering_ui_action_required".to_string());
    }

    issues.sort();
    issues.dedup();
    issues
}

fn bridge_provenance_string<'a>(
    provenance: &'a serde_json::Map<String, Value>,
    key: &str,
) -> Option<&'a str> {
    provenance
        .get(key)?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn command_risk_gate_name(risk_gate: &crate::commands::CommandRiskGate) -> &'static str {
    match risk_gate {
        crate::commands::CommandRiskGate::ReadOnly => "read_only",
        crate::commands::CommandRiskGate::UserVisibleStateChange => "user_visible_state_change",
        crate::commands::CommandRiskGate::CriticalStateChange => "critical_state_change",
    }
}

// ---------------------------------------------------------------------------
// debug.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct DebugStartSessionArgs {
    database_path: String,
    session_id: String,
    started_at_unix_ms: u64,
    bridge: DebugBridgeConfig,
}

#[derive(Debug, Clone, Deserialize)]
struct DebugStartCommandArgs {
    database_path: String,
    session_id: String,
    received_at_unix_ms: u64,
    command: DebugCommandEnvelope,
}

#[derive(Debug, Clone, Deserialize)]
struct DebugFinishCommandArgs {
    database_path: String,
    session_id: String,
    time_unix_ms: u64,
    command_id: String,
    ok: bool,
    message: String,
    #[serde(default = "empty_json_object")]
    data: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct DebugRecordEventArgs {
    database_path: String,
    session_id: String,
    time_unix_ms: u64,
    source: String,
    level: String,
    topic: String,
    message: String,
    #[serde(default)]
    command_id: Option<String>,
    #[serde(default = "empty_json_object")]
    data: serde_json::Value,
}

#[derive(Debug, Clone, Deserialize)]
struct DebugSessionSnapshotArgs {
    database_path: String,
    session_id: String,
}

fn debug_start_session_bridge(args: DebugStartSessionArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let snapshot = start_debug_session(
        &store,
        &DebugSessionStartInput {
            session_id: args.session_id,
            started_at_unix_ms: args.started_at_unix_ms,
            bridge: args.bridge,
        },
    )?;
    serde_json::to_value(snapshot).map_err(|error| {
        GooseError::message(format!("cannot serialize debug session snapshot: {error}"))
    })
}

fn debug_start_command_bridge(args: DebugStartCommandArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let snapshot = start_debug_command(
        &store,
        &DebugCommandStartInput {
            session_id: args.session_id,
            received_at_unix_ms: args.received_at_unix_ms,
            command: args.command,
        },
    )?;
    serde_json::to_value(snapshot).map_err(|error| {
        GooseError::message(format!("cannot serialize debug session snapshot: {error}"))
    })
}

fn debug_finish_command_bridge(args: DebugFinishCommandArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let snapshot = finish_debug_command(
        &store,
        &DebugCommandFinishInput {
            session_id: args.session_id,
            time_unix_ms: args.time_unix_ms,
            command_id: args.command_id,
            ok: args.ok,
            message: args.message,
            data: args.data,
        },
    )?;
    serde_json::to_value(snapshot).map_err(|error| {
        GooseError::message(format!("cannot serialize debug session snapshot: {error}"))
    })
}

fn debug_record_event_bridge(args: DebugRecordEventArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let event = append_debug_event(
        &store,
        &DebugEventInput {
            session_id: args.session_id,
            time_unix_ms: args.time_unix_ms,
            source: args.source,
            level: args.level,
            topic: args.topic,
            message: args.message,
            command_id: args.command_id,
            data: args.data,
        },
    )?;
    serde_json::to_value(event)
        .map_err(|error| GooseError::message(format!("cannot serialize debug event: {error}")))
}

fn debug_session_snapshot_bridge(args: DebugSessionSnapshotArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let snapshot = debug_session_snapshot(&store, &args.session_id)?;
    serde_json::to_value(snapshot).map_err(|error| {
        GooseError::message(format!("cannot serialize debug session snapshot: {error}"))
    })
}

// ---------------------------------------------------------------------------
// device.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct DeviceCapabilitiesArgs {
    device_kind: DeviceKind,
}

fn device_capabilities_bridge(args: DeviceCapabilitiesArgs) -> GooseResult<serde_json::Value> {
    let caps = DeviceCapabilities::for_kind(args.device_kind);
    let mut value = serde_json::to_value(caps).map_err(|e| GooseError::message(e.to_string()))?;
    // Inject device_kind so Swift can decode it into DeviceCapabilities.deviceKind.
    let kind_value =
        serde_json::to_value(args.device_kind).map_err(|e| GooseError::message(e.to_string()))?;
    if let Some(obj) = value.as_object_mut() {
        obj.insert("device_kind".to_string(), kind_value);
    }
    Ok(value)
}

// ---------------------------------------------------------------------------
// store.*
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct EwmaBaselineFoldHistoryArgs {
    database_path: String,
}

#[derive(Debug, Deserialize)]
struct EwmaBaselineUpdateArgs {
    database_path: String,
    date_key: String,
    hrv_rmssd: f64,
    rhr_bpm: f64,
}

#[derive(Debug, Clone, Deserialize)]
struct GravityRowArg {
    ts: f64,
    x: f64,
    y: f64,
    z: f64,
}

#[derive(Debug, Deserialize)]
struct InsertGravityRowsArgs {
    database_path: String,
    device_id: String,
    rows: Vec<GravityRowArg>,
}

#[derive(Debug, Deserialize)]
struct GravityRowsBetweenArgs {
    database_path: String,
    device_id: String,
    ts_start: f64,
    ts_end: f64,
}

fn ewma_baseline_fold_history_bridge(
    args: EwmaBaselineFoldHistoryArgs,
) -> GooseResult<serde_json::Value> {
    use crate::baselines::EwmaBaseline;
    let store = acquire_bridge_conn(&args.database_path)?;
    let baseline = EwmaBaseline::fold_history(&store)?;
    Ok(json!({
        "hrv": ewma_state_to_json(&baseline.hrv, baseline.hrv.trust_level()),
        "resting_hr": ewma_state_to_json(&baseline.resting_hr, baseline.resting_hr.trust_level()),
    }))
}

fn ewma_state_to_json(
    state: &crate::baselines::EwmaState,
    trust: crate::baselines::EwmaTrustLevel,
) -> serde_json::Value {
    json!({
        "mean": state.mean,
        "variance": state.variance,
        "night_count": state.night_count,
        "trust": trust.as_str(),
        "is_ready": state.is_ready(),
    })
}

fn ewma_baseline_update_bridge(args: EwmaBaselineUpdateArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let wrote = store.ewma_baseline_update(&args.date_key, args.hrv_rmssd, args.rhr_bpm)?;
    Ok(json!({"skipped": !wrote}))
}

fn insert_gravity_rows_bridge(args: InsertGravityRowsArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let tuples: Vec<(f64, f64, f64, f64)> =
        args.rows.iter().map(|r| (r.ts, r.x, r.y, r.z)).collect();
    let inserted = store.insert_gravity_rows(&args.device_id, &tuples)?;
    Ok(json!({"inserted": inserted}))
}

fn gravity_rows_between_bridge(args: GravityRowsBetweenArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows: Vec<GravityRow> =
        store.gravity_rows_between(&args.device_id, args.ts_start, args.ts_end)?;
    let json_rows: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| json!({"ts": r.ts, "x": r.x, "y": r.y, "z": r.z}))
        .collect();
    Ok(json!({"rows": json_rows}))
}

fn insert_gravity2_batch_bridge(args: InsertGravityRowsArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let tuples: Vec<(f64, f64, f64, f64)> =
        args.rows.iter().map(|r| (r.ts, r.x, r.y, r.z)).collect();
    let inserted = store.insert_gravity2_batch(&args.device_id, &tuples)?;
    Ok(json!({"inserted": inserted}))
}

fn gravity2_samples_between_bridge(args: GravityRowsBetweenArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows: Vec<GravityRow> =
        store.gravity2_samples_between(&args.device_id, args.ts_start, args.ts_end)?;
    let json_rows: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| json!({"ts": r.ts, "x": r.x, "y": r.y, "z": r.z}))
        .collect();
    Ok(json!({"rows": json_rows}))
}

// ---------------------------------------------------------------------------
// store.* — HealthKit export queries
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct HkHrSamplesBetweenArgs {
    database_path: String,
    device_id: String,
    start_unix_s: f64,
    end_unix_s: f64,
}

fn hk_hr_samples_between_bridge(args: HkHrSamplesBetweenArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = store.hr_samples_between(&args.device_id, args.start_unix_s, args.end_unix_s)?;
    let json_rows: Vec<serde_json::Value> = rows
        .iter()
        .map(|(ts, bpm)| json!({"ts": ts, "bpm": bpm}))
        .collect();
    Ok(json!({"rows": json_rows}))
}

#[derive(Debug, Clone, Deserialize)]
struct HkSpo2SamplesBetweenArgs {
    database_path: String,
    device_id: String,
    start_unix_s: f64,
    end_unix_s: f64,
}

fn hk_spo2_samples_between_bridge(
    args: HkSpo2SamplesBetweenArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = store.spo2_samples_between(&args.device_id, args.start_unix_s, args.end_unix_s)?;
    let json_rows: Vec<serde_json::Value> = rows
        .iter()
        .map(|(ts, spo2_percent)| json!({"ts": ts, "spo2_percent": spo2_percent}))
        .collect();
    Ok(json!({"rows": json_rows}))
}

#[derive(Debug, Clone, Deserialize)]
struct HkSleepSessionsBetweenArgs {
    database_path: String,
    start_unix_ms: i64,
    end_unix_ms: i64,
}

fn hk_sleep_sessions_between_bridge(
    args: HkSleepSessionsBetweenArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let rows = store.external_sleep_sessions_between(args.start_unix_ms, args.end_unix_ms)?;
    let json_rows: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            json!({
                "sleep_id": r.sleep_id,
                "start_time_unix_ms": r.start_time_unix_ms,
                "end_time_unix_ms": r.end_time_unix_ms,
                "source": r.source,
            })
        })
        .collect();
    Ok(json!({"rows": json_rows}))
}

// ---------------------------------------------------------------------------
// settings.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct ApplyDefaultPreferencesArgs {
    database_path: String,
    #[serde(default = "default_algorithm_scope")]
    scope: String,
}

#[derive(Debug, Clone, Deserialize)]
struct SetPreferenceArgs {
    database_path: String,
    #[serde(default = "default_algorithm_scope")]
    scope: String,
    metric_family: String,
    algorithm_id: String,
    version: String,
    #[serde(default = "default_true")]
    register_built_ins: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct GetPreferenceArgs {
    database_path: String,
    #[serde(default = "default_algorithm_scope")]
    scope: String,
    metric_family: String,
}

#[derive(Debug, Clone, Deserialize)]
struct ListPreferencesArgs {
    database_path: String,
    #[serde(default)]
    scope: Option<String>,
}

fn apply_default_preferences_bridge(
    args: ApplyDefaultPreferencesArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    register_built_in_definitions(&store)?;
    let preferences = default_algorithm_preferences_for_scope(&args.scope);
    for preference in &preferences {
        store.set_algorithm_preference(preference)?;
    }
    serde_json::to_value(preferences)
        .map_err(|error| GooseError::message(format!("cannot serialize preferences: {error}")))
}

fn set_algorithm_preference_bridge(args: SetPreferenceArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    if args.register_built_ins {
        register_built_in_definitions(&store)?;
    }
    let preference = AlgorithmPreferenceRecord {
        scope: args.scope,
        metric_family: args.metric_family,
        algorithm_id: args.algorithm_id,
        version: args.version,
    };
    store.set_algorithm_preference(&preference)?;
    serde_json::to_value(preference)
        .map_err(|error| GooseError::message(format!("cannot serialize preference: {error}")))
}

fn get_algorithm_preference_bridge(args: GetPreferenceArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let preference = store.algorithm_preference(&args.scope, &args.metric_family)?;
    serde_json::to_value(preference)
        .map_err(|error| GooseError::message(format!("cannot serialize preference: {error}")))
}

fn list_algorithm_preferences_bridge(args: ListPreferencesArgs) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let preferences = store.algorithm_preferences(args.scope.as_deref())?;
    serde_json::to_value(preferences)
        .map_err(|error| GooseError::message(format!("cannot serialize preferences: {error}")))
}

// ---------------------------------------------------------------------------
// storage.*
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Deserialize)]
struct StorageCheckArgs {
    database_path: String,
    #[serde(default)]
    self_test: bool,
}

#[derive(Debug, Clone, Deserialize)]
struct StorageCompactRawEvidenceArgs {
    database_path: String,
    limit_bytes: i64,
}

fn storage_check_bridge(args: StorageCheckArgs) -> GooseResult<serde_json::Value> {
    if args.database_path.trim().is_empty() {
        return Err(GooseError::message("database_path is required"));
    }
    let report = check_storage_database(StorageCheckOptions {
        database_path: Path::new(&args.database_path),
        run_self_test: args.self_test,
    })?;
    serde_json::to_value(report)
        .map_err(|error| GooseError::message(format!("cannot serialize storage report: {error}")))
}

fn storage_compact_raw_evidence_bridge(
    args: StorageCompactRawEvidenceArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let report = store.compact_raw_evidence_payloads_to_limit(args.limit_bytes)?;
    serde_json::to_value(report).map_err(|error| {
        GooseError::message(format!("cannot serialize compaction report: {error}"))
    })
}

// ---------------------------------------------------------------------------
// upload.*
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct UploadGetRecentDecodedStreamsArgs {
    database_path: String,
    #[allow(dead_code)]
    device_id: String,
    since_ts: f64,
}

#[derive(Debug, Deserialize)]
struct UploadGetRawFramesArgs {
    database_path: String,
    since_ts: f64,
    #[serde(default = "default_raw_frames_limit")]
    limit: usize,
}

fn default_raw_frames_limit() -> usize {
    2000
}

fn upload_get_recent_decoded_streams_bridge(
    args: UploadGetRecentDecodedStreamsArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;

    // Convert unix timestamp to ISO-8601 for decoded_frames_between query
    let since_dt = chrono_from_unix(args.since_ts);
    let now_dt = chrono_now();

    let frames = store.decoded_frames_between(&since_dt, &now_dt)?;

    let mut hr: Vec<serde_json::Value> = Vec::new();
    let mut rr: Vec<serde_json::Value> = Vec::new();
    let mut events: Vec<serde_json::Value> = Vec::new();
    let battery: Vec<serde_json::Value> = Vec::new();
    let mut spo2: Vec<serde_json::Value> = Vec::new();
    let mut skin_temp: Vec<serde_json::Value> = Vec::new();
    let mut resp: Vec<serde_json::Value> = Vec::new();
    let mut gravity: Vec<serde_json::Value> = Vec::new();
    let mut gravity2: Vec<serde_json::Value> = Vec::new();
    let mut step: Vec<(f64, i64)> = Vec::new();

    for frame in &frames {
        // Skip CRC-failed frames (matches server-side rule)
        if !frame.header_crc_valid || !frame.payload_crc_valid {
            continue;
        }

        // CR-02: per-row device_id filtering is deferred to v3.0 multi-device tracking.
        // The device_id field (iOS CoreBluetooth peripheral UUID) and device_model
        // (sanitized BLE device name) live in different namespaces — a comparison
        // between them always mismatches. For the current single-device case, all
        // captured frames belong to the active device, so the time-window filter
        // (since_ts) is the correct and sufficient filter.

        let parsed: Option<ParsedPayload> =
            serde_json::from_str(&frame.parsed_payload_json).unwrap_or(None);

        match parsed {
            Some(ParsedPayload::DataPacket {
                packet_k,
                timestamp_seconds,
                body_summary,
                ..
            }) => {
                // REALTIME_DATA (packet_k == Some(40 | 0x28)) — canonical HR stream
                // HISTORICAL_DATA (packet_k == Some(47 | 0x2F)) — V24 biometric history
                let ts_unix: Option<f64> = timestamp_seconds.map(|s| s as f64);

                // Extract heart rate and RR intervals from the body_summary
                if let Some(ref summary) = body_summary {
                    match summary {
                        DataPacketBodySummary::NormalHistory {
                            hr_present,
                            marker_value,
                            ..
                        } => {
                            // Normal history packet: hr_present flag + marker_value = HR bpm
                            if hr_present.unwrap_or(false)
                                && let (Some(ts), Some(bpm)) = (ts_unix, marker_value)
                            {
                                hr.push(json!({"ts": ts, "bpm": *bpm}));
                            }
                        }
                        DataPacketBodySummary::RawMotionK10 {
                            heart_rate, axes, ..
                        } => {
                            // K10 raw motion carries an HR byte and three accel axes
                            if let (Some(ts), Some(bpm)) = (ts_unix, heart_rate) {
                                hr.push(json!({"ts": ts, "bpm": *bpm}));
                            }
                            // Extract accelerometer_x/y/z full_samples and convert
                            // LSB → g via IMU_LSB_PER_G. Match axes by name (not offset)
                            // to stay robust across any future reordering.
                            let ax = axes
                                .iter()
                                .find(|a| a.name == "accelerometer_x")
                                .and_then(|a| a.full_samples.as_ref());
                            let ay = axes
                                .iter()
                                .find(|a| a.name == "accelerometer_y")
                                .and_then(|a| a.full_samples.as_ref());
                            let az = axes
                                .iter()
                                .find(|a| a.name == "accelerometer_z")
                                .and_then(|a| a.full_samples.as_ref());
                            // CR-02 fix: assign per-sample timestamp so the gravity time
                            // series is recoverable. WHOOP 5 IMU samples at 50 Hz.
                            const K10_SAMPLE_RATE_HZ: f64 = 50.0;
                            if let (Some(xs), Some(ys), Some(zs), Some(ts_base)) =
                                (ax, ay, az, ts_unix)
                            {
                                let n = xs.len().min(ys.len()).min(zs.len());
                                for i in 0..n {
                                    let sample_ts = ts_base + i as f64 / K10_SAMPLE_RATE_HZ;
                                    gravity.push(json!({
                                        "ts": sample_ts,
                                        "x": xs[i] as f64 / IMU_LSB_PER_G,
                                        "y": ys[i] as f64 / IMU_LSB_PER_G,
                                        "z": zs[i] as f64 / IMU_LSB_PER_G,
                                    }));
                                }
                            }
                        }
                        DataPacketBodySummary::R17OpticalOrLabradorFiltered { .. } => {
                            // Optical/Labrador filtered — SpO2 raw ADC data
                            // Raw interpretation requires calibration; skip for now
                        }
                        DataPacketBodySummary::RawMotionK21 { .. } => {
                            // K21 gravity extraction is deferred: axis-to-physical mapping
                            // unconfirmed (variable group_1_count/group_2_count, non-standard
                            // axis naming). Only K10 accel axes (accelerometer_x/y/z) are
                            // converted in this phase (IMU-03). K21 will be handled once
                            // empirical K21 payload data is available to confirm the mapping.
                        }
                        DataPacketBodySummary::V24History {
                            hr: v24_hr,
                            rr_intervals_ms,
                            skin_contact,
                            spo2_red,
                            spo2_ir,
                            skin_temp_raw,
                            resp_raw,
                            gravity_x,
                            gravity_y,
                            gravity_z,
                            gravity2_x,
                            gravity2_y,
                            gravity2_z,
                            ..
                        } => {
                            // V24 biometric fields: wire into the same upload streams as
                            // NormalHistory (hr, rr) plus the V24-only streams (spo2,
                            // skin_temp, resp). sig_quality is stored via
                            // insert_v24_biometric_batch and is NOT included in the upload
                            // payload (POST /v1/ingest-decoded schema does not include it).
                            let contact = skin_contact.unwrap_or(0) == 1;

                            // HR — only when skin contact is established
                            if contact && let (Some(ts), Some(bpm)) = (ts_unix, *v24_hr) {
                                hr.push(json!({"ts": ts, "bpm": bpm}));
                            }

                            // RR intervals — accumulate with per-interval timestamps
                            if let Some(ts_base) = ts_unix {
                                let mut t = ts_base;
                                for &ms in rr_intervals_ms.iter() {
                                    rr.push(json!({"ts": t, "interval_ms": ms}));
                                    t += ms as f64 / 1000.0;
                                }
                            }

                            // SpO2 raw red/IR — only when in contact
                            if contact {
                                if let (Some(ts), Some(r), Some(i)) = (ts_unix, *spo2_red, *spo2_ir)
                                {
                                    spo2.push(json!({"ts": ts, "red": r, "ir": i, "contact": 1}));
                                }

                                // Skin temperature raw ADC
                                if let (Some(ts), Some(raw)) = (ts_unix, *skin_temp_raw) {
                                    skin_temp.push(json!({"ts": ts, "raw": raw, "contact": 1}));
                                }

                                // Respiratory raw ADC
                                if let (Some(ts), Some(raw)) = (ts_unix, *resp_raw) {
                                    resp.push(json!({"ts": ts, "raw": raw, "contact": 1}));
                                }
                            }

                            // Primary gravity triplet (bytes 33–44 in V24 body, f32 LE, already in g units).
                            // Single sample per V24 frame — no loop needed unlike K10 (50 Hz array).
                            // No IMU_LSB_PER_G conversion: protocol.rs already parses as f32 in g units.
                            if let (Some(ts), Some(x), Some(y), Some(z)) =
                                (ts_unix, *gravity_x, *gravity_y, *gravity_z)
                            {
                                gravity.push(json!({
                                    "ts": ts,
                                    "x": x as f64,
                                    "y": y as f64,
                                    "z": z as f64,
                                }));
                            }

                            // Secondary gravity triplet (bytes 49–60 in V24 body). Present only when
                            // frame body length >= 60 (parsed as Option<f32> in protocol.rs).
                            if let (Some(ts), Some(x2), Some(y2), Some(z2)) =
                                (ts_unix, *gravity2_x, *gravity2_y, *gravity2_z)
                            {
                                gravity2.push(json!({
                                    "ts": ts,
                                    "x": x2 as f64,
                                    "y": y2 as f64,
                                    "z": z2 as f64,
                                }));
                            }
                        }
                        DataPacketBodySummary::R22Whoop5Hr { hr_bpm, .. } => {
                            // R22 WHOOP 5.0 realtime packet: push HR into the same stream
                            // as NormalHistory/V24 so the upload pipeline receives it.
                            if let (Some(ts), Some(bpm)) = (ts_unix, *hr_bpm)
                                && bpm > 0.0
                            {
                                hr.push(json!({"ts": ts, "bpm": bpm.round() as u16}));
                            }
                        }
                        DataPacketBodySummary::V18History {
                            hr: v18_hr,
                            rr_intervals_ms,
                            gravity_x,
                            gravity_y,
                            gravity_z,
                            skin_temp_raw,
                            step_motion_counter,
                            ..
                        } => {
                            // V18 WHOOP 5.0 historical packet: push all biometric fields.
                            // No skin_contact byte in v18 — HR/RR/gravity not gated on contact.

                            // HR
                            if let (Some(ts), Some(bpm)) = (ts_unix, *v18_hr) {
                                hr.push(json!({"ts": ts, "bpm": bpm}));
                            }

                            // RR intervals — accumulate with per-interval timestamps
                            if let Some(ts_base) = ts_unix {
                                let mut t = ts_base;
                                for &ms in rr_intervals_ms.iter() {
                                    rr.push(json!({"ts": t, "interval_ms": ms}));
                                    t += ms as f64 / 1000.0;
                                }
                            }

                            // Gravity triplet (f32 LE, already in g units — no IMU_LSB_PER_G conversion)
                            if let (Some(ts), Some(x), Some(y), Some(z)) =
                                (ts_unix, *gravity_x, *gravity_y, *gravity_z)
                            {
                                gravity.push(json!({
                                    "ts": ts,
                                    "x": x as f64,
                                    "y": y as f64,
                                    "z": z as f64,
                                }));
                            }

                            // Skin temperature — raw u16 persisted only when degC is within physiological gate.
                            if let (Some(ts), Some(raw)) = (ts_unix, *skin_temp_raw) {
                                let deg_c = raw as f32 / 128.0;
                                if (5.0..=45.0).contains(&deg_c) {
                                    skin_temp.push(json!({"ts": ts, "raw": raw, "contact": 1}));
                                }
                            }

                            // Step motion counter — accumulate (ts, count) for batch persist below.
                            if let (Some(ts), Some(count)) = (ts_unix, *step_motion_counter) {
                                step.push((ts, count as i64));
                            }
                        }
                        DataPacketBodySummary::V26PpgWaveform { .. } => {
                            // PPG waveform burst — optical persistence handled in Phase 113; skip here.
                        }
                        DataPacketBodySummary::V20V21OpticalMultiChannel { .. } => {
                            // v20 optical multi-channel — persistence deferred to Phase 113; skip here.
                        }
                        DataPacketBodySummary::Unknown { .. } => {
                            // Unknown packet_k — no upload stream; skip gracefully.
                        }
                    }
                }

                let _ = packet_k; // used for routing above
            }
            Some(ParsedPayload::Event {
                event_id,
                event_name,
                timestamp_seconds,
                data_hex,
                ..
            }) => {
                // EVENT packets: wall-clock unix seconds (real RTC, not device epoch)
                let ts_unix: Option<f64> = timestamp_seconds.map(|s| s as f64);
                let kind = event_name
                    .clone()
                    .or_else(|| event_id.map(|id| format!("event_{id}")));

                events.push(json!({
                    "ts": ts_unix,
                    "kind": kind,
                    "payload": {"data_hex": data_hex},
                }));
            }
            _ => {
                // Command, CommandResponse, Raw, None — no biometric streams to extract
            }
        }

        // HR monitor branch: 0x2A37 standard GATT notifications stored with device_type == "HR_MONITOR".
        // parsed_payload_json is "null" for these rows (parse_frame was bypassed in capture_import.rs),
        // so the match above falls through to `_ => {}`. Gate on device_type string.
        // D-01: bpm + rr_intervals embedded in hr entry. D-02: NOT pushed to top-level rr.
        // D-03: captured_at parsed to f64 unix seconds via unix_from_iso8601 helper.
        // T-08.1-01: hex::decode or parse_hr_measurement failures skip the frame silently.
        if frame.device_type == "HR_MONITOR" {
            let bytes = match hex::decode(&frame.payload_hex) {
                Ok(b) => b,
                Err(_) => continue,
            };
            let measurement = match crate::heart_rate_gatt_protocol::parse_hr_measurement(&bytes) {
                Ok(m) => m,
                Err(_) => continue,
            };
            // D-03: captured_at is "YYYY-MM-DDTHH:MM:SS.mmmZ" — parse to f64 unix seconds.
            // T-08.1-02: on parse failure use null rather than panicking.
            let ts_opt: Option<f64> = unix_from_iso8601(&frame.captured_at);
            hr.push(json!({
                "ts": ts_opt,
                "bpm": measurement.hr_bpm,
                "rr_intervals": measurement.rr_intervals_ms,
            }));
        }
    }

    // Persist gravity rows extracted from V24History / K10 frames into the gravity table.
    // On empty vec, store returns Ok(0) immediately — no-op.
    if !gravity.is_empty() {
        let gravity_tuples: Vec<(f64, f64, f64, f64)> = gravity
            .iter()
            .filter_map(|v| {
                let ts = v["ts"].as_f64()?;
                let x = v["x"].as_f64()?;
                let y = v["y"].as_f64()?;
                let z = v["z"].as_f64()?;
                Some((ts, x, y, z))
            })
            .collect();
        let _ = store.insert_gravity_rows(&args.device_id, &gravity_tuples);
    }

    // Persist secondary gravity (gravity2) rows when present.
    if !gravity2.is_empty() {
        let gravity2_tuples: Vec<(f64, f64, f64, f64)> = gravity2
            .iter()
            .filter_map(|v| {
                let ts = v["ts"].as_f64()?;
                let x = v["x"].as_f64()?;
                let y = v["y"].as_f64()?;
                let z = v["z"].as_f64()?;
                Some((ts, x, y, z))
            })
            .collect();
        let _ = store.insert_gravity2_batch(&args.device_id, &gravity2_tuples);
    }

    // Persist step counter rows extracted from V18History frames.
    for (ts, count) in &step {
        let sample_time_unix_ms = (*ts * 1_000.0) as i64;
        let sample_id = format!("v18_step:{}:{}", args.device_id, sample_time_unix_ms);
        let provenance = serde_json::json!({
            "source": "v18_historical_frame",
            "device_id": args.device_id,
        })
        .to_string();
        let _ = store.insert_step_counter_sample(StepCounterSampleInput {
            sample_id: &sample_id,
            sample_time_unix_ms,
            counter_value: *count,
            cadence_spm: None,
            activity_state: None,
            source_kind: "device_counter",
            packet_family: "v18_history",
            json_path: "body_summary.step_motion_counter",
            frame_id: None,
            evidence_id: None,
            capture_session_id: None,
            quality_flags_json: "[]",
            provenance_json: &provenance,
        });
    }

    let result = json!({
        "hr": hr,
        "rr": rr,
        "events": events,
        "battery": battery,
        "spo2": spo2,
        "skin_temp": skin_temp,
        "resp": resp,
        "gravity": gravity,
        "gravity2": gravity2,
        "frame_count": frames.len(),
    });

    serde_json::to_value(result)
        .map_err(|error| GooseError::message(format!("upload streams serialize failed: {error}")))
}

fn upload_get_raw_frames_for_upload_bridge(
    args: UploadGetRawFramesArgs,
) -> GooseResult<serde_json::Value> {
    let store = acquire_bridge_conn(&args.database_path)?;
    let since_dt = chrono_from_unix(args.since_ts);
    let now_dt = chrono_now();
    let all_rows = store.raw_evidence_between(&since_dt, &now_dt)?;
    let rows: Vec<&crate::store::RawEvidenceRow> = all_rows.iter().take(args.limit).collect();
    let frames: Vec<serde_json::Value> = rows
        .iter()
        .map(|r| {
            let captured_at_unix: f64 = iso8601_to_unix(&r.captured_at);
            json!({
                "captured_at_unix": captured_at_unix,
                "frame_hex": r.payload_hex,
                "source": r.source,
                "device_type": "GOOSE",
                "device_model": r.device_model,
                "sensitivity": r.sensitivity,
                "device_uuid": r.device_uuid,
            })
        })
        .collect();
    let count = frames.len();
    Ok(json!({
        "frames": frames,
        "count": count,
    }))
}

// ---------------------------------------------------------------------------
// dispatch_debug — public entry point
// ---------------------------------------------------------------------------

pub(crate) fn dispatch_debug(request: &BridgeRequest) -> BridgeResponse {
    match request.method.as_str() {
        // export.*
        "export.raw_timeframe" => request_args::<RawExportArgs>(request)
            .and_then(raw_export_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "export.validate_bundle" => request_args::<ExportValidateBundleArgs>(request)
            .and_then(export_validate_bundle_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // validation.* / local_health.*
        "validation.local_health_manifest_scaffold"
        | "local_health.validation_manifest_scaffold" => {
            request_args::<LocalHealthValidationManifestScaffoldArgs>(request)
                .and_then(local_health_validation_manifest_scaffold_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "validation.local_health_manifest_runbook" | "local_health.validation_manifest_runbook" => {
            request_args::<LocalHealthValidationManifestRunbookArgs>(request)
                .and_then(local_health_validation_manifest_runbook_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "validation.local_health_manifest_review" | "local_health.validation_manifest_review" => {
            request_args::<LocalHealthValidationManifestReviewArgs>(request)
                .and_then(local_health_validation_manifest_review_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }

        // privacy.*
        "privacy.lint" => request_args::<PrivacyLintArgs>(request)
            .and_then(privacy_lint_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // ui_coverage.*
        "ui_coverage.audit" => request_args::<UiCoverageAuditArgs>(request)
            .and_then(ui_coverage_audit_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // workout.*
        "workout.upsert" => request_args::<WorkoutUpsertArgs>(request)
            .and_then(workout_upsert_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // commands.*
        "commands.evidence_template" => serde_json::to_value(command_evidence_template())
            .map_err(|error| GooseError::message(error.to_string()))
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "commands.definitions" => serde_json::to_value(COMMAND_DEFINITIONS)
            .map_err(|error| GooseError::message(error.to_string()))
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "commands.validate_evidence" => request_args::<CommandValidateEvidenceArgs>(request)
            .and_then(command_validate_evidence_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "commands.evidence_from_emulator_log" => {
            request_args::<CommandEvidenceFromEmulatorLogArgs>(request)
                .and_then(command_evidence_from_emulator_log_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "commands.promote_local_frame_matches" => {
            request_args::<CommandPromoteLocalFrameMatchesArgs>(request)
                .and_then(command_promote_local_frame_matches_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "commands.direct_send_gate" => request_args::<CommandDirectSendGateArgs>(request)
            .and_then(command_direct_send_gate_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "commands.direct_send_preflight" => request_args::<CommandDirectSendPreflightArgs>(request)
            .and_then(command_direct_send_preflight_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "commands.capture_plan" => request_args::<CommandCapturePlanArgs>(request)
            .and_then(command_capture_plan_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "commands.list_validation_records" => {
            request_args::<ListCommandValidationRecordsArgs>(request)
                .and_then(command_list_validation_records_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "commands.import_validation_records" => {
            request_args::<ImportCommandValidationRecordsArgs>(request)
                .and_then(command_import_validation_records_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }

        // debug.*
        "debug.start_session" => request_args::<DebugStartSessionArgs>(request)
            .and_then(debug_start_session_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "debug.start_command" => request_args::<DebugStartCommandArgs>(request)
            .and_then(debug_start_command_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "debug.finish_command" => request_args::<DebugFinishCommandArgs>(request)
            .and_then(debug_finish_command_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "debug.record_event" => request_args::<DebugRecordEventArgs>(request)
            .and_then(debug_record_event_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "debug.session_snapshot" => request_args::<DebugSessionSnapshotArgs>(request)
            .and_then(debug_session_snapshot_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // device.*
        "device.capabilities" => request_args::<DeviceCapabilitiesArgs>(request)
            .and_then(device_capabilities_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // store.*
        "store.ewma_baseline_fold_history" => request_args::<EwmaBaselineFoldHistoryArgs>(request)
            .and_then(ewma_baseline_fold_history_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.ewma_baseline_update" => request_args::<EwmaBaselineUpdateArgs>(request)
            .and_then(ewma_baseline_update_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.gravity_rows_between" => request_args::<GravityRowsBetweenArgs>(request)
            .and_then(gravity_rows_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.gravity2_samples_between" => request_args::<GravityRowsBetweenArgs>(request)
            .and_then(gravity2_samples_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.insert_gravity_rows" => request_args::<InsertGravityRowsArgs>(request)
            .and_then(insert_gravity_rows_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.insert_gravity2_batch" => request_args::<InsertGravityRowsArgs>(request)
            .and_then(insert_gravity2_batch_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.hk_hr_samples_between" => request_args::<HkHrSamplesBetweenArgs>(request)
            .and_then(hk_hr_samples_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.hk_sleep_sessions_between" => request_args::<HkSleepSessionsBetweenArgs>(request)
            .and_then(hk_sleep_sessions_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "store.hk_spo2_samples_between" => request_args::<HkSpo2SamplesBetweenArgs>(request)
            .and_then(hk_spo2_samples_between_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // settings.*
        "settings.apply_default_algorithm_preferences" => {
            request_args::<ApplyDefaultPreferencesArgs>(request)
                .and_then(apply_default_preferences_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "settings.set_algorithm_preference" => request_args::<SetPreferenceArgs>(request)
            .and_then(set_algorithm_preference_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "settings.get_algorithm_preference" => request_args::<GetPreferenceArgs>(request)
            .and_then(get_algorithm_preference_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "settings.list_algorithm_preferences" => request_args::<ListPreferencesArgs>(request)
            .and_then(list_algorithm_preferences_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // storage.*
        "storage.check" => request_args::<StorageCheckArgs>(request)
            .and_then(storage_check_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),
        "storage.compact_raw_evidence" => request_args::<StorageCompactRawEvidenceArgs>(request)
            .and_then(storage_compact_raw_evidence_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        // upload.*
        "upload.get_recent_decoded_streams" => {
            request_args::<UploadGetRecentDecodedStreamsArgs>(request)
                .and_then(upload_get_recent_decoded_streams_bridge)
                .map(|value| bridge_ok(&request.request_id, value))
                .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error))
        }
        "upload.get_raw_frames_for_upload" => request_args::<UploadGetRawFramesArgs>(request)
            .and_then(upload_get_raw_frames_for_upload_bridge)
            .map(|value| bridge_ok(&request.request_id, value))
            .unwrap_or_else(|error| bridge_error(&request.request_id, "method_error", error)),

        _ => bridge_error(
            &request.request_id,
            "not_implemented",
            format!("debug domain: unsupported method: {}", request.method),
        ),
    }
}
