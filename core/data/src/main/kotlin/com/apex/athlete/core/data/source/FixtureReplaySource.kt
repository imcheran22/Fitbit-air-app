package com.apex.athlete.core.data.source

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.HeartRatePoint
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.domain.SyncSource
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.io.InputStream
import java.time.Instant
import java.time.ZoneId

/**
 * A fake band for end-to-end tests: replays recorded [HealthBatch]es as if a source had delivered
 * them, filtered to the requested window. It is deterministic (the same window always yields the same
 * batches in the same order), keeps each batch's provenance, and never touches the database.
 *
 * Filtering by window, per row kind: heart rate and samples by instant in [from, to); sleep by end
 * instant; workouts by start instant; daily values by civil day (in [zone]) of the window. A daily
 * value can therefore be delivered by two adjacent windows; writes are idempotent, so that is harmless
 * and mirrors how real sources re-read overlaps.
 *
 * @param faults called before each window; a returned throwable is thrown, to test failures and resume.
 */
class FixtureReplaySource(
    override val source: SyncSource,
    private val fixtures: List<HealthBatch>,
    private val streamName: String = "fixture",
    windowMillis: Long = 7L * 24 * 60 * 60 * 1000,
    private val zone: ZoneId = ZoneId.of("UTC"),
    private val availability: SourceAvailability = SourceAvailability.Ready,
    private val maxRowsPerBatch: Int = 2_500,
    private val faults: (fromMillis: Long, toMillis: Long) -> Throwable? = { _, _ -> null },
) : HealthSource {

    override val streams: List<SourceStream> = listOf(SourceStream(streamName, windowMillis))

    /** Windows requested so far, oldest first. For assertions. */
    val pulledWindows: List<Pair<Long, Long>> get() = pulled.toList()
    private val pulled = ArrayList<Pair<Long, Long>>()

    override suspend fun availability(): SourceAvailability = availability

    override suspend fun pull(stream: SourceStream, fromMillis: Long, toMillis: Long, emit: suspend (HealthBatch) -> Unit) {
        if (stream.name != streamName) throw IllegalArgumentException("Unknown fixture stream")
        if (toMillis <= fromMillis) return
        pulled += fromMillis to toMillis
        faults(fromMillis, toMillis)?.let { throw it }
        val firstDay = Instant.ofEpochMilli(fromMillis).atZone(zone).toLocalDate().toEpochDay()
        val lastDay = Instant.ofEpochMilli(toMillis - 1).atZone(zone).toLocalDate().toEpochDay()
        for (b in fixtures) {
            val window = HealthBatch(
                provenance = b.provenance,
                heartRate = b.heartRate.filter { it.epochMillis in fromMillis until toMillis },
                daily = b.daily.filter { it.epochDay in firstDay..lastDay },
                samples = b.samples.filter { it.epochMillis in fromMillis until toMillis },
                sleeps = b.sleeps.filter { it.endEpochMillis in fromMillis until toMillis },
                workouts = b.workouts.filter { it.startEpochMillis in fromMillis until toMillis },
            )
            if (window.isEmpty) continue
            for (c in window.heartRate.chunked(maxRowsPerBatch)) emit(HealthBatch(b.provenance, heartRate = c))
            for (c in window.daily.chunked(maxRowsPerBatch)) emit(HealthBatch(b.provenance, daily = c))
            for (c in window.samples.chunked(maxRowsPerBatch)) emit(HealthBatch(b.provenance, samples = c))
            for (c in window.sleeps.chunked(maxRowsPerBatch)) emit(HealthBatch(b.provenance, sleeps = c))
            for (c in window.workouts.chunked(maxRowsPerBatch)) emit(HealthBatch(b.provenance, workouts = c))
        }
    }

    companion object {
        private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; isLenient = true }

        /**
         * Reads fixtures from JSON (see [FixtureFile]). Unknown fields, metric keys, stage keys and
         * provenance keys are skipped, never fatal; a batch with an unknown provenance is dropped.
         */
        fun parse(input: InputStream): List<HealthBatch> =
            json.decodeFromString(FixtureFile.serializer(), input.readBytes().decodeToString()).batches.mapNotNull { it.toBatch() }

        /** Convenience: a source over JSON fixtures. */
        fun fromJson(source: SyncSource, input: InputStream): FixtureReplaySource =
            FixtureReplaySource(source, parse(input))
    }
}

// --- JSON shape ----------------------------------------------------------------------------------

/** `{ "batches": [ { "provenance": "ghealth_api", "heartRate": [...], ... } ] }`; keys are the domain storage keys. */
@Serializable
data class FixtureFile(val batches: List<FixtureBatch> = emptyList())

@Serializable
data class FixtureBatch(
    val provenance: String,
    val heartRate: List<FxHeartRate> = emptyList(),
    val daily: List<FxDaily> = emptyList(),
    val samples: List<FxSample> = emptyList(),
    val sleeps: List<FxSleep> = emptyList(),
    val workouts: List<FxWorkout> = emptyList(),
) {
    internal fun toBatch(): HealthBatch? {
        val p = DataProvenance.entries.firstOrNull { it.storageKey == provenance } ?: return null
        return HealthBatch(
            provenance = p,
            heartRate = heartRate.map { HeartRatePoint(it.t, it.bpm) },
            daily = daily.mapNotNull { d -> metric(d.metric)?.let { DailyObservation(it, d.day, d.value, d.resolutionSeconds, d.sampleCount) } },
            samples = samples.mapNotNull { s -> metric(s.metric)?.let { SampleObservation(it, s.t, s.value, s.end) } },
            sleeps = sleeps.map { it.toObservation() },
            workouts = workouts.map { it.toObservation() },
        )
    }

    private fun metric(key: String): MetricType? = MetricType.entries.firstOrNull { it.storageKey == key }
}

@Serializable data class FxHeartRate(val t: Long, val bpm: Int)

@Serializable
data class FxDaily(val metric: String, val day: Long, val value: Double, val resolutionSeconds: Int? = null, val sampleCount: Int? = null)

@Serializable data class FxSample(val metric: String, val t: Long, val value: Double, val end: Long? = null)

@Serializable data class FxStage(val start: Long, val end: Long, val stage: String)

@Serializable
data class FxSleep(
    val id: String,
    val start: Long,
    val end: Long,
    val startOffset: Int = 0,
    val endOffset: Int = 0,
    val main: Boolean? = null,
    val nap: Boolean? = null,
    val asleepMin: Int? = null,
    val awakeMin: Int? = null,
    val latencyMin: Int? = null,
    val stages: List<FxStage> = emptyList(),
) {
    internal fun toObservation() = SleepObservation(
        id, start, end, startOffset, endOffset, main, nap, asleepMin, awakeMin, latencyMin,
        stages.mapNotNull { s ->
            SleepStage.entries.firstOrNull { it.storageKey == s.stage }?.let { SleepStageObservation(s.start, s.end, it) }
        },
    )
}

@Serializable
data class FxWorkout(
    val id: String,
    val start: Long,
    val end: Long,
    val offset: Int = 0,
    val type: String = "OTHER",
    val name: String = "Workout",
    val activeMillis: Long? = null,
    val avgHr: Int? = null,
    val maxHr: Int? = null,
    val kcal: Double? = null,
    val meters: Double? = null,
    val steps: Long? = null,
) {
    internal fun toObservation() = WorkoutObservation(
        id, start, end, offset, type, name, activeMillis ?: (end - start), avgHr, maxHr, kcal, meters, steps,
    )
}
