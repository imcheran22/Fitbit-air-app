package com.apex.athlete.core.data.healthconnect

import com.apex.athlete.core.data.ingest.Plausibility
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Pure conversion from Health Connect intermediate records to Apex observations. No SDK, no I/O.
 *
 * Rules that matter for correctness:
 * - **No double counting.** Health Connect holds the same steps from several apps (band companion,
 *   phone pedometer). Day totals are never summed across data origins: one origin is chosen per
 *   day, the preferred one if present, otherwise the one with the largest total.
 * - **Civil days** use the record's own zone offset; when the writer gave none, the device zone at
 *   that instant (so DST and travel are respected).
 * - **Nightly values** (HRV, SpO2, respiratory rate) are averaged only over the main sleep of the
 *   day, never over the whole day. Readings outside any sleep stay as samples; no daily value is
 *   invented for them.
 * - **Range checks** use the same [Plausibility] the ingestor applies. Implausible readings are
 *   left out of averages, but individual samples and heart-rate points pass through untouched so
 *   the ingestor counts them as rejected.
 * - Unknown sleep stages and exercise types are tolerated, never guessed.
 */
class HealthConnectMapper(
    private val zone: ZoneId = ZoneId.systemDefault(),
    /** Origins (package names) that win when several apps wrote the same day total. */
    private val preferredOrigins: List<String> = DEFAULT_PREFERRED_ORIGINS,
) {

    // --- Time -------------------------------------------------------------------------------------

    /** The writer's offset when it is a valid one, otherwise the device zone's offset at [epochMillis]. */
    fun offsetSeconds(epochMillis: Long, recordOffset: Int?): Int =
        recordOffset?.takeIf { it in -MAX_OFFSET..MAX_OFFSET } ?: zone.rules.getOffset(Instant.ofEpochMilli(epochMillis)).totalSeconds

    fun epochDay(epochMillis: Long, recordOffset: Int?): Long =
        Instant.ofEpochMilli(epochMillis).atOffset(ZoneOffset.ofTotalSeconds(offsetSeconds(epochMillis, recordOffset))).toLocalDate().toEpochDay()

    // --- Heart rate -------------------------------------------------------------------------------

    /** Samples inside [fromMillis, toMillis). Values are not range-checked here (the ingestor counts rejects). */
    fun heartRate(records: List<HcHeartRateRecord>, fromMillis: Long, toMillis: Long): List<HeartRatePoint> {
        val out = ArrayList<HeartRatePoint>()
        for (r in records) for (s in r.samples) {
            if (s.epochMillis < fromMillis || s.epochMillis >= toMillis) continue
            if (s.bpm !in 0..Int.MAX_VALUE.toLong()) continue
            out += HeartRatePoint(s.epochMillis, s.bpm.toInt())
        }
        return out
    }

    // --- Sleep ------------------------------------------------------------------------------------

    fun mapStage(type: Int): SleepStage? = when (type) {
        STAGE_AWAKE, STAGE_AWAKE_IN_BED, STAGE_OUT_OF_BED -> SleepStage.AWAKE
        STAGE_SLEEPING -> SleepStage.ASLEEP
        STAGE_LIGHT -> SleepStage.LIGHT
        STAGE_DEEP -> SleepStage.DEEP
        STAGE_REM -> SleepStage.REM
        else -> null // UNKNOWN (0) and any value a newer platform adds: dropped, not guessed
    }

    fun sleeps(records: List<HcSleepRecord>): List<SleepObservation> =
        records.asSequence()
            .filter { it.endEpochMillis > it.startEpochMillis }
            .distinctBy { sleepId(it) }
            .map { r ->
                val stages = r.stages.asSequence()
                    .mapNotNull { st ->
                        val stage = mapStage(st.type) ?: return@mapNotNull null
                        val s = max(st.startEpochMillis, r.startEpochMillis)
                        val e = min(st.endEpochMillis, r.endEpochMillis)
                        if (e > s) SleepStageObservation(s, e, stage) else null
                    }
                    .sortedBy { it.startEpochMillis }
                    .toList()
                SleepObservation(
                    id = sleepId(r),
                    startEpochMillis = r.startEpochMillis,
                    endEpochMillis = r.endEpochMillis,
                    startZoneOffsetSeconds = offsetSeconds(r.startEpochMillis, r.startOffsetSeconds),
                    endZoneOffsetSeconds = offsetSeconds(r.endEpochMillis, r.endOffsetSeconds),
                    // Health Connect has no nap flag; the ingestor decides from time asleep.
                    isMainSleep = null,
                    isNap = null,
                    stages = stages,
                )
            }
            .toList()

    private fun sleepId(r: HcSleepRecord) =
        if (r.id.isNotBlank()) "hc:sleep:${r.id}" else "hc:sleep:${r.origin}:${r.startEpochMillis}"

    // --- Per-day readings -------------------------------------------------------------------------

    /** The latest reading of each civil day (resting heart rate, VO2 max). Implausible readings are skipped. */
    fun latestPerDay(records: List<HcInstantRecord>, metric: MetricType, fromDay: Long, toDayInclusive: Long): List<DailyObservation> =
        records.asSequence()
            .filter { Plausibility.isPlausible(metric, it.value) }
            .map { epochDay(it.epochMillis, it.offsetSeconds) to it }
            .filter { it.first in fromDay..toDayInclusive }
            .groupBy({ it.first }, { it.second })
            .map { (day, list) -> DailyObservation(metric, day, list.maxBy { it.epochMillis }.value, sampleCount = list.size) }
            .sortedBy { it.epochDay }

    /**
     * Readings grouped by the main sleep of the civil day it ended on. Only sleeps ending inside
     * [fromMillis, toMillis) are considered, so each night belongs to exactly one window.
     * The caller must supply readings covering whole nights (read with a margin around the window).
     */
    fun nightlyValues(
        readings: List<HcInstantRecord>,
        sleeps: List<HcSleepRecord>,
        metric: MetricType,
        fromMillis: Long,
        toMillis: Long,
    ): Map<Long, List<Double>> {
        val main = mainSleepsByDay(sleeps, fromMillis, toMillis)
        val out = java.util.TreeMap<Long, List<Double>>()
        for ((day, s) in main) {
            val values = readings.asSequence()
                .filter { it.epochMillis in s.startEpochMillis..(s.endEpochMillis + NIGHT_END_GRACE_MS) && Plausibility.isPlausible(metric, it.value) }
                .map { it.value }
                .toList()
            if (values.isNotEmpty()) out[day] = values
        }
        return out
    }

    private fun mainSleepsByDay(sleeps: List<HcSleepRecord>, fromMillis: Long, toMillis: Long): Map<Long, HcSleepRecord> =
        sleeps.asSequence()
            .filter { it.endEpochMillis > it.startEpochMillis && it.endEpochMillis in fromMillis until toMillis }
            .groupBy { epochDay(it.endEpochMillis, it.endOffsetSeconds) }
            .mapValues { (_, list) -> list.maxBy { it.endEpochMillis - it.startEpochMillis } }

    fun nightlyMean(
        readings: List<HcInstantRecord>,
        sleeps: List<HcSleepRecord>,
        metric: MetricType,
        fromMillis: Long,
        toMillis: Long,
    ): List<DailyObservation> =
        nightlyValues(readings, sleeps, metric, fromMillis, toMillis).map { (day, v) ->
            DailyObservation(metric, day, v.average(), sampleCount = v.size)
        }

    /** SpO2 per night: mean, lowest and highest reading. */
    fun nightlySpo2(readings: List<HcInstantRecord>, sleeps: List<HcSleepRecord>, fromMillis: Long, toMillis: Long): List<DailyObservation> =
        nightlyValues(readings, sleeps, MetricType.SPO2_AVG, fromMillis, toMillis).flatMap { (day, v) ->
            listOf(
                DailyObservation(MetricType.SPO2_AVG, day, v.average(), sampleCount = v.size),
                DailyObservation(MetricType.SPO2_LOWER_BOUND, day, v.min(), sampleCount = v.size),
                DailyObservation(MetricType.SPO2_UPPER_BOUND, day, v.max(), sampleCount = v.size),
            )
        }

    /** Timestamped readings inside the window, passed through unfiltered. */
    fun samples(readings: List<HcInstantRecord>, metric: MetricType, fromMillis: Long, toMillis: Long): List<SampleObservation> =
        readings.asSequence()
            .filter { it.epochMillis in fromMillis until toMillis }
            .map { SampleObservation(metric, it.epochMillis, it.value) }
            .toList()

    /**
     * Skin temperature: nightly mean delta against the device baseline, attributed to the civil day
     * the record ended on. The absolute value is only produced when the record carries a baseline.
     */
    fun skinTemperature(records: List<HcSkinTempRecord>, fromMillis: Long, toMillis: Long): List<DailyObservation> {
        val byDay = records
            .filter { it.endEpochMillis in fromMillis until toMillis && it.deltasCelsius.isNotEmpty() }
            .groupBy { epochDay(it.endEpochMillis, it.endOffsetSeconds) }
        val out = ArrayList<DailyObservation>()
        for ((day, list) in byDay.toSortedMap()) {
            val r = list.maxBy { it.endEpochMillis }
            val deltas = r.deltasCelsius.map { it.value }.filter { Plausibility.isPlausible(MetricType.SKIN_TEMP_DEVIATION, it) }
            if (deltas.isEmpty()) continue
            val mean = deltas.average()
            out += DailyObservation(MetricType.SKIN_TEMP_DEVIATION, day, mean, sampleCount = deltas.size)
            r.baselineCelsius?.let { b ->
                if (Plausibility.isPlausible(MetricType.SKIN_TEMP_NIGHTLY, b + mean)) {
                    out += DailyObservation(MetricType.SKIN_TEMP_NIGHTLY, day, b + mean, sampleCount = deltas.size)
                }
            }
        }
        return out
    }

    // --- Day totals -------------------------------------------------------------------------------

    /**
     * Day totals (steps, calories, floors) per civil day in [fromDay]..[toDayInclusive]. A record
     * belongs to the civil day of its start. Totals are never added across origins.
     */
    fun dailyTotals(records: List<HcIntervalRecord>, metric: MetricType, fromDay: Long, toDayInclusive: Long): List<DailyObservation> {
        val byDay = records.asSequence()
            .filter { it.value.isFinite() && it.value > 0.0 && it.endEpochMillis >= it.startEpochMillis }
            .groupBy { epochDay(it.startEpochMillis, it.startOffsetSeconds) }
            .filterKeys { it in fromDay..toDayInclusive }
        val out = ArrayList<DailyObservation>()
        for ((day, list) in byDay.toSortedMap()) {
            val perOrigin = list.groupBy { it.origin }
            val chosen = chooseOrigin(perOrigin.mapValues { (_, v) -> v.sumOf { it.value } }) ?: continue
            val rows = perOrigin.getValue(chosen)
            val total = rows.sumOf { it.value }
            if (total > 0.0) out += DailyObservation(metric, day, total, sampleCount = rows.size)
        }
        return out
    }

    private fun chooseOrigin(totals: Map<String, Double>): String? {
        if (totals.isEmpty()) return null
        preferredOrigins.firstOrNull { it in totals }?.let { return it }
        return totals.entries.sortedWith(compareByDescending<Map.Entry<String, Double>> { it.value }.thenBy { it.key }).first().key
    }

    // --- Workouts ---------------------------------------------------------------------------------

    /**
     * An exercise session with its heart rate, energy, distance and steps. Supporting records are
     * used only when written by the same app as the session (so two apps' copies are never
     * combined), and interval totals that straddle the session are pro-rated by overlap.
     */
    fun workout(
        session: HcExerciseRecord,
        heartRate: List<HcHeartRateRecord>,
        calories: List<HcIntervalRecord>,
        distance: List<HcIntervalRecord>,
        steps: List<HcIntervalRecord>,
    ): WorkoutObservation? {
        if (session.endEpochMillis <= session.startEpochMillis) return null
        val bpm = heartRate.asSequence().filter { it.origin == session.origin }.flatMap { it.samples.asSequence() }
            .filter { it.epochMillis in session.startEpochMillis..session.endEpochMillis && it.bpm in MIN_BPM..MAX_BPM }
            .map { it.bpm }.toList()
        val id = if (session.id.isNotBlank()) "hc:exercise:${session.id}" else "hc:exercise:${session.origin}:${session.startEpochMillis}"
        return WorkoutObservation(
            id = id,
            startEpochMillis = session.startEpochMillis,
            endEpochMillis = session.endEpochMillis,
            zoneOffsetSeconds = offsetSeconds(session.startEpochMillis, session.startOffsetSeconds),
            exerciseType = session.type,
            displayName = session.title?.trim()?.takeIf { it.isNotEmpty() } ?: friendlyName(session.type),
            activeDurationMillis = session.endEpochMillis - session.startEpochMillis,
            averageHeartRate = if (bpm.isEmpty()) null else bpm.average().roundToInt(),
            maxHeartRate = bpm.maxOrNull()?.toInt(),
            caloriesKcal = proratedTotal(calories, session),
            distanceMeters = proratedTotal(distance, session),
            steps = proratedTotal(steps, session)?.roundToInt()?.toLong(),
        )
    }

    private fun proratedTotal(records: List<HcIntervalRecord>, s: HcExerciseRecord): Double? {
        var sum = 0.0
        var any = false
        for (r in records) {
            if (r.origin != s.origin || !r.value.isFinite() || r.value < 0.0) continue
            val len = r.endEpochMillis - r.startEpochMillis
            val overlap = min(r.endEpochMillis, s.endEpochMillis) - max(r.startEpochMillis, s.startEpochMillis)
            if (overlap <= 0 || len <= 0) continue
            sum += r.value * (overlap.toDouble() / len)
            any = true
        }
        return if (any) sum else null
    }

    private fun friendlyName(type: String): String =
        type.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }

    companion object {
        /**
         * UNVERIFIED-NEEDS-REAL-BAND: the package the Fitbit/Google companion writes with. Only a
         * tie-break; when absent the origin with the largest total wins.
         */
        val DEFAULT_PREFERRED_ORIGINS = listOf("com.fitbit.FitbitMobile")

        // SleepSessionRecord.STAGE_TYPE_* platform values.
        const val STAGE_UNKNOWN = 0
        const val STAGE_AWAKE = 1
        const val STAGE_SLEEPING = 2
        const val STAGE_OUT_OF_BED = 3
        const val STAGE_LIGHT = 4
        const val STAGE_DEEP = 5
        const val STAGE_REM = 6
        const val STAGE_AWAKE_IN_BED = 7

        private const val MAX_OFFSET = 18 * 3600

        /**
         * Fitbit stamps its one nightly HRV (and possibly SpO2 / respiratory rate) value at or up to about two
         * minutes after the sleep ends (Pulse `health/sync.ts`, IMPORT_VERSION 9). UNVERIFIED-NEEDS-REAL-BAND.
         */
        const val NIGHT_END_GRACE_MS = 2 * 60_000L
        private const val MIN_BPM = 25L
        private const val MAX_BPM = 240L
    }
}
