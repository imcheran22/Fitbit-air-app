package com.apex.athlete.core.data.googlehealth

import com.apex.athlete.core.data.ingest.Plausibility
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.network.googlehealth.DataPoint
import com.apex.athlete.core.network.googlehealth.GhDate
import com.apex.athlete.core.network.googlehealth.GhInterval
import com.apex.athlete.core.network.googlehealth.GhSampleTime
import com.apex.athlete.core.network.googlehealth.GoogleHealthDataType
import com.apex.athlete.core.network.googlehealth.GoogleTime
import java.time.DateTimeException
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/**
 * Result of mapping a list of data points. Counts only, never values.
 *
 * - [malformed]: the point had the expected field but it could not be used (missing time, bad date,
 *   non-numeric value); the point is dropped and counted.
 * - [implausible]: a value outside the ingestor's [Plausibility] limits; dropped and counted.
 * - [ignored]: the point carried none of the fields this data type maps (a type the app does not
 *   read, or a future one); dropped silently.
 */
data class GhMapped<T>(
    val items: List<T>,
    val malformed: Int = 0,
    val implausible: Int = 0,
    val ignored: Int = 0,
) {
    operator fun plus(o: GhMapped<T>) =
        GhMapped(items + o.items, malformed + o.malformed, implausible + o.implausible, ignored + o.ignored)
}

/** Weight and body-fat samples split by how they were recorded, so a typed-in value is never labelled as measured. */
data class GhBodySamples(
    val measured: List<SampleObservation>,
    val manual: List<SampleObservation>,
    val malformed: Int,
    val implausible: Int,
    val ignored: Int,
)

/**
 * Pure conversion from Google Health API v4 data points (tolerant DTOs from `:core:network`) to Apex
 * observations. No I/O, no Android. Conventions (see `docs/API_MAPPING.md`):
 *
 * - **Units:** distance mm -> m, weight g -> kg, everything else is already in Apex's unit
 *   (bpm, ms, %, brpm, deg C, kcal, ml/kg/min, minutes).
 * - **Instants** are UTC epoch milliseconds from RFC 3339 strings. **Civil days** use the offset the
 *   record carries (`utcOffset`, `startUtcOffset`); when it is absent the [zone] rules at that instant
 *   decide, so DST and travel are respected. Daily summary types carry a calendar `date` and are used as is.
 * - **Day totals** (steps, distance, floors, energy, active-zone/active minutes, sedentary) are summed
 *   per civil day of the interval start, after removing duplicate points (same resource name, or
 *   same interval and value when unnamed), because a page boundary or a re-read can deliver a point twice.
 *   A total is only emitted when it is greater than zero.
 * - **Sleep** keeps the session and its stages; no daily sleep metric is derived here (the ingestor and
 *   pipeline derive those from the session, so a night is never counted twice).
 * - Unknown enum values (stage types, activity levels, exercise types) never fail a record: unknown
 *   stages are dropped, unknown exercise types are kept as raw text.
 * - Range checks use the ingestor's own [Plausibility]; a violation is counted, not thrown.
 */
class GoogleHealthMapper(private val zone: ZoneId = ZoneId.systemDefault()) {

    // --- Time --------------------------------------------------------------------------------------

    private fun validOffset(seconds: Int?): Int? = seconds?.takeIf { it in -MAX_OFFSET..MAX_OFFSET }

    /** The record's own offset when valid, otherwise the device zone's offset at [epochMillis]. */
    internal fun offsetSeconds(epochMillis: Long, recordOffset: String?): Int =
        validOffset(GoogleTime.offsetSeconds(recordOffset)) ?: zone.rules.getOffset(Instant.ofEpochMilli(epochMillis)).totalSeconds

    internal fun epochDay(epochMillis: Long, offsetSeconds: Int): Long =
        Instant.ofEpochMilli(epochMillis).atOffset(ZoneOffset.ofTotalSeconds(offsetSeconds)).toLocalDate().toEpochDay()

    private fun dateToEpochDay(date: GhDate?): Long? {
        val y = date?.year ?: return null
        val m = date.month ?: return null
        val d = date.day ?: return null
        return try {
            LocalDate.of(y, m, d).toEpochDay()
        } catch (_: DateTimeException) {
            null
        }
    }

    private fun instant(time: String?): Long? = GoogleTime.parseInstant(time)?.toEpochMilli()

    private fun sampleInstant(t: GhSampleTime?): Long? = instant(t?.physicalTime)?.takeIf { it > 0 }

    // --- Heart rate --------------------------------------------------------------------------------

    /**
     * Samples inside [fromMillis, toMillis). Values outside the heart-rate limits are dropped and
     * counted. [seen] (optional) removes a second sample at an instant already delivered, across calls.
     */
    fun heartRate(points: List<DataPoint>, fromMillis: Long, toMillis: Long, seen: MutableSet<Long>? = null): GhMapped<HeartRatePoint> {
        val out = ArrayList<HeartRatePoint>(points.size)
        var malformed = 0
        var implausible = 0
        var ignored = 0
        for (p in points) {
            val hr = p.heartRate
            if (hr == null) {
                ignored++
                continue
            }
            val t = sampleInstant(hr.sampleTime)
            val bpm = hr.beatsPerMinute
            if (t == null || bpm == null || bpm !in 0..Int.MAX_VALUE.toLong()) {
                malformed++
                continue
            }
            if (t < fromMillis || t >= toMillis) continue
            if (!Plausibility.isPlausible(MetricType.HEART_RATE_AVG, bpm.toDouble())) {
                implausible++
                continue
            }
            if (seen != null && !seen.add(t)) continue
            out += HeartRatePoint(t, bpm.toInt())
        }
        return GhMapped(out, malformed, implausible, ignored)
    }

    // --- Daily summaries (one point per civil date) ------------------------------------------------

    /** Daily summary types: [GoogleHealthDataType.DAILY_RESTING_HEART_RATE] and its siblings. Other types are ignored. */
    fun daily(type: GoogleHealthDataType, points: List<DataPoint>): GhMapped<DailyObservation> {
        val out = ArrayList<DailyObservation>()
        var malformed = 0
        var implausible = 0
        var ignored = 0

        fun add(metric: MetricType, day: Long, value: Double?) {
            if (value == null) return
            if (!Plausibility.isPlausible(metric, value)) {
                implausible++
                return
            }
            out += DailyObservation(metric, day, value)
        }

        for (p in points) {
            when (type) {
                GoogleHealthDataType.DAILY_RESTING_HEART_RATE -> {
                    val d = p.dailyRestingHeartRate
                    if (d == null) { ignored++; continue }
                    val day = dateToEpochDay(d.date)
                    if (day == null || d.beatsPerMinute == null) { malformed++; continue }
                    add(MetricType.RESTING_HEART_RATE, day, d.beatsPerMinute!!.toDouble())
                }
                GoogleHealthDataType.DAILY_HEART_RATE_VARIABILITY -> {
                    val d = p.dailyHeartRateVariability
                    if (d == null) { ignored++; continue }
                    val day = dateToEpochDay(d.date)
                    if (day == null) { malformed++; continue }
                    add(MetricType.HRV_RMSSD, day, d.averageHeartRateVariabilityMilliseconds)
                    add(MetricType.HRV_DEEP_SLEEP_RMSSD, day, d.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds)
                    // Fitbit's own sleeping heart rate (mean non-REM HR of the night): observed, so it
                    // outranks the value the pipeline derives from heart-rate minutes.
                    add(MetricType.SLEEPING_HEART_RATE, day, d.nonRemHeartRateBeatsPerMinute?.toDouble())
                }
                GoogleHealthDataType.DAILY_OXYGEN_SATURATION -> {
                    val d = p.dailyOxygenSaturation
                    if (d == null) { ignored++; continue }
                    val day = dateToEpochDay(d.date)
                    if (day == null) { malformed++; continue }
                    add(MetricType.SPO2_AVG, day, d.averagePercentage)
                    add(MetricType.SPO2_LOWER_BOUND, day, d.lowerBoundPercentage)
                    add(MetricType.SPO2_UPPER_BOUND, day, d.upperBoundPercentage)
                }
                GoogleHealthDataType.DAILY_RESPIRATORY_RATE -> {
                    val d = p.dailyRespiratoryRate
                    if (d == null) { ignored++; continue }
                    val day = dateToEpochDay(d.date)
                    if (day == null || d.breathsPerMinute == null) { malformed++; continue }
                    add(MetricType.RESPIRATORY_RATE, day, d.breathsPerMinute)
                }
                GoogleHealthDataType.DAILY_SLEEP_TEMPERATURE_DERIVATIONS -> {
                    val d = p.dailySleepTemperatureDerivations
                    if (d == null) { ignored++; continue }
                    val day = dateToEpochDay(d.date)
                    if (day == null) { malformed++; continue }
                    val night = d.nightlyTemperatureCelsius
                    val base = d.baselineTemperatureCelsius
                    add(MetricType.SKIN_TEMP_NIGHTLY, day, night)
                    // The deviation is computed only when both inputs exist; a missing baseline stays missing.
                    if (night != null && base != null && night.isFinite() && base.isFinite()) {
                        add(MetricType.SKIN_TEMP_DEVIATION, day, night - base)
                    }
                }
                GoogleHealthDataType.DAILY_VO2_MAX -> {
                    val d = p.dailyVo2Max
                    if (d == null) { ignored++; continue }
                    val day = dateToEpochDay(d.date)
                    if (day == null || d.vo2Max == null) { malformed++; continue }
                    add(MetricType.VO2_MAX, day, d.vo2Max)
                }
                else -> ignored++
            }
        }
        return GhMapped(out, malformed, implausible, ignored)
    }

    /** Daily VO2 max split by the API's `estimated` flag, so a modelled value is never labelled as measured. */
    data class GhVo2Split(val measured: List<DailyObservation>, val estimated: List<DailyObservation>, val malformed: Int, val implausible: Int, val ignored: Int)

    /**
     * `daily-vo2-max` points. Rows with `estimated == true` go to [GhVo2Split.estimated] (the caller labels
     * them [com.apex.athlete.core.domain.DataProvenance.ESTIMATED]); `false` and absent stay measured.
     * [daily] with the same type returns both kinds together and is kept for callers that do not label.
     */
    fun dailyVo2Max(points: List<DataPoint>): GhVo2Split {
        val measured = ArrayList<DailyObservation>()
        val estimated = ArrayList<DailyObservation>()
        var malformed = 0
        var implausible = 0
        var ignored = 0
        for (p in points) {
            val d = p.dailyVo2Max
            if (d == null) { ignored++; continue }
            val day = dateToEpochDay(d.date)
            val v = d.vo2Max
            if (day == null || v == null) { malformed++; continue }
            if (!Plausibility.isPlausible(MetricType.VO2_MAX, v)) { implausible++; continue }
            (if (d.estimated == true) estimated else measured) += DailyObservation(MetricType.VO2_MAX, day, v)
        }
        return GhVo2Split(measured, estimated, malformed, implausible, ignored)
    }

    // --- Heart-rate variability inside sleep stages -------------------------------------------------

    /**
     * The night's HRV from `heart-rate-variability` samples, as one [MetricType.HRV_SLEEP_SAMPLES] value
     * on the civil day the sleep ended: the mean RMSSD of the samples that lie inside a stage segment
     * where the person was asleep ([SleepStage.isAsleep]; AWAKE and RESTLESS are excluded).
     *
     * Needs the night's stages, so it is called with the already mapped [sleep] (see
     * `GoogleHealthApiSource` stream `hrv-sleep`). A night without stages produces nothing, because
     * without them awake samples cannot be excluded; nothing is guessed. Never writes [MetricType.HRV_RMSSD].
     * Samples are de-duplicated by instant; implausible values are counted and dropped.
     */
    fun hrvDuringSleep(sleep: SleepObservation, points: List<DataPoint>): GhMapped<DailyObservation> {
        val asleep = sleep.stages.filter { it.stage.isAsleep }
        val seen = HashSet<Long>()
        val values = ArrayList<Double>()
        var malformed = 0
        var implausible = 0
        var ignored = 0
        for (p in points) {
            val h = p.heartRateVariability
            if (h == null) { ignored++; continue }
            val t = sampleInstant(h.sampleTime)
            val v = h.rootMeanSquareOfSuccessiveDifferencesMilliseconds
            if (t == null || v == null) { malformed++; continue }
            if (t < sleep.startEpochMillis || t >= sleep.endEpochMillis) continue
            if (asleep.none { t >= it.startEpochMillis && t < it.endEpochMillis }) continue
            if (!Plausibility.isPlausible(MetricType.HRV_SLEEP_SAMPLES, v)) { implausible++; continue }
            if (!seen.add(t)) continue
            values += v
        }
        if (values.isEmpty()) return GhMapped(emptyList(), malformed, implausible, ignored)
        val day = epochDay(sleep.endEpochMillis, sleep.endZoneOffsetSeconds)
        return GhMapped(listOf(DailyObservation(MetricType.HRV_SLEEP_SAMPLES, day, values.average(), sampleCount = values.size)), malformed, implausible, ignored)
    }

    // --- Timestamped samples -----------------------------------------------------------------------

    /**
     * Sample types that map to a [SampleObservation]: `heart-rate-variability` (RMSSD ms),
     * `oxygen-saturation` (%), `vo2-max`. `run-vo2-max` is deliberately not mapped (a different
     * estimate; mixing it into VO2_MAX would bend the trend). Weight and body fat: see [body].
     */
    fun samples(type: GoogleHealthDataType, points: List<DataPoint>, fromMillis: Long, toMillis: Long): GhMapped<SampleObservation> {
        val out = ArrayList<SampleObservation>()
        var malformed = 0
        var implausible = 0
        var ignored = 0
        for (p in points) {
            val row = when (type) {
                GoogleHealthDataType.HEART_RATE_VARIABILITY -> p.heartRateVariability?.let {
                    Triple(it.sampleTime, MetricType.HRV_RMSSD, it.rootMeanSquareOfSuccessiveDifferencesMilliseconds)
                }
                GoogleHealthDataType.OXYGEN_SATURATION -> p.oxygenSaturation?.let { Triple(it.sampleTime, MetricType.SPO2_AVG, it.percentage) }
                GoogleHealthDataType.VO2_MAX -> p.vo2Max?.let { Triple(it.sampleTime, MetricType.VO2_MAX, it.vo2Max) }
                else -> null
            }
            if (row == null) { ignored++; continue }
            val (time, metric, value) = row
            val t = sampleInstant(time)
            if (t == null || value == null) { malformed++; continue }
            if (t < fromMillis || t >= toMillis) continue
            if (!Plausibility.isPlausible(metric, value)) { implausible++; continue }
            out += SampleObservation(metric, t, value)
        }
        return GhMapped(out, malformed, implausible, ignored)
    }

    /** `weight` (grams to kg) and `body-fat` (%). A manually logged value is returned separately. */
    fun body(type: GoogleHealthDataType, points: List<DataPoint>, fromMillis: Long, toMillis: Long): GhBodySamples {
        val measured = ArrayList<SampleObservation>()
        val manual = ArrayList<SampleObservation>()
        var malformed = 0
        var implausible = 0
        var ignored = 0
        for (p in points) {
            val row = when (type) {
                GoogleHealthDataType.WEIGHT -> p.weight?.let { Triple(it.sampleTime, MetricType.WEIGHT, it.weightGrams?.let { g -> g / 1000.0 }) }
                GoogleHealthDataType.BODY_FAT -> p.bodyFat?.let { Triple(it.sampleTime, MetricType.BODY_FAT, it.percentage) }
                else -> null
            }
            if (row == null) { ignored++; continue }
            val (time, metric, value) = row
            val t = sampleInstant(time)
            if (t == null || value == null) { malformed++; continue }
            if (t < fromMillis || t >= toMillis) continue
            if (!Plausibility.isPlausible(metric, value)) { implausible++; continue }
            val obs = SampleObservation(metric, t, value)
            if (p.dataSource?.recordingMethod == "MANUAL") manual += obs else measured += obs
        }
        return GhBodySamples(measured, manual, malformed, implausible, ignored)
    }

    // --- Interval day totals -----------------------------------------------------------------------

    private class Entry(val metric: MetricType, val day: Long, val value: Double)

    private class Collected(val entries: List<Entry>, val malformed: Int, val ignored: Int)

    private fun intervalKey(p: DataPoint, iv: GhInterval?, extra: String): String =
        p.resourceName ?: "${iv?.startTime}|${iv?.endTime}|$extra"

    /** Unique interval points of [type] as (metric, civil day, value) entries. */
    private fun collect(type: GoogleHealthDataType, points: List<DataPoint>): Collected {
        val entries = ArrayList<Entry>(points.size)
        val seen = HashSet<String>()
        var malformed = 0
        var ignored = 0
        for (p in points) {
            val iv: GhInterval?
            val extra: String
            val values: List<Pair<MetricType, Double?>>
            when (type) {
                GoogleHealthDataType.STEPS -> {
                    val d = p.steps
                    if (d == null) { ignored++; continue }
                    iv = d.interval; extra = "${d.count}"
                    values = listOf(MetricType.STEPS to d.count?.toDouble())
                }
                GoogleHealthDataType.DISTANCE -> {
                    val d = p.distance
                    if (d == null) { ignored++; continue }
                    iv = d.interval; extra = "${d.millimeters}"
                    values = listOf(MetricType.DISTANCE to d.millimeters?.let { it / 1000.0 })
                }
                GoogleHealthDataType.FLOORS -> {
                    val d = p.floors
                    if (d == null) { ignored++; continue }
                    iv = d.interval; extra = "${d.count}"
                    values = listOf(MetricType.FLOORS to d.count?.toDouble())
                }
                GoogleHealthDataType.ACTIVE_ENERGY_BURNED -> {
                    val d = p.activeEnergyBurned
                    if (d == null) { ignored++; continue }
                    iv = d.interval; extra = "${d.kcal}"
                    values = listOf(MetricType.CALORIES_ACTIVE to d.kcal)
                }
                GoogleHealthDataType.BASAL_ENERGY_BURNED -> {
                    val d = p.basalEnergyBurned
                    if (d == null) { ignored++; continue }
                    iv = d.interval; extra = "${d.kcal}"
                    // Placeholder metric: basal is only ever combined into the total by [calories].
                    values = listOf(MetricType.CALORIES_TOTAL to d.kcal)
                }
                GoogleHealthDataType.ACTIVE_ZONE_MINUTES -> {
                    val d = p.activeZoneMinutes
                    if (d == null) { ignored++; continue }
                    iv = d.interval; extra = "${d.heartRateZone}|${d.activeZoneMinutes}"
                    values = listOf(MetricType.ACTIVE_ZONE_MINUTES to d.activeZoneMinutes?.toDouble())
                }
                GoogleHealthDataType.ACTIVE_MINUTES -> {
                    val d = p.activeMinutes
                    if (d == null) { ignored++; continue }
                    iv = d.interval
                    extra = d.activeMinutesByActivityLevel.joinToString(",") { "${it.activityLevel}=${it.activeMinutes}" }
                    // Unknown activity levels are left out; the known ones still count.
                    values = d.activeMinutesByActivityLevel.mapNotNull { l ->
                        val metric = when (l.activityLevel) {
                            "LIGHT" -> MetricType.LIGHTLY_ACTIVE_MINUTES
                            "MODERATE" -> MetricType.MODERATELY_ACTIVE_MINUTES
                            "VIGOROUS" -> MetricType.VERY_ACTIVE_MINUTES
                            else -> null
                        }
                        metric?.let { it to l.activeMinutes?.toDouble() }
                    }
                }
                GoogleHealthDataType.SEDENTARY_PERIOD -> {
                    val d = p.sedentaryPeriod
                    if (d == null) { ignored++; continue }
                    iv = d.interval; extra = ""
                    val s = instant(iv?.startTime)
                    val e = instant(iv?.endTime)
                    values = listOf(MetricType.SEDENTARY_MINUTES to if (s != null && e != null && e >= s) (e - s) / 60_000.0 else null)
                }
                else -> { ignored++; continue }
            }
            val start = instant(iv?.startTime)
            if (start == null || values.isEmpty() || values.any { it.second == null || !it.second!!.isFinite() || it.second!! < 0.0 }) {
                malformed++
                continue
            }
            if (!seen.add(intervalKey(p, iv, extra))) continue
            val day = epochDay(start, offsetSeconds(start, iv?.startUtcOffset))
            for ((metric, v) in values) entries += Entry(metric, day, v!!)
        }
        return Collected(entries, malformed, ignored)
    }

    private fun totals(c: Collected, fromDay: Long, toDay: Long): Pair<List<DailyObservation>, Int> {
        var implausible = 0
        val out = ArrayList<DailyObservation>()
        val byKey = c.entries.filter { it.day in fromDay..toDay }.groupBy { it.metric to it.day }
        for ((key, rows) in byKey.entries.sortedWith(compareBy({ it.key.second }, { it.key.first.ordinal }))) {
            val sum = rows.sumOf { it.value }
            if (sum <= 0.0) continue
            if (!Plausibility.isPlausible(key.first, sum)) { implausible++; continue }
            out += DailyObservation(key.first, key.second, sum, sampleCount = rows.size)
        }
        return out to implausible
    }

    /**
     * Day totals of an interval type for civil days [fromDay]..[toDay] (inclusive). Records of other
     * days are ignored. [GoogleHealthDataType.BASAL_ENERGY_BURNED] is not a metric of its own: use [calories].
     */
    fun dailyTotals(type: GoogleHealthDataType, points: List<DataPoint>, fromDay: Long, toDay: Long): GhMapped<DailyObservation> {
        if (type == GoogleHealthDataType.BASAL_ENERGY_BURNED) return GhMapped(emptyList(), ignored = points.size)
        val c = collect(type, points)
        val (rows, implausible) = totals(c, fromDay, toDay)
        return GhMapped(rows, c.malformed, implausible, c.ignored)
    }

    /**
     * Active energy per day as CALORIES_ACTIVE, and CALORIES_TOTAL (active + basal) only for days where
     * both are present: a missing half is never replaced by an assumed one.
     */
    fun calories(active: List<DataPoint>, basal: List<DataPoint>, fromDay: Long, toDay: Long): GhMapped<DailyObservation> {
        val a = collect(GoogleHealthDataType.ACTIVE_ENERGY_BURNED, active)
        val b = collect(GoogleHealthDataType.BASAL_ENERGY_BURNED, basal)
        val (activeRows, impA) = totals(a, fromDay, toDay)
        val (basalRows, impB) = totals(b, fromDay, toDay)
        val basalByDay = basalRows.associateBy { it.epochDay }
        var implausible = impA + impB
        val out = ArrayList<DailyObservation>(activeRows)
        for (row in activeRows) {
            val base = basalByDay[row.epochDay] ?: continue
            val total = row.value + base.value
            if (!Plausibility.isPlausible(MetricType.CALORIES_TOTAL, total)) { implausible++; continue }
            out += DailyObservation(MetricType.CALORIES_TOTAL, row.epochDay, total, sampleCount = (row.sampleCount ?: 0) + (base.sampleCount ?: 0))
        }
        return GhMapped(out.sortedWith(compareBy({ it.epochDay }, { it.metric.ordinal })), a.malformed + b.malformed, implausible, a.ignored + b.ignored)
    }

    // --- Sleep -------------------------------------------------------------------------------------

    fun sleepStage(type: String?): SleepStage? = when (type) {
        "AWAKE" -> SleepStage.AWAKE
        "LIGHT" -> SleepStage.LIGHT
        "DEEP" -> SleepStage.DEEP
        "REM" -> SleepStage.REM
        "ASLEEP" -> SleepStage.ASLEEP
        "RESTLESS" -> SleepStage.RESTLESS
        else -> null // SLEEP_STAGE_TYPE_UNSPECIFIED and values a newer API adds: dropped, not guessed
    }

    private fun minutes(value: Long?): Int? = value?.takeIf { it in 0..MAX_MINUTES }?.toInt()

    fun sleeps(points: List<DataPoint>): GhMapped<SleepObservation> {
        val out = LinkedHashMap<String, SleepObservation>()
        var malformed = 0
        var ignored = 0
        for (p in points) {
            val s = p.sleep
            if (s == null) { ignored++; continue }
            val start = instant(s.interval?.startTime)
            val end = instant(s.interval?.endTime)
            if (start == null || end == null || end <= start) { malformed++; continue }
            val stages = s.stages.mapNotNull { st ->
                val stage = sleepStage(st.type) ?: return@mapNotNull null
                val a = instant(st.startTime) ?: return@mapNotNull null
                val b = instant(st.endTime) ?: return@mapNotNull null
                val from = maxOf(a, start)
                val to = minOf(b, end)
                if (to > from) SleepStageObservation(from, to, stage) else null
            }.sortedBy { it.startEpochMillis }
            val id = "gh:sleep:" + (p.resourceName?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: start.toString())
            out[id] = SleepObservation(
                id = id,
                startEpochMillis = start,
                endEpochMillis = end,
                startZoneOffsetSeconds = offsetSeconds(start, s.interval?.startUtcOffset),
                endZoneOffsetSeconds = offsetSeconds(end, s.interval?.endUtcOffset),
                isMainSleep = s.metadata?.mainSleep,
                isNap = s.metadata?.nap,
                minutesAsleep = minutes(s.summary?.minutesAsleep),
                minutesAwake = minutes(s.summary?.minutesAwake),
                minutesToFallAsleep = minutes(s.summary?.minutesToFallAsleep),
                stages = stages,
            )
        }
        return GhMapped(out.values.toList(), malformed, 0, ignored)
    }

    // --- Exercise ----------------------------------------------------------------------------------

    /** Sessions that started in [fromMillis, toMillis). The server filter is widened by a day each side, so trimming happens here. */
    fun workouts(points: List<DataPoint>, fromMillis: Long, toMillis: Long): GhMapped<WorkoutObservation> {
        val out = LinkedHashMap<String, WorkoutObservation>()
        var malformed = 0
        var ignored = 0
        for (p in points) {
            val e = p.exercise
            if (e == null) { ignored++; continue }
            val start = instant(e.interval?.startTime)
            val end = instant(e.interval?.endTime)
            if (start == null || end == null || end <= start) { malformed++; continue }
            if (start < fromMillis || start >= toMillis) continue
            val m = e.metricsSummary
            val type = e.exerciseType?.takeIf { it.isNotBlank() } ?: "OTHER"
            val id = "gh:exercise:" + (p.resourceName?.substringAfterLast('/')?.takeIf { it.isNotBlank() } ?: start.toString())
            out[id] = WorkoutObservation(
                id = id,
                startEpochMillis = start,
                endEpochMillis = end,
                zoneOffsetSeconds = offsetSeconds(start, e.interval?.startUtcOffset),
                exerciseType = type,
                displayName = e.displayName?.trim()?.takeIf { it.isNotEmpty() } ?: friendlyName(type),
                activeDurationMillis = (GoogleTime.durationMillis(e.activeDuration) ?: (end - start)).coerceIn(0, end - start),
                averageHeartRate = m?.averageHeartRateBeatsPerMinute?.takeIf { it in 1..Int.MAX_VALUE.toLong() }?.toInt(),
                maxHeartRate = null, // the API summary has no maximum; it stays missing
                caloriesKcal = m?.caloriesKcal?.takeIf { it.isFinite() && it >= 0 },
                distanceMeters = m?.distanceMillimeters?.takeIf { it.isFinite() && it >= 0 }?.let { it / 1000.0 },
                steps = m?.steps?.takeIf { it >= 0 },
                elevationGainMeters = m?.elevationGainMillimeters?.takeIf { it.isFinite() }?.let { it / 1000.0 },
                activeZoneMinutes = m?.activeZoneMinutes?.takeIf { it in 0..Int.MAX_VALUE.toLong() }?.toInt(),
            )
        }
        return GhMapped(out.values.toList(), malformed, 0, ignored)
    }

    private fun friendlyName(type: String): String = type.lowercase().replace('_', ' ').replaceFirstChar { it.uppercase() }

    private companion object {
        const val MAX_OFFSET = 18 * 3600
        const val MAX_MINUTES = 24L * 60
    }
}
