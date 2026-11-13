package com.apex.athlete.core.data.export

import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.SampleObservation
import com.apex.athlete.core.data.model.SleepObservation
import com.apex.athlete.core.data.model.SleepStageObservation
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.domain.SleepStage

/** Why a row was not imported. Counts per reason are reported; the rows themselves are dropped, never repaired. */
enum class QuarantineReason {
    MALFORMED_ROW,
    UNKNOWN_METRIC,
    UNKNOWN_PROVENANCE,
    PROVENANCE_NOT_IMPORTABLE,
    INVALID_VALUE,
    INVALID_TIME,
    DERIVED_VALUE_SKIPPED,

    /** A row of the local logging tables whose kind, source or role is not one this version knows. */
    UNKNOWN_KIND,

    /** A valid row the store could not take: a chat message whose thread is not in the store (nor earlier in the file). */
    NOT_STORED,
}

internal sealed interface Mapped<out T> {
    data class Ok<T>(val provenance: DataProvenance, val value: T) : Mapped<T>
    data class Rejected(val reason: QuarantineReason) : Mapped<Nothing>
}

/**
 * Validates one decoded row and converts it to the observation the ingestor takes, keeping the
 * row's original provenance. Values computed by Apex (scores, loads) are not imported: the replay
 * after the import recomputes them from the readings, so a file made by an older formula version
 * cannot plant stale scores.
 */
internal object ImportMapping {
    private val metrics = MetricType.entries.associateBy { it.storageKey }
    private val provenances = DataProvenance.entries.associateBy { it.storageKey }
    private val stages = SleepStage.entries.associateBy { it.storageKey }

    private const val MAX_EPOCH_DAY = 3_000_000L // year ~10200; anything above is corruption
    private const val MAX_OFFSET_SECONDS = 18 * 3600

    private val notImportable = setOf(
        DataProvenance.SYNTHETIC_DEMO, DataProvenance.UNAVAILABLE, DataProvenance.AI_INTERPRETED, DataProvenance.MATHEMATICALLY_DERIVED,
    )

    private fun resolveProvenance(key: String): Pair<DataProvenance?, QuarantineReason?> {
        val p = provenances[key] ?: return null to QuarantineReason.UNKNOWN_PROVENANCE
        if (p in notImportable) return null to QuarantineReason.PROVENANCE_NOT_IMPORTABLE
        return p to null
    }

    private fun validTime(ms: Long) = ms in 1..(MAX_EPOCH_DAY * 86_400_000L)

    fun daily(r: DailyRow): Mapped<DailyObservation> {
        val metric = metrics[r.metric] ?: return Mapped.Rejected(QuarantineReason.UNKNOWN_METRIC)
        if (metric.isDerived || r.algorithmVersion != null || provenances[r.provenance] == DataProvenance.MATHEMATICALLY_DERIVED) {
            return Mapped.Rejected(QuarantineReason.DERIVED_VALUE_SKIPPED)
        }
        val (p, why) = resolveProvenance(r.provenance)
        if (p == null) return Mapped.Rejected(why!!)
        if (!r.value.isFinite()) return Mapped.Rejected(QuarantineReason.INVALID_VALUE)
        if (r.epochDay !in -1L..MAX_EPOCH_DAY) return Mapped.Rejected(QuarantineReason.INVALID_TIME)
        return Mapped.Ok(p, DailyObservation(metric, r.epochDay, r.value, r.resolutionSeconds, r.sampleCount))
    }

    fun heartRate(r: HeartRateMinuteRow): Mapped<List<com.apex.athlete.core.data.model.HeartRatePoint>> {
        val (p, why) = resolveProvenance(r.provenance)
        if (p == null) return Mapped.Rejected(why!!)
        if (!validTime(r.t)) return Mapped.Rejected(QuarantineReason.INVALID_TIME)
        if (r.n !in 1..HeartRateMinuteExpansion.MAX_SAMPLES_PER_MINUTE || !r.avg.isFinite() || r.min > r.max ||
            r.avg < r.min - 0.5 || r.avg > r.max + 0.5
        ) return Mapped.Rejected(QuarantineReason.INVALID_VALUE)
        return Mapped.Ok(p, HeartRateMinuteExpansion.expand(r.t, r.avg, r.min, r.max, r.n))
    }

    fun sample(r: SampleRow): Mapped<SampleObservation> {
        val metric = metrics[r.metric] ?: return Mapped.Rejected(QuarantineReason.UNKNOWN_METRIC)
        if (metric.isDerived) return Mapped.Rejected(QuarantineReason.DERIVED_VALUE_SKIPPED)
        val (p, why) = resolveProvenance(r.provenance)
        if (p == null) return Mapped.Rejected(why!!)
        if (!r.value.isFinite()) return Mapped.Rejected(QuarantineReason.INVALID_VALUE)
        if (!validTime(r.t) || (r.endT != null && r.endT < r.t)) return Mapped.Rejected(QuarantineReason.INVALID_TIME)
        return Mapped.Ok(p, SampleObservation(metric, r.t, r.value, r.endT))
    }

    fun sleep(r: SleepRow): Mapped<SleepObservation> {
        val (p, why) = resolveProvenance(r.provenance)
        if (p == null) return Mapped.Rejected(why!!)
        if (r.id.isBlank() || !validTime(r.start) || r.end <= r.start || !validTime(r.end)) return Mapped.Rejected(QuarantineReason.INVALID_TIME)
        if (kotlin.math.abs(r.startZoneOffsetSeconds) > MAX_OFFSET_SECONDS || kotlin.math.abs(r.endZoneOffsetSeconds) > MAX_OFFSET_SECONDS) {
            return Mapped.Rejected(QuarantineReason.INVALID_TIME)
        }
        // A stage with an unknown name is dropped, not the whole night.
        val segs = r.stages.mapNotNull { s -> stages[s.stage]?.let { SleepStageObservation(s.start, s.end, it) } }
        return Mapped.Ok(
            p,
            SleepObservation(
                id = r.id, startEpochMillis = r.start, endEpochMillis = r.end,
                startZoneOffsetSeconds = r.startZoneOffsetSeconds, endZoneOffsetSeconds = r.endZoneOffsetSeconds,
                isMainSleep = r.isMainSleep, isNap = r.isNap,
                minutesAsleep = r.minutesAsleep, minutesAwake = r.minutesAwake, minutesToFallAsleep = r.minutesToFallAsleep,
                stages = segs,
            ),
        )
    }

    fun workout(r: WorkoutRow): Mapped<WorkoutObservation> {
        val (p, why) = resolveProvenance(r.provenance)
        if (p == null) return Mapped.Rejected(why!!)
        if (r.id.isBlank() || !validTime(r.start) || r.end <= r.start || !validTime(r.end)) return Mapped.Rejected(QuarantineReason.INVALID_TIME)
        if (kotlin.math.abs(r.zoneOffsetSeconds) > MAX_OFFSET_SECONDS) return Mapped.Rejected(QuarantineReason.INVALID_TIME)
        val doubles = listOfNotNull(r.caloriesKcal, r.distanceMeters, r.elevationGainMeters)
        if (doubles.any { !it.isFinite() }) return Mapped.Rejected(QuarantineReason.INVALID_VALUE)
        return Mapped.Ok(
            p,
            WorkoutObservation(
                id = r.id, startEpochMillis = r.start, endEpochMillis = r.end, zoneOffsetSeconds = r.zoneOffsetSeconds,
                exerciseType = r.exerciseType, displayName = r.displayName, activeDurationMillis = r.activeDurationMillis,
                averageHeartRate = r.averageHeartRate, maxHeartRate = r.maxHeartRate, caloriesKcal = r.caloriesKcal,
                distanceMeters = r.distanceMeters, steps = r.steps, elevationGainMeters = r.elevationGainMeters,
                activeZoneMinutes = r.activeZoneMinutes, perceivedExertion = r.perceivedExertion,
            ),
        )
    }
}
