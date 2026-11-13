package com.apex.athlete.core.data.pipeline

import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.analytics.baseline.BaselineEngine
import com.apex.athlete.core.analytics.baseline.BaselineSpec
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.fitness.CardioFitness
import com.apex.athlete.core.analytics.fitness.MaxHeartRate
import com.apex.athlete.core.analytics.fitness.MaxHeartRateEstimate
import com.apex.athlete.core.analytics.fitness.RestingHeartRateSeries
import com.apex.athlete.core.analytics.fitness.RestingHeartRateSource
import com.apex.athlete.core.analytics.load.DailyLoad
import com.apex.athlete.core.analytics.load.DailyLoadPolicy
import com.apex.athlete.core.analytics.load.TrainingLoadEngine
import com.apex.athlete.core.analytics.load.TrainingLoadResult
import com.apex.athlete.core.analytics.recovery.FatigueAssessment
import com.apex.athlete.core.analytics.recovery.FatigueSignalDetector
import com.apex.athlete.core.analytics.recovery.RecoveryEngine
import com.apex.athlete.core.analytics.recovery.RecoveryInputs
import com.apex.athlete.core.analytics.recovery.RecoveryResult
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.analytics.sleep.NightBalance
import com.apex.athlete.core.analytics.sleep.SleepNeed
import com.apex.athlete.core.analytics.sleep.SleepNeedCalculator
import com.apex.athlete.core.analytics.sleep.SleepNightInput
import com.apex.athlete.core.analytics.sleep.SleepRegularityIndex
import com.apex.athlete.core.analytics.sleep.SleepScoreEngine
import com.apex.athlete.core.analytics.sleep.SleepScoreResult
import com.apex.athlete.core.analytics.sleep.SleepSpan
import com.apex.athlete.core.analytics.sleep.SleepTiming
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateSample
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.strain.RemainingCapacity
import com.apex.athlete.core.analytics.strain.StrainEngine
import com.apex.athlete.core.analytics.strain.StrainResult
import com.apex.athlete.core.analytics.strain.StrainTarget
import com.apex.athlete.core.analytics.strain.StrainTargetCalculator
import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.SleepSessionEntity
import com.apex.athlete.core.database.entity.WorkoutEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset

/** Why a score is not shown. The screens turn each into a plain sentence; none is ever replaced by a number. */
enum class MissingReason {
    NO_HEART_RATE_DATA,
    NO_SLEEP_DATA,
    NEEDS_RESTING_HEART_RATE,
    NEEDS_MAX_HEART_RATE,
    CALIBRATING,
    NO_DATA,
}

/** A VO2 max to show, with where it came from. */
data class Vo2MaxReading(val value: Double, val provenance: DataProvenance, val epochDay: Long?, val method: String?)

/**
 * Everything the engines say about one civil day. Built from stored observations only; a field is
 * null when its inputs are missing, together with a [MissingReason] where a screen needs to explain.
 */
data class DayAnalysis(
    val epochDay: Long,
    /** True for the current day, whose strain and steps are still accumulating. */
    val isProvisional: Boolean,
    val recovery: RecoveryResult,
    val hrv: MetricIntelligence,
    val restingHeartRate: MetricIntelligence,
    /** Which stored series [restingHeartRate] was built from (resting or sleeping heart rate). */
    val restingHeartRateMetric: MetricType,
    val respiratoryRate: MetricIntelligence,
    val skinTemperature: MetricIntelligence,
    val spo2: MetricIntelligence,
    val sleepSession: SleepSessionEntity?,
    val sleep: SleepScoreResult?,
    /** The need last night was scored against. */
    val sleepNeedLastNight: SleepNeed,
    /** The need for the coming night, including today's strain so far. */
    val sleepNeedTonight: SleepNeed,
    val strain: StrainResult?,
    val strainMissing: MissingReason?,
    val strainTarget: StrainTarget?,
    val remaining: RemainingCapacity?,
    val cardioProfile: CardioProfile?,
    val maxHeartRate: MaxHeartRateEstimate?,
    val zones: HeartRateZoneModel?,
    val load: TrainingLoadResult,
    val fatigue: FatigueAssessment,
    val vo2Max: Vo2MaxReading?,
    val workouts: List<WorkoutEntity>,
    val subjectiveFatigue: Int?,
    val subjectiveSoreness: Int?,
    /** Provenance of each observed input that fed the scores, for the label next to the number. */
    val provenance: Map<MetricType, DataProvenance>,
    val steps: Double?,
    val algorithmVersion: Int = ANALYTICS_ALGORITHM_VERSION,
)

/**
 * Turns stored observations into the day's derived scores.
 *
 * A day's result depends only on that day and earlier days (baselines exclude the evaluated day,
 * loads are trailing averages, sleep debt looks back seven nights). Later days therefore depend on
 * the derived values stored for earlier ones, which is why [replay] always walks forward in order.
 * Same stored inputs and same [ANALYTICS_ALGORITHM_VERSION] always give the same outputs.
 */
class DailyIntelligencePipeline(
    private val db: ApexDatabase,
    private val profile: suspend () -> UserProfile,
    private val zone: () -> ZoneId = ZoneId::systemDefault,
    private val nowMillis: () -> Long = System::currentTimeMillis,
) {
    private val recoveryEngine = RecoveryEngine()
    // One definition of consistency in the stored series: the Sleep Regularity Index, never the old spread rule.
    private val sleepEngine = SleepScoreEngine(SleepScoreEngine.Config(useTimingSpreadForConsistency = false))
    private val needCalculator = SleepNeedCalculator()
    private val loadEngine = TrainingLoadEngine()

    fun today(): Long = Instant.ofEpochMilli(nowMillis()).atZone(zone()).toLocalDate().toEpochDay()

    /**
     * Recomputes every day from [fromDay] to [toDay] in chronological order and stores the results.
     * Safe to interrupt and run again: each day is written in full before the next one starts.
     */
    suspend fun replay(fromDay: Long, toDay: Long, onProgress: suspend (done: Int, total: Int) -> Unit = { _, _ -> }): Int {
        if (toDay < fromDay) return 0
        val total = (toDay - fromDay + 1).toInt()
        var done = 0
        for (day in fromDay..toDay) {
            analyze(day, persist = true)
            done++
            onProgress(done, total)
        }
        return done
    }

    /**
     * Recomputes history after a formula change. Derived rows carry the [ANALYTICS_ALGORITHM_VERSION]
     * they were computed with; when any is older, every day from the oldest stale one to today is
     * replayed, and derived rows still older afterwards (values no current formula produces) are
     * removed. Observed rows have no version and are never touched. Returns the number of days
     * replayed (0 when nothing is stale), and is safe to interrupt: a later start finds the rest stale.
     */
    suspend fun recomputeIfStale(onProgress: suspend (done: Int, total: Int) -> Unit = { _, _ -> }): Int {
        val dao = db.dailyBiometricSummaryDao()
        val from = dao.firstStaleDerivedDay(ANALYTICS_ALGORITHM_VERSION) ?: return 0
        val done = replay(from, today(), onProgress)
        dao.deleteStaleDerived(ANALYTICS_ALGORITHM_VERSION)
        return done
    }

    /** The earliest day that has any stored observation, or null for an empty store. */
    suspend fun earliestDataDay(): Long? {
        val z = zone()
        val candidates = listOfNotNull(
            db.intradayHeartRateDao().earliestTimestamp()?.let { Instant.ofEpochMilli(it).atZone(z).toLocalDate().toEpochDay() },
            db.dailyBiometricSummaryDao().firstDay(MetricType.HRV_RMSSD),
            db.dailyBiometricSummaryDao().firstDay(MetricType.RESTING_HEART_RATE),
            db.dailyBiometricSummaryDao().firstDay(MetricType.STEPS),
            db.sleepDao().allSessions().minOfOrNull { it.epochDay },
        )
        return candidates.minOrNull()
    }

    suspend fun analyze(day: Long, persist: Boolean): DayAnalysis {
        val z = zone()
        val date = LocalDate.ofEpochDay(day)
        val dayStart = date.atStartOfDay(z).toInstant().toEpochMilli()
        val dayEnd = date.plusDays(1).atStartOfDay(z).toInstant().toEpochMilli()
        val user = profile()
        val dailyDao = db.dailyBiometricSummaryDao()
        val hrDao = db.intradayHeartRateDao()

        // --- Sleep sessions -------------------------------------------------------------------
        val sessions = db.sleepDao().mainSleepsBetween(day - SLEEP_HISTORY_DAYS, day).distinctBy { it.epochDay }
        val night = sessions.firstOrNull { it.epochDay == day }
        val allSessions = db.sleepDao().sessionsBetween(day - SLEEP_HISTORY_DAYS, day)
        val napMinutesByDay: Map<Long, Double> = allSessions.filter { !it.isMainSleep }
            .groupBy { it.epochDay }.mapValues { (_, v) -> v.sumOf { it.minutesAsleep }.toDouble() }

        if (persist) deriveNightlyObservations(day, night)

        val rows = dailyDao.allInRange(day - HISTORY_DAYS, day)
        val byMetric = rows.groupBy { it.metricType }
        fun series(metric: MetricType): List<DailyValue> = byMetric[metric].orEmpty().map { DailyValue(it.epochDay, it.value) }
        fun valueOn(metric: MetricType, d: Long): Double? = byMetric[metric]?.firstOrNull { it.epochDay == d }?.value
        fun analyzeMetric(metric: MetricType, spec: BaselineSpec) = MetricTrendAnalyzer.analyze(series(metric), day, spec)

        // --- Autonomic and respiratory markers ------------------------------------------------
        val hrv = analyzeMetric(MetricType.HRV_RMSSD, BaselineSpecs.HRV)
        // One series for the whole baseline window (B10): the one with more readings in the 30 days
        // before the day, not whichever has a reading today. SLEEPING_HEART_RATE rows may be observed
        // (vendor) or derived; the reconciler keeps one row per day and the observed one wins.
        val rhrMetric = when (RestingHeartRateSource.choose(series(MetricType.RESTING_HEART_RATE), series(MetricType.SLEEPING_HEART_RATE), day)) {
            RestingHeartRateSeries.RESTING -> MetricType.RESTING_HEART_RATE
            RestingHeartRateSeries.SLEEPING -> MetricType.SLEEPING_HEART_RATE
        }
        val rhr = analyzeMetric(rhrMetric, BaselineSpecs.RESTING_HEART_RATE)
        val resp = analyzeMetric(MetricType.RESPIRATORY_RATE, BaselineSpecs.RESPIRATORY_RATE)
        val skin = analyzeMetric(MetricType.SKIN_TEMP_DEVIATION, BaselineSpecs.SKIN_TEMPERATURE_DEVIATION)
        val spo2 = analyzeMetric(MetricType.SPO2_AVG, BaselineSpecs.SPO2)

        // --- Strain history (days the band was worn long enough, DailyLoadPolicy) ------------------
        val strainEngine = StrainEngine(StrainEngine.Config(zoneMethod = user.zoneMethod))
        val strainByDay: Map<Long, Double> = series(MetricType.DAILY_TRIMP)
            .distinctBy { it.epochDay }
            .associate { it.epochDay to strainEngine.strainFromTrimp(it.value) }

        // --- Sleep need and score -------------------------------------------------------------
        val earlier = sessions.filter { it.epochDay < day }
        val durations = earlier.map { it.minutesAsleep.toDouble() }
        val baseNeed = needCalculator.baseNeed(durations).first
        /** z of a day's strain against the athlete's own last 30 recorded strain days before it. */
        fun strainZ(strainDay: Long, strainValue: Double?): Double? =
            needCalculator.strainZ(strainValue, (strainDay - STRAIN_Z_DAYS until strainDay).mapNotNull { strainByDay[it] })
        fun balances(asOf: Long, pool: List<SleepSessionEntity>) = pool
            .filter { it.epochDay in (asOf - 7) until asOf }
            .map {
                NightBalance(
                    epochDay = it.epochDay,
                    needMinutes = baseNeed + needCalculator.strainSurcharge(strainZ(it.epochDay - 1, strainByDay[it.epochDay - 1]), baseNeed),
                    asleepMinutes = it.minutesAsleep.toDouble(),
                    napMinutes = napMinutesByDay[it.epochDay] ?: 0.0,
                )
            }
        val needLastNight = needCalculator.need(durations, strainZ(day - 1, strainByDay[day - 1]), balances(day, earlier), day)

        val sleepResult = night?.let { n ->
            val timings = sessions.filter { it.epochDay in (day - 6)..day }.map(::timingOf)
            val restorativeHistory = earlier.filter { it.hasStages && it.minutesAsleep > 0 }
                .map { DailyValue(it.epochDay, ((it.minutesDeep ?: 0) + (it.minutesRem ?: 0)).toDouble() / it.minutesAsleep) }
            val restorativeZ = if (n.hasStages && n.minutesAsleep > 0) {
                val base = BaselineEngine.baseline(restorativeHistory, day, BaselineSpecs.RESTORATIVE_SLEEP_FRACTION)
                BaselineEngine.zScore(((n.minutesDeep ?: 0) + (n.minutesRem ?: 0)).toDouble() / n.minutesAsleep, base)
            } else null
            val regularity = regularityOf(day, sessions, allSessions)
            sleepEngine.evaluate(
                night = SleepNightInput(
                    asleepMinutes = n.minutesAsleep.toDouble(),
                    inBedMinutes = n.minutesInBed.toDouble(),
                    deepMinutes = n.minutesDeep?.toDouble(),
                    remMinutes = n.minutesRem?.toDouble(),
                    lightMinutes = n.minutesLight?.toDouble(),
                    wakeBoutsOverThreeMinutes = n.wakeBoutsOverThreeMinutes,
                    timing = timingOf(n),
                ),
                needMinutes = needLastNight.totalMinutes,
                recentTimings = timings,
                restorativeZ = restorativeZ,
                regularityIndex = regularity.index,
            )
        }

        // --- Strain ---------------------------------------------------------------------------
        // TRIMP is measured from the resting-HR baseline, so a morning that is 8 bpm above usual does
        // not change every minute of the day (B10). Today's reading only stands in without a baseline.
        val restingForLoad = RestingHeartRateSource.loadAnchor(rhr.baseline.center, rhr.current, dailyDao.latest(rhrMetric, day)?.value)
        val age = user.ageOn(date.year)
        // Robust observed maximum (B5): the 99.5th percentile of active minutes over 180 days, never one glitch.
        val peakSince = dayEnd - PEAK_LOOKBACK_MS
        val activePeakMinutes = hrDao.countMinutesBetween(peakSince, dayEnd, MaxHeartRate.MIN_PEAK_SAMPLE_BPM, MaxHeartRate.MAX_PEAK_SAMPLE_BPM)
        val observedPeak = MaxHeartRate.robustPeakOffset(activePeakMinutes)?.let {
            hrDao.minuteAverageAtRank(peakSince, dayEnd, MaxHeartRate.MIN_PEAK_SAMPLE_BPM, MaxHeartRate.MAX_PEAK_SAMPLE_BPM, it)
        }
        val maxHr = MaxHeartRate.resolve(age, observedPeak, user.maxHeartRateOverride?.toDouble())
        val cardio = if (restingForLoad != null && maxHr != null && maxHr.bpm > restingForLoad) {
            CardioProfile(restingForLoad, maxHr.bpm, user.sex, maxHr.provenance)
        } else null

        val hrRows = hrDao.range(dayStart, dayEnd)
        val strain = if (cardio != null && hrRows.isNotEmpty()) {
            strainEngine.evaluate(hrRows.map { HeartRateSample(it.avgBpm, 1.0) }, cardio)
        } else null
        val strainMissing = when {
            strain != null -> null
            hrRows.isEmpty() -> MissingReason.NO_HEART_RATE_DATA
            restingForLoad == null -> MissingReason.NEEDS_RESTING_HEART_RATE
            else -> MissingReason.NEEDS_MAX_HEART_RATE
        }

        var workouts = db.workoutDao().between(day, day)
        if (persist && cardio != null) {
            for (w in workouts) {
                val inside = hrRows.filter { it.timestampEpochMillis >= w.startEpochMillis && it.timestampEpochMillis < w.endEpochMillis }
                if (inside.isEmpty()) continue
                val r = strainEngine.evaluate(inside.map { HeartRateSample(it.avgBpm, 1.0) }, cardio)
                if (w.derivedTrimp != r.trimp || w.derivedStrain != r.strain) {
                    db.workoutDao().updateDerivedLoad(w.id, r.trimp, r.strain)
                }
            }
            workouts = db.workoutDao().between(day, day)
        }

        // --- Training load --------------------------------------------------------------------
        // Earlier days are the stored loads (only days worn >= 600 minutes were stored). The day itself
        // is a null entry while it is today, and when it was worn too little (B2, B3).
        val earlierLoads = series(MetricType.DAILY_TRIMP).filter { it.epochDay < day }.map { DailyLoad(it.epochDay, it.value) }
        val thisDayLoad = strain?.let { DailyLoadPolicy.historyEntry(day, today(), it.trimp, it.recordedMinutes) } ?: DailyLoad(day, null)
        val load = loadEngine.analyze(earlierLoads + thisDayLoad, day)
        // Yesterday's ratio for this morning's recovery, and only when it carries no caveat (B6).
        val yesterdayRatio = loadEngine.analyze(earlierLoads, day - 1).reliableUncoupledRatio

        // --- Recovery -------------------------------------------------------------------------
        val subjectiveFatigue = valueOn(MetricType.SUBJECTIVE_FATIGUE, day)?.toInt()
        val calibrating = listOf(hrv, rhr).any { it.current != null && !it.baseline.isEstablished }
        val recovery = recoveryEngine.evaluate(
            RecoveryInputs(
                hrvZ = hrv.zScore,
                restingHeartRateZ = rhr.zScore,
                sleepScore = sleepResult?.score,
                respiratoryRateZ = resp.zScore,
                skinTemperatureZ = skin.zScore,
                subjectiveFatigue = subjectiveFatigue,
                // Yesterday's ratio: this morning's readiness must not depend on today's training.
                acuteChronicRatio = yesterdayRatio,
                autonomicBaselineCalibrating = calibrating,
                calibrationDaysRemaining = listOf(hrv, rhr).filter { it.current != null && !it.baseline.isEstablished }
                    .minOfOrNull { it.baseline.daysUntilEstablished },
            ),
        )

        val targetCalculator = StrainTargetCalculator(strainEngine)
        val personalBase = targetCalculator.personalBase(((day - TARGET_BASE_DAYS) until day).map { strainByDay[it] })
        val target = recovery.score?.let { targetCalculator.targetFor(it, personalBase) }
        // No heart-rate data means nothing is "left" (B11): it must not read as a full window.
        val remaining = if (target != null && cardio != null && strain != null) targetCalculator.remaining(strain.trimp, target, cardio) else null

        val nightsForTonight = if (night != null) earlier + night else earlier
        val needTonight = needCalculator.need(
            nightsForTonight.map { it.minutesAsleep.toDouble() },
            strainZ(day, strain?.strain),
            balances(day + 1, nightsForTonight),
            day + 1,
        )

        val fatigue = FatigueSignalDetector.assess(hrv, rhr, resp)

        val vo2Row = dailyDao.latest(MetricType.VO2_MAX, day)?.takeIf { day - it.epochDay <= VO2_MAX_AGE_DAYS }
        val vo2 = when {
            vo2Row != null -> Vo2MaxReading(vo2Row.value, vo2Row.provenance, vo2Row.epochDay, null)
            cardio != null -> CardioFitness.estimateFromHeartRateRatio(cardio.maxHeartRate, cardio.restingHeartRate)
                ?.let { Vo2MaxReading(it.mlPerKgPerMin, it.provenance, null, it.method) }
            else -> null
        }

        val analysis = DayAnalysis(
            epochDay = day,
            isProvisional = day >= today(),
            recovery = recovery,
            hrv = hrv,
            restingHeartRate = rhr,
            restingHeartRateMetric = rhrMetric,
            respiratoryRate = resp,
            skinTemperature = skin,
            spo2 = spo2,
            sleepSession = night,
            sleep = sleepResult,
            sleepNeedLastNight = needLastNight,
            sleepNeedTonight = needTonight,
            strain = strain,
            strainMissing = strainMissing,
            strainTarget = target,
            remaining = remaining,
            cardioProfile = cardio,
            maxHeartRate = maxHr,
            zones = cardio?.let { HeartRateZoneModel.of(it, user.zoneMethod) },
            load = load,
            fatigue = fatigue,
            vo2Max = vo2,
            workouts = workouts,
            subjectiveFatigue = subjectiveFatigue,
            subjectiveSoreness = valueOn(MetricType.SUBJECTIVE_SORENESS, day)?.toInt(),
            provenance = rows.filter { it.epochDay == day }.associate { it.metricType to it.provenance },
            steps = valueOn(MetricType.STEPS, day),
        )
        if (persist) store(analysis)
        return analysis
    }

    /**
     * Fills in nightly values a source did not deliver as daily figures but that follow directly
     * from stored samples: the mean of the overnight HRV readings and the mean heart rate during
     * the main sleep. They are labelled derived and lose to any observed daily value.
     */
    private suspend fun deriveNightlyObservations(day: Long, night: SleepSessionEntity?) {
        if (night == null) return
        val dailyDao = db.dailyBiometricSummaryDao()
        val now = nowMillis()
        val derived = ArrayList<DailyBiometricSummaryEntity>()

        val hrvStats = db.metricSampleDao().stats(MetricType.HRV_RMSSD, night.startEpochMillis, night.endEpochMillis)
        val hrvMean = hrvStats.mean
        if (hrvMean != null && hrvStats.n >= MIN_HRV_SAMPLES) {
            derived += derivedRow(MetricType.HRV_RMSSD, day, hrvMean, now, sampleCount = hrvStats.n)
        }
        val sleepHr = db.intradayHeartRateDao().stats(night.startEpochMillis, night.endEpochMillis)
        val sleepHrMean = sleepHr.avgBpm
        if (sleepHrMean != null && sleepHr.minutes >= MIN_SLEEP_HR_MINUTES) {
            derived += derivedRow(MetricType.SLEEPING_HEART_RATE, day, sleepHrMean, now, sampleCount = sleepHr.minutes)
        }
        if (derived.isNotEmpty()) dailyDao.reconcileAndUpsert(derived)

        // The session is the reconciled truth for the night, so its summary minutes are written as is.
        val asleep = night.minutesAsleep.toDouble()
        val observed = listOfNotNull(
            MetricType.SLEEP_DURATION to asleep,
            MetricType.TIME_IN_BED to night.minutesInBed.toDouble(),
            MetricType.SLEEP_AWAKE to night.minutesAwake.toDouble(),
            if (night.minutesInBed > 0) MetricType.SLEEP_EFFICIENCY to (100.0 * asleep / night.minutesInBed).coerceIn(0.0, 100.0) else null,
            night.minutesDeep?.let { MetricType.SLEEP_DEEP to it.toDouble() },
            night.minutesRem?.let { MetricType.SLEEP_REM to it.toDouble() },
            night.minutesLight?.let { MetricType.SLEEP_LIGHT to it.toDouble() },
            night.minutesToFallAsleep?.let { MetricType.SLEEP_LATENCY to it.toDouble() },
        ).map { (metric, value) ->
            DailyBiometricSummaryEntity(metric, day, value, night.provenance, updatedAtEpochMillis = now)
        }
        dailyDao.upsertAll(observed)
    }

    private suspend fun store(a: DayAnalysis) {
        val now = nowMillis()
        val dao = db.dailyBiometricSummaryDao()
        val values: List<Pair<MetricType, Double?>> = listOf(
            MetricType.RECOVERY_SCORE to a.recovery.score,
            MetricType.SLEEP_SCORE to a.sleep?.score,
            MetricType.SLEEP_NEED to a.sleepNeedLastNight.totalMinutes,
            MetricType.SLEEP_DEBT to a.sleepNeedLastNight.accumulatedDebtMinutes,
            MetricType.SLEEP_CONSISTENCY to a.sleep?.contributions
                ?.firstOrNull { it.component == com.apex.athlete.core.analytics.sleep.SleepComponent.CONSISTENCY }?.subScore,
            MetricType.STRAIN_SCORE to a.strain?.strain,
            MetricType.STRAIN_TARGET to a.strainTarget?.center,
            MetricType.DAILY_TRIMP to a.strain?.let { DailyLoadPolicy.storedTrimp(it.trimp, it.recordedMinutes) },
            MetricType.ACUTE_LOAD to a.load.acuteLoad,
            MetricType.CHRONIC_LOAD to a.load.chronicLoad,
            MetricType.ACWR_COUPLED to a.load.acwrCoupled,
            MetricType.ACWR_UNCOUPLED to a.load.acwrUncoupled,
            MetricType.TRAINING_MONOTONY to a.load.monotony,
            MetricType.TRAINING_STRAIN_FOSTER to a.load.fosterStrain,
            MetricType.TRAINING_BALANCE to a.load.trainingBalance,
        )
        val present = values.mapNotNull { (metric, value) ->
            value?.takeIf { it.isFinite() }?.let { derivedRow(metric, a.epochDay, it, now) }
        }
        if (present.isNotEmpty()) dao.upsertAll(present)
        // A score whose inputs have gone stays missing instead of showing a stale number.
        for ((metric, value) in values) if (value == null || !value.isFinite()) dao.delete(metric, a.epochDay)
    }

    private fun derivedRow(metric: MetricType, day: Long, value: Double, now: Long, sampleCount: Int? = null) =
        DailyBiometricSummaryEntity(
            metricType = metric,
            epochDay = day,
            value = value,
            provenance = DataProvenance.MATHEMATICALLY_DERIVED,
            sampleCount = sampleCount,
            algorithmVersion = ANALYTICS_ALGORITHM_VERSION,
            updatedAtEpochMillis = now,
        )

    /**
     * Sleep Regularity Index of the 7 windows (local noon to noon) before the end of [day]'s night.
     * A window is covered when a main sleep ended on the civil day after it starts; naps count as sleep.
     */
    private fun regularityOf(day: Long, mainSleeps: List<SleepSessionEntity>, all: List<SleepSessionEntity>) =
        SleepRegularityIndex.compute(
            spans = all.filter { it.epochDay in (day - 7)..day }.map {
                SleepSpan(
                    Math.floorDiv(it.startEpochMillis + it.startZoneOffsetSeconds * 1000L, 60_000L),
                    Math.floorDiv(it.endEpochMillis + it.endZoneOffsetSeconds * 1000L, 60_000L),
                )
            },
            firstWindowDay = day - 7,
            covered = (0 until 7).map { i -> mainSleeps.any { it.epochDay == day - 6 + i } },
        )

    /** Bed and wake time as local clock minutes, using the UTC offset recorded with the session. */
    private fun timingOf(s: SleepSessionEntity): SleepTiming {
        fun minuteOfDay(epochMillis: Long, offsetSeconds: Int): Double {
            val t = Instant.ofEpochMilli(epochMillis).atOffset(ZoneOffset.ofTotalSeconds(offsetSeconds)).toLocalTime()
            return t.hour * 60.0 + t.minute + t.second / 60.0
        }
        return SleepTiming(
            onsetMinuteOfDay = minuteOfDay(s.startEpochMillis, s.startZoneOffsetSeconds),
            wakeMinuteOfDay = minuteOfDay(s.endEpochMillis, s.endZoneOffsetSeconds),
        )
    }

    companion object {
        /** Days of daily values loaded: 66 for the weekly HRV baseline (60 nights before the week), plus margin. */
        const val HISTORY_DAYS = 70L
        /** Prior strain days behind the sleep-need z-score, and the days of the personal strain-target base. */
        const val STRAIN_Z_DAYS = 30L
        const val TARGET_BASE_DAYS = 14L
        const val SLEEP_HISTORY_DAYS = 30L
        const val PEAK_LOOKBACK_MS = 180L * 24 * 60 * 60 * 1000
        const val VO2_MAX_AGE_DAYS = 30
        const val MIN_HRV_SAMPLES = 6
        const val MIN_SLEEP_HR_MINUTES = 60
    }
}
