use std::collections::BTreeSet;

use rusqlite::{OptionalExtension, params, params_from_iter};

use crate::{GooseError, GooseResult};

use super::{
    ALLOWED_ACTIVITY_DETECTION_METHODS, ALLOWED_ACTIVITY_INTERVAL_TYPES,
    ALLOWED_ACTIVITY_LABEL_TYPES, ALLOWED_ACTIVITY_METRIC_UNITS, ALLOWED_ACTIVITY_SYNC_STATUSES,
    ALLOWED_ACTIVITY_TYPES, ActivityIntervalInput, ActivityIntervalRow, ActivityLabelInput,
    ActivityLabelRow, ActivityMetricInput, ActivityMetricRow, ActivitySessionInput,
    ActivitySessionRow, DebugCommandRow, DebugEventRow, DebugSessionRow, ExerciseSessionRow,
    GooseStore, bool_to_i64, validate_allowed, validate_confidence, validate_json,
    validate_json_object, validate_non_negative, validate_optional_required, validate_required,
    validate_window_order,
};

// --- Local validation helpers ---

fn validate_activity_type(activity_type: &str) -> GooseResult<()> {
    validate_allowed("activity_type", activity_type, &ALLOWED_ACTIVITY_TYPES)
}

fn validate_sync_status(sync_status: &str) -> GooseResult<()> {
    validate_allowed("sync_status", sync_status, &ALLOWED_ACTIVITY_SYNC_STATUSES)
}

fn validate_activity_detection_method(detection_method: &str) -> GooseResult<()> {
    validate_allowed(
        "detection_method",
        detection_method,
        &ALLOWED_ACTIVITY_DETECTION_METHODS,
    )
}

fn validate_activity_interval_type(interval_type: &str) -> GooseResult<()> {
    validate_allowed(
        "interval_type",
        interval_type,
        &ALLOWED_ACTIVITY_INTERVAL_TYPES,
    )
}

fn validate_activity_label_type(label_type: &str) -> GooseResult<()> {
    validate_allowed("label_type", label_type, &ALLOWED_ACTIVITY_LABEL_TYPES)
}

fn validate_activity_metric_unit(unit: &str) -> GooseResult<()> {
    validate_allowed("unit", unit, &ALLOWED_ACTIVITY_METRIC_UNITS)
}

fn validate_positive(name: &str, value: i64) -> GooseResult<()> {
    if value <= 0 {
        Err(GooseError::message(format!("{name} must be positive")))
    } else {
        Ok(())
    }
}

// --- Input validators ---

fn validate_activity_session_input(input: &ActivitySessionInput<'_>) -> GooseResult<()> {
    validate_required("session_id", input.session_id)?;
    validate_required("source", input.source)?;
    validate_non_negative("start_time_unix_ms", input.start_time_unix_ms)?;
    validate_non_negative("end_time_unix_ms", input.end_time_unix_ms)?;
    validate_window_order(input.start_time_unix_ms, input.end_time_unix_ms)?;
    validate_required("activity_type", input.activity_type)?;
    validate_activity_type(input.activity_type)?;
    validate_optional_required(
        "external_activity_type_code",
        input.external_activity_type_code,
    )?;
    validate_optional_required(
        "external_activity_type_name",
        input.external_activity_type_name,
    )?;
    validate_optional_required("custom_label", input.custom_label)?;
    validate_confidence("confidence", input.confidence)?;
    validate_required("detection_method", input.detection_method)?;
    validate_activity_detection_method(input.detection_method)?;
    validate_required("sync_status", input.sync_status)?;
    validate_sync_status(input.sync_status)?;
    validate_json_object("provenance_json", input.provenance_json)?;
    Ok(())
}

fn validate_activity_metric_input(input: &ActivityMetricInput<'_>) -> GooseResult<()> {
    validate_required("metric_id", input.metric_id)?;
    validate_required("activity_session_id", input.activity_session_id)?;
    validate_required("metric_name", input.metric_name)?;
    if !input.value.is_finite() {
        return Err(GooseError::message("value must be finite"));
    }
    validate_required("unit", input.unit)?;
    validate_activity_metric_unit(input.unit)?;
    validate_non_negative("start_time_unix_ms", input.start_time_unix_ms)?;
    validate_non_negative("end_time_unix_ms", input.end_time_unix_ms)?;
    validate_window_order(input.start_time_unix_ms, input.end_time_unix_ms)?;
    validate_json("quality_flags_json", input.quality_flags_json)?;
    validate_json_object("provenance_json", input.provenance_json)?;
    Ok(())
}

fn validate_activity_interval_input(input: &ActivityIntervalInput<'_>) -> GooseResult<()> {
    validate_required("interval_id", input.interval_id)?;
    validate_required("activity_session_id", input.activity_session_id)?;
    validate_required("interval_type", input.interval_type)?;
    validate_activity_interval_type(input.interval_type)?;
    validate_non_negative("start_time_unix_ms", input.start_time_unix_ms)?;
    validate_non_negative("end_time_unix_ms", input.end_time_unix_ms)?;
    validate_window_order(input.start_time_unix_ms, input.end_time_unix_ms)?;
    validate_non_negative("sequence", input.sequence)?;
    validate_json_object("metadata_json", input.metadata_json)?;
    validate_json_object("provenance_json", input.provenance_json)?;
    Ok(())
}

fn validate_activity_label_input(input: &ActivityLabelInput<'_>) -> GooseResult<()> {
    validate_required("label_id", input.label_id)?;
    validate_required("activity_session_id", input.activity_session_id)?;
    validate_required("label_type", input.label_type)?;
    validate_activity_label_type(input.label_type)?;
    validate_required("value", input.value)?;
    validate_required("source", input.source)?;
    if let Some(confidence) = input.confidence {
        validate_confidence("confidence", confidence)?;
    }
    validate_json_object("provenance_json", input.provenance_json)?;
    Ok(())
}

// --- Row mappers ---

fn activity_session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivitySessionRow> {
    Ok(ActivitySessionRow {
        session_id: row.get(0)?,
        source: row.get(1)?,
        start_time_unix_ms: row.get(2)?,
        end_time_unix_ms: row.get(3)?,
        duration_ms: row.get(4)?,
        activity_type: row.get(5)?,
        external_activity_type_code: row.get(6)?,
        external_activity_type_name: row.get(7)?,
        custom_label: row.get(8)?,
        confidence: row.get(9)?,
        detection_method: row.get(10)?,
        sync_status: row.get(11)?,
        provenance_json: row.get(12)?,
        created_at: row.get(13)?,
        updated_at: row.get(14)?,
    })
}

fn activity_metric_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityMetricRow> {
    Ok(ActivityMetricRow {
        metric_id: row.get(0)?,
        activity_session_id: row.get(1)?,
        metric_name: row.get(2)?,
        value: row.get(3)?,
        unit: row.get(4)?,
        start_time_unix_ms: row.get(5)?,
        end_time_unix_ms: row.get(6)?,
        quality_flags_json: row.get(7)?,
        provenance_json: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn activity_interval_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityIntervalRow> {
    Ok(ActivityIntervalRow {
        interval_id: row.get(0)?,
        activity_session_id: row.get(1)?,
        interval_type: row.get(2)?,
        start_time_unix_ms: row.get(3)?,
        end_time_unix_ms: row.get(4)?,
        duration_ms: row.get(5)?,
        sequence: row.get(6)?,
        metadata_json: row.get(7)?,
        provenance_json: row.get(8)?,
        created_at: row.get(9)?,
    })
}

fn activity_label_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<ActivityLabelRow> {
    Ok(ActivityLabelRow {
        label_id: row.get(0)?,
        activity_session_id: row.get(1)?,
        label_type: row.get(2)?,
        value: row.get(3)?,
        source: row.get(4)?,
        confidence: row.get(5)?,
        provenance_json: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn debug_session_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DebugSessionRow> {
    Ok(DebugSessionRow {
        session_id: row.get(0)?,
        started_at_unix_ms: row.get(1)?,
        bridge_url: row.get(2)?,
        bind_host: row.get(3)?,
        token_required: i64_to_bool(row.get(4)?),
        token_present: i64_to_bool(row.get(5)?),
        remote_bind_enabled: i64_to_bool(row.get(6)?),
        visible_remote_bind_toggle: i64_to_bool(row.get(7)?),
    })
}

fn debug_command_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DebugCommandRow> {
    Ok(DebugCommandRow {
        command_id: row.get(0)?,
        session_id: row.get(1)?,
        schema: row.get(2)?,
        command: row.get(3)?,
        args_json: row.get(4)?,
        dry_run: i64_to_bool(row.get(5)?),
        received_at_unix_ms: row.get(6)?,
    })
}

fn debug_event_from_row(row: &rusqlite::Row<'_>) -> rusqlite::Result<DebugEventRow> {
    Ok(DebugEventRow {
        session_id: row.get(0)?,
        sequence: row.get(1)?,
        schema: row.get(2)?,
        time_unix_ms: row.get(3)?,
        source: row.get(4)?,
        level: row.get(5)?,
        topic: row.get(6)?,
        message: row.get(7)?,
        command_id: row.get(8)?,
        data_json: row.get(9)?,
    })
}

fn i64_to_bool(value: i64) -> bool {
    value != 0
}

// --- impl GooseStore: activity domain ---

impl GooseStore {
    // ---- Activity sessions ----

    pub fn insert_activity_session(&self, input: ActivitySessionInput<'_>) -> GooseResult<bool> {
        validate_activity_session_input(&input)?;

        if let Some(existing) = self.activity_session(input.session_id)? {
            let same = existing.session_id == input.session_id
                && existing.source == input.source
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.activity_type == input.activity_type
                && existing.external_activity_type_code
                    == input.external_activity_type_code.map(str::to_string)
                && existing.external_activity_type_name
                    == input.external_activity_type_name.map(str::to_string)
                && existing.custom_label == input.custom_label.map(str::to_string)
                && existing.confidence == input.confidence
                && existing.detection_method == input.detection_method
                && existing.sync_status == input.sync_status
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "activity session {} already exists with different metadata",
                input.session_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO activity_sessions (
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
            "#,
            params![
                input.session_id,
                input.source,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.end_time_unix_ms - input.start_time_unix_ms,
                input.activity_type,
                input.external_activity_type_code,
                input.external_activity_type_name,
                input.custom_label,
                input.confidence,
                input.detection_method,
                input.sync_status,
                input.provenance_json,
            ],
        )?;
        Ok(true)
    }

    pub fn update_activity_session(&self, input: ActivitySessionInput<'_>) -> GooseResult<bool> {
        validate_activity_session_input(&input)?;
        let Some(existing) = self.activity_session(input.session_id)? else {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                input.session_id
            )));
        };

        let same = existing.session_id == input.session_id
            && existing.source == input.source
            && existing.start_time_unix_ms == input.start_time_unix_ms
            && existing.end_time_unix_ms == input.end_time_unix_ms
            && existing.activity_type == input.activity_type
            && existing.external_activity_type_code
                == input.external_activity_type_code.map(str::to_string)
            && existing.external_activity_type_name
                == input.external_activity_type_name.map(str::to_string)
            && existing.custom_label == input.custom_label.map(str::to_string)
            && existing.confidence == input.confidence
            && existing.detection_method == input.detection_method
            && existing.sync_status == input.sync_status
            && existing.provenance_json == input.provenance_json;
        if same {
            return Ok(false);
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let changed = conn.execute(
            r#"
            UPDATE activity_sessions
            SET source = ?2,
                start_time_unix_ms = ?3,
                end_time_unix_ms = ?4,
                duration_ms = ?5,
                activity_type = ?6,
                external_activity_type_code = ?7,
                external_activity_type_name = ?8,
                custom_label = ?9,
                confidence = ?10,
                detection_method = ?11,
                sync_status = ?12,
                provenance_json = ?13,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE session_id = ?1
            "#,
            params![
                input.session_id,
                input.source,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.end_time_unix_ms - input.start_time_unix_ms,
                input.activity_type,
                input.external_activity_type_code,
                input.external_activity_type_name,
                input.custom_label,
                input.confidence,
                input.detection_method,
                input.sync_status,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn delete_activity_session(&self, session_id: &str) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("session_id", session_id)?;
        let changed = conn.execute(
            "DELETE FROM activity_sessions WHERE session_id = ?1",
            params![session_id],
        )?;
        Ok(changed > 0)
    }

    pub fn activity_session(&self, session_id: &str) -> GooseResult<Option<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("session_id", session_id)?;
        conn.query_row(
            r#"
                SELECT
                    session_id,
                    source,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    duration_ms,
                    activity_type,
                    external_activity_type_code,
                    external_activity_type_name,
                    custom_label,
                    confidence,
                    detection_method,
                    sync_status,
                    provenance_json,
                    created_at,
                    updated_at
                FROM activity_sessions
                WHERE session_id = ?1
                "#,
            params![session_id],
            activity_session_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn activity_sessions_between(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_non_negative("start_time_unix_ms", start_time_unix_ms)?;
        validate_non_negative("end_time_unix_ms", end_time_unix_ms)?;
        validate_window_order(start_time_unix_ms, end_time_unix_ms)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json,
                created_at,
                updated_at
            FROM activity_sessions
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, session_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            activity_session_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_sessions_by_type(
        &self,
        activity_type: &str,
    ) -> GooseResult<Vec<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("activity_type", activity_type)?;
        validate_activity_type(activity_type)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json,
                created_at,
                updated_at
            FROM activity_sessions
            WHERE activity_type = ?1
            ORDER BY start_time_unix_ms, session_id
            "#,
        )?;
        let rows = statement.query_map(params![activity_type], activity_session_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_sessions_by_source(
        &self,
        source: &str,
    ) -> GooseResult<Vec<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("source", source)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json,
                created_at,
                updated_at
            FROM activity_sessions
            WHERE source = ?1
            ORDER BY start_time_unix_ms, session_id
            "#,
        )?;
        let rows = statement.query_map(params![source], activity_session_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_sessions_by_sync_status(
        &self,
        sync_status: &str,
    ) -> GooseResult<Vec<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("sync_status", sync_status)?;
        validate_sync_status(sync_status)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json,
                created_at,
                updated_at
            FROM activity_sessions
            WHERE sync_status = ?1
            ORDER BY start_time_unix_ms, session_id
            "#,
        )?;
        let rows = statement.query_map(params![sync_status], activity_session_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_sessions_by_custom_label(
        &self,
        custom_label: &str,
    ) -> GooseResult<Vec<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("custom_label", custom_label)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json,
                created_at,
                updated_at
            FROM activity_sessions
            WHERE custom_label = ?1
            ORDER BY start_time_unix_ms, session_id
            "#,
        )?;
        let rows = statement.query_map(params![custom_label], activity_session_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_sessions_by_external_activity_type_code(
        &self,
        external_activity_type_code: &str,
    ) -> GooseResult<Vec<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("external_activity_type_code", external_activity_type_code)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json,
                created_at,
                updated_at
            FROM activity_sessions
            WHERE external_activity_type_code = ?1
            ORDER BY start_time_unix_ms, session_id
            "#,
        )?;
        let rows = statement.query_map(
            params![external_activity_type_code],
            activity_session_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_sessions_by_external_activity_type_name(
        &self,
        external_activity_type_name: &str,
    ) -> GooseResult<Vec<ActivitySessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("external_activity_type_name", external_activity_type_name)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                source,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                activity_type,
                external_activity_type_code,
                external_activity_type_name,
                custom_label,
                confidence,
                detection_method,
                sync_status,
                provenance_json,
                created_at,
                updated_at
            FROM activity_sessions
            WHERE external_activity_type_name = ?1
            ORDER BY start_time_unix_ms, session_id
            "#,
        )?;
        let rows = statement.query_map(
            params![external_activity_type_name],
            activity_session_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Activity metrics ----

    pub fn insert_activity_metric(&self, input: ActivityMetricInput<'_>) -> GooseResult<bool> {
        validate_activity_metric_input(&input)?;
        if self.activity_session(input.activity_session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                input.activity_session_id
            )));
        }
        self.insert_activity_metric_without_session_check(&input)
    }

    pub fn insert_activity_metrics(
        &self,
        inputs: &[ActivityMetricInput<'_>],
    ) -> GooseResult<(usize, usize)> {
        let mut session_ids = BTreeSet::new();
        for input in inputs {
            validate_activity_metric_input(input)?;
            session_ids.insert(input.activity_session_id);
        }

        for session_id in session_ids {
            if self.activity_session(session_id)?.is_none() {
                return Err(GooseError::message(format!(
                    "activity session {} not found",
                    session_id
                )));
            }
        }

        let mut inserted = 0;
        let mut existing = 0;
        for input in inputs {
            if self.insert_activity_metric_without_session_check(input)? {
                inserted += 1;
            } else {
                existing += 1;
            }
        }
        Ok((inserted, existing))
    }

    fn insert_activity_metric_without_session_check(
        &self,
        input: &ActivityMetricInput<'_>,
    ) -> GooseResult<bool> {
        let changed = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| GooseError::message("store mutex poisoned"))?;
            conn.execute(
                r#"
            INSERT OR IGNORE INTO activity_metrics (
                metric_id,
                activity_session_id,
                metric_name,
                value,
                unit,
                start_time_unix_ms,
                end_time_unix_ms,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
                params![
                    input.metric_id,
                    input.activity_session_id,
                    input.metric_name,
                    input.value,
                    input.unit,
                    input.start_time_unix_ms,
                    input.end_time_unix_ms,
                    input.quality_flags_json,
                    input.provenance_json,
                ],
            )?
        };
        if changed > 0 {
            return Ok(true);
        }

        if let Some(existing) = self.activity_metric(input.metric_id)? {
            if existing.activity_session_id == input.activity_session_id
                && existing.metric_name == input.metric_name
                && existing.value == input.value
                && existing.unit == input.unit
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.quality_flags_json == input.quality_flags_json
                && existing.provenance_json == input.provenance_json
            {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "activity metric {} already exists with different metadata",
                input.metric_id
            )));
        }

        Err(GooseError::message(format!(
            "activity metric {} insert was ignored but no existing row was found",
            input.metric_id
        )))
    }

    pub fn activity_metric(&self, metric_id: &str) -> GooseResult<Option<ActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("metric_id", metric_id)?;
        conn.query_row(
            r#"
                SELECT
                    metric_id,
                    activity_session_id,
                    metric_name,
                    value,
                    unit,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    quality_flags_json,
                    provenance_json,
                    created_at
                FROM activity_metrics
                WHERE metric_id = ?1
                "#,
            params![metric_id],
            activity_metric_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn activity_metrics_for_session(
        &self,
        activity_session_id: &str,
    ) -> GooseResult<Vec<ActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("activity_session_id", activity_session_id)?;
        if self.activity_session(activity_session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                activity_session_id
            )));
        }
        let mut statement = conn.prepare(
            r#"
            SELECT
                metric_id,
                activity_session_id,
                metric_name,
                value,
                unit,
                start_time_unix_ms,
                end_time_unix_ms,
                quality_flags_json,
                provenance_json,
                created_at
            FROM activity_metrics
            WHERE activity_session_id = ?1
            ORDER BY start_time_unix_ms, metric_id
            "#,
        )?;
        let rows = statement.query_map(params![activity_session_id], activity_metric_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_metrics_for_sessions(
        &self,
        activity_session_ids: &[String],
    ) -> GooseResult<Vec<ActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        if activity_session_ids.is_empty() {
            return Ok(Vec::new());
        }
        for activity_session_id in activity_session_ids {
            validate_required("activity_session_id", activity_session_id)?;
        }

        let placeholders = (0..activity_session_ids.len())
            .map(|_| "?")
            .collect::<Vec<_>>()
            .join(", ");
        let sql = format!(
            r#"
            SELECT
                metric_id,
                activity_session_id,
                metric_name,
                value,
                unit,
                start_time_unix_ms,
                end_time_unix_ms,
                quality_flags_json,
                provenance_json,
                created_at
            FROM activity_metrics
            WHERE activity_session_id IN ({placeholders})
            ORDER BY activity_session_id, start_time_unix_ms, metric_id
            "#
        );
        let mut statement = conn.prepare(&sql)?;
        let rows = statement.query_map(
            params_from_iter(activity_session_ids.iter().map(String::as_str)),
            activity_metric_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_metrics_by_name(
        &self,
        metric_name: &str,
    ) -> GooseResult<Vec<ActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("metric_name", metric_name)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                metric_id,
                activity_session_id,
                metric_name,
                value,
                unit,
                start_time_unix_ms,
                end_time_unix_ms,
                quality_flags_json,
                provenance_json,
                created_at
            FROM activity_metrics
            WHERE metric_name = ?1
            ORDER BY start_time_unix_ms, metric_id
            "#,
        )?;
        let rows = statement.query_map(params![metric_name], activity_metric_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_metrics_for_session_in_window(
        &self,
        activity_session_id: &str,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<ActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("activity_session_id", activity_session_id)?;
        validate_non_negative("start_time_unix_ms", start_time_unix_ms)?;
        validate_non_negative("end_time_unix_ms", end_time_unix_ms)?;
        validate_window_order(start_time_unix_ms, end_time_unix_ms)?;
        if self.activity_session(activity_session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                activity_session_id
            )));
        }
        let mut statement = conn.prepare(
            r#"
            SELECT
                metric_id,
                activity_session_id,
                metric_name,
                value,
                unit,
                start_time_unix_ms,
                end_time_unix_ms,
                quality_flags_json,
                provenance_json,
                created_at
            FROM activity_metrics
            WHERE activity_session_id = ?1
              AND start_time_unix_ms < ?3
              AND end_time_unix_ms > ?2
            ORDER BY start_time_unix_ms, metric_id
            "#,
        )?;
        let rows = statement.query_map(
            params![activity_session_id, start_time_unix_ms, end_time_unix_ms],
            activity_metric_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_metrics_in_window(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<ActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_non_negative("start_time_unix_ms", start_time_unix_ms)?;
        validate_non_negative("end_time_unix_ms", end_time_unix_ms)?;
        validate_window_order(start_time_unix_ms, end_time_unix_ms)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                metric_id,
                activity_session_id,
                metric_name,
                value,
                unit,
                start_time_unix_ms,
                end_time_unix_ms,
                quality_flags_json,
                provenance_json,
                created_at
            FROM activity_metrics
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, metric_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            activity_metric_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Activity intervals ----

    pub fn insert_activity_interval(&self, input: ActivityIntervalInput<'_>) -> GooseResult<bool> {
        validate_activity_interval_input(&input)?;
        if self.activity_session(input.activity_session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                input.activity_session_id
            )));
        }
        if let Some(existing) = self.activity_interval(input.interval_id)? {
            if existing.activity_session_id == input.activity_session_id
                && existing.interval_type == input.interval_type
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.sequence == input.sequence
                && existing.metadata_json == input.metadata_json
                && existing.provenance_json == input.provenance_json
            {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "activity interval {} already exists with different metadata",
                input.interval_id
            )));
        }
        let duration_ms = input.end_time_unix_ms - input.start_time_unix_ms;
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO activity_intervals (
                interval_id,
                activity_session_id,
                interval_type,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                sequence,
                metadata_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                input.interval_id,
                input.activity_session_id,
                input.interval_type,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                duration_ms,
                input.sequence,
                input.metadata_json,
                input.provenance_json,
            ],
        )?;
        Ok(true)
    }

    pub fn activity_interval(&self, interval_id: &str) -> GooseResult<Option<ActivityIntervalRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("interval_id", interval_id)?;
        conn.query_row(
            r#"
                SELECT
                    interval_id,
                    activity_session_id,
                    interval_type,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    duration_ms,
                    sequence,
                    metadata_json,
                    provenance_json,
                    created_at
                FROM activity_intervals
                WHERE interval_id = ?1
                "#,
            params![interval_id],
            activity_interval_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn activity_intervals_for_session(
        &self,
        activity_session_id: &str,
    ) -> GooseResult<Vec<ActivityIntervalRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("activity_session_id", activity_session_id)?;
        if self.activity_session(activity_session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                activity_session_id
            )));
        }
        let mut statement = conn.prepare(
            r#"
            SELECT
                interval_id,
                activity_session_id,
                interval_type,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                sequence,
                metadata_json,
                provenance_json,
                created_at
            FROM activity_intervals
            WHERE activity_session_id = ?1
            ORDER BY start_time_unix_ms, sequence, interval_id
            "#,
        )?;
        let rows = statement.query_map(params![activity_session_id], activity_interval_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_intervals_in_window(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<ActivityIntervalRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_non_negative("start_time_unix_ms", start_time_unix_ms)?;
        validate_non_negative("end_time_unix_ms", end_time_unix_ms)?;
        validate_window_order(start_time_unix_ms, end_time_unix_ms)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                interval_id,
                activity_session_id,
                interval_type,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                sequence,
                metadata_json,
                provenance_json,
                created_at
            FROM activity_intervals
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, sequence, interval_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            activity_interval_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Activity labels ----

    pub fn insert_activity_label(&self, input: ActivityLabelInput<'_>) -> GooseResult<bool> {
        validate_activity_label_input(&input)?;
        if self.activity_session(input.activity_session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                input.activity_session_id
            )));
        }
        if let Some(existing) = self.activity_label(input.label_id)? {
            if existing.activity_session_id == input.activity_session_id
                && existing.label_type == input.label_type
                && existing.value == input.value
                && existing.source == input.source
                && existing.confidence == input.confidence
                && existing.provenance_json == input.provenance_json
            {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "activity label {} already exists with different metadata",
                input.label_id
            )));
        }
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO activity_labels (
                label_id,
                activity_session_id,
                label_type,
                value,
                source,
                confidence,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                input.label_id,
                input.activity_session_id,
                input.label_type,
                input.value,
                input.source,
                input.confidence,
                input.provenance_json,
            ],
        )?;
        Ok(true)
    }

    pub fn activity_label(&self, label_id: &str) -> GooseResult<Option<ActivityLabelRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("label_id", label_id)?;
        conn.query_row(
            r#"
                SELECT
                    label_id,
                    activity_session_id,
                    label_type,
                    value,
                    source,
                    confidence,
                    provenance_json,
                    created_at
                FROM activity_labels
                WHERE label_id = ?1
                "#,
            params![label_id],
            activity_label_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn activity_labels_for_session(
        &self,
        activity_session_id: &str,
    ) -> GooseResult<Vec<ActivityLabelRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("activity_session_id", activity_session_id)?;
        if self.activity_session(activity_session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "activity session {} not found",
                activity_session_id
            )));
        }
        let mut statement = conn.prepare(
            r#"
            SELECT
                label_id,
                activity_session_id,
                label_type,
                value,
                source,
                confidence,
                provenance_json,
                created_at
            FROM activity_labels
            WHERE activity_session_id = ?1
            ORDER BY label_type, created_at, label_id
            "#,
        )?;
        let rows = statement.query_map(params![activity_session_id], activity_label_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn activity_labels_by_type(&self, label_type: &str) -> GooseResult<Vec<ActivityLabelRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("label_type", label_type)?;
        validate_activity_label_type(label_type)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                label_id,
                activity_session_id,
                label_type,
                value,
                source,
                confidence,
                provenance_json,
                created_at
            FROM activity_labels
            WHERE label_type = ?1
            ORDER BY created_at, label_id
            "#,
        )?;
        let rows = statement.query_map(params![label_type], activity_label_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Debug sessions ----

    pub fn insert_debug_session(&self, session: &DebugSessionRow) -> GooseResult<bool> {
        validate_required("session_id", &session.session_id)?;
        validate_required("bridge_url", &session.bridge_url)?;
        validate_required("bind_host", &session.bind_host)?;
        validate_non_negative("started_at_unix_ms", session.started_at_unix_ms)?;

        if let Some(existing) = self.debug_session(&session.session_id)? {
            if existing == *session {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "debug session {} already exists with different metadata",
                session.session_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO debug_sessions (
                session_id,
                started_at_unix_ms,
                bridge_url,
                bind_host,
                token_required,
                token_present,
                remote_bind_enabled,
                visible_remote_bind_toggle
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
            params![
                session.session_id,
                session.started_at_unix_ms,
                session.bridge_url,
                session.bind_host,
                bool_to_i64(session.token_required),
                bool_to_i64(session.token_present),
                bool_to_i64(session.remote_bind_enabled),
                bool_to_i64(session.visible_remote_bind_toggle),
            ],
        )?;
        Ok(true)
    }

    pub fn debug_session(&self, session_id: &str) -> GooseResult<Option<DebugSessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("session_id", session_id)?;
        conn.query_row(
            r#"
                SELECT
                    session_id,
                    started_at_unix_ms,
                    bridge_url,
                    bind_host,
                    token_required,
                    token_present,
                    remote_bind_enabled,
                    visible_remote_bind_toggle
                FROM debug_sessions
                WHERE session_id = ?1
                "#,
            params![session_id],
            debug_session_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn debug_sessions_between(
        &self,
        start_unix_ms: i64,
        end_unix_ms: i64,
    ) -> GooseResult<Vec<DebugSessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_non_negative("start_unix_ms", start_unix_ms)?;
        validate_positive("end_unix_ms", end_unix_ms)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                started_at_unix_ms,
                bridge_url,
                bind_host,
                token_required,
                token_present,
                remote_bind_enabled,
                visible_remote_bind_toggle
            FROM debug_sessions
            WHERE started_at_unix_ms >= ?1 AND started_at_unix_ms < ?2
            ORDER BY started_at_unix_ms, session_id
            "#,
        )?;
        let rows =
            statement.query_map(params![start_unix_ms, end_unix_ms], debug_session_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Debug commands ----

    pub fn insert_debug_command(&self, command: &DebugCommandRow) -> GooseResult<bool> {
        validate_required("command_id", &command.command_id)?;
        validate_required("session_id", &command.session_id)?;
        validate_required("schema", &command.schema)?;
        validate_required("command", &command.command)?;
        validate_json_object("args_json", &command.args_json)?;
        validate_non_negative("received_at_unix_ms", command.received_at_unix_ms)?;

        if let Some(existing) = self.debug_command(&command.command_id)? {
            if existing == *command {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "debug command {} already exists with different metadata",
                command.command_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO debug_commands (
                command_id,
                session_id,
                schema,
                command,
                args_json,
                dry_run,
                received_at_unix_ms
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                command.command_id,
                command.session_id,
                command.schema,
                command.command,
                command.args_json,
                bool_to_i64(command.dry_run),
                command.received_at_unix_ms,
            ],
        )?;
        Ok(true)
    }

    pub fn debug_command(&self, command_id: &str) -> GooseResult<Option<DebugCommandRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("command_id", command_id)?;
        conn.query_row(
            r#"
                SELECT
                    command_id,
                    session_id,
                    schema,
                    command,
                    args_json,
                    dry_run,
                    received_at_unix_ms
                FROM debug_commands
                WHERE command_id = ?1
                "#,
            params![command_id],
            debug_command_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn debug_commands_for_session(
        &self,
        session_id: &str,
    ) -> GooseResult<Vec<DebugCommandRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("session_id", session_id)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                command_id,
                session_id,
                schema,
                command,
                args_json,
                dry_run,
                received_at_unix_ms
            FROM debug_commands
            WHERE session_id = ?1
            ORDER BY received_at_unix_ms, command_id
            "#,
        )?;
        let rows = statement.query_map(params![session_id], debug_command_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn debug_commands_between(
        &self,
        start_unix_ms: i64,
        end_unix_ms: i64,
    ) -> GooseResult<Vec<DebugCommandRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_non_negative("start_unix_ms", start_unix_ms)?;
        validate_positive("end_unix_ms", end_unix_ms)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                command_id,
                session_id,
                schema,
                command,
                args_json,
                dry_run,
                received_at_unix_ms
            FROM debug_commands
            WHERE received_at_unix_ms >= ?1 AND received_at_unix_ms < ?2
            ORDER BY received_at_unix_ms, command_id
            "#,
        )?;
        let rows =
            statement.query_map(params![start_unix_ms, end_unix_ms], debug_command_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Debug events ----

    pub fn next_debug_event_sequence(&self, session_id: &str) -> GooseResult<i64> {
        validate_required("session_id", session_id)?;
        if self.debug_session(session_id)?.is_none() {
            return Err(GooseError::message(format!(
                "debug session {session_id} not found"
            )));
        }
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let max_sequence: Option<i64> = conn.query_row(
            "SELECT MAX(sequence) FROM debug_events WHERE session_id = ?1",
            params![session_id],
            |row| row.get(0),
        )?;
        Ok(max_sequence.unwrap_or(0) + 1)
    }

    pub fn insert_debug_event(&self, event: &DebugEventRow) -> GooseResult<bool> {
        validate_required("session_id", &event.session_id)?;
        validate_required("schema", &event.schema)?;
        validate_required("source", &event.source)?;
        validate_required("level", &event.level)?;
        validate_required("topic", &event.topic)?;
        validate_required("message", &event.message)?;
        validate_json_object("data_json", &event.data_json)?;
        validate_positive("sequence", event.sequence)?;
        validate_non_negative("time_unix_ms", event.time_unix_ms)?;

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let previous: Option<(i64, i64)> = conn
            .query_row(
                r#"
                SELECT sequence, time_unix_ms
                FROM debug_events
                WHERE session_id = ?1
                ORDER BY sequence DESC
                LIMIT 1
                "#,
                params![event.session_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .optional()?;
        if let Some((previous_sequence, previous_time)) = previous {
            if event.sequence <= previous_sequence {
                return Err(GooseError::message(format!(
                    "debug event sequence {} is not after previous sequence {}",
                    event.sequence, previous_sequence
                )));
            }
            if event.time_unix_ms < previous_time {
                return Err(GooseError::message(format!(
                    "debug event time {} is before previous event time {}",
                    event.time_unix_ms, previous_time
                )));
            }
        }

        let changed = conn.execute(
            r#"
            INSERT OR IGNORE INTO debug_events (
                session_id,
                sequence,
                schema,
                time_unix_ms,
                source,
                level,
                topic,
                message,
                command_id,
                data_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            "#,
            params![
                event.session_id,
                event.sequence,
                event.schema,
                event.time_unix_ms,
                event.source,
                event.level,
                event.topic,
                event.message,
                event.command_id,
                event.data_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn debug_events_for_session(&self, session_id: &str) -> GooseResult<Vec<DebugEventRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("session_id", session_id)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                sequence,
                schema,
                time_unix_ms,
                source,
                level,
                topic,
                message,
                command_id,
                data_json
            FROM debug_events
            WHERE session_id = ?1
            ORDER BY sequence
            "#,
        )?;
        let rows = statement.query_map(params![session_id], debug_event_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn debug_events_between(
        &self,
        start_unix_ms: i64,
        end_unix_ms: i64,
    ) -> GooseResult<Vec<DebugEventRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_non_negative("start_unix_ms", start_unix_ms)?;
        validate_positive("end_unix_ms", end_unix_ms)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                sequence,
                schema,
                time_unix_ms,
                source,
                level,
                topic,
                message,
                command_id,
                data_json
            FROM debug_events
            WHERE time_unix_ms >= ?1 AND time_unix_ms < ?2
            ORDER BY time_unix_ms, session_id, sequence
            "#,
        )?;
        let rows =
            statement.query_map(params![start_unix_ms, end_unix_ms], debug_event_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn debug_events_after_sequence(
        &self,
        session_id: &str,
        after_sequence: i64,
        limit: Option<usize>,
    ) -> GooseResult<Vec<DebugEventRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("session_id", session_id)?;
        validate_non_negative("after_sequence", after_sequence)?;
        let limit = i64::try_from(limit.unwrap_or(1000))
            .map_err(|_| GooseError::message("limit is too large"))?;
        validate_positive("limit", limit)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                session_id,
                sequence,
                schema,
                time_unix_ms,
                source,
                level,
                topic,
                message,
                command_id,
                data_json
            FROM debug_events
            WHERE session_id = ?1 AND sequence > ?2
            ORDER BY sequence
            LIMIT ?3
            "#,
        )?;
        let rows = statement.query_map(
            params![session_id, after_sequence, limit],
            debug_event_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Table introspection ----

    pub fn table_count(&self, table: &str) -> GooseResult<i64> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        if !super::is_known_table(table) {
            return Err(GooseError::message(format!("unknown table: {table}")));
        }
        let query = format!("SELECT COUNT(*) FROM {table}");
        Ok(conn.query_row(&query, [], |row| row.get(0))?)
    }

    pub fn table_columns(&self, table: &str) -> GooseResult<BTreeSet<String>> {
        if !super::is_known_table(table) {
            return Err(GooseError::message(format!("unknown table: {table}")));
        }
        self.table_columns_unchecked(table)
    }

    pub fn foreign_keys_enabled(&self) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let enabled: i64 = conn.query_row("PRAGMA foreign_keys", [], |row| row.get(0))?;
        Ok(enabled != 0)
    }

    pub fn integrity_check(&self) -> GooseResult<String> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))
            .map_err(GooseError::from)
    }

    // ---- Exercise sessions ----

    pub fn insert_exercise_session(&self, row: &ExerciseSessionRow) -> GooseResult<bool> {
        validate_required("device_id", &row.device_id)?;
        self.immediate_transaction(|conn| {
            let changed = conn.execute(
                "INSERT OR IGNORE INTO exercise_sessions \
                 (device_id, start_ts, end_ts, duration_s, avg_hr, peak_hr, strain, \
                  calories_kcal, zone_time_pct_json, hrmax_source, rhr_source, avg_hrr_pct) \
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    row.device_id,
                    row.start_ts,
                    row.end_ts,
                    row.duration_s,
                    row.avg_hr,
                    row.peak_hr,
                    row.strain,
                    row.calories_kcal,
                    row.zone_time_pct_json,
                    row.hrmax_source,
                    row.rhr_source,
                    row.avg_hrr_pct
                ],
            )?;
            Ok(changed > 0)
        })
    }

    /// Insert multiple exercise sessions in a single atomic transaction (PERF-03).
    /// Returns the count of newly inserted rows (duplicates skipped via INSERT OR IGNORE).
    pub fn insert_exercise_sessions_batch(
        &self,
        rows: &[ExerciseSessionRow],
    ) -> GooseResult<usize> {
        if rows.is_empty() {
            return Ok(0);
        }
        self.immediate_transaction(|conn| {
            let mut inserted = 0usize;
            for row in rows {
                validate_required("device_id", &row.device_id)?;
                let changed = conn.execute(
                    "INSERT OR IGNORE INTO exercise_sessions \
                     (device_id, start_ts, end_ts, duration_s, avg_hr, peak_hr, strain, \
                      calories_kcal, zone_time_pct_json, hrmax_source, rhr_source, avg_hrr_pct) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                    params![
                        row.device_id,
                        row.start_ts,
                        row.end_ts,
                        row.duration_s,
                        row.avg_hr,
                        row.peak_hr,
                        row.strain,
                        row.calories_kcal,
                        row.zone_time_pct_json,
                        row.hrmax_source,
                        row.rhr_source,
                        row.avg_hrr_pct
                    ],
                )?;
                if changed > 0 {
                    inserted += 1;
                }
            }
            Ok(inserted)
        })
    }

    pub fn exercise_sessions_between(
        &self,
        device_id: &str,
        ts_start: f64,
        ts_end: f64,
    ) -> GooseResult<Vec<ExerciseSessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("device_id", device_id)?;
        if ts_end < ts_start {
            return Err(GooseError::message("ts_end must be >= ts_start"));
        }
        let mut stmt = conn.prepare(
            "SELECT device_id, start_ts, end_ts, duration_s, avg_hr, peak_hr, strain, \
             calories_kcal, zone_time_pct_json, hrmax_source, rhr_source, avg_hrr_pct \
             FROM exercise_sessions WHERE device_id = ?1 AND start_ts >= ?2 AND start_ts < ?3 \
             ORDER BY start_ts",
        )?;
        let rows = stmt.query_map(params![device_id, ts_start, ts_end], |row| {
            Ok(ExerciseSessionRow {
                device_id: row.get(0)?,
                start_ts: row.get(1)?,
                end_ts: row.get(2)?,
                duration_s: row.get(3)?,
                avg_hr: row.get(4)?,
                peak_hr: row.get(5)?,
                strain: row.get(6)?,
                calories_kcal: row.get(7)?,
                zone_time_pct_json: row.get(8)?,
                hrmax_source: row.get(9)?,
                rhr_source: row.get(10)?,
                avg_hrr_pct: row.get(11)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    // ---- Journal, Workout, Apple Daily ----

    pub fn insert_journal(
        &self,
        date: &str,
        source: &str,
        behaviors_json: &str,
        notes: Option<&str>,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let rows = conn.execute(
            "INSERT OR REPLACE INTO journal (date, source, behaviors_json, notes)
             VALUES (?1, ?2, ?3, ?4)",
            params![date, source, behaviors_json, notes],
        )?;
        Ok(rows > 0)
    }

    pub fn insert_workout(
        &self,
        date: &str,
        source: &str,
        sport: &str,
        start_time: &str,
        end_time: &str,
        duration_s: f64,
        activity_session_id: Option<&str>,
        avg_hr_bpm: Option<f64>,
        max_hr_bpm: Option<f64>,
        strain: Option<f64>,
        calories_kcal: Option<f64>,
        distance_m: Option<f64>,
        notes: Option<&str>,
        provenance_json: &str,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let rows = conn.execute(
            "INSERT OR REPLACE INTO workout
             (date, source, sport, start_time, end_time, duration_s,
              activity_session_id, avg_hr_bpm, max_hr_bpm, strain,
              calories_kcal, distance_m, notes, provenance_json)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                date,
                source,
                sport,
                start_time,
                end_time,
                duration_s,
                activity_session_id,
                avg_hr_bpm,
                max_hr_bpm,
                strain,
                calories_kcal,
                distance_m,
                notes,
                provenance_json,
            ],
        )?;
        Ok(rows > 0)
    }

    pub fn insert_apple_daily(
        &self,
        date: &str,
        source: &str,
        steps: Option<i64>,
        active_kcal: Option<f64>,
        basal_kcal: Option<f64>,
        avg_hr_bpm: Option<f64>,
        max_hr_bpm: Option<f64>,
        vo2max: Option<f64>,
        weight_kg: Option<f64>,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let rows = conn.execute(
            "INSERT OR REPLACE INTO apple_daily
             (date, source, steps, active_kcal, basal_kcal, avg_hr_bpm, max_hr_bpm, vo2max, weight_kg)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![date, source, steps, active_kcal, basal_kcal, avg_hr_bpm, max_hr_bpm, vo2max, weight_kg],
        )?;
        Ok(rows > 0)
    }
}
