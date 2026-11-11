use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;

use super::{
    AlgorithmDefinitionRecord, AlgorithmPreferenceRecord, AlgorithmRunRecord,
    CalibrationLabelInput, CalibrationLabelRow, CalibrationRunRecord, CalibrationRunTimes,
    CommandValidationRecord, DailyActivityMetricInput, DailyActivityMetricRow,
    DailyRecoveryMetricInput, DailyRecoveryMetricRow, GooseStore, GravityRow,
    HourlyActivityMetricInput, HourlyActivityMetricRow, MetricComponentRecord,
    MetricDebugFeatureInput, MetricDebugFeatureRow, MetricProvenanceInput, MetricProvenanceRow,
    MetricValueRecord, RespSampleRow, SigQualitySampleRow, SkinTempSampleRow, Spo2SampleRow,
    V24BiometricBatch, V24BiometricWindow, algorithm_preference_from_row, bool_to_i64,
    calibration_label_from_row, command_validation_record_from_row, daily_activity_metric_from_row,
    daily_recovery_metric_from_row, finite_json_number, hourly_activity_metric_from_row,
    is_allowed_calibration_label_source, metric_debug_feature_from_row, metric_output_unit,
    metric_provenance_from_row, validate_command_report_json, validate_daily_activity_metric_input,
    validate_daily_recovery_metric_input, validate_hourly_activity_metric_input, validate_json,
    validate_json_object, validate_metric_debug_feature_input, validate_metric_provenance_input,
    validate_non_negative, validate_required, validate_window_order,
};
use crate::{GooseError, GooseResult};

impl GooseStore {
    pub fn insert_daily_activity_metric(
        &self,
        input: DailyActivityMetricInput<'_>,
    ) -> GooseResult<bool> {
        validate_daily_activity_metric_input(&input)?;
        if let Some(existing) = self.daily_activity_metric(input.daily_metric_id)? {
            let same = existing.date_key == input.date_key
                && existing.timezone == input.timezone
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.steps == input.steps
                && existing.active_kcal == input.active_kcal
                && existing.resting_kcal == input.resting_kcal
                && existing.total_kcal == input.total_kcal
                && existing.average_cadence_spm == input.average_cadence_spm
                && existing.source_kind == input.source_kind
                && existing.confidence == input.confidence
                && existing.inputs_json == input.inputs_json
                && existing.quality_flags_json == input.quality_flags_json
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "daily activity metric {} already exists with different metadata",
                input.daily_metric_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let changed = conn.execute(
            r#"
            INSERT INTO daily_activity_metrics (
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                steps,
                active_kcal,
                resting_kcal,
                total_kcal,
                average_cadence_spm,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#,
            params![
                input.daily_metric_id,
                input.date_key,
                input.timezone,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.steps,
                input.active_kcal,
                input.resting_kcal,
                input.total_kcal,
                input.average_cadence_spm,
                input.source_kind,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn upsert_daily_activity_metric(
        &self,
        input: DailyActivityMetricInput<'_>,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_daily_activity_metric_input(&input)?;
        let changed = conn.execute(
            r#"
            INSERT INTO daily_activity_metrics (
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                steps,
                active_kcal,
                resting_kcal,
                total_kcal,
                average_cadence_spm,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(daily_metric_id) DO UPDATE SET
                date_key = excluded.date_key,
                timezone = excluded.timezone,
                start_time_unix_ms = excluded.start_time_unix_ms,
                end_time_unix_ms = excluded.end_time_unix_ms,
                steps = excluded.steps,
                active_kcal = excluded.active_kcal,
                resting_kcal = excluded.resting_kcal,
                total_kcal = excluded.total_kcal,
                average_cadence_spm = excluded.average_cadence_spm,
                source_kind = excluded.source_kind,
                confidence = excluded.confidence,
                inputs_json = excluded.inputs_json,
                quality_flags_json = excluded.quality_flags_json,
                provenance_json = excluded.provenance_json,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE daily_activity_metrics.date_key IS NOT excluded.date_key
               OR daily_activity_metrics.timezone IS NOT excluded.timezone
               OR daily_activity_metrics.start_time_unix_ms IS NOT excluded.start_time_unix_ms
               OR daily_activity_metrics.end_time_unix_ms IS NOT excluded.end_time_unix_ms
               OR daily_activity_metrics.steps IS NOT excluded.steps
               OR daily_activity_metrics.active_kcal IS NOT excluded.active_kcal
               OR daily_activity_metrics.resting_kcal IS NOT excluded.resting_kcal
               OR daily_activity_metrics.total_kcal IS NOT excluded.total_kcal
               OR daily_activity_metrics.average_cadence_spm IS NOT excluded.average_cadence_spm
               OR daily_activity_metrics.source_kind IS NOT excluded.source_kind
               OR daily_activity_metrics.confidence IS NOT excluded.confidence
               OR daily_activity_metrics.inputs_json IS NOT excluded.inputs_json
               OR daily_activity_metrics.quality_flags_json IS NOT excluded.quality_flags_json
               OR daily_activity_metrics.provenance_json IS NOT excluded.provenance_json
            "#,
            params![
                input.daily_metric_id,
                input.date_key,
                input.timezone,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.steps,
                input.active_kcal,
                input.resting_kcal,
                input.total_kcal,
                input.average_cadence_spm,
                input.source_kind,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn daily_activity_metric(
        &self,
        daily_metric_id: &str,
    ) -> GooseResult<Option<DailyActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("daily_metric_id", daily_metric_id)?;
        conn.query_row(
            r#"
                SELECT
                    daily_metric_id,
                    date_key,
                    timezone,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    steps,
                    active_kcal,
                    resting_kcal,
                    total_kcal,
                    average_cadence_spm,
                    source_kind,
                    confidence,
                    inputs_json,
                    quality_flags_json,
                    provenance_json,
                    created_at,
                    updated_at
                FROM daily_activity_metrics
                WHERE daily_metric_id = ?1
                "#,
            params![daily_metric_id],
            daily_activity_metric_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn daily_activity_metrics_between(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<DailyActivityMetricRow>> {
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
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                steps,
                active_kcal,
                resting_kcal,
                total_kcal,
                average_cadence_spm,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json,
                created_at,
                updated_at
            FROM daily_activity_metrics
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, daily_metric_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            daily_activity_metric_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_hourly_activity_metric(
        &self,
        input: HourlyActivityMetricInput<'_>,
    ) -> GooseResult<bool> {
        validate_hourly_activity_metric_input(&input)?;
        if let Some(existing) = self.hourly_activity_metric(input.hourly_metric_id)? {
            let same = existing.date_key == input.date_key
                && existing.timezone == input.timezone
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.steps == input.steps
                && existing.active_kcal == input.active_kcal
                && existing.resting_kcal == input.resting_kcal
                && existing.total_kcal == input.total_kcal
                && existing.average_cadence_spm == input.average_cadence_spm
                && existing.source_kind == input.source_kind
                && existing.confidence == input.confidence
                && existing.inputs_json == input.inputs_json
                && existing.quality_flags_json == input.quality_flags_json
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "hourly activity metric {} already exists with different metadata",
                input.hourly_metric_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let changed = conn.execute(
            r#"
            INSERT INTO hourly_activity_metrics (
                hourly_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                steps,
                active_kcal,
                resting_kcal,
                total_kcal,
                average_cadence_spm,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#,
            params![
                input.hourly_metric_id,
                input.date_key,
                input.timezone,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.steps,
                input.active_kcal,
                input.resting_kcal,
                input.total_kcal,
                input.average_cadence_spm,
                input.source_kind,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn upsert_hourly_activity_metric(
        &self,
        input: HourlyActivityMetricInput<'_>,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_hourly_activity_metric_input(&input)?;
        let changed = conn.execute(
            r#"
            INSERT INTO hourly_activity_metrics (
                hourly_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                steps,
                active_kcal,
                resting_kcal,
                total_kcal,
                average_cadence_spm,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(hourly_metric_id) DO UPDATE SET
                date_key = excluded.date_key,
                timezone = excluded.timezone,
                start_time_unix_ms = excluded.start_time_unix_ms,
                end_time_unix_ms = excluded.end_time_unix_ms,
                steps = excluded.steps,
                active_kcal = excluded.active_kcal,
                resting_kcal = excluded.resting_kcal,
                total_kcal = excluded.total_kcal,
                average_cadence_spm = excluded.average_cadence_spm,
                source_kind = excluded.source_kind,
                confidence = excluded.confidence,
                inputs_json = excluded.inputs_json,
                quality_flags_json = excluded.quality_flags_json,
                provenance_json = excluded.provenance_json,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE hourly_activity_metrics.date_key IS NOT excluded.date_key
               OR hourly_activity_metrics.timezone IS NOT excluded.timezone
               OR hourly_activity_metrics.start_time_unix_ms IS NOT excluded.start_time_unix_ms
               OR hourly_activity_metrics.end_time_unix_ms IS NOT excluded.end_time_unix_ms
               OR hourly_activity_metrics.steps IS NOT excluded.steps
               OR hourly_activity_metrics.active_kcal IS NOT excluded.active_kcal
               OR hourly_activity_metrics.resting_kcal IS NOT excluded.resting_kcal
               OR hourly_activity_metrics.total_kcal IS NOT excluded.total_kcal
               OR hourly_activity_metrics.average_cadence_spm IS NOT excluded.average_cadence_spm
               OR hourly_activity_metrics.source_kind IS NOT excluded.source_kind
               OR hourly_activity_metrics.confidence IS NOT excluded.confidence
               OR hourly_activity_metrics.inputs_json IS NOT excluded.inputs_json
               OR hourly_activity_metrics.quality_flags_json IS NOT excluded.quality_flags_json
               OR hourly_activity_metrics.provenance_json IS NOT excluded.provenance_json
            "#,
            params![
                input.hourly_metric_id,
                input.date_key,
                input.timezone,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.steps,
                input.active_kcal,
                input.resting_kcal,
                input.total_kcal,
                input.average_cadence_spm,
                input.source_kind,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn hourly_activity_metric(
        &self,
        hourly_metric_id: &str,
    ) -> GooseResult<Option<HourlyActivityMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("hourly_metric_id", hourly_metric_id)?;
        conn.query_row(
            r#"
                SELECT
                    hourly_metric_id,
                    date_key,
                    timezone,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    steps,
                    active_kcal,
                    resting_kcal,
                    total_kcal,
                    average_cadence_spm,
                    source_kind,
                    confidence,
                    inputs_json,
                    quality_flags_json,
                    provenance_json,
                    created_at,
                    updated_at
                FROM hourly_activity_metrics
                WHERE hourly_metric_id = ?1
                "#,
            params![hourly_metric_id],
            hourly_activity_metric_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn hourly_activity_metrics_between(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<HourlyActivityMetricRow>> {
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
                hourly_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                steps,
                active_kcal,
                resting_kcal,
                total_kcal,
                average_cadence_spm,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json,
                created_at,
                updated_at
            FROM hourly_activity_metrics
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, hourly_metric_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            hourly_activity_metric_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_daily_recovery_metric(
        &self,
        input: DailyRecoveryMetricInput<'_>,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_daily_recovery_metric_input(&input)?;
        if let Some(existing) = Self::daily_recovery_metric_with_conn(&conn, input.daily_metric_id)?
        {
            let same = existing.date_key == input.date_key
                && existing.timezone == input.timezone
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.resting_hr_bpm == input.resting_hr_bpm
                && existing.hrv_rmssd_ms == input.hrv_rmssd_ms
                && existing.respiratory_rate_rpm == input.respiratory_rate_rpm
                && existing.oxygen_saturation_percent == input.oxygen_saturation_percent
                && existing.skin_temperature_delta_c == input.skin_temperature_delta_c
                && existing.source_kind == input.source_kind
                && existing.confidence == input.confidence
                && existing.inputs_json == input.inputs_json
                && existing.quality_flags_json == input.quality_flags_json
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "daily recovery metric {} already exists with different metadata",
                input.daily_metric_id
            )));
        }

        let changed = conn.execute(
            r#"
            INSERT INTO daily_recovery_metrics (
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                resting_hr_bpm,
                hrv_rmssd_ms,
                respiratory_rate_rpm,
                oxygen_saturation_percent,
                skin_temperature_delta_c,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            "#,
            params![
                input.daily_metric_id,
                input.date_key,
                input.timezone,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.resting_hr_bpm,
                input.hrv_rmssd_ms,
                input.respiratory_rate_rpm,
                input.oxygen_saturation_percent,
                input.skin_temperature_delta_c,
                input.source_kind,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn upsert_daily_recovery_metric(
        &self,
        input: DailyRecoveryMetricInput<'_>,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_daily_recovery_metric_input(&input)?;
        let changed = conn.execute(
            r#"
            INSERT INTO daily_recovery_metrics (
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                resting_hr_bpm,
                hrv_rmssd_ms,
                respiratory_rate_rpm,
                oxygen_saturation_percent,
                skin_temperature_delta_c,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)
            ON CONFLICT(daily_metric_id) DO UPDATE SET
                date_key = excluded.date_key,
                timezone = excluded.timezone,
                start_time_unix_ms = excluded.start_time_unix_ms,
                end_time_unix_ms = excluded.end_time_unix_ms,
                resting_hr_bpm = excluded.resting_hr_bpm,
                hrv_rmssd_ms = excluded.hrv_rmssd_ms,
                respiratory_rate_rpm = excluded.respiratory_rate_rpm,
                oxygen_saturation_percent = excluded.oxygen_saturation_percent,
                skin_temperature_delta_c = excluded.skin_temperature_delta_c,
                source_kind = excluded.source_kind,
                confidence = excluded.confidence,
                inputs_json = excluded.inputs_json,
                quality_flags_json = excluded.quality_flags_json,
                provenance_json = excluded.provenance_json,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            WHERE daily_recovery_metrics.date_key IS NOT excluded.date_key
               OR daily_recovery_metrics.timezone IS NOT excluded.timezone
               OR daily_recovery_metrics.start_time_unix_ms IS NOT excluded.start_time_unix_ms
               OR daily_recovery_metrics.end_time_unix_ms IS NOT excluded.end_time_unix_ms
               OR daily_recovery_metrics.resting_hr_bpm IS NOT excluded.resting_hr_bpm
               OR daily_recovery_metrics.hrv_rmssd_ms IS NOT excluded.hrv_rmssd_ms
               OR daily_recovery_metrics.respiratory_rate_rpm IS NOT excluded.respiratory_rate_rpm
               OR daily_recovery_metrics.oxygen_saturation_percent IS NOT excluded.oxygen_saturation_percent
               OR daily_recovery_metrics.skin_temperature_delta_c IS NOT excluded.skin_temperature_delta_c
               OR daily_recovery_metrics.source_kind IS NOT excluded.source_kind
               OR daily_recovery_metrics.confidence IS NOT excluded.confidence
               OR daily_recovery_metrics.inputs_json IS NOT excluded.inputs_json
               OR daily_recovery_metrics.quality_flags_json IS NOT excluded.quality_flags_json
               OR daily_recovery_metrics.provenance_json IS NOT excluded.provenance_json
            "#,
            params![
                input.daily_metric_id,
                input.date_key,
                input.timezone,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.resting_hr_bpm,
                input.hrv_rmssd_ms,
                input.respiratory_rate_rpm,
                input.oxygen_saturation_percent,
                input.skin_temperature_delta_c,
                input.source_kind,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    fn daily_recovery_metric_with_conn(
        conn: &Connection,
        daily_metric_id: &str,
    ) -> GooseResult<Option<DailyRecoveryMetricRow>> {
        conn.query_row(
            r#"
                SELECT
                    daily_metric_id,
                    date_key,
                    timezone,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    resting_hr_bpm,
                    hrv_rmssd_ms,
                    respiratory_rate_rpm,
                    oxygen_saturation_percent,
                    skin_temperature_delta_c,
                    source_kind,
                    confidence,
                    inputs_json,
                    quality_flags_json,
                    provenance_json,
                    created_at,
                    updated_at
                FROM daily_recovery_metrics
                WHERE daily_metric_id = ?1
                "#,
            params![daily_metric_id],
            daily_recovery_metric_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn daily_recovery_metric(
        &self,
        daily_metric_id: &str,
    ) -> GooseResult<Option<DailyRecoveryMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("daily_metric_id", daily_metric_id)?;
        conn.query_row(
            r#"
                SELECT
                    daily_metric_id,
                    date_key,
                    timezone,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    resting_hr_bpm,
                    hrv_rmssd_ms,
                    respiratory_rate_rpm,
                    oxygen_saturation_percent,
                    skin_temperature_delta_c,
                    source_kind,
                    confidence,
                    inputs_json,
                    quality_flags_json,
                    provenance_json,
                    created_at,
                    updated_at
                FROM daily_recovery_metrics
                WHERE daily_metric_id = ?1
                "#,
            params![daily_metric_id],
            daily_recovery_metric_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn daily_recovery_metrics_between(
        &self,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<DailyRecoveryMetricRow>> {
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
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                resting_hr_bpm,
                hrv_rmssd_ms,
                respiratory_rate_rpm,
                oxygen_saturation_percent,
                skin_temperature_delta_c,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json,
                created_at,
                updated_at
            FROM daily_recovery_metrics
            WHERE start_time_unix_ms < ?2
              AND end_time_unix_ms > ?1
            ORDER BY start_time_unix_ms, daily_metric_id
            "#,
        )?;
        let rows = statement.query_map(
            params![start_time_unix_ms, end_time_unix_ms],
            daily_recovery_metric_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    /// Return all `daily_recovery_metrics` rows ordered by `date_key` ascending.
    ///
    /// Used by `baselines::EwmaBaseline::fold_history` to reconstruct EWMA state
    /// without requiring a new SQLite table (ALG-SLP-02).
    pub fn daily_recovery_metrics_all_ordered(&self) -> GooseResult<Vec<DailyRecoveryMetricRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                resting_hr_bpm,
                hrv_rmssd_ms,
                respiratory_rate_rpm,
                oxygen_saturation_percent,
                skin_temperature_delta_c,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json,
                created_at,
                updated_at
            FROM daily_recovery_metrics
            ORDER BY date_key ASC, daily_metric_id ASC
            "#,
        )?;
        let rows = statement.query_map([], daily_recovery_metric_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    /// Idempotent EWMA baseline update: upsert a `daily_recovery_metrics` row for
    /// `date_key` under a BEGIN EXCLUSIVE transaction.
    ///
    /// The guard `WHERE last_applied_date < ?1` is implemented by checking whether
    /// a row with the given `date_key` already has non-NULL hrv/rhr values that match
    /// the supplied values. A second call for the same `date_key` with identical values
    /// is a no-op (returns `skipped = true`).
    ///
    /// Because ALG-SLP-02 requires no new SQLite table, EWMA state is NOT persisted
    /// directly — it is always reconstructed via `fold_history`. The "update" here
    /// simply records the night's raw metric values so they become part of the source
    /// used by subsequent `fold_history` calls.
    ///
    /// Returns `Ok(false)` (skipped) if a row for `date_key` already exists with the
    /// same (hrv, rhr) pair; `Ok(true)` if a new or updated row was written.
    pub fn ewma_baseline_update(
        &self,
        date_key: &str,
        hrv_rmssd: f64,
        rhr_bpm: f64,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("date_key", date_key)?;
        if !hrv_rmssd.is_finite() {
            return Err(GooseError::message(
                "hrv_rmssd must be a finite number (T-24-05)",
            ));
        }
        if !rhr_bpm.is_finite() {
            return Err(GooseError::message(
                "rhr_bpm must be a finite number (T-24-05)",
            ));
        }

        // BEGIN EXCLUSIVE to prevent concurrent double-update on the same date (T-24-04).
        conn.execute_batch("BEGIN EXCLUSIVE TRANSACTION")?;
        let result = Self::ewma_baseline_update_inner(&conn, date_key, hrv_rmssd, rhr_bpm);
        match result {
            Ok(wrote) => {
                conn.execute_batch("COMMIT")?;
                Ok(wrote)
            }
            Err(err) => {
                let _ = conn.execute_batch("ROLLBACK");
                Err(err)
            }
        }
    }

    fn ewma_baseline_update_inner(
        conn: &rusqlite::Connection,
        date_key: &str,
        hrv_rmssd: f64,
        rhr_bpm: f64,
    ) -> GooseResult<bool> {
        // Check if an identical row already exists for this date_key (idempotency guard).
        let existing: Option<(Option<f64>, Option<f64>)> = conn
            .query_row(
                "SELECT hrv_rmssd_ms, resting_hr_bpm FROM daily_recovery_metrics WHERE date_key = ?1 LIMIT 1",
                rusqlite::params![date_key],
                |row| Ok((row.get::<_, Option<f64>>(0)?, row.get::<_, Option<f64>>(1)?)),
            )
            .optional()
            .map_err(GooseError::from)?;

        if let Some((existing_hrv, existing_rhr)) = existing {
            // CR-02 fix: only apply the date guard when both columns are already non-NULL.
            // A NULL row (e.g. from a prior unavailable-status insert) must NOT permanently
            // block the EWMA write — the EWMA values are new data for that date.
            let both_non_null = existing_hrv.is_some() && existing_rhr.is_some();
            if both_non_null {
                // Row exists with real values — idempotency check.
                let hrv_matches = existing_hrv.is_some_and(|v| (v - hrv_rmssd).abs() < 1e-9);
                let rhr_matches = existing_rhr.is_some_and(|v| (v - rhr_bpm).abs() < 1e-9);
                if hrv_matches && rhr_matches {
                    return Ok(false); // identical values — idempotent no-op
                }
                // Date already has real values but they differ — date guard: skip.
                return Ok(false);
            }
            // Row exists but with NULL metrics — fall through and UPDATE the row below.
        }

        // No row for this date_key (or row exists with NULL metrics) — upsert via INSERT OR REPLACE.
        // This handles both the fresh-insert path and the NULL-row-exists path (CR-02 fix).
        let daily_metric_id = format!("ewma-{}", date_key);
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_millis() as i64)
            .unwrap_or(0);

        // Check if a NULL-metrics row already exists that we should update rather than insert.
        // (CR-02 fix: existing NULL rows must not be bypassed by INSERT.)
        let null_row_id: Option<String> = conn
            .query_row(
                "SELECT daily_metric_id FROM daily_recovery_metrics WHERE date_key = ?1 AND (hrv_rmssd_ms IS NULL OR resting_hr_bpm IS NULL) LIMIT 1",
                rusqlite::params![date_key],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(GooseError::from)?;

        if let Some(row_id) = null_row_id {
            // Update the existing NULL row instead of inserting a duplicate.
            conn.execute(
                "UPDATE daily_recovery_metrics SET hrv_rmssd_ms = ?1, resting_hr_bpm = ?2 WHERE daily_metric_id = ?3",
                rusqlite::params![hrv_rmssd, rhr_bpm, row_id],
            )?;
            return Ok(true);
        }

        conn.execute(
            r#"
            INSERT INTO daily_recovery_metrics (
                daily_metric_id,
                date_key,
                timezone,
                start_time_unix_ms,
                end_time_unix_ms,
                hrv_rmssd_ms,
                resting_hr_bpm,
                source_kind,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, 'UTC', ?3, ?3, ?4, ?5, 'local_estimate', 1.0, '{}', '[]', '{}')
            "#,
            rusqlite::params![daily_metric_id, date_key, now_ms, hrv_rmssd, rhr_bpm],
        )?;
        Ok(true)
    }

    pub fn insert_metric_provenance(&self, input: MetricProvenanceInput<'_>) -> GooseResult<bool> {
        validate_metric_provenance_input(self, &input)?;
        if let Some(existing) = self.metric_provenance(input.provenance_id)? {
            let same = existing.metric_scope == input.metric_scope
                && existing.metric_id == input.metric_id
                && existing.source_kind == input.source_kind
                && existing.source_detail == input.source_detail
                && existing.confidence == input.confidence
                && existing.inputs_json == input.inputs_json
                && existing.quality_flags_json == input.quality_flags_json
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "metric provenance {} already exists with different metadata",
                input.provenance_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let changed = conn.execute(
            r#"
            INSERT INTO metric_provenance (
                provenance_id,
                metric_scope,
                metric_id,
                source_kind,
                source_detail,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                input.provenance_id,
                input.metric_scope,
                input.metric_id,
                input.source_kind,
                input.source_detail,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn upsert_metric_provenance(&self, input: MetricProvenanceInput<'_>) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_metric_provenance_input(self, &input)?;
        let changed = conn.execute(
            r#"
            INSERT INTO metric_provenance (
                provenance_id,
                metric_scope,
                metric_id,
                source_kind,
                source_detail,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(provenance_id) DO UPDATE SET
                metric_scope = excluded.metric_scope,
                metric_id = excluded.metric_id,
                source_kind = excluded.source_kind,
                source_detail = excluded.source_detail,
                confidence = excluded.confidence,
                inputs_json = excluded.inputs_json,
                quality_flags_json = excluded.quality_flags_json,
                provenance_json = excluded.provenance_json
            WHERE metric_provenance.metric_scope IS NOT excluded.metric_scope
               OR metric_provenance.metric_id IS NOT excluded.metric_id
               OR metric_provenance.source_kind IS NOT excluded.source_kind
               OR metric_provenance.source_detail IS NOT excluded.source_detail
               OR metric_provenance.confidence IS NOT excluded.confidence
               OR metric_provenance.inputs_json IS NOT excluded.inputs_json
               OR metric_provenance.quality_flags_json IS NOT excluded.quality_flags_json
               OR metric_provenance.provenance_json IS NOT excluded.provenance_json
            "#,
            params![
                input.provenance_id,
                input.metric_scope,
                input.metric_id,
                input.source_kind,
                input.source_detail,
                input.confidence,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn metric_provenance(
        &self,
        provenance_id: &str,
    ) -> GooseResult<Option<MetricProvenanceRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("provenance_id", provenance_id)?;
        conn.query_row(
            r#"
                SELECT
                    provenance_id,
                    metric_scope,
                    metric_id,
                    source_kind,
                    source_detail,
                    confidence,
                    inputs_json,
                    quality_flags_json,
                    provenance_json,
                    created_at
                FROM metric_provenance
                WHERE provenance_id = ?1
                "#,
            params![provenance_id],
            metric_provenance_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn metric_provenance_for_metric(
        &self,
        metric_scope: &str,
        metric_id: &str,
    ) -> GooseResult<Vec<MetricProvenanceRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("metric_scope", metric_scope)?;
        validate_required("metric_id", metric_id)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                provenance_id,
                metric_scope,
                metric_id,
                source_kind,
                source_detail,
                confidence,
                inputs_json,
                quality_flags_json,
                provenance_json,
                created_at
            FROM metric_provenance
            WHERE metric_scope = ?1
              AND metric_id = ?2
            ORDER BY provenance_id
            "#,
        )?;
        let rows =
            statement.query_map(params![metric_scope, metric_id], metric_provenance_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_metric_debug_feature(
        &self,
        input: MetricDebugFeatureInput<'_>,
    ) -> GooseResult<bool> {
        validate_metric_debug_feature_input(&input)?;
        if let Some(existing) = self.metric_debug_feature(input.feature_id)? {
            let same = existing.metric_family == input.metric_family
                && existing.feature_name == input.feature_name
                && existing.start_time_unix_ms == input.start_time_unix_ms
                && existing.end_time_unix_ms == input.end_time_unix_ms
                && existing.source_kind == input.source_kind
                && existing.confidence == input.confidence
                && existing.feature_json == input.feature_json
                && existing.inputs_json == input.inputs_json
                && existing.quality_flags_json == input.quality_flags_json
                && existing.provenance_json == input.provenance_json;
            if same {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "metric debug feature {} already exists with different metadata",
                input.feature_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let changed = conn.execute(
            r#"
            INSERT INTO metric_debug_features (
                feature_id,
                metric_family,
                feature_name,
                start_time_unix_ms,
                end_time_unix_ms,
                source_kind,
                confidence,
                feature_json,
                inputs_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
            "#,
            params![
                input.feature_id,
                input.metric_family,
                input.feature_name,
                input.start_time_unix_ms,
                input.end_time_unix_ms,
                input.source_kind,
                input.confidence,
                input.feature_json,
                input.inputs_json,
                input.quality_flags_json,
                input.provenance_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn metric_debug_feature(
        &self,
        feature_id: &str,
    ) -> GooseResult<Option<MetricDebugFeatureRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("feature_id", feature_id)?;
        conn.query_row(
            r#"
                SELECT
                    feature_id,
                    metric_family,
                    feature_name,
                    start_time_unix_ms,
                    end_time_unix_ms,
                    source_kind,
                    confidence,
                    feature_json,
                    inputs_json,
                    quality_flags_json,
                    provenance_json,
                    created_at
                FROM metric_debug_features
                WHERE feature_id = ?1
                "#,
            params![feature_id],
            metric_debug_feature_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn metric_debug_features_between(
        &self,
        metric_family: &str,
        start_time_unix_ms: i64,
        end_time_unix_ms: i64,
    ) -> GooseResult<Vec<MetricDebugFeatureRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("metric_family", metric_family)?;
        validate_non_negative("start_time_unix_ms", start_time_unix_ms)?;
        validate_non_negative("end_time_unix_ms", end_time_unix_ms)?;
        validate_window_order(start_time_unix_ms, end_time_unix_ms)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                feature_id,
                metric_family,
                feature_name,
                start_time_unix_ms,
                end_time_unix_ms,
                source_kind,
                confidence,
                feature_json,
                inputs_json,
                quality_flags_json,
                provenance_json,
                created_at
            FROM metric_debug_features
            WHERE metric_family = ?1
              AND start_time_unix_ms < ?3
              AND end_time_unix_ms > ?2
            ORDER BY start_time_unix_ms, feature_id
            "#,
        )?;
        let rows = statement.query_map(
            params![metric_family, start_time_unix_ms, end_time_unix_ms],
            metric_debug_feature_from_row,
        )?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn upsert_algorithm_definition(
        &self,
        definition: &AlgorithmDefinitionRecord,
    ) -> GooseResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("algorithm_id", &definition.algorithm_id)?;
        validate_required("version", &definition.version)?;
        validate_required("metric_family", &definition.metric_family)?;
        validate_required("display_name", &definition.display_name)?;
        validate_required("implementation", &definition.implementation)?;
        validate_required("license", &definition.license)?;
        validate_required("input_schema", &definition.input_schema)?;
        validate_required("output_schema", &definition.output_schema)?;
        validate_json(
            "input_requirements_json",
            &definition.input_requirements_json,
        )?;
        validate_json("params_json", &definition.params_json)?;
        validate_json("quality_gates_json", &definition.quality_gates_json)?;
        validate_required("status", &definition.status)?;

        conn.execute(
            r#"
            INSERT INTO algorithm_definitions (
                algorithm_id,
                version,
                metric_family,
                display_name,
                implementation,
                license,
                input_schema,
                output_schema,
                input_requirements_json,
                params_json,
                quality_gates_json,
                status
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
            ON CONFLICT(algorithm_id, version) DO UPDATE SET
                metric_family = excluded.metric_family,
                display_name = excluded.display_name,
                implementation = excluded.implementation,
                license = excluded.license,
                input_schema = excluded.input_schema,
                output_schema = excluded.output_schema,
                input_requirements_json = excluded.input_requirements_json,
                params_json = excluded.params_json,
                quality_gates_json = excluded.quality_gates_json,
                status = excluded.status
            "#,
            params![
                definition.algorithm_id,
                definition.version,
                definition.metric_family,
                definition.display_name,
                definition.implementation,
                definition.license,
                definition.input_schema,
                definition.output_schema,
                definition.input_requirements_json,
                definition.params_json,
                definition.quality_gates_json,
                definition.status,
            ],
        )?;
        Ok(())
    }

    pub fn algorithm_definition(
        &self,
        algorithm_id: &str,
        version: &str,
    ) -> GooseResult<Option<AlgorithmDefinitionRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.query_row(
            r#"
                SELECT
                    algorithm_id,
                    version,
                    metric_family,
                    display_name,
                    implementation,
                    license,
                    input_schema,
                    output_schema,
                    input_requirements_json,
                    params_json,
                    quality_gates_json,
                    status
                FROM algorithm_definitions
                WHERE algorithm_id = ?1 AND version = ?2
                "#,
            params![algorithm_id, version],
            |row| {
                Ok(AlgorithmDefinitionRecord {
                    algorithm_id: row.get(0)?,
                    version: row.get(1)?,
                    metric_family: row.get(2)?,
                    display_name: row.get(3)?,
                    implementation: row.get(4)?,
                    license: row.get(5)?,
                    input_schema: row.get(6)?,
                    output_schema: row.get(7)?,
                    input_requirements_json: row.get(8)?,
                    params_json: row.get(9)?,
                    quality_gates_json: row.get(10)?,
                    status: row.get(11)?,
                })
            },
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn set_algorithm_preference(
        &self,
        preference: &AlgorithmPreferenceRecord,
    ) -> GooseResult<()> {
        validate_required("scope", &preference.scope)?;
        validate_required("metric_family", &preference.metric_family)?;
        validate_required("algorithm_id", &preference.algorithm_id)?;
        validate_required("version", &preference.version)?;

        let Some(definition) =
            self.algorithm_definition(&preference.algorithm_id, &preference.version)?
        else {
            return Err(GooseError::message(format!(
                "algorithm definition {}@{} must exist before it can be selected",
                preference.algorithm_id, preference.version
            )));
        };
        if definition.metric_family != preference.metric_family {
            return Err(GooseError::message(format!(
                "algorithm {}@{} belongs to metric family {}, not {}",
                preference.algorithm_id,
                preference.version,
                definition.metric_family,
                preference.metric_family
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO algorithm_preferences (
                scope,
                metric_family,
                algorithm_id,
                version
            ) VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(scope, metric_family) DO UPDATE SET
                algorithm_id = excluded.algorithm_id,
                version = excluded.version,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            "#,
            params![
                preference.scope,
                preference.metric_family,
                preference.algorithm_id,
                preference.version,
            ],
        )?;
        Ok(())
    }

    pub fn algorithm_preference(
        &self,
        scope: &str,
        metric_family: &str,
    ) -> GooseResult<Option<AlgorithmPreferenceRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("scope", scope)?;
        validate_required("metric_family", metric_family)?;

        conn.query_row(
            r#"
                SELECT scope, metric_family, algorithm_id, version
                FROM algorithm_preferences
                WHERE scope = ?1 AND metric_family = ?2
                "#,
            params![scope, metric_family],
            |row| {
                Ok(AlgorithmPreferenceRecord {
                    scope: row.get(0)?,
                    metric_family: row.get(1)?,
                    algorithm_id: row.get(2)?,
                    version: row.get(3)?,
                })
            },
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn algorithm_preferences(
        &self,
        scope: Option<&str>,
    ) -> GooseResult<Vec<AlgorithmPreferenceRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        if let Some(scope) = scope {
            validate_required("scope", scope)?;
            let mut statement = conn.prepare(
                r#"
                SELECT scope, metric_family, algorithm_id, version
                FROM algorithm_preferences
                WHERE scope = ?1
                ORDER BY metric_family
                "#,
            )?;
            let rows = statement.query_map(params![scope], algorithm_preference_from_row)?;
            return rows
                .collect::<Result<Vec<_>, _>>()
                .map_err(GooseError::from);
        }

        let mut statement = conn.prepare(
            r#"
            SELECT scope, metric_family, algorithm_id, version
            FROM algorithm_preferences
            ORDER BY scope, metric_family
            "#,
        )?;
        let rows = statement.query_map([], algorithm_preference_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_algorithm_run(&self, run: &AlgorithmRunRecord) -> GooseResult<bool> {
        validate_required("run_id", &run.run_id)?;
        validate_required("algorithm_id", &run.algorithm_id)?;
        validate_required("version", &run.version)?;
        validate_required("start_time", &run.start_time)?;
        validate_required("end_time", &run.end_time)?;
        validate_json("output_json", &run.output_json)?;
        validate_json("quality_flags_json", &run.quality_flags_json)?;
        validate_json("provenance_json", &run.provenance_json)?;

        // Scope conn so it's dropped before calling insert_metric_rows_for_algorithm_run
        // (which acquires its own lock — holding conn here would deadlock).
        let changed = {
            let conn = self
                .conn
                .lock()
                .map_err(|_| GooseError::message("store mutex poisoned"))?;
            conn.execute(
                r#"
            INSERT OR IGNORE INTO algorithm_runs (
                run_id,
                algorithm_id,
                version,
                start_time,
                end_time,
                output_json,
                quality_flags_json,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            "#,
                params![
                    run.run_id,
                    run.algorithm_id,
                    run.version,
                    run.start_time,
                    run.end_time,
                    run.output_json,
                    run.quality_flags_json,
                    run.provenance_json,
                ],
            )?
        }; // conn dropped here — insert_metric_rows_for_algorithm_run acquires its own lock
        if changed > 0 {
            self.insert_metric_rows_for_algorithm_run(run)?;
        }
        Ok(changed > 0)
    }

    fn insert_metric_rows_for_algorithm_run(&self, run: &AlgorithmRunRecord) -> GooseResult<()> {
        let definition = self
            .algorithm_definition(&run.algorithm_id, &run.version)?
            .ok_or_else(|| {
                GooseError::message(format!(
                    "missing algorithm definition {} {}",
                    run.algorithm_id, run.version
                ))
            })?;
        let output: Value = serde_json::from_str(&run.output_json).map_err(|error| {
            GooseError::message(format!("output_json is not valid JSON: {error}"))
        })?;
        let Some(output_object) = output.as_object() else {
            return Ok(());
        };

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        for (name, value) in output_object {
            if name == "algorithm_id" || name == "algorithm_version" || name == "components" {
                continue;
            }
            let Some(value) = finite_json_number(value) else {
                continue;
            };
            conn.execute(
                r#"
                INSERT OR IGNORE INTO metric_values (
                    metric_value_id,
                    run_id,
                    metric_family,
                    name,
                    value,
                    unit,
                    start_time,
                    end_time
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
                "#,
                params![
                    format!("{}.{}", run.run_id, name),
                    run.run_id,
                    definition.metric_family,
                    name,
                    value,
                    metric_output_unit(name),
                    run.start_time,
                    run.end_time,
                ],
            )?;
        }

        if let Some(components) = output_object.get("components").and_then(Value::as_array) {
            for (index, component) in components.iter().enumerate() {
                let component_name = component
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("unnamed_component");
                let Some(value) = component.get("value").and_then(finite_json_number) else {
                    continue;
                };
                let unit = component
                    .get("unit")
                    .and_then(Value::as_str)
                    .unwrap_or("raw");
                let contribution_json = serde_json::json!({
                    "score_0_to_100": component.get("score_0_to_100").cloned().unwrap_or(Value::Null),
                    "weight": component.get("weight").cloned().unwrap_or(Value::Null),
                    "contribution": component.get("contribution").cloned().unwrap_or(Value::Null),
                })
                .to_string();
                conn.execute(
                    r#"
                    INSERT OR IGNORE INTO metric_components (
                        metric_component_id,
                        run_id,
                        component_name,
                        value,
                        unit,
                        contribution_json
                    ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
                    "#,
                    params![
                        format!("{}.component.{}.{}", run.run_id, index, component_name),
                        run.run_id,
                        component_name,
                        value,
                        unit,
                        contribution_json,
                    ],
                )?;
            }
        }

        Ok(())
    }

    pub fn algorithm_run(&self, run_id: &str) -> GooseResult<Option<AlgorithmRunRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.query_row(
            r#"
                SELECT
                    run_id,
                    algorithm_id,
                    version,
                    start_time,
                    end_time,
                    output_json,
                    quality_flags_json,
                    provenance_json
                FROM algorithm_runs
                WHERE run_id = ?1
                "#,
            params![run_id],
            |row| {
                Ok(AlgorithmRunRecord {
                    run_id: row.get(0)?,
                    algorithm_id: row.get(1)?,
                    version: row.get(2)?,
                    start_time: row.get(3)?,
                    end_time: row.get(4)?,
                    output_json: row.get(5)?,
                    quality_flags_json: row.get(6)?,
                    provenance_json: row.get(7)?,
                })
            },
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn algorithm_runs_overlapping(
        &self,
        start: &str,
        end: &str,
    ) -> GooseResult<Vec<AlgorithmRunRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("start", start)?;
        validate_required("end", end)?;

        let mut statement = conn.prepare(
            r#"
            SELECT
                run_id,
                algorithm_id,
                version,
                start_time,
                end_time,
                output_json,
                quality_flags_json,
                provenance_json
            FROM algorithm_runs
            WHERE start_time < ?2 AND end_time > ?1
            ORDER BY start_time, run_id
            "#,
        )?;
        let rows = statement.query_map(params![start, end], |row| {
            Ok(AlgorithmRunRecord {
                run_id: row.get(0)?,
                algorithm_id: row.get(1)?,
                version: row.get(2)?,
                start_time: row.get(3)?,
                end_time: row.get(4)?,
                output_json: row.get(5)?,
                quality_flags_json: row.get(6)?,
                provenance_json: row.get(7)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn metric_values_for_run(&self, run_id: &str) -> GooseResult<Vec<MetricValueRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("run_id", run_id)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                metric_value_id,
                run_id,
                metric_family,
                name,
                value,
                unit,
                start_time,
                end_time
            FROM metric_values
            WHERE run_id = ?1
            ORDER BY name
            "#,
        )?;
        let rows = statement.query_map(params![run_id], |row| {
            Ok(MetricValueRecord {
                metric_value_id: row.get(0)?,
                run_id: row.get(1)?,
                metric_family: row.get(2)?,
                name: row.get(3)?,
                value: row.get(4)?,
                unit: row.get(5)?,
                start_time: row.get(6)?,
                end_time: row.get(7)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn metric_components_for_run(
        &self,
        run_id: &str,
    ) -> GooseResult<Vec<MetricComponentRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("run_id", run_id)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                metric_component_id,
                run_id,
                component_name,
                value,
                unit,
                contribution_json
            FROM metric_components
            WHERE run_id = ?1
            ORDER BY metric_component_id
            "#,
        )?;
        let rows = statement.query_map(params![run_id], |row| {
            Ok(MetricComponentRecord {
                metric_component_id: row.get(0)?,
                run_id: row.get(1)?,
                component_name: row.get(2)?,
                value: row.get(3)?,
                unit: row.get(4)?,
                contribution_json: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_calibration_run(&self, run: &CalibrationRunRecord) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("calibration_run_id", &run.calibration_run_id)?;
        validate_required("algorithm_id", &run.algorithm_id)?;
        validate_required("version", &run.version)?;
        validate_required("train_start", &run.times.train_start)?;
        validate_required("train_end", &run.times.train_end)?;
        validate_required("holdout_start", &run.times.holdout_start)?;
        validate_required("holdout_end", &run.times.holdout_end)?;
        validate_json("metrics_json", &run.metrics_json)?;
        validate_json("params_json", &run.params_json)?;

        let changed = conn.execute(
            r#"
            INSERT OR IGNORE INTO calibration_runs (
                calibration_run_id,
                algorithm_id,
                version,
                train_start,
                train_end,
                holdout_start,
                holdout_end,
                metrics_json,
                params_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                run.calibration_run_id,
                run.algorithm_id,
                run.version,
                run.times.train_start,
                run.times.train_end,
                run.times.holdout_start,
                run.times.holdout_end,
                run.metrics_json,
                run.params_json,
            ],
        )?;
        Ok(changed > 0)
    }

    pub fn calibration_run(
        &self,
        calibration_run_id: &str,
    ) -> GooseResult<Option<CalibrationRunRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.query_row(
            r#"
                SELECT
                    calibration_run_id,
                    algorithm_id,
                    version,
                    train_start,
                    train_end,
                    holdout_start,
                    holdout_end,
                    metrics_json,
                    params_json
                FROM calibration_runs
                WHERE calibration_run_id = ?1
                "#,
            params![calibration_run_id],
            |row| {
                Ok(CalibrationRunRecord {
                    calibration_run_id: row.get(0)?,
                    algorithm_id: row.get(1)?,
                    version: row.get(2)?,
                    times: CalibrationRunTimes {
                        train_start: row.get(3)?,
                        train_end: row.get(4)?,
                        holdout_start: row.get(5)?,
                        holdout_end: row.get(6)?,
                    },
                    metrics_json: row.get(7)?,
                    params_json: row.get(8)?,
                })
            },
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn calibration_runs_overlapping(
        &self,
        start: &str,
        end: &str,
    ) -> GooseResult<Vec<CalibrationRunRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("start", start)?;
        validate_required("end", end)?;

        let mut statement = conn.prepare(
            r#"
            SELECT
                calibration_run_id,
                algorithm_id,
                version,
                train_start,
                train_end,
                holdout_start,
                holdout_end,
                metrics_json,
                params_json
            FROM calibration_runs
            WHERE holdout_start < ?2 AND holdout_end > ?1
            ORDER BY holdout_start, calibration_run_id
            "#,
        )?;
        let rows = statement.query_map(params![start, end], |row| {
            Ok(CalibrationRunRecord {
                calibration_run_id: row.get(0)?,
                algorithm_id: row.get(1)?,
                version: row.get(2)?,
                times: CalibrationRunTimes {
                    train_start: row.get(3)?,
                    train_end: row.get(4)?,
                    holdout_start: row.get(5)?,
                    holdout_end: row.get(6)?,
                },
                metrics_json: row.get(7)?,
                params_json: row.get(8)?,
            })
        })?;

        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_calibration_label(&self, input: CalibrationLabelInput<'_>) -> GooseResult<bool> {
        validate_required("label_id", input.label_id)?;
        validate_required("metric_family", input.metric_family)?;
        validate_required("label_source", input.label_source)?;
        validate_required("captured_at", input.captured_at)?;
        validate_required("unit", input.unit)?;
        validate_json_object("provenance_json", input.provenance_json)?;
        if !input.value.is_finite() {
            return Err(GooseError::message("value must be finite"));
        }
        if !is_allowed_calibration_label_source(input.label_source) {
            return Err(GooseError::message(format!(
                "unsupported label_source {}",
                input.label_source
            )));
        }
        let parsed_provenance: serde_json::Value = serde_json::from_str(input.provenance_json)
            .map_err(|error| {
                GooseError::message(format!("provenance_json must be valid JSON: {error}"))
            })?;
        if parsed_provenance == serde_json::json!({}) {
            return Err(GooseError::message("provenance_json must not be empty"));
        }

        if let Some(existing) = self.calibration_label(input.label_id)? {
            let new_row = CalibrationLabelRow {
                label_id: input.label_id.to_string(),
                metric_family: input.metric_family.to_string(),
                label_source: input.label_source.to_string(),
                captured_at: input.captured_at.to_string(),
                value: input.value,
                unit: input.unit.to_string(),
                provenance_json: input.provenance_json.to_string(),
            };
            if existing == new_row {
                return Ok(false);
            }
            return Err(GooseError::message(format!(
                "calibration label {} already exists with different metadata",
                input.label_id
            )));
        }

        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        conn.execute(
            r#"
            INSERT INTO calibration_labels (
                label_id,
                metric_family,
                label_source,
                captured_at,
                value,
                unit,
                provenance_json
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            "#,
            params![
                input.label_id,
                input.metric_family,
                input.label_source,
                input.captured_at,
                input.value,
                input.unit,
                input.provenance_json,
            ],
        )?;
        Ok(true)
    }

    pub fn calibration_label(&self, label_id: &str) -> GooseResult<Option<CalibrationLabelRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("label_id", label_id)?;
        conn.query_row(
            r#"
                SELECT
                    label_id,
                    metric_family,
                    label_source,
                    captured_at,
                    value,
                    unit,
                    provenance_json
                FROM calibration_labels
                WHERE label_id = ?1
                "#,
            params![label_id],
            calibration_label_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn calibration_labels_between(
        &self,
        start: &str,
        end: &str,
    ) -> GooseResult<Vec<CalibrationLabelRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("start", start)?;
        validate_required("end", end)?;
        let mut statement = conn.prepare(
            r#"
            SELECT
                label_id,
                metric_family,
                label_source,
                captured_at,
                value,
                unit,
                provenance_json
            FROM calibration_labels
            WHERE captured_at >= ?1 AND captured_at < ?2
            ORDER BY captured_at, label_id
            "#,
        )?;
        let rows = statement.query_map(params![start, end], calibration_label_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn upsert_command_validation_record(
        &self,
        record: &CommandValidationRecord,
    ) -> GooseResult<()> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("command", &record.command)?;
        validate_required("risk_gate", &record.risk_gate)?;
        validate_command_report_json(record)?;
        conn.execute(
            r#"
            INSERT INTO command_validation_records (
                command,
                risk_gate,
                direct_send_ready,
                report_json
            ) VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(command) DO UPDATE SET
                risk_gate = excluded.risk_gate,
                direct_send_ready = excluded.direct_send_ready,
                report_json = excluded.report_json,
                updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
            "#,
            params![
                record.command,
                record.risk_gate,
                bool_to_i64(record.direct_send_ready),
                record.report_json,
            ],
        )?;
        Ok(())
    }

    pub fn command_validation_record(
        &self,
        command: &str,
    ) -> GooseResult<Option<CommandValidationRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("command", command)?;
        conn.query_row(
            r#"
                SELECT command, risk_gate, direct_send_ready, report_json
                FROM command_validation_records
                WHERE command = ?1
                "#,
            params![command],
            command_validation_record_from_row,
        )
        .optional()
        .map_err(GooseError::from)
    }

    pub fn command_validation_records(&self) -> GooseResult<Vec<CommandValidationRecord>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let mut statement = conn.prepare(
            r#"
            SELECT command, risk_gate, direct_send_ready, report_json
            FROM command_validation_records
            ORDER BY command
            "#,
        )?;
        let rows = statement.query_map([], command_validation_record_from_row)?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_gravity_rows(
        &self,
        device_id: &str,
        rows: &[(f64, f64, f64, f64)],
    ) -> GooseResult<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("device_id", device_id)?;
        if rows.is_empty() {
            return Ok(0);
        }
        let mut inserted = 0usize;
        for &(ts, x, y, z) in rows {
            let changed = conn.execute(
                "INSERT OR IGNORE INTO gravity (device_id, ts, x, y, z) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![device_id, ts, x, y, z],
            )?;
            inserted += changed;
        }
        Ok(inserted)
    }

    pub fn gravity_rows_between(
        &self,
        device_id: &str,
        ts_start: f64,
        ts_end: f64,
    ) -> GooseResult<Vec<GravityRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("device_id", device_id)?;
        if ts_end < ts_start {
            return Err(GooseError::message(
                "ts_end must be greater than or equal to ts_start",
            ));
        }
        let mut statement = conn.prepare(
            "SELECT device_id, ts, x, y, z FROM gravity WHERE device_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts",
        )?;
        let rows = statement.query_map(params![device_id, ts_start, ts_end], |row| {
            Ok(GravityRow {
                device_id: row.get(0)?,
                ts: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
                z: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_gravity2_batch(
        &self,
        device_id: &str,
        rows: &[(f64, f64, f64, f64)],
    ) -> GooseResult<usize> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("device_id", device_id)?;
        if rows.is_empty() {
            return Ok(0);
        }
        let mut inserted = 0usize;
        for &(ts, x, y, z) in rows {
            let changed = conn.execute(
                "INSERT OR IGNORE INTO gravity2_samples (device_id, ts, x, y, z) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![device_id, ts, x, y, z],
            )?;
            inserted += changed;
        }
        Ok(inserted)
    }

    pub fn gravity2_samples_between(
        &self,
        device_id: &str,
        ts_start: f64,
        ts_end: f64,
    ) -> GooseResult<Vec<GravityRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("device_id", device_id)?;
        if ts_end < ts_start {
            return Err(GooseError::message(
                "ts_end must be greater than or equal to ts_start",
            ));
        }
        let mut statement = conn.prepare(
            "SELECT device_id, ts, x, y, z FROM gravity2_samples WHERE device_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts",
        )?;
        let rows = statement.query_map(params![device_id, ts_start, ts_end], |row| {
            Ok(GravityRow {
                device_id: row.get(0)?,
                ts: row.get(1)?,
                x: row.get(2)?,
                y: row.get(3)?,
                z: row.get(4)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    /// Return resp_samples rows in [ts_start, ts_end). Used by the sleep staging
    /// bridge to determine whether resp data is present for a session.
    pub fn resp_samples_between(
        &self,
        device_id: &str,
        ts_start: f64,
        ts_end: f64,
    ) -> GooseResult<Vec<RespSampleRow>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("device_id", device_id)?;
        if ts_end < ts_start {
            return Err(GooseError::message(
                "ts_end must be greater than or equal to ts_start",
            ));
        }
        let mut stmt = conn.prepare(
            "SELECT device_id, ts, raw, contact FROM resp_samples WHERE device_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts",
        )?;
        let rows = stmt.query_map(params![device_id, ts_start, ts_end], |row| {
            Ok(RespSampleRow {
                device_id: row.get(0)?,
                ts: row.get(1)?,
                raw: row.get(2)?,
                contact: row.get(3)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)
    }

    pub fn insert_v24_biometric_batch(
        &self,
        device_id: &str,
        batch: &V24BiometricBatch,
    ) -> GooseResult<()> {
        validate_required("device_id", device_id)?;
        self.immediate_transaction(|conn| {
            for &(ts, red, ir, contact) in &batch.spo2 {
                conn.execute(
                    "INSERT OR IGNORE INTO spo2_samples (device_id, ts, red, ir, contact) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![device_id, ts, red, ir, contact],
                )?;
            }
            for &(ts, raw, contact) in &batch.skin_temp {
                conn.execute(
                    "INSERT OR IGNORE INTO skin_temp_samples (device_id, ts, raw, contact) VALUES (?1, ?2, ?3, ?4)",
                    params![device_id, ts, raw, contact],
                )?;
            }
            for &(ts, raw, contact) in &batch.resp {
                conn.execute(
                    "INSERT OR IGNORE INTO resp_samples (device_id, ts, raw, contact) VALUES (?1, ?2, ?3, ?4)",
                    params![device_id, ts, raw, contact],
                )?;
            }
            for &(ts, quality, contact) in &batch.sig_quality {
                conn.execute(
                    "INSERT OR IGNORE INTO sig_quality_samples (device_id, ts, quality, contact) VALUES (?1, ?2, ?3, ?4)",
                    params![device_id, ts, quality, contact],
                )?;
            }
            Ok(())
        })
    }

    pub fn v24_biometric_samples_between(
        &self,
        device_id: &str,
        ts_start: f64,
        ts_end: f64,
    ) -> GooseResult<V24BiometricWindow> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        validate_required("device_id", device_id)?;
        if ts_end < ts_start {
            return Err(GooseError::message("ts_end must be >= ts_start"));
        }
        let spo2 = {
            let mut stmt = conn.prepare(
                "SELECT device_id, ts, red, ir, contact FROM spo2_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3 ORDER BY ts",
            )?;
            stmt.query_map(params![device_id, ts_start, ts_end], |row| {
                Ok(Spo2SampleRow {
                    device_id: row.get(0)?,
                    ts: row.get(1)?,
                    red: row.get(2)?,
                    ir: row.get(3)?,
                    contact: row.get(4)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };
        let skin_temp = {
            let mut stmt = conn.prepare(
                "SELECT device_id, ts, raw, contact FROM skin_temp_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3 ORDER BY ts",
            )?;
            stmt.query_map(params![device_id, ts_start, ts_end], |row| {
                Ok(SkinTempSampleRow {
                    device_id: row.get(0)?,
                    ts: row.get(1)?,
                    raw: row.get(2)?,
                    contact: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };
        let resp = {
            let mut stmt = conn.prepare(
                "SELECT device_id, ts, raw, contact FROM resp_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3 ORDER BY ts",
            )?;
            stmt.query_map(params![device_id, ts_start, ts_end], |row| {
                Ok(RespSampleRow {
                    device_id: row.get(0)?,
                    ts: row.get(1)?,
                    raw: row.get(2)?,
                    contact: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };
        let sig_quality = {
            let mut stmt = conn.prepare(
                "SELECT device_id, ts, quality, contact FROM sig_quality_samples WHERE device_id=?1 AND ts>=?2 AND ts<?3 ORDER BY ts",
            )?;
            stmt.query_map(params![device_id, ts_start, ts_end], |row| {
                Ok(SigQualitySampleRow {
                    device_id: row.get(0)?,
                    ts: row.get(1)?,
                    quality: row.get(2)?,
                    contact: row.get(3)?,
                })
            })?
            .collect::<Result<Vec<_>, _>>()?
        };
        Ok(V24BiometricWindow {
            spo2,
            skin_temp,
            resp,
            sig_quality,
        })
    }

    pub fn insert_metric_series(
        &self,
        source: &str,
        metric_name: &str,
        date: &str,
        value: f64,
    ) -> GooseResult<bool> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let rows = conn.execute(
            "INSERT OR IGNORE INTO metric_series (source, metric_name, date, value)
             VALUES (?1, ?2, ?3, ?4)",
            params![source, metric_name, date, value],
        )?;
        Ok(rows > 0)
    }

    pub fn query_metric_series_range(
        &self,
        metric_name: &str,
        start_date: &str,
        end_date: &str,
        source: Option<&str>,
    ) -> GooseResult<Vec<serde_json::Value>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let rows: Vec<serde_json::Value> = if let Some(src) = source {
            let mut stmt = conn.prepare(
                "SELECT date, value FROM metric_series \
                 WHERE metric_name = ?1 AND source = ?2 \
                   AND date >= ?3 AND date <= ?4 \
                 ORDER BY date ASC",
            )?;
            stmt.query_map(params![metric_name, src, start_date, end_date], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })?
            .filter_map(|r| {
                r.map_err(|e| eprintln!("[metric_series] row error: {e}"))
                    .ok()
            })
            .map(|(date, value)| serde_json::json!({"date": date, "value": value}))
            .collect()
        } else {
            let mut stmt = conn.prepare(
                "SELECT date, value FROM metric_series \
                 WHERE metric_name = ?1 AND date >= ?2 AND date <= ?3 \
                 ORDER BY date ASC",
            )?;
            stmt.query_map(params![metric_name, start_date, end_date], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, f64>(1)?))
            })?
            .filter_map(|r| {
                r.map_err(|e| eprintln!("[metric_series] row error: {e}"))
                    .ok()
            })
            .map(|(date, value)| serde_json::json!({"date": date, "value": value}))
            .collect()
        };
        Ok(rows)
    }

    // -------------------------------------------------------------------------
    // HealthKit export queries
    // -------------------------------------------------------------------------

    /// Return HR samples in [start_unix_s, end_unix_s) for a device.
    pub fn hr_samples_between(
        &self,
        device_id: &str,
        start_unix_s: f64,
        end_unix_s: f64,
    ) -> GooseResult<Vec<(f64, i64)>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT ts, bpm FROM hr_samples \
             WHERE device_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts",
        )?;
        let rows = stmt
            .query_map(params![device_id, start_unix_s, end_unix_s], |row| {
                Ok((row.get::<_, f64>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<Vec<_>, _>>()
            .map_err(GooseError::from)?;
        Ok(rows)
    }

    /// Return SpO2 samples in [start_unix_s, end_unix_s) for a device,
    /// with inline ratio-of-ratios conversion (110 − 25·(red/ir)).
    /// Samples where the computed value falls outside 70–100 % are omitted.
    pub fn spo2_samples_between(
        &self,
        device_id: &str,
        start_unix_s: f64,
        end_unix_s: f64,
    ) -> GooseResult<Vec<(f64, f64)>> {
        let conn = self
            .conn
            .lock()
            .map_err(|_| GooseError::message("store mutex poisoned"))?;
        let mut stmt = conn.prepare(
            "SELECT ts, red, ir FROM spo2_samples \
             WHERE device_id = ?1 AND ts >= ?2 AND ts < ?3 ORDER BY ts",
        )?;
        let rows: Vec<(f64, f64)> = stmt
            .query_map(params![device_id, start_unix_s, end_unix_s], |row| {
                Ok((
                    row.get::<_, f64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, i64>(2)?,
                ))
            })?
            .filter_map(|r| r.ok())
            .filter_map(|(ts, red, ir)| {
                if ir == 0 {
                    return None;
                }
                let ratio = (red as f64) / (ir as f64);
                let spo2 = 110.0 - 25.0 * ratio;
                if (70.0..=100.0).contains(&spo2) {
                    Some((ts, spo2))
                } else {
                    None
                }
            })
            .collect();
        Ok(rows)
    }
}
