package com.apex.athlete.core.data.ingest

import androidx.room.withTransaction
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.IngestCounts
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.entity.MetricSampleEntity
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.domain.SourceCandidate
import com.apex.athlete.core.domain.SourceReconciler
import java.time.Instant
import java.time.ZoneId
import java.time.ZoneOffset
import kotlin.math.roundToInt

/**
 * The single writer of observed data. Every source goes through here, so the rules that keep one
 * real-world event from being stored twice live in exactly one place:
 *
 * - **Heart rate** is folded into one-minute buckets. A minute that already exists is replaced only
 *   by a bucket built from at least as many samples (a finer stream), or by the same source
 *   re-delivering it. A coarser copy never overwrites a finer one.
 * - **Daily values** go through [SourceReconciler] via the DAO.
 * - **Sleep sessions and workouts** that overlap an existing one from another source by more than
 *   half are the same event: [SourceReconciler] picks the survivor and the other is not stored.
 * - **Samples** are keyed by (metric, instant), so re-delivery is an overwrite, not an addition.
 *   Day totals (steps, calories) are never summed from samples; they arrive as daily values.
 *
 * Values outside physiological limits are rejected and counted, never stored and never logged.
 */
class HealthIngestor(
    private val db: ApexDatabase,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
) {

    /**
     * State of one run (one sync or one archive import). Heart-rate points of the same minute may
     * arrive in different batches and in any order, so the session remembers which minutes it has
     * already written and merges later points into them instead of replacing them.
     */
    class Session internal constructor() {
        internal val writtenMinutes = MinuteLedger()

        /** Minutes the run still remembers; stays a few thousand however long the run is. For tests. */
        internal val trackedMinuteCount: Int get() = writtenMinutes.size
        var counts: IngestCounts = IngestCounts()
            internal set
        /** Earliest civil day this run changed; null when nothing was written. */
        var earliestAffectedDay: Long? = null
            internal set
        var latestAffectedDay: Long? = null
            internal set

        internal fun touch(epochDay: Long) {
            earliestAffectedDay = minOf(earliestAffectedDay ?: epochDay, epochDay)
            latestAffectedDay = maxOf(latestAffectedDay ?: epochDay, epochDay)
        }
    }

    fun newSession(): Session = Session()

    suspend fun ingest(batch: HealthBatch, session: Session): IngestCounts {
        if (batch.isEmpty) return IngestCounts()
        var counts = IngestCounts()
        counts += ingestHeartRate(batch.heartRate, batch.provenance, session)
        counts += ingestDaily(batch, session)
        counts += ingestSamples(batch, session)
        for (s in batch.sleeps) counts += ingestSleep(s, batch.provenance, session)
        for (w in batch.workouts) counts += ingestWorkout(w, batch.provenance, session)
        session.counts += counts
        return counts
    }

    // --- Heart rate -------------------------------------------------------------------------------

    private class Bucket(var sum: Long = 0, var n: Int = 0, var min: Int = Int.MAX_VALUE, var max: Int = 0)

    private suspend fun ingestHeartRate(
        points: List<HeartRatePoint>,
        provenance: DataProvenance,
        session: Session,
    ): IngestCounts {
        if (points.isEmpty()) return IngestCounts()
        var rejected = 0L
        val now = nowMillis()
        val buckets = HashMap<Long, Bucket>()
        for (p in points) {
            if (p.bpm !in MIN_BPM..MAX_BPM || !ObservationBounds.isPlausibleInstant(p.epochMillis, now)) {
                rejected++
                continue
            }
            val minute = p.epochMillis - Math.floorMod(p.epochMillis, MINUTE_MS)
            val b = buckets.getOrPut(minute) { Bucket() }
            b.sum += p.bpm
            b.n++
            if (p.bpm < b.min) b.min = p.bpm
            if (p.bpm > b.max) b.max = p.bpm
        }

        var written = 0L
        var kept = 0L
        val z = zone()
        val minutes = buckets.keys.sorted()
        for (chunk in minutes.chunked(BATCH_ROWS)) {
            val committed = db.withTransaction {
                val dao = db.intradayHeartRateDao()
                val existing = dao.range(chunk.first(), chunk.last() + 1).associateBy { it.timestampEpochMillis }
                val rows = ArrayList<IntradayHeartRateEntity>(chunk.size)
                for (minute in chunk) {
                    val b = buckets.getValue(minute)
                    val old = existing[minute]
                    val row = when {
                        old == null -> b.toEntity(minute, provenance)
                        // Same run, same minute, split across batches: merge the two halves.
                        old.provenance == provenance && minute in session.writtenMinutes -> {
                            val n = old.sampleCount + b.n
                            IntradayHeartRateEntity(
                                timestampEpochMillis = minute,
                                avgBpm = (old.avgBpm * old.sampleCount + b.sum) / n,
                                minBpm = minOf(old.minBpm, b.min),
                                maxBpm = maxOf(old.maxBpm, b.max),
                                sampleCount = n,
                                provenance = provenance,
                            )
                        }
                        old.provenance == provenance -> b.toEntity(minute, provenance)
                        b.n > old.sampleCount || (b.n == old.sampleCount && rank(provenance) >= rank(old.provenance)) ->
                            b.toEntity(minute, provenance)
                        else -> null
                    }
                    if (row == null) kept++ else rows += row
                }
                if (rows.isNotEmpty()) dao.upsertAll(rows)
                written += rows.size
                rows.map { it.timestampEpochMillis }
            }
            // Only committed minutes are remembered, and only those near this chunk (see MinuteLedger).
            session.writtenMinutes.recordChunk(committed)
            session.touch(Instant.ofEpochMilli(chunk.first()).atZone(z).toLocalDate().toEpochDay())
            session.touch(Instant.ofEpochMilli(chunk.last()).atZone(z).toLocalDate().toEpochDay())
        }
        return IngestCounts(
            heartRatePoints = points.size.toLong(),
            heartRateMinutesWritten = written,
            heartRateMinutesKept = kept,
            rejected = rejected,
        )
    }

    private fun Bucket.toEntity(minute: Long, provenance: DataProvenance) = IntradayHeartRateEntity(
        timestampEpochMillis = minute,
        avgBpm = sum.toDouble() / n,
        minBpm = min,
        maxBpm = max,
        sampleCount = n,
        provenance = provenance,
    )

    // --- Daily values and samples -----------------------------------------------------------------

    private suspend fun ingestDaily(batch: HealthBatch, session: Session): IngestCounts {
        if (batch.daily.isEmpty()) return IngestCounts()
        val now = nowMillis()
        val today = Instant.ofEpochMilli(now).atZone(zone()).toLocalDate().toEpochDay()
        var rejected = 0L
        val rows = batch.daily.mapNotNull { o ->
            if (!Plausibility.isPlausible(o.metric, o.value) || !ObservationBounds.isPlausibleDay(o.epochDay, today)) {
                rejected++
                null
            } else {
                DailyBiometricSummaryEntity(
                    metricType = o.metric,
                    epochDay = o.epochDay,
                    value = o.value,
                    provenance = batch.provenance,
                    sourceResolutionSeconds = o.resolutionSeconds,
                    sampleCount = o.sampleCount,
                    updatedAtEpochMillis = now,
                )
            }
        }
        var written = 0L
        for (chunk in rows.chunked(BATCH_ROWS)) {
            written += db.dailyBiometricSummaryDao().reconcileAndUpsert(chunk)
        }
        rows.forEach { session.touch(it.epochDay) }
        return IngestCounts(dailyWritten = written, dailyKept = rows.size - written, rejected = rejected)
    }

    private suspend fun ingestSamples(batch: HealthBatch, session: Session): IngestCounts {
        if (batch.samples.isEmpty()) return IngestCounts()
        var rejected = 0L
        val z = zone()
        val now = nowMillis()
        val rows = batch.samples.mapNotNull { o ->
            if (!Plausibility.isPlausible(o.metric, o.value) || !ObservationBounds.isPlausibleInstant(o.epochMillis, now)) {
                rejected++
                null
            } else {
                MetricSampleEntity(o.metric, o.epochMillis, o.endEpochMillis, o.value, batch.provenance)
            }
        }
        for (chunk in rows.chunked(BATCH_ROWS)) {
            db.withTransaction { db.metricSampleDao().upsertAll(chunk) }
        }
        if (rows.isNotEmpty()) {
            session.touch(Instant.ofEpochMilli(rows.minOf { it.timestampEpochMillis }).atZone(z).toLocalDate().toEpochDay())
        }
        return IngestCounts(samplesWritten = rows.size.toLong(), rejected = rejected)
    }

    // --- Sleep ------------------------------------------------------------------------------------

    private suspend fun ingestSleep(o: SleepObservation, provenance: DataProvenance, session: Session): IngestCounts {
        val durationMin = ((o.endEpochMillis - o.startEpochMillis) / MINUTE_MS).toInt()
        if (durationMin !in MIN_SLEEP_MINUTES..MAX_SLEEP_MINUTES || o.endEpochMillis > nowMillis() + FUTURE_TOLERANCE_MS ||
            o.startEpochMillis < ObservationBounds.MIN_EPOCH_MILLIS
        ) {
            return IngestCounts(rejected = 1)
        }
        val stages = o.stages
            .filter { it.endEpochMillis > it.startEpochMillis && it.startEpochMillis >= o.startEpochMillis - MINUTE_MS && it.endEpochMillis <= o.endEpochMillis + MINUTE_MS }
            .sortedBy { it.startEpochMillis }
        val hasStages = stages.any { it.stage == SleepStage.DEEP || it.stage == SleepStage.REM || it.stage == SleepStage.LIGHT }

        fun minutesOf(vararg wanted: SleepStage): Int =
            (stages.filter { it.stage in wanted }.sumOf { it.endEpochMillis - it.startEpochMillis } / MINUTE_MS.toDouble()).roundToInt()

        val awakeFromStages = minutesOf(SleepStage.AWAKE, SleepStage.RESTLESS)
        val asleepFromStages = minutesOf(SleepStage.LIGHT, SleepStage.DEEP, SleepStage.REM, SleepStage.ASLEEP)
        val asleep = o.minutesAsleep ?: if (stages.isNotEmpty()) asleepFromStages else durationMin
        val awake = o.minutesAwake ?: if (stages.isNotEmpty()) awakeFromStages else 0
        if (asleep <= 0) return IngestCounts(rejected = 1)

        val firstAsleep = stages.firstOrNull { it.stage.isAsleep }
        val latency = o.minutesToFallAsleep
            ?: firstAsleep?.let { ((it.startEpochMillis - o.startEpochMillis) / MINUTE_MS).toInt().coerceAtLeast(0) }
        // Awakenings of three minutes or more between first sleep and final wake.
        val wakeBouts = if (stages.isEmpty() || firstAsleep == null) null else {
            val lastAsleepEnd = stages.last { it.stage.isAsleep }.endEpochMillis
            stages.count {
                !it.stage.isAsleep && it.startEpochMillis >= firstAsleep.startEpochMillis &&
                    it.endEpochMillis <= lastAsleepEnd && it.endEpochMillis - it.startEpochMillis >= 3 * MINUTE_MS
            }
        }

        val epochDay = Instant.ofEpochMilli(o.endEpochMillis)
            .atOffset(ZoneOffset.ofTotalSeconds(o.endZoneOffsetSeconds)).toLocalDate().toEpochDay()
        // A source's "main sleep" flag cannot bypass the minimum duration (SleepClassification).
        val kind = SleepClassification.classify(asleep, o.isMainSleep, o.isNap)
        val entity = SleepSessionEntity(
            id = o.id,
            startEpochMillis = o.startEpochMillis,
            endEpochMillis = o.endEpochMillis,
            startZoneOffsetSeconds = o.startZoneOffsetSeconds,
            endZoneOffsetSeconds = o.endZoneOffsetSeconds,
            epochDay = epochDay,
            isMainSleep = kind.isMain,
            isNap = kind.isNap,
            hasStages = hasStages,
            minutesAsleep = asleep,
            minutesAwake = awake,
            minutesInBed = durationMin,
            minutesToFallAsleep = latency,
            minutesDeep = if (hasStages) minutesOf(SleepStage.DEEP) else null,
            minutesRem = if (hasStages) minutesOf(SleepStage.REM) else null,
            minutesLight = if (hasStages) minutesOf(SleepStage.LIGHT) else null,
            wakeBoutsOverThreeMinutes = wakeBouts,
            provenance = provenance,
            updatedAtEpochMillis = nowMillis(),
        )

        val stored = db.withTransaction {
            val dao = db.sleepDao()
            val rivals = dao.overlapping(o.startEpochMillis, o.endEpochMillis).filter { it.id != o.id && sameEvent(it.startEpochMillis, it.endEpochMillis, o.startEpochMillis, o.endEpochMillis) }
            val incoming = SourceCandidate(provenance, if (hasStages) 30 else 60, entity.updatedAtEpochMillis)
            val losesTo = rivals.firstOrNull { r ->
                !SourceReconciler.shouldReplace(
                    MetricType.SLEEP_DURATION,
                    SourceCandidate(r.provenance, if (r.hasStages) 30 else 60, r.updatedAtEpochMillis),
                    incoming,
                )
            }
            if (losesTo != null) {
                false
            } else {
                rivals.forEach { dao.deleteById(it.id) }
                dao.replaceSession(
                    entity,
                    stages.map { SleepStageSegmentEntity(o.id, it.startEpochMillis, it.endEpochMillis, it.stage) },
                )
                // Only one main sleep per day: the longest keeps the flag.
                if (entity.isMainSleep) demoteShorterMainSleeps(epochDay)
                true
            }
        }
        if (stored) session.touch(epochDay)
        return if (stored) IngestCounts(sleepsWritten = 1) else IngestCounts(sleepsKept = 1)
    }

    private suspend fun demoteShorterMainSleeps(epochDay: Long) {
        val dao = db.sleepDao()
        val mains = dao.sessionsBetween(epochDay, epochDay).filter { it.isMainSleep }.sortedByDescending { it.minutesAsleep }
        for (extra in mains.drop(1)) {
            dao.replaceSession(extra.copy(isMainSleep = false, isNap = true), dao.stagesFor(extra.id))
        }
    }

    // --- Workouts ---------------------------------------------------------------------------------

    private suspend fun ingestWorkout(o: WorkoutObservation, provenance: DataProvenance, session: Session): IngestCounts {
        val duration = o.endEpochMillis - o.startEpochMillis
        if (duration < MINUTE_MS || duration > MAX_WORKOUT_MS || o.endEpochMillis > nowMillis() + FUTURE_TOLERANCE_MS ||
            o.startEpochMillis < ObservationBounds.MIN_EPOCH_MILLIS
        ) {
            return IngestCounts(rejected = 1)
        }
        val epochDay = Instant.ofEpochMilli(o.startEpochMillis)
            .atOffset(ZoneOffset.ofTotalSeconds(o.zoneOffsetSeconds)).toLocalDate().toEpochDay()
        val stored = db.withTransaction {
            val dao = db.workoutDao()
            val previous = dao.byId(o.id)
            val rivals = dao.overlapping(o.startEpochMillis, o.endEpochMillis)
                .filter { it.id != o.id && sameEvent(it.startEpochMillis, it.endEpochMillis, o.startEpochMillis, o.endEpochMillis) }
            val incoming = SourceCandidate(provenance, null, nowMillis())
            val losesTo = rivals.firstOrNull { r ->
                !SourceReconciler.shouldReplace(MetricType.DAILY_TRIMP, SourceCandidate(r.provenance, null, r.updatedAtEpochMillis), incoming)
            }
            if (losesTo != null) {
                false
            } else {
                rivals.forEach { dao.deleteById(it.id) }
                dao.upsertAll(
                    listOf(
                        WorkoutEntity(
                            id = o.id,
                            startEpochMillis = o.startEpochMillis,
                            endEpochMillis = o.endEpochMillis,
                            zoneOffsetSeconds = o.zoneOffsetSeconds,
                            epochDay = epochDay,
                            exerciseType = o.exerciseType,
                            displayName = o.displayName,
                            activeDurationMillis = o.activeDurationMillis.coerceIn(0, duration),
                            averageHeartRate = o.averageHeartRate?.takeIf { it in MIN_BPM..MAX_BPM },
                            maxHeartRate = o.maxHeartRate?.takeIf { it in MIN_BPM..MAX_BPM },
                            caloriesKcal = o.caloriesKcal?.takeIf { it >= 0 },
                            distanceMeters = o.distanceMeters?.takeIf { it >= 0 },
                            steps = o.steps?.takeIf { it >= 0 },
                            elevationGainMeters = o.elevationGainMeters,
                            activeZoneMinutes = o.activeZoneMinutes,
                            // Load is recomputed by the pipeline; keep what was there until then.
                            derivedTrimp = previous?.derivedTrimp,
                            derivedStrain = previous?.derivedStrain,
                            perceivedExertion = o.perceivedExertion?.coerceIn(1, 10) ?: previous?.perceivedExertion,
                            provenance = provenance,
                            updatedAtEpochMillis = nowMillis(),
                        ),
                    ),
                )
                true
            }
        }
        if (stored) session.touch(epochDay)
        return if (stored) IngestCounts(workoutsWritten = 1) else IngestCounts(workoutsKept = 1)
    }

    /** Two spans describe the same event when their overlap covers more than half of the shorter one. */
    private fun sameEvent(aStart: Long, aEnd: Long, bStart: Long, bEnd: Long): Boolean {
        val overlap = minOf(aEnd, bEnd) - maxOf(aStart, bStart)
        val shorter = minOf(aEnd - aStart, bEnd - bStart)
        return shorter > 0 && overlap * 2 > shorter
    }

    private fun rank(p: DataProvenance): Int = when (p) {
        DataProvenance.IMPORTED_FILE_ARCHIVE -> 3
        DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API -> 2
        DataProvenance.IMPORTED_HEALTH_CONNECT -> 1
        else -> 0
    }

    companion object {
        /** Rows per transaction: large enough to be fast, small enough never to hold the write lock long. */
        const val BATCH_ROWS = 2_500
        const val MINUTE_MS = 60_000L
        const val MIN_BPM = 25
        const val MAX_BPM = 240
        const val MIN_SLEEP_MINUTES = 10
        const val MAX_SLEEP_MINUTES = 24 * 60
        const val MAIN_SLEEP_MIN_MINUTES = SleepClassification.MAIN_SLEEP_MIN_MINUTES
        const val MAX_WORKOUT_MS = 24 * 60 * MINUTE_MS
        const val FUTURE_TOLERANCE_MS = ObservationBounds.FUTURE_TOLERANCE_MS
    }
}

/** Hard physiological limits. A value outside them is a sensor or parsing fault, not a reading. */
object Plausibility {
    fun isPlausible(metric: MetricType, value: Double): Boolean {
        if (!value.isFinite()) return false
        return when (metric) {
            MetricType.RESTING_HEART_RATE, MetricType.SLEEPING_HEART_RATE,
            MetricType.HEART_RATE_AVG, MetricType.HEART_RATE_MIN, MetricType.HEART_RATE_MAX -> value in 25.0..240.0
            MetricType.HRV_RMSSD, MetricType.HRV_DEEP_SLEEP_RMSSD, MetricType.HRV_SLEEP_SAMPLES -> value > 0.0 && value <= 400.0
            MetricType.SPO2_AVG, MetricType.SPO2_LOWER_BOUND, MetricType.SPO2_UPPER_BOUND -> value in 50.0..100.0
            MetricType.RESPIRATORY_RATE -> value in 4.0..60.0
            MetricType.SKIN_TEMP_DEVIATION -> value in -10.0..10.0
            MetricType.SKIN_TEMP_NIGHTLY -> value in 20.0..45.0
            MetricType.VO2_MAX -> value in 10.0..100.0
            MetricType.WEIGHT -> value in 20.0..400.0
            MetricType.BODY_FAT -> value in 1.0..75.0
            MetricType.SUBJECTIVE_FATIGUE, MetricType.SUBJECTIVE_SORENESS -> value in 1.0..10.0
            // Journal factors are yes/no: exactly 1.0 or 0.0.
            MetricType.JOURNAL_ALCOHOL, MetricType.JOURNAL_LATE_CAFFEINE, MetricType.JOURNAL_LATE_MEAL,
            MetricType.JOURNAL_STRESSFUL_DAY, MetricType.JOURNAL_TRAVEL -> value == 0.0 || value == 1.0
            MetricType.BMI -> value in 8.0..100.0
            // Derived in formula version 4; bounds match what the engines can produce.
            MetricType.STRESS_DAY_AGGREGATE_BPM -> value in 25.0..240.0
            MetricType.STRESS_SCORE -> value in 0.0..3.0
            MetricType.STRESS_LOW_MINUTES, MetricType.STRESS_MEDIUM_MINUTES, MetricType.STRESS_HIGH_MINUTES -> value in 0.0..1500.0
            MetricType.HR_DIP -> value in -300.0..100.0
            MetricType.SLEEP_EFFICIENCY -> value in 0.0..100.0
            else -> value >= 0.0 || metric == MetricType.TRAINING_BALANCE
        }
    }
}
