use rusqlite::{OptionalExtension, params};

use crate::{GooseError, GooseResult};

use super::{
    ExternalSleepSessionInput, ExternalSleepSessionRow, ExternalSleepStageInput,
    ExternalSleepStageRow, GooseStore, SleepCorrectionLabelInput, SleepCorrectionLabelRow,
    external_sleep_session_from_row, external_sleep_stage_from_row,
    sleep_correction_label_from_row, validate_external_sleep_session_input,
    validate_external_sleep_stage_input, validate_non_negative, validate_required,
    validate_sleep_correction_label_input, validate_window_order,
};

impl GooseStore {
    pub fn insert_external_sleep_session(
        &self,
        input: ExternalSleepSessionInput<'_>,
    ) -> GooseResult<bool> {
        validate_external_sleep_session_input(&input)?;

        if let Some(existing) = self.external_sleep_session(input.sleep_id)? {
            let same = existing.sleep_id == input.sleep_id
                && existing.source == input.source
                && existing.platform == input.platform
                && existing.platform_record_id == input.platform_record_id.map(str::to_string)
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.timezone == input.timezone.map(str::to_string)
                && existing.stage_summary_json == input.stage_summary_json
                && existing.confidence == input.confidence
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "external sleep session {} already exists with different metadata",
                input.sleep_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO external_sleep_sessions (
                sleep_id,
                source,
                platform,
                platform_record_id,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                timezone,
                stage_summary_json,
                confidence,
                provenance_json
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

    pub fn external_sleep_session(
        &self,
        sleep_id: &str,
    ) -> GooseResult<Option<ExternalSleepSessionRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("sleep_id", sleep_id)?;
        conn.query_row(
            r#"
                SELECT
                    sleep_id,
                    source,
                    platform,
                    platform_record_id,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    duration_ms,
                    timezone,
                    stage_summary_json,
                    confidence,
                    provenance_json,
                    created_at,
                    updated_at
                FROM external_sleep_sessions
                WHERE sleep_id = ?1
                "#,
            params![sleep_id],
            external_sleep_session_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn external_sleep_sessions_between(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<ExternalSleepSessionRow>> {
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
                sleep_id,
                source,
                platform,
                platform_record_id,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                timezone,
                stage_summary_json,
                confidence,
                provenance_json,
                created_at,
                updated_at
            FROM external_sleep_sessions
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, sleep_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            external_sleep_session_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_external_sleep_stage(
        &self,
        input: ExternalSleepStageInput<'_>,
    ) -> GooseResult<bool> {
        validate_external_sleep_stage_input(self, &input)?;

        if let Some(existing) = self.external_sleep_stage(input.stage_id)? {
            let same = existing.stage_id == input.stage_id
                && existing.sleep_id == input.sleep_id
                && existing.stage_kind == input.stage_kind
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.confidence == input.confidence
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "external sleep stage {} already exists with different metadata",
                input.stage_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO external_sleep_stages (
                stage_id,
                sleep_id,
                stage_kind,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                confidence,
                provenance_json
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

    pub fn external_sleep_stage(
        &self,
        stage_id: &str,
    ) -> GooseResult<Option<ExternalSleepStageRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("stage_id", stage_id)?;
        conn.query_row(
            r#"
                SELECT
                    stage_id,
                    sleep_id,
                    stage_kind,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    duration_ms,
                    confidence,
                    provenance_json,
                    created_at
                FROM external_sleep_stages
                WHERE stage_id = ?1
                "#,
            params![stage_id],
            external_sleep_stage_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn external_sleep_stages_for_session(
        &self,
        sleep_id: &str,
    ) -> GooseResult<Vec<ExternalSleepStageRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("sleep_id", sleep_id)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                stage_id,
                sleep_id,
                stage_kind,
                start_time_unix_ms,
                end_time_unix_ms,
                duration_ms,
                confidence,
                provenance_json,
                created_at
            FROM external_sleep_stages
            WHERE sleep_id = ?1
            ORDER BY start_time_unix_ms, stage_id
            "#,
        )?;
        let rows = statement.query_map(params![sleep_id], external_sleep_stage_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_sleep_correction_label(
        &self,
        input: SleepCorrectionLabelInput<'_>,
    ) -> GooseResult<bool> {
        validate_sleep_correction_label_input(&input)?;
        if let Some(existing) = self.sleep_correction_label(input.label_id)? {
            if existing.sleep_id == input.sleep_id.map(str::to_string)
                && existing.label_type == input.label_type
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.value_json == input.value_json
                && existing.source == input.source
                && existing.confidence == input.confidence
                && existing.provenance_json == input.provenance_json
            {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "sleep correction label {} already exists with different metadata",
                input.label_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO sleep_correction_labels (
                label_id,
                sleep_id,
                label_type,
                start_time_unix_ms,
                end_time_unix_ms,
                value_json,
                source,
                confidence,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                input.label_id,
                input.sleep_id,
                input.label_type,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.value_json,
                input.source,
                input.confidence,
                input.provenance_json,
            ],
        )?;
        Ok(true)
    }

    pub fn sleep_correction_label(
        &self,
        label_id: &str,
    ) -> GooseResult<Option<SleepCorrectionLabelRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("label_id", label_id)?;
        conn.query_row(
            r#"
                SELECT
                    label_id,
                    sleep_id,
                    label_type,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    value_json,
                    source,
                    confidence,
                    provenance_json,
                    created_at
                FROM sleep_correction_labels
                WHERE label_id = ?1
                "#,
            params![label_id],
            sleep_correction_label_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn sleep_correction_labels_between(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<SleepCorrectionLabelRow>> {
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
                label_id,
                sleep_id,
                label_type,
                start_time_unix_ms,
                end_time_unix_ms,
                value_json,
                source,
                confidence,
                provenance_json,
                created_at
            FROM sleep_correction_labels
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, label_type, label_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            sleep_correction_label_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }
}
