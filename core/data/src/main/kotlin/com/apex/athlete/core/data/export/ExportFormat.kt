package com.apex.athlete.core.data.export

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * The Apex export file: one JSON document, schema-versioned, written and read as a stream.
 *
 * Layout (top-level object, keys in this order):
 * `format`, `schemaVersion`, `appVersion`, `algorithmVersion`, `exportedAtEpochMillis`, `exportedAt`,
 * `provenanceLegend`, then the arrays `daily`, `heartRateMinutes`, `samples`, `sleepSessions`,
 * `workouts`, then (real store only) the local logging tables of [ExtrasTable] (`behaviourDefs`, `behaviourEntries`,
 * `quickLogs`, `goals`, `foodLogs`, `bloodPressure`, `breatheSessions`, `coachThreads`, `coachMessages`), and last
 * `counts`. Every row carries its `provenance` (the stable storage key of
 * [com.apex.athlete.core.domain.DataProvenance]); that key is also the source of the row.
 *
 * The file holds readings only. No tokens, keys, client ids or settings are ever written.
 * Adding a field is not a version change (readers ignore unknown fields); removing or re-typing one is.
 */
object ExportFormat {
    const val FORMAT = "apex-export"
    const val SCHEMA_VERSION = 1

    const val KEY_FORMAT = "format"
    const val KEY_SCHEMA_VERSION = "schemaVersion"
    const val KEY_APP_VERSION = "appVersion"
    const val KEY_ALGORITHM_VERSION = "algorithmVersion"
    const val KEY_EXPORTED_AT_MILLIS = "exportedAtEpochMillis"
    const val KEY_EXPORTED_AT = "exportedAt"
    const val KEY_LEGEND = "provenanceLegend"
    const val KEY_COUNTS = "counts"

    /** Writer: compact, drops null and default values. */
    val writerJson: Json = Json {
        encodeDefaults = false
        explicitNulls = false
    }

    /** Reader: tolerant. Unknown fields are ignored; a wrong type for a known field fails that row only. */
    val readerJson: Json = Json {
        ignoreUnknownKeys = true
        isLenient = false
        explicitNulls = false
        coerceInputValues = false
    }
}

enum class ExportTable(val jsonKey: String, val csvFile: String) {
    DAILY("daily", "daily_values.csv"),
    HEART_RATE("heartRateMinutes", "heart_rate_minutes.csv"),
    SAMPLES("samples", "samples.csv"),
    SLEEP_SESSIONS("sleepSessions", "sleep_sessions.csv"),
    SLEEP_STAGES("sleepSessions", "sleep_stages.csv"),
    WORKOUTS("workouts", "workouts.csv"),
}

/** One value of a metric for one civil day. [algorithmVersion] is set only for values computed by Apex. */
@Serializable
data class DailyRow(
    val metric: String,
    val epochDay: Long,
    val value: Double,
    val provenance: String,
    val resolutionSeconds: Int? = null,
    val sampleCount: Int? = null,
    val algorithmVersion: Int? = null,
    val updatedAtEpochMillis: Long = 0,
)

/** Heart rate folded into one minute: start of the minute (UTC ms), average, minimum, maximum, sample count. */
@Serializable
data class HeartRateMinuteRow(
    val t: Long,
    val avg: Double,
    val min: Int,
    val max: Int,
    val n: Int,
    val provenance: String,
)

@Serializable
data class SampleRow(
    val metric: String,
    val t: Long,
    val value: Double,
    val provenance: String,
    val endT: Long? = null,
)

@Serializable
data class SleepStageRow(val start: Long, val end: Long, val stage: String)

@Serializable
data class SleepRow(
    val id: String,
    val start: Long,
    val end: Long,
    val startZoneOffsetSeconds: Int,
    val endZoneOffsetSeconds: Int,
    val epochDay: Long,
    val isMainSleep: Boolean,
    val isNap: Boolean,
    val hasStages: Boolean,
    val minutesAsleep: Int,
    val minutesAwake: Int,
    val minutesInBed: Int,
    val minutesToFallAsleep: Int? = null,
    val minutesDeep: Int? = null,
    val minutesRem: Int? = null,
    val minutesLight: Int? = null,
    val wakeBoutsOverThreeMinutes: Int? = null,
    val provenance: String,
    val updatedAtEpochMillis: Long = 0,
    val stages: List<SleepStageRow> = emptyList(),
)

@Serializable
data class WorkoutRow(
    val id: String,
    val start: Long,
    val end: Long,
    val zoneOffsetSeconds: Int,
    val epochDay: Long,
    val exerciseType: String,
    val displayName: String,
    val activeDurationMillis: Long,
    val averageHeartRate: Int? = null,
    val maxHeartRate: Int? = null,
    val caloriesKcal: Double? = null,
    val distanceMeters: Double? = null,
    val steps: Long? = null,
    val elevationGainMeters: Double? = null,
    val activeZoneMinutes: Int? = null,
    val sourceLightZoneMinutes: Double? = null,
    val sourceModerateZoneMinutes: Double? = null,
    val sourceVigorousZoneMinutes: Double? = null,
    val sourcePeakZoneMinutes: Double? = null,
    val hasGps: Boolean = false,
    val derivedTrimp: Double? = null,
    val derivedStrain: Double? = null,
    val perceivedExertion: Int? = null,
    val provenance: String,
    val updatedAtEpochMillis: Long = 0,
)

/** Row counts of an export or of the `counts` object at the end of a file. */
@Serializable
data class ExportCounts(
    val daily: Long = 0,
    val heartRateMinutes: Long = 0,
    val samples: Long = 0,
    val sleepSessions: Long = 0,
    val sleepStages: Long = 0,
    val workouts: Long = 0,
    /** Rows left out because a value was not a finite number. */
    val skipped: Long = 0,
    /** Rows per [ExtrasTable] (key = [ExtrasTable.jsonKey]); empty when the file or store has none of the local logging tables. */
    val extras: Map<String, Long> = emptyMap(),
) {
    /** Rows of the local logging tables (behaviours, quick log, goals, food, blood pressure, breathing, coach chats). */
    val extraRows: Long get() = extras.values.sum()

    val totalRows: Long get() = daily + heartRateMinutes + samples + sleepSessions + workouts
}

/** Thrown when an export or import is asked to work on the Demo store. Demo data never leaves or enters the app. */
class DemoStoreRefusedException : IllegalStateException("Export and import work on real data only, never on Demo mode data.")
