package com.apex.athlete.core.data.export

import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

/**
 * CSV encoding for the export ZIP: RFC 4180 (comma separated, CRLF line ends, quotes doubled), UTF-8,
 * decimals always with '.' whatever the phone's language is, no thousands separators.
 */
object CsvFormat {

    const val EOL = "\r\n"

    /** A cell holding free text. A leading `=`, `+`, `-`, `@`, tab or CR would be run as a formula by a spreadsheet, so it gets a `'` first. */
    fun text(s: String?): String {
        if (s == null) return ""
        val safe = if (s.isNotEmpty() && s[0] in FORMULA_STARTS) "'$s" else s
        return quoteIfNeeded(safe)
    }

    fun quoteIfNeeded(s: String): String {
        val needs = s.any { it == ',' || it == '"' || it == '\n' || it == '\r' } || s.startsWith(" ") || s.endsWith(" ")
        return if (needs) "\"" + s.replace("\"", "\"\"") + "\"" else s
    }

    /** Locale-independent decimal, shortest exact form, never scientific notation. Null and non-finite give an empty cell. */
    fun number(d: Double?): String {
        if (d == null || !d.isFinite()) return ""
        if (d == Math.rint(d) && Math.abs(d) < 1e15) return d.toLong().toString()
        return BigDecimal.valueOf(d).stripTrailingZeros().toPlainString()
    }

    fun number(l: Long?): String = l?.toString() ?: ""
    fun number(i: Int?): String = i?.toString() ?: ""
    fun bool(b: Boolean): String = if (b) "true" else "false"
    fun instant(epochMillis: Long?): String = if (epochMillis == null || epochMillis <= 0) "" else Instant.ofEpochMilli(epochMillis).toString()
    fun date(epochDay: Long): String = try { LocalDate.ofEpochDay(epochDay).toString() } catch (_: Exception) { "" }

    fun line(vararg cells: String): String = cells.joinToString(",") + EOL

    private val FORMULA_STARTS = charArrayOf('=', '+', '-', '@', '\t', '\r')

    val headers: Map<ExportTable, List<String>> = mapOf(
        ExportTable.DAILY to listOf("metric", "date", "epoch_day", "value", "provenance", "resolution_seconds", "sample_count", "algorithm_version", "updated_at_utc"),
        ExportTable.HEART_RATE to listOf("minute_start_utc", "epoch_millis", "avg_bpm", "min_bpm", "max_bpm", "sample_count", "provenance"),
        ExportTable.SAMPLES to listOf("metric", "time_utc", "epoch_millis", "end_epoch_millis", "value", "provenance"),
        ExportTable.SLEEP_SESSIONS to listOf(
            "id", "start_utc", "end_utc", "start_epoch_millis", "end_epoch_millis", "start_zone_offset_seconds", "end_zone_offset_seconds", "date",
            "is_main_sleep", "is_nap", "has_stages", "minutes_asleep", "minutes_awake", "minutes_in_bed", "minutes_to_fall_asleep",
            "minutes_deep", "minutes_rem", "minutes_light", "wake_bouts_over_3_min", "provenance", "updated_at_utc",
        ),
        ExportTable.SLEEP_STAGES to listOf("session_id", "start_utc", "end_utc", "start_epoch_millis", "end_epoch_millis", "stage"),
        ExportTable.WORKOUTS to listOf(
            "id", "start_utc", "end_utc", "start_epoch_millis", "end_epoch_millis", "zone_offset_seconds", "date", "exercise_type", "name",
            "active_duration_millis", "avg_heart_rate", "max_heart_rate", "calories_kcal", "distance_m", "steps", "elevation_gain_m",
            "active_zone_minutes", "source_light_zone_min", "source_moderate_zone_min", "source_vigorous_zone_min", "source_peak_zone_min",
            "has_gps", "derived_trimp", "derived_strain", "perceived_exertion", "provenance", "updated_at_utc",
        ),
    )

    fun headerLine(table: ExportTable): String = headers.getValue(table).joinToString(",") + EOL

    fun row(r: DailyRow) = line(
        text(r.metric), date(r.epochDay), r.epochDay.toString(), number(r.value), text(r.provenance),
        number(r.resolutionSeconds), number(r.sampleCount), number(r.algorithmVersion), instant(r.updatedAtEpochMillis),
    )

    fun row(r: HeartRateMinuteRow) = line(
        instant(r.t), r.t.toString(), number(r.avg), r.min.toString(), r.max.toString(), r.n.toString(), text(r.provenance),
    )

    fun row(r: SampleRow) = line(
        text(r.metric), instant(r.t), r.t.toString(), number(r.endT), number(r.value), text(r.provenance),
    )

    fun row(r: SleepRow) = line(
        text(r.id), instant(r.start), instant(r.end), r.start.toString(), r.end.toString(),
        r.startZoneOffsetSeconds.toString(), r.endZoneOffsetSeconds.toString(), date(r.epochDay),
        bool(r.isMainSleep), bool(r.isNap), bool(r.hasStages), r.minutesAsleep.toString(), r.minutesAwake.toString(), r.minutesInBed.toString(),
        number(r.minutesToFallAsleep), number(r.minutesDeep), number(r.minutesRem), number(r.minutesLight), number(r.wakeBoutsOverThreeMinutes),
        text(r.provenance), instant(r.updatedAtEpochMillis),
    )

    fun stageRow(sessionId: String, s: SleepStageRow) = line(
        text(sessionId), instant(s.start), instant(s.end), s.start.toString(), s.end.toString(), text(s.stage),
    )

    fun row(r: WorkoutRow) = line(
        text(r.id), instant(r.start), instant(r.end), r.start.toString(), r.end.toString(), r.zoneOffsetSeconds.toString(), date(r.epochDay),
        text(r.exerciseType), text(r.displayName), r.activeDurationMillis.toString(), number(r.averageHeartRate), number(r.maxHeartRate),
        number(r.caloriesKcal), number(r.distanceMeters), number(r.steps), number(r.elevationGainMeters), number(r.activeZoneMinutes),
        number(r.sourceLightZoneMinutes), number(r.sourceModerateZoneMinutes), number(r.sourceVigorousZoneMinutes), number(r.sourcePeakZoneMinutes),
        bool(r.hasGps), number(r.derivedTrimp), number(r.derivedStrain), number(r.perceivedExertion), text(r.provenance), instant(r.updatedAtEpochMillis),
    )

    // --- Local logging tables (schema v4). Free text goes through [text] so a spreadsheet cannot run it as a formula. ---

    val extrasHeaders: Map<ExtrasTable, List<String>> = mapOf(
        ExtrasTable.BEHAVIOUR_DEFS to listOf("id", "name", "kind", "icon_key", "sort_order", "archived"),
        ExtrasTable.BEHAVIOUR_ENTRIES to listOf("behaviour_id", "date", "epoch_day", "value", "provenance", "updated_at_utc"),
        ExtrasTable.QUICK_LOGS to listOf("id", "time_utc", "epoch_millis", "kind", "numeric_value", "label", "text", "provenance"),
        ExtrasTable.GOALS to listOf("id", "kind", "target", "enabled", "reminder_enabled", "created_at_utc"),
        ExtrasTable.FOOD_LOGS to listOf(
            "id", "time_utc", "epoch_millis", "meal_kind", "name", "kcal", "protein_g", "carbs_g", "fat_g", "fibre_g", "source", "provenance",
        ),
        ExtrasTable.BLOOD_PRESSURE to listOf("id", "time_utc", "epoch_millis", "systolic_mmhg", "diastolic_mmhg", "pulse_bpm", "source", "provenance"),
        ExtrasTable.BREATHE_SESSIONS to listOf(
            "id", "start_utc", "start_epoch_millis", "planned_seconds", "completed_seconds", "pattern_key", "avg_heart_rate",
        ),
        ExtrasTable.COACH_THREADS to listOf("id", "title", "topic", "created_at_utc", "updated_at_utc"),
        ExtrasTable.COACH_MESSAGES to listOf("id", "thread_id", "role", "time_utc", "epoch_millis", "provenance", "unverified_numerals", "text"),
    )

    fun headerLine(table: ExtrasTable): String = extrasHeaders.getValue(table).joinToString(",") + EOL

    /** Behaviour entries are always self-reported; the column says so in the file. */
    private const val SELF_REPORTED = "user_reported"

    fun extraRow(r: ExtraRow): String = when (r) {
        is BehaviourDefRow -> line(text(r.id), text(r.name), text(r.kind), text(r.iconKey), r.sortOrder.toString(), bool(r.archived))
        is BehaviourEntryRow -> line(
            text(r.behaviourId), date(r.epochDay), r.epochDay.toString(), number(r.value), SELF_REPORTED, instant(r.updatedAtEpochMillis),
        )
        is QuickLogRow -> line(
            text(r.id), instant(r.epochMillis), r.epochMillis.toString(), text(r.kind), number(r.numericValue), text(r.label), text(r.text), SELF_REPORTED,
        )
        is GoalRow -> line(text(r.id), text(r.kind), number(r.target), bool(r.enabled), bool(r.reminderEnabled), instant(r.createdAtEpochMillis))
        is FoodLogRow -> line(
            text(r.id), instant(r.epochMillis), r.epochMillis.toString(), text(r.mealKind), text(r.name), number(r.kcal), number(r.proteinG),
            number(r.carbsG), number(r.fatG), number(r.fibreG), text(r.source), text(r.provenance),
        )
        is BloodPressureRow -> line(
            text(r.id), instant(r.epochMillis), r.epochMillis.toString(), number(r.systolic), number(r.diastolic), number(r.pulse),
            text(r.source), text(r.provenance),
        )
        is BreatheSessionRow -> line(
            text(r.id), instant(r.startMillis), r.startMillis.toString(), r.plannedSeconds.toString(), r.completedSeconds.toString(),
            text(r.patternKey), number(r.avgHeartRate),
        )
        is CoachThreadRow -> line(text(r.id), text(r.title), text(r.topic), instant(r.createdAtEpochMillis), instant(r.updatedAtEpochMillis))
        is CoachMessageRow -> line(
            text(r.id), text(r.threadId), text(r.role), instant(r.createdAtMillis), r.createdAtMillis.toString(), text(r.provenance),
            text(r.unverifiedNumerals), text(r.text),
        )
    }
}
