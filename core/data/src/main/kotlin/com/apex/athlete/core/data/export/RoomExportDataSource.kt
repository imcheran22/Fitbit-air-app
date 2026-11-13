package com.apex.athlete.core.data.export

import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
import com.apex.athlete.core.database.entity.MetricSampleEntity
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.MetricType

/**
 * Reads a Room store in bounded windows so memory stays flat however much history there is:
 * daily values a year at a time, heart-rate minutes a week at a time (about 10 000 rows),
 * samples per metric, sleep sessions and workouts in chunks of [CHUNK].
 */
class RoomExportDataSource(
    private val db: ApexDatabase,
    override val isDemo: Boolean,
) : ExportDataSource {

    constructor(store: ActiveStore) : this(store.db, store.isDemo)

    override suspend fun daily(emit: suspend (List<DailyRow>) -> Unit) {
        val dao = db.dailyBiometricSummaryDao()
        val first = MetricType.entries.mapNotNull { dao.firstDay(it) }.minOrNull() ?: return
        val last = MetricType.entries.mapNotNull { dao.lastDay(it) }.maxOrNull() ?: return
        var from = first
        while (from <= last) {
            val to = minOf(from + DAILY_WINDOW_DAYS - 1, last)
            val rows = dao.allInRange(from, to)
            if (rows.isNotEmpty()) emit(rows.map { it.toRow() })
            from = to + 1
        }
    }

    override suspend fun heartRateMinutes(emit: suspend (List<HeartRateMinuteRow>) -> Unit) {
        val dao = db.intradayHeartRateDao()
        val first = dao.earliestTimestamp() ?: return
        val last = dao.latestTimestamp() ?: return
        var from = first
        while (from <= last) {
            val to = from + HR_WINDOW_MILLIS
            val rows = dao.range(from, to)
            if (rows.isNotEmpty()) emit(rows.map { it.toRow() })
            from = to
        }
    }

    override suspend fun samples(emit: suspend (List<SampleRow>) -> Unit) {
        val dao = db.metricSampleDao()
        for (metric in MetricType.entries) {
            val latest = dao.latest(metric) ?: continue
            val rows = dao.range(metric, 0L, latest.timestampEpochMillis + 1)
            for (chunk in rows.chunked(CHUNK)) emit(chunk.map { it.toRow() })
        }
    }

    override suspend fun sleepSessions(emit: suspend (List<SleepRow>) -> Unit) {
        val dao = db.sleepDao()
        for (chunk in dao.allSessions().chunked(CHUNK)) {
            emit(chunk.map { s -> s.toRow(dao.stagesFor(s.id).map { SleepStageRow(it.startEpochMillis, it.endEpochMillis, it.stage.storageKey) }) })
        }
    }

    override suspend fun workouts(emit: suspend (List<WorkoutRow>) -> Unit) {
        for (chunk in db.workoutDao().all().chunked(CHUNK)) emit(chunk.map { it.toRow() })
    }

    override val includesExtras: Boolean get() = true

    override suspend fun extras(table: ExtrasTable, emit: suspend (List<ExtraRow>) -> Unit) {
        val rows: List<ExtraRow> = when (table) {
            ExtrasTable.BEHAVIOUR_DEFS -> db.behaviourDao().defs().map { it.toRow() }
            ExtrasTable.BEHAVIOUR_ENTRIES -> db.behaviourDao().allEntries().map { it.toRow() }
            ExtrasTable.QUICK_LOGS -> db.quickLogDao().all().map { it.toRow() }
            ExtrasTable.GOALS -> db.goalDao().all().map { it.toRow() }
            ExtrasTable.FOOD_LOGS -> db.foodLogDao().all().map { it.toRow() }
            ExtrasTable.BLOOD_PRESSURE -> db.bloodPressureDao().all().map { it.toRow() }
            ExtrasTable.BREATHE_SESSIONS -> db.breatheSessionDao().all().map { it.toRow() }
            ExtrasTable.COACH_THREADS -> db.coachChatDao().allThreads().map { it.toRow() }
            ExtrasTable.COACH_MESSAGES -> db.coachChatDao().allMessages().map { it.toRow() }
        }
        for (chunk in rows.chunked(CHUNK)) emit(chunk)
    }

    private fun DailyBiometricSummaryEntity.toRow() = DailyRow(
        metric = metricType.storageKey, epochDay = epochDay, value = value, provenance = provenance.storageKey,
        resolutionSeconds = sourceResolutionSeconds, sampleCount = sampleCount, algorithmVersion = algorithmVersion,
        updatedAtEpochMillis = updatedAtEpochMillis,
    )

    private fun IntradayHeartRateEntity.toRow() = HeartRateMinuteRow(
        t = timestampEpochMillis, avg = avgBpm, min = minBpm, max = maxBpm, n = sampleCount, provenance = provenance.storageKey,
    )

    private fun MetricSampleEntity.toRow() = SampleRow(
        metric = metricType.storageKey, t = timestampEpochMillis, value = value, provenance = provenance.storageKey, endT = endEpochMillis,
    )

    private fun SleepSessionEntity.toRow(stages: List<SleepStageRow>) = SleepRow(
        id = id, start = startEpochMillis, end = endEpochMillis,
        startZoneOffsetSeconds = startZoneOffsetSeconds, endZoneOffsetSeconds = endZoneOffsetSeconds, epochDay = epochDay,
        isMainSleep = isMainSleep, isNap = isNap, hasStages = hasStages,
        minutesAsleep = minutesAsleep, minutesAwake = minutesAwake, minutesInBed = minutesInBed,
        minutesToFallAsleep = minutesToFallAsleep, minutesDeep = minutesDeep, minutesRem = minutesRem, minutesLight = minutesLight,
        wakeBoutsOverThreeMinutes = wakeBoutsOverThreeMinutes, provenance = provenance.storageKey,
        updatedAtEpochMillis = updatedAtEpochMillis, stages = stages,
    )

    private fun WorkoutEntity.toRow() = WorkoutRow(
        id = id, start = startEpochMillis, end = endEpochMillis, zoneOffsetSeconds = zoneOffsetSeconds, epochDay = epochDay,
        exerciseType = exerciseType, displayName = displayName, activeDurationMillis = activeDurationMillis,
        averageHeartRate = averageHeartRate, maxHeartRate = maxHeartRate, caloriesKcal = caloriesKcal, distanceMeters = distanceMeters,
        steps = steps, elevationGainMeters = elevationGainMeters, activeZoneMinutes = activeZoneMinutes,
        sourceLightZoneMinutes = sourceLightZoneMinutes, sourceModerateZoneMinutes = sourceModerateZoneMinutes,
        sourceVigorousZoneMinutes = sourceVigorousZoneMinutes, sourcePeakZoneMinutes = sourcePeakZoneMinutes,
        hasGps = hasGps, derivedTrimp = derivedTrimp, derivedStrain = derivedStrain, perceivedExertion = perceivedExertion,
        provenance = provenance.storageKey, updatedAtEpochMillis = updatedAtEpochMillis,
    )

    private companion object {
        const val DAILY_WINDOW_DAYS = 366L
        const val HR_WINDOW_MILLIS = 7L * 24 * 60 * 60 * 1000
        const val CHUNK = 2_000
    }
}

/** The exporter for the app's real store. The real store is opened on demand; the Demo store is never reachable from here. */
fun ApexStores.dataExporter(appVersion: String): DataExporter =
    DataExporter(openSource = { RoomExportDataSource(realStore()) }, appVersion = appVersion)
