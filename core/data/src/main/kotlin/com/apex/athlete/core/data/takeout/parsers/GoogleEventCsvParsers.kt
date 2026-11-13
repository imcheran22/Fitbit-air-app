package com.apex.athlete.core.data.takeout.parsers

import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.data.takeout.TakeoutClock
import com.apex.athlete.core.data.takeout.TakeoutNumbers
import com.apex.athlete.core.data.takeout.TakeoutTimestamps
import com.apex.athlete.core.domain.SleepStage
import java.io.Reader
import kotlin.math.roundToInt
import kotlin.math.roundToLong

/*
 * The Google-layout files that carry events rather than series: exercises and sleep stages. The
 * reference repos name the files (`UserExercises_YYYY-MM-DD.csv`, `UserSleepStages_YYYY-MM-DD.csv`)
 * and call them event-grain, but none of them documents a column. Everything below is therefore a
 * tolerant guess at the header names, UNVERIFIED-NEEDS-REAL-ARCHIVE: a file whose header has no start
 * column, or no end/duration (exercise), or no stage (sleep), is a schema mismatch, nothing is read
 * from it, and it is not marked imported, so a later version of the engine reads it.
 */

/** One CSV row per workout. Distance is stored only from a column that names its unit; elevation is never stored. */
class GoogleExerciseCsvParser(reader: Reader, private val clock: TakeoutClock) : CsvRowParser(reader) {
    private var startColumn = -1
    private var endColumn = -1
    private var idColumn = -1
    private var nameColumn = -1
    private var caloriesColumn = -1
    private var heartRateColumn = -1
    private var stepsColumn = -1
    private var durationColumn = -1
    private var durationMillisPerUnit = 1.0
    private var distanceColumn = -1
    private var distanceMetresPerUnit = 1.0

    override fun bind(): Boolean {
        startColumn = csv.column("start_time", "start", "start_timestamp", "timestamp")
        endColumn = csv.column("end_time", "end", "end_timestamp")
        for ((alias, millis) in DURATIONS) {
            val i = csv.column(alias)
            if (i >= 0) {
                durationColumn = i
                durationMillisPerUnit = millis
                break
            }
        }
        idColumn = csv.column("exercise_id", "log_id", "id")
        nameColumn = csv.column("exercise_type", "activity_name", "exercise_name", "type", "name")
        caloriesColumn = csv.column("calories", "calories_burned", "kilocalories", "kcal")
        heartRateColumn = csv.column("average_heart_rate", "avg_heart_rate", "average_heart_rate_beats_per_minute")
        stepsColumn = csv.column("steps")
        for ((alias, metres) in DISTANCES) {
            val i = csv.column(alias)
            if (i >= 0) {
                distanceColumn = i
                distanceMetresPerUnit = metres
                break
            }
        }
        return startColumn >= 0 && (endColumn >= 0 || durationColumn >= 0)
    }

    override fun row(out: TakeoutRowBuffer) {
        val startStamp = TakeoutTimestamps.parse(csv.get(startColumn))
        if (startStamp == null) {
            stats.quarantined++
            return
        }
        val start = clock.candidates(startStamp)[0]
        val end = endTime(start)
        if (end == null || end <= start) {
            stats.quarantined++
            return
        }
        val name = csv.get(nameColumn)?.trim()?.take(80)?.takeIf { it.isNotEmpty() } ?: "Workout"
        val id = csv.get(idColumn)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 40 }
        val workout = WorkoutObservation(
            id = "takeout:exercise:" + (id ?: start.toString()),
            startEpochMillis = start,
            endEpochMillis = end,
            zoneOffsetSeconds = clock.offsetSecondsAt(start),
            exerciseType = ExerciseTypes.of(name),
            displayName = name,
            activeDurationMillis = end - start,
            averageHeartRate = positive(heartRateColumn)?.roundToInt(),
            caloriesKcal = positive(caloriesColumn),
            distanceMeters = positive(distanceColumn)?.let { it * distanceMetresPerUnit },
            steps = positive(stepsColumn)?.roundToLong(),
        )
        out.workouts += workout
        stats.rowsEmitted++
        stats.span(start)
        stats.span(end)
    }

    private fun endTime(start: Long): Long? {
        TakeoutTimestamps.parse(csv.get(endColumn))?.let { return clock.toEpochMillisNear(it, start) }
        if (csv.get(endColumn) != null) return null
        val duration = number(durationColumn)?.takeIf { it > 0 } ?: return null
        return start + (duration * durationMillisPerUnit).roundToLong()
    }

    private fun positive(column: Int): Double? = number(column)?.takeIf { it > 0 }

    private companion object {
        val DURATIONS = listOf("duration_seconds" to 1_000.0, "duration_millis" to 1.0, "duration_milliseconds" to 1.0, "duration_minutes" to 60_000.0)
        val DISTANCES = listOf(
            "distance_meters" to 1.0, "distance_millimeters" to 0.001, "distance_centimeters" to 0.01,
            "distance_kilometers" to 1_000.0, "distance_miles" to 1_609.344,
        )
    }
}

/**
 * Sleep as rows of stage intervals (`start_time`, `end_time` or a duration, `stage`; optionally a
 * session id). Rows are grouped into one [SleepObservation] per session: by the id column when the file
 * has one, otherwise by time, a gap of more than an hour between two rows starting a new sleep. Only the
 * current session is held in memory. A row whose stage is not recognised is skipped and counted; the
 * stage name is never guessed. The session's id is `takeout:sleep:<session id>` or, without one, its start
 * instant, so re-reading the same bytes rewrites the same sleep.
 */
class GoogleSleepStagesCsvParser(reader: Reader, private val clock: TakeoutClock) : TakeoutEntryParser {
    override val stats = TakeoutParseStats()
    private val csv = CsvStreamParser(reader)
    private val startColumn = csv.column("start_time", "start", "start_timestamp", "timestamp")
    private val endColumn = csv.column("end_time", "end", "end_timestamp")
    private val stageColumn = csv.column("stage", "sleep_stage", "sleep_stage_type", "level", "type")
    private val idColumn = csv.column("sleep_id", "log_id", "session_id", "sleep_session_id")
    private var durationColumn = -1
    private var durationMillisPerUnit = 1.0
    private var bound = false
    private var done = false

    private var sessionId: String? = null
    private val stages = ArrayList<SleepStageObservation>()

    override fun readInto(out: TakeoutRowBuffer, maxRows: Int): Boolean {
        if (done) return false
        if (!bound) {
            bound = true
            if (csv.header.isEmpty()) {
                done = true
                return false
            }
            for ((alias, millis) in DURATIONS) {
                val i = csv.column(alias)
                if (i >= 0) {
                    durationColumn = i
                    durationMillisPerUnit = millis
                    break
                }
            }
            if (startColumn < 0 || stageColumn < 0 || (endColumn < 0 && durationColumn < 0)) {
                stats.schemaMismatch = true
                done = true
                return false
            }
        }
        var budget = TakeoutParsers.SOURCE_ROWS_PER_CALL
        while (out.size < maxRows && budget-- > 0) {
            if (!csv.next()) {
                flush(out)
                done = true
                return false
            }
            stats.rowsRead++
            if (csv.oversized || csv.unterminatedQuote || !take(out)) stats.quarantined++
        }
        return true
    }

    /** Adds the current row to the session in progress, closing that session first when the row starts another. False when the row is unusable. */
    private fun take(out: TakeoutRowBuffer): Boolean {
        val stage = stageOf(csv.get(stageColumn)) ?: return false
        val startStamp = TakeoutTimestamps.parse(csv.get(startColumn)) ?: return false
        val previousEnd = stages.lastOrNull()?.endEpochMillis
        val start = if (previousEnd != null) clock.toEpochMillisNear(startStamp, previousEnd) else clock.candidates(startStamp)[0]
        val end = endTime(start) ?: return false
        if (end <= start) return false
        val id = csv.get(idColumn)?.trim()?.takeIf { it.isNotEmpty() && it.length <= 40 }
        if (stages.isNotEmpty()) {
            val sameSession = if (idColumn >= 0) id == sessionId else start - previousEnd!! <= SESSION_GAP_MS
            if (!sameSession) flush(out)
            else if (start < previousEnd!! - OVERLAP_SLACK_MS) return false
        }
        if (stages.size >= MAX_STAGES_PER_SESSION) return false
        if (stages.isEmpty()) sessionId = id
        stages += SleepStageObservation(start, end, stage)
        return true
    }

    private fun endTime(start: Long): Long? {
        TakeoutTimestamps.parse(csv.get(endColumn))?.let { return clock.toEpochMillisNear(it, start) }
        if (csv.get(endColumn) != null) return null
        val duration = TakeoutNumbers.parse(csv.get(durationColumn), csv.decimalComma)?.takeIf { it > 0 } ?: return null
        return start + (duration * durationMillisPerUnit).roundToLong()
    }

    private fun flush(out: TakeoutRowBuffer) {
        if (stages.isEmpty()) return
        val start = stages.minOf { it.startEpochMillis }
        val end = stages.maxOf { it.endEpochMillis }
        out.sleeps += SleepObservation(
            id = "takeout:sleep:" + (sessionId ?: start.toString()),
            startEpochMillis = start,
            endEpochMillis = end,
            startZoneOffsetSeconds = clock.offsetSecondsAt(start),
            endZoneOffsetSeconds = clock.offsetSecondsAt(end),
            stages = ArrayList(stages),
        )
        stats.rowsEmitted++
        stats.span(start)
        stats.span(end)
        stages.clear()
        sessionId = null
    }

    private fun stageOf(text: String?): SleepStage? {
        val name = text?.trim()?.lowercase()?.replace(Regex("[^a-z]+"), "_")?.trim('_') ?: return null
        return when {
            name == "awake" || name == "wake" || name == "wake_up" || name.startsWith("awake") -> SleepStage.AWAKE
            name.startsWith("light") -> SleepStage.LIGHT
            name.startsWith("deep") -> SleepStage.DEEP
            name.startsWith("rem") -> SleepStage.REM
            name == "asleep" || name == "sleep" || name.startsWith("asleep") -> SleepStage.ASLEEP
            name == "restless" -> SleepStage.RESTLESS
            else -> null
        }
    }

    private companion object {
        val DURATIONS = listOf("duration_seconds" to 1_000.0, "duration_millis" to 1.0, "duration_milliseconds" to 1.0, "duration_minutes" to 60_000.0)
        const val SESSION_GAP_MS = 60L * 60 * 1000
        const val OVERLAP_SLACK_MS = 60L * 1000
        const val MAX_STAGES_PER_SESSION = 5_000
    }
}
