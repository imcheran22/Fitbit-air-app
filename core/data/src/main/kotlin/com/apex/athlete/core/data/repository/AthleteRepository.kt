package com.apex.athlete.core.data.repository

import com.apex.athlete.core.analytics.baseline.BaselineSpec
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.stats.CircularTime
import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.data.coach.CoachBriefing
import com.apex.athlete.core.data.coach.RuleBasedCoachEngine
import com.apex.athlete.core.data.model.DailyObservation
import com.apex.athlete.core.data.model.HealthBatch
import com.apex.athlete.core.data.model.WorkoutObservation
import com.apex.athlete.core.data.pipeline.DayAnalysis
import com.apex.athlete.core.data.pipeline.JournalDay
import com.apex.athlete.core.data.settings.SettingsStore
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.data.store.ApexStores
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.database.entity.SleepStageSegmentEntity
import com.apex.athlete.core.database.entity.SyncWatermarkEntity
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import kotlinx.coroutines.CoroutineDispatcher
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.flowOn
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.mapLatest
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.UUID

/** One point of a daily series; [value] is null on days without a reading (drawn as a gap). */
data class TrendPoint(val epochDay: Long, val value: Double?)

/** One point of a heart-rate line; a null [bpm] breaks the line. */
data class HeartRateTick(val epochMillis: Long, val bpm: Double?, val provenance: DataProvenance? = null)

data class MonitorItem(val metric: MetricType, val intelligence: MetricIntelligence, val provenance: DataProvenance?)

data class DailyDashboardState(
    val analysis: DayAnalysis,
    val isDemo: Boolean,
    val briefing: CoachBriefing,
    val monitor: List<MonitorItem>,
    /** Most recent heart-rate minute on this day and the half hour before it. */
    val latestHeartRate: HeartRateTick?,
    val recentHeartRate: List<HeartRateTick>,
    /** Newest observation of any kind in the store; null for an empty store. */
    val newestDataMillis: Long?,
    val lastSyncMillis: Long?,
    val hasAnyData: Boolean,
)

data class RecoveryDetailState(
    val analysis: DayAnalysis,
    val isDemo: Boolean,
    val recoveryHistory: List<TrendPoint>,
    val hrvHistory: List<TrendPoint>,
    val restingHeartRateHistory: List<TrendPoint>,
)

data class SleepDetailState(
    val analysis: DayAnalysis,
    val isDemo: Boolean,
    val stages: List<SleepStageSegmentEntity>,
    val scoreHistory: List<TrendPoint>,
    val durationHistory: List<TrendPoint>,
    /** Suggested local bedtime (minutes after midnight) to meet tonight's need before the usual wake time. */
    val suggestedBedtimeMinute: Int?,
    val usualWakeMinute: Int?,
)

data class StrainLoadState(
    val analysis: DayAnalysis,
    val isDemo: Boolean,
    /** The day's heart rate in five-minute buckets, with gaps where no data exists. */
    val heartRate: List<HeartRateTick>,
    val strainHistory: List<TrendPoint>,
    val dayStartMillis: Long,
    val dayEndMillis: Long,
)

data class MetricTrend(
    val metric: MetricType,
    val points: List<TrendPoint>,
    val intelligence: MetricIntelligence,
    val provenance: DataProvenance?,
)

data class TrendIntelligenceState(val isDemo: Boolean, val asOfDay: Long, val rangeDays: Int, val trends: List<MetricTrend>)

data class DataSourcesState(
    val isDemo: Boolean,
    val watermarks: List<SyncWatermarkEntity>,
    val heartRateMinutes: Int,
    val dailyValues: Int,
    val samples: Int,
    val earliestDay: Long?,
)

/**
 * What the screens observe. Every flow re-emits when the active store changes (real or demo), when
 * a write bumps the data version, or when the profile changes (zones and load depend on it).
 */
@OptIn(ExperimentalCoroutinesApi::class)
class AthleteRepository(
    private val stores: ApexStores,
    private val settings: SettingsStore,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val nowMillis: () -> Long = System::currentTimeMillis,
    private val io: CoroutineDispatcher = Dispatchers.IO,
) {
    private val coach = RuleBasedCoachEngine()

    val storeStatus: Flow<StoreStatus> = stores.status

    fun today(): Long = Instant.ofEpochMilli(nowMillis()).atZone(zone()).toLocalDate().toEpochDay()

    private fun <T> observe(block: suspend (ActiveStore) -> T): Flow<T?> =
        combine(stores.status, stores.dataVersion, settings.profile) { status, _, _ -> status }
            .mapLatest { status -> (status as? StoreStatus.Ready)?.let { block(it.store) } }
            .flowOn(io)

    fun dashboard(day: Long): Flow<DailyDashboardState?> = observe { store ->
        val a = store.pipeline.analyze(day, persist = false)
        val z = zone()
        val date = LocalDate.ofEpochDay(day)
        val dayStart = date.atStartOfDay(z).toInstant().toEpochMilli()
        val dayEnd = date.plusDays(1).atStartOfDay(z).toInstant().toEpochMilli()
        val hrDao = store.db.intradayHeartRateDao()
        val lastRow = hrDao.range(maxOf(dayStart, dayEnd - DAY_MS), dayEnd).lastOrNull()
        val recent = lastRow?.let { last ->
            val from = last.timestampEpochMillis - 29 * MINUTE_MS
            val rows = hrDao.range(from, last.timestampEpochMillis + MINUTE_MS).associateBy { it.timestampEpochMillis }
            (0 until 30).map { i ->
                val t = from + i * MINUTE_MS
                HeartRateTick(t, rows[t]?.avgBpm, rows[t]?.provenance)
            }
        }.orEmpty()
        val newest = listOfNotNull(hrDao.latestTimestamp(), store.db.sleepDao().allSessions().maxOfOrNull { it.endEpochMillis }).maxOrNull()
        DailyDashboardState(
            analysis = a,
            isDemo = store.isDemo,
            briefing = coach.briefing(a, settings.currentSettings().units),
            monitor = listOf(
                MonitorItem(MetricType.HRV_RMSSD, a.hrv, a.provenance[MetricType.HRV_RMSSD]),
                MonitorItem(a.restingHeartRateMetric, a.restingHeartRate, a.provenance[a.restingHeartRateMetric]),
                MonitorItem(MetricType.RESPIRATORY_RATE, a.respiratoryRate, a.provenance[MetricType.RESPIRATORY_RATE]),
                MonitorItem(MetricType.SPO2_AVG, a.spo2, a.provenance[MetricType.SPO2_AVG]),
                MonitorItem(MetricType.SKIN_TEMP_DEVIATION, a.skinTemperature, a.provenance[MetricType.SKIN_TEMP_DEVIATION]),
            ),
            latestHeartRate = lastRow?.let { HeartRateTick(it.timestampEpochMillis, it.avgBpm, it.provenance) },
            recentHeartRate = recent,
            newestDataMillis = newest,
            lastSyncMillis = if (store.isDemo) null else settings.currentSettings().lastSyncMillis,
            hasAnyData = newest != null || store.db.dailyBiometricSummaryDao().count() > 0,
        )
    }

    fun recoveryDetail(day: Long): Flow<RecoveryDetailState?> = observe { store ->
        val a = store.pipeline.analyze(day, persist = false)
        RecoveryDetailState(
            analysis = a,
            isDemo = store.isDemo,
            recoveryHistory = history(store, MetricType.RECOVERY_SCORE, day, 14),
            hrvHistory = history(store, MetricType.HRV_RMSSD, day, 14),
            restingHeartRateHistory = history(store, a.restingHeartRateMetric, day, 14),
        )
    }

    fun sleepDetail(day: Long): Flow<SleepDetailState?> = observe { store ->
        val a = store.pipeline.analyze(day, persist = false)
        val stages = a.sleepSession?.let { store.db.sleepDao().stagesFor(it.id) }.orEmpty()
        val recent = store.db.sleepDao().mainSleepsBetween(day - 13, day).distinctBy { it.epochDay }
        val wakeMinutes = recent.map {
            val t = Instant.ofEpochMilli(it.endEpochMillis).atOffset(ZoneOffset.ofTotalSeconds(it.endZoneOffsetSeconds)).toLocalTime()
            t.hour * 60.0 + t.minute
        }
        val usualWake = if (wakeMinutes.size >= 3) CircularTime.meanMinuteOfDay(wakeMinutes) else null
        // Time in bed needed = sleep need / the owner's own recent efficiency (never better than 95 %).
        val efficiency = recent.filter { it.minutesInBed > 0 }.map { it.minutesAsleep.toDouble() / it.minutesInBed }
            .takeIf { it.size >= 3 }?.average()?.coerceIn(0.7, 0.95)
        val bedtime = if (usualWake != null && efficiency != null) {
            val inBed = a.sleepNeedTonight.totalMinutes / efficiency
            (((usualWake - inBed) % 1440 + 1440) % 1440).toInt()
        } else null
        SleepDetailState(
            analysis = a,
            isDemo = store.isDemo,
            stages = stages,
            scoreHistory = history(store, MetricType.SLEEP_SCORE, day, 14),
            durationHistory = history(store, MetricType.SLEEP_DURATION, day, 14),
            suggestedBedtimeMinute = bedtime,
            usualWakeMinute = usualWake?.toInt(),
        )
    }

    fun strainLoad(day: Long): Flow<StrainLoadState?> = observe { store ->
        val a = store.pipeline.analyze(day, persist = false)
        val z = zone()
        val date = LocalDate.ofEpochDay(day)
        val dayStart = date.atStartOfDay(z).toInstant().toEpochMilli()
        val dayEnd = date.plusDays(1).atStartOfDay(z).toInstant().toEpochMilli()
        val buckets = store.db.intradayHeartRateDao().downsampled(dayStart, dayEnd, HR_BUCKET_MS).associateBy { it.bucketIndex }
        val count = ((dayEnd - dayStart) / HR_BUCKET_MS).toInt()
        StrainLoadState(
            analysis = a,
            isDemo = store.isDemo,
            heartRate = (0 until count).map { i -> HeartRateTick(dayStart + i * HR_BUCKET_MS, buckets[i.toLong()]?.avgBpm) },
            strainHistory = history(store, MetricType.STRAIN_SCORE, day, 14),
            dayStartMillis = dayStart,
            dayEndMillis = dayEnd,
        )
    }

    fun trends(asOfDay: Long, rangeDays: Int): Flow<TrendIntelligenceState?> = observe { store ->
        val dao = store.db.dailyBiometricSummaryDao()
        val rows = dao.allInRange(asOfDay - maxOf(rangeDays, 60), asOfDay).groupBy { it.metricType }
        val trends = TREND_METRICS.mapNotNull { (metric, spec) ->
            val all = rows[metric].orEmpty()
            if (all.isEmpty()) return@mapNotNull null
            val byDay = all.associateBy { it.epochDay }
            MetricTrend(
                metric = metric,
                points = ((asOfDay - rangeDays + 1)..asOfDay).map { TrendPoint(it, byDay[it]?.value) },
                intelligence = MetricTrendAnalyzer.analyze(all.map { DailyValue(it.epochDay, it.value) }, asOfDay, spec),
                provenance = all.last().provenance,
            )
        }
        TrendIntelligenceState(store.isDemo, asOfDay, rangeDays, trends)
    }

    fun trend(metric: MetricType, asOfDay: Long, rangeDays: Int): Flow<MetricTrend?> =
        trends(asOfDay, rangeDays).map { s -> s?.trends?.firstOrNull { it.metric == metric } }.distinctUntilChanged()

    fun workout(id: String): Flow<WorkoutEntity?> = observe { it.db.workoutDao().byId(id) }

    // --- Formula version 4 and the activity, body and vitals streams -----------------------------------

    /** Everything the engines say about [day], for screens that need a field no dedicated flow carries (SRI, weekly HRV status, load confidence ...). */
    fun analysis(day: Long): Flow<DayAnalysis?> = observe { it.pipeline.analyze(day, persist = false) }

    /** Steps, distance, floors, calories, active zone minutes and the activity-minute classes of [day], each with provenance or a reason. */
    fun activityDay(day: Long): Flow<ActivityDayState?> = observe { RepositoryQueries.activityDay(it, day) }

    /** Weight, body fat and BMI (derived on read; null with a reason without a height). */
    fun body(day: Long): Flow<BodyState?> = observe { store -> RepositoryQueries.body(store, day, settings.currentProfile()) }

    /** Skin temperature, SpO2 range, HRV variants and sleeping heart rate of the night that ended on [day]. */
    fun vitals(day: Long): Flow<VitalsState?> = observe { RepositoryQueries.vitals(it, day) }

    /** Daytime stress and the energy bank for [day]; each null with a reason on a band-off day. */
    fun stressEnergy(day: Long): Flow<StressEnergyState?> = observe { RepositoryQueries.stressEnergy(it, day) }

    /** The journal factors logged on [day] and the 90-day next-day associations (at least 5 days per arm). */
    fun journal(day: Long): Flow<JournalState?> = observe { RepositoryQueries.journal(it, day) }

    /** VO2 max, its FRIEND category and fitness age (null with a reason without sex or age in the profile). */
    fun fitness(day: Long): Flow<FitnessState?> = observe { RepositoryQueries.fitness(it, day) }

    /** One workout with its reported fields, heart-rate recovery, zone minutes and minute heart rate. */
    /** Sleep Regularity Index over the last [nights] nights ending on [day] (used by the experimental Health age). */
    fun sleepRegularity(day: Long, nights: Int = 30): Flow<SleepRegularityWindow?> =
        observe { RepositoryQueries.sleepRegularity(it, day, nights) }

    fun workoutDetail(id: String): Flow<WorkoutDetailState?> = observe { RepositoryQueries.workoutDetail(it, id) }

    fun recentWorkouts(limit: Int = 30): Flow<List<WorkoutEntity>> = stores.status.flatMapLatest { status ->
        (status as? StoreStatus.Ready)?.store?.db?.workoutDao()?.observeRecent(limit) ?: flowOf(emptyList())
    }

    fun dataSources(): Flow<DataSourcesState?> = observe { store ->
        DataSourcesState(
            isDemo = store.isDemo,
            watermarks = if (store.isDemo) emptyList() else {
                com.apex.athlete.core.domain.SyncSource.entries.flatMap { store.db.syncWatermarkDao().forSource(it) }
            },
            heartRateMinutes = store.db.intradayHeartRateDao().count(),
            dailyValues = store.db.dailyBiometricSummaryDao().count(),
            samples = store.db.metricSampleDao().count(),
            earliestDay = store.pipeline.earliestDataDay(),
        )
    }

    // --- Writes the owner makes by hand ----------------------------------------------------------

    /** Stores the morning check-in (1-10 fatigue and soreness) as self-reported values and recomputes. */
    suspend fun saveCheckIn(day: Long, fatigue: Int?, soreness: Int?) = write { store ->
        val obs = listOfNotNull(
            fatigue?.let { DailyObservation(MetricType.SUBJECTIVE_FATIGUE, day, it.coerceIn(1, 10).toDouble()) },
            soreness?.let { DailyObservation(MetricType.SUBJECTIVE_SORENESS, day, it.coerceIn(1, 10).toDouble()) },
        )
        if (fatigue == null) store.db.dailyBiometricSummaryDao().delete(MetricType.SUBJECTIVE_FATIGUE, day)
        if (soreness == null) store.db.dailyBiometricSummaryDao().delete(MetricType.SUBJECTIVE_SORENESS, day)
        val session = store.ingestor.newSession()
        store.ingestor.ingest(HealthBatch(DataProvenance.USER_REPORTED, daily = obs), session)
        store.pipeline.replay(day, store.pipeline.today())
    }

    /**
     * Stores the journal factors of [day]: true = yes, false = no, null = not logged (the stored value is removed). Factors
     * outside [JournalDay.FACTORS] are ignored. Journal effects are computed on read, so nothing is replayed.
     */
    suspend fun saveJournalFactors(day: Long, factors: Map<MetricType, Boolean?>) = write { store ->
        val known = factors.filterKeys { it in JournalDay.FACTORS }
        for ((metric, value) in known) if (value == null) store.db.dailyBiometricSummaryDao().delete(metric, day)
        val obs = known.mapNotNull { (metric, value) -> value?.let { DailyObservation(metric, day, if (it) 1.0 else 0.0) } }
        if (obs.isNotEmpty()) store.ingestor.ingest(HealthBatch(DataProvenance.USER_REPORTED, daily = obs), store.ingestor.newSession())
    }

    /** Logs a workout the band did not record, with a 1-10 perceived-exertion rating. */
    suspend fun addManualWorkout(startMillis: Long, durationMinutes: Int, name: String, type: String, rpe: Int): String {
        val id = "manual:" + UUID.randomUUID()
        write { store ->
            val offset = zone().rules.getOffset(Instant.ofEpochMilli(startMillis)).totalSeconds
            val workout = WorkoutObservation(
                id = id,
                startEpochMillis = startMillis,
                endEpochMillis = startMillis + durationMinutes * MINUTE_MS,
                zoneOffsetSeconds = offset,
                exerciseType = type,
                displayName = name,
                activeDurationMillis = durationMinutes * MINUTE_MS,
                perceivedExertion = rpe,
            )
            val session = store.ingestor.newSession()
            store.ingestor.ingest(HealthBatch(DataProvenance.USER_REPORTED, workouts = listOf(workout)), session)
            session.earliestAffectedDay?.let { store.pipeline.replay(it, store.pipeline.today()) }
        }
        return id
    }

    suspend fun deleteWorkout(id: String) = write { store ->
        val w = store.db.workoutDao().byId(id) ?: return@write
        store.db.workoutDao().deleteById(id)
        store.pipeline.replay(w.epochDay, store.pipeline.today())
    }

    /** Recomputes every derived value from the first stored day, for example after a profile change. */
    suspend fun recomputeAll(onProgress: suspend (Int, Int) -> Unit = { _, _ -> }) = write { store ->
        val from = store.pipeline.earliestDataDay() ?: return@write
        store.pipeline.replay(from, store.pipeline.today(), onProgress)
    }

    /** Runs [block] under the write mutex; throws when no store is ready so callers never report a false save. */
    private suspend fun write(block: suspend (ActiveStore) -> Unit) = withContext(io) {
        val store = (stores.status.value as? StoreStatus.Ready)?.store
            ?: throw IllegalStateException("The data store is not ready")
        stores.writeMutex.withLock { block(store) }
        stores.notifyChanged()
    }

    private suspend fun history(store: ActiveStore, metric: MetricType, day: Long, days: Int): List<TrendPoint> {
        val rows = store.db.dailyBiometricSummaryDao().range(metric, day - days + 1, day).associateBy { it.epochDay }
        return ((day - days + 1)..day).map { TrendPoint(it, rows[it]?.value) }
    }

    companion object {
        private const val MINUTE_MS = 60_000L
        private const val DAY_MS = 24 * 60 * MINUTE_MS
        private const val HR_BUCKET_MS = 5 * MINUTE_MS

        /** Metrics offered on the Trends screen, each with the baseline rule it is judged against. */
        val TREND_METRICS: List<Pair<MetricType, BaselineSpec>> = listOf(
            MetricType.RECOVERY_SCORE to BaselineSpecs.GENERIC,
            MetricType.HRV_RMSSD to BaselineSpecs.HRV,
            MetricType.RESTING_HEART_RATE to BaselineSpecs.RESTING_HEART_RATE,
            MetricType.SLEEPING_HEART_RATE to BaselineSpecs.RESTING_HEART_RATE,
            MetricType.RESPIRATORY_RATE to BaselineSpecs.RESPIRATORY_RATE,
            MetricType.SPO2_AVG to BaselineSpecs.SPO2,
            MetricType.SKIN_TEMP_DEVIATION to BaselineSpecs.SKIN_TEMPERATURE_DEVIATION,
            MetricType.SLEEP_SCORE to BaselineSpecs.GENERIC,
            MetricType.SLEEP_DURATION to BaselineSpecs.SLEEP_DURATION,
            MetricType.STRAIN_SCORE to BaselineSpecs.GENERIC,
            MetricType.DAILY_TRIMP to BaselineSpecs.GENERIC,
            MetricType.VO2_MAX to BaselineSpecs.GENERIC,
            MetricType.STEPS to BaselineSpecs.GENERIC,
            // Research metrics (formula set 6)
            MetricType.HRV_CV7_LN to BaselineSpecs.GENERIC,
            MetricType.SLEEP_REGULARITY_INDEX to BaselineSpecs.GENERIC,
            MetricType.SLEEP_MIDPOINT_SD_7D to BaselineSpecs.GENERIC,
            MetricType.GUIDELINE_SHORTFALL_CLIPPED_7D to BaselineSpecs.GENERIC,
            MetricType.GUIDELINE_SHORTFALL_SIGNED_7D to BaselineSpecs.GENERIC,
            MetricType.SLEEP_WASO to BaselineSpecs.GENERIC,
            MetricType.AWAKENINGS_PER_HOUR to BaselineSpecs.GENERIC,
            MetricType.SEDENTARY_PROLONGED_BOUTS to BaselineSpecs.GENERIC,
            MetricType.SEDENTARY_LONGEST_BOUT to BaselineSpecs.GENERIC,
            MetricType.SEDENTARY_BREAKS_PER_HOUR to BaselineSpecs.GENERIC,
            MetricType.PEAK_CADENCE_30 to BaselineSpecs.GENERIC,
            MetricType.RHR_ROBUST_Z to BaselineSpecs.GENERIC,
            MetricType.HRV_ROBUST_Z to BaselineSpecs.GENERIC,
            MetricType.RESP_RATE_ROBUST_Z to BaselineSpecs.GENERIC,
            // Activity
            MetricType.DISTANCE to BaselineSpecs.GENERIC,
            MetricType.FLOORS to BaselineSpecs.GENERIC,
            MetricType.CALORIES_TOTAL to BaselineSpecs.GENERIC,
            MetricType.CALORIES_ACTIVE to BaselineSpecs.GENERIC,
            MetricType.ACTIVE_ZONE_MINUTES to BaselineSpecs.GENERIC,
            MetricType.LIGHTLY_ACTIVE_MINUTES to BaselineSpecs.GENERIC,
            MetricType.MODERATELY_ACTIVE_MINUTES to BaselineSpecs.GENERIC,
            MetricType.VERY_ACTIVE_MINUTES to BaselineSpecs.GENERIC,
            MetricType.SEDENTARY_MINUTES to BaselineSpecs.GENERIC,
            // Body
            MetricType.WEIGHT to BaselineSpecs.GENERIC,
            MetricType.BODY_FAT to BaselineSpecs.GENERIC,
            // Vitals
            MetricType.SKIN_TEMP_NIGHTLY to BaselineSpecs.SKIN_TEMPERATURE_DEVIATION,
            MetricType.SPO2_LOWER_BOUND to BaselineSpecs.SPO2,
            MetricType.SPO2_UPPER_BOUND to BaselineSpecs.SPO2,
            MetricType.HRV_DEEP_SLEEP_RMSSD to BaselineSpecs.HRV,
            MetricType.HRV_SLEEP_SAMPLES to BaselineSpecs.HRV,
            // Version 4 derived
            MetricType.STRESS_SCORE to BaselineSpecs.GENERIC,
            MetricType.STRESS_DAY_AGGREGATE_BPM to BaselineSpecs.GENERIC,
            MetricType.STRESS_HIGH_MINUTES to BaselineSpecs.GENERIC,
            MetricType.HR_DIP to BaselineSpecs.GENERIC,
        )
    }
}
