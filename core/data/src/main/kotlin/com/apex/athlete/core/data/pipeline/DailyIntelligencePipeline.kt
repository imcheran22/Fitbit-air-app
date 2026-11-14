package com.apex.athlete.core.data.pipeline

import com.apex.athlete.core.analytics.ANALYTICS_ALGORITHM_VERSION
import com.apex.athlete.core.analytics.baseline.BaselineEngine
import com.apex.athlete.core.analytics.baseline.BaselineSpec
import com.apex.athlete.core.analytics.baseline.BaselineSpecs
import com.apex.athlete.core.analytics.baseline.DailyValue
import com.apex.athlete.core.analytics.baseline.DualBaselines
import com.apex.athlete.core.analytics.research.AutonomicMetrics
import com.apex.athlete.core.analytics.research.ConfidenceInputs
import com.apex.athlete.core.analytics.research.ContextTag
import com.apex.athlete.core.analytics.research.DataQuality
import com.apex.athlete.core.analytics.research.MultiSignal
import com.apex.athlete.core.analytics.research.PatternContext
import com.apex.athlete.core.analytics.energy.EnergyResult
import com.apex.athlete.core.analytics.fitness.CardioFitness
import com.apex.athlete.core.analytics.fitness.FitnessAge
import com.apex.athlete.core.analytics.fitness.FitnessAgeResult
import com.apex.athlete.core.analytics.fitness.MaxHeartRate
import com.apex.athlete.core.analytics.fitness.MaxHeartRateEstimate
import com.apex.athlete.core.analytics.fitness.RestingHeartRateSeries
import com.apex.athlete.core.analytics.fitness.RestingHeartRateSource
import com.apex.athlete.core.analytics.fitness.Vo2CategoryResult
import com.apex.athlete.core.analytics.fitness.Vo2Categories
import com.apex.athlete.core.analytics.journal.JournalEffects
import com.apex.athlete.core.analytics.journal.JournalEffectsReport
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
import com.apex.athlete.core.analytics.sleep.DipMissing
import com.apex.athlete.core.analytics.sleep.HeartRateDipResult
import com.apex.athlete.core.analytics.sleep.NightBalance
import com.apex.athlete.core.analytics.sleep.SleepNeed
import com.apex.athlete.core.analytics.sleep.SleepNeedCalculator
import com.apex.athlete.core.analytics.sleep.SleepNightInput
import com.apex.athlete.core.analytics.sleep.SleepRegularity
import com.apex.athlete.core.analytics.sleep.SleepRegularityIndex
import com.apex.athlete.core.analytics.sleep.SleepScoreEngine
import com.apex.athlete.core.analytics.sleep.SleepScoreResult
import com.apex.athlete.core.analytics.sleep.SleepSpan
import com.apex.athlete.core.analytics.sleep.SleepTiming
import com.apex.athlete.core.analytics.strain.CardioProfile
import com.apex.athlete.core.analytics.strain.HeartRateRecoveryResult
import com.apex.athlete.core.analytics.strain.HeartRateSample
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.analytics.strain.HeartRateZoneModel
import com.apex.athlete.core.analytics.strain.RemainingCapacity
import com.apex.athlete.core.analytics.strain.StrainEngine
import com.apex.athlete.core.analytics.strain.StrainResult
import com.apex.athlete.core.analytics.strain.StrainTarget
import com.apex.athlete.core.analytics.strain.StrainTargetCalculator
import com.apex.athlete.core.analytics.stress.MinuteHeartRate
import com.apex.athlete.core.analytics.stress.MinuteStress
import com.apex.athlete.core.analytics.stress.StressBaseline
import com.apex.athlete.core.analytics.stress.StressConfig
import com.apex.athlete.core.analytics.stress.StressSummary
import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.analytics.trend.MetricTrendAnalyzer
import com.apex.athlete.core.analytics.trend.WeeklyHrvStatus
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.database.ApexDatabase
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.database.entity.IntradayHeartRateEntity
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
    /**
     * Mean heart rate during the main sleep against its own baseline (formula version 5); feeds the sleep score's
     * restoration part. Never substituted by the daytime resting heart rate.
     */
    val sleepingHeartRate: MetricIntelligence,
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
    // --- Added in formula version 4. Every output below is null (with a reason where one exists) when its inputs are missing. ---
    /** Daytime stress summary (heart rate while still, against the athlete's own baseline); null with [stressMissing]. */
    val stress: StressSummary?,
    /** Per-minute 0..3 levels behind [stress] for the day chart; empty when [stress] is null. */
    val stressMinuteLevels: List<MinuteStress>,
    /** The day's resting daytime heart rate (feeds later baselines); present even while the stress baseline calibrates. */
    val stressDayAggregateBpm: Double?,
    val stressBaseline: StressBaseline?,
    val stressMissing: StressMissingReason?,
    /** Energy bank curve from the morning recovery and wake time; null with [energyMissing]. Computed on read, not stored. */
    val energy: EnergyResult?,
    val energyMissing: EnergyMissingReason?,
    /** Sleeping heart-rate dip; [HeartRateDipResult.dipFraction] is null with a reason when it cannot be computed. */
    val heartRateDip: HeartRateDipResult,
    /** Next-day associations of journal factors over the last 90 days; null when nothing was journalled. */
    val journalEffects: JournalEffectsReport?,
    /** VO2 max against FRIEND norms; the result carries a missing reason (no sex, no age, no VO2 max) instead of a value. */
    val vo2Category: Vo2CategoryResult,
    val fitnessAge: FitnessAgeResult,
    /** Minutes per heart-rate zone over every recorded minute of the day (including rest); null without a zone model or heart rate. */
    val zoneMinutes: Map<HeartRateZone, Double>?,
    /** Weekly HRV status (last 7 nights against the 60 nights before the week); null without HRV readings. */
    val weeklyHrvStatus: WeeklyHrvStatus?,
    /** Sleep Regularity Index of the last week; [SleepRegularity.index] is null with fewer than two usable day pairs. */
    val sleepRegularity: SleepRegularity,
    /** 0..1 confidence in the training load (density and recency of recorded days); [loadCalibrating] below 0.35. */
    val loadConfidence: Double,
    val loadCalibrating: Boolean,
    /** False when no autonomic signal was available to judge fatigue: "not evaluable", never "no fatigue". */
    val fatigueEvaluable: Boolean,
    /** The athlete's own recent strain base the target is built from; null with fewer than 5 recorded days (then no target). */
    val personalStrainBase: Double?,
    /** Research metrics (formula version 6): dual baselines, HRV CV/SWC, sleep shortfall and midpoint, WASO, sedentary bouts, patterns. */
    val research: ResearchInsights = ResearchInsights.EMPTY,
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
        // Last night's sleeping heart rate against its own baseline (the evaluated day is excluded from the window).
        // Only this series feeds the sleep score's restoration part: when it is missing the daytime resting heart rate
        // is not substituted for it (a different measurement).
        val sleepingHr = analyzeMetric(MetricType.SLEEPING_HEART_RATE, BaselineSpecs.SLEEPING_HEART_RATE)
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

        val regularity = regularityOf(day, sessions, allSessions)
        val sleepResult = night?.let { n ->
            val timings = sessions.filter { it.epochDay in (day - 6)..day }.map(::timingOf)
            // A staged night with neither deep nor REM is a staging failure, not a measurement: it is kept out of the
            // personal baseline and gets no z-score (the engine leaves the quality part out).
            fun restorativeMinutes(s: SleepSessionEntity) = (s.minutesDeep ?: 0) + (s.minutesRem ?: 0)
            fun hasUsableStages(s: SleepSessionEntity) = s.hasStages && s.minutesAsleep > 0 && restorativeMinutes(s) > 0
            val restorativeHistory = earlier.filter { hasUsableStages(it) }
                .map { DailyValue(it.epochDay, restorativeMinutes(it).toDouble() / it.minutesAsleep) }
            val restorativeZ = if (hasUsableStages(n)) {
                val base = BaselineEngine.baseline(restorativeHistory, day, BaselineSpecs.RESTORATIVE_SLEEP_FRACTION)
                BaselineEngine.zScore(restorativeMinutes(n).toDouble() / n.minutesAsleep, base)
            } else null
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
                // Restoration (version 5): the night's own readings against the personal mean/SD baselines. Each z is
                // null when the night has no reading or the baseline is still calibrating; the engine then leaves the
                // part out (partial score, lower confidence) rather than assuming a typical night.
                sleepingHeartRateZ = sleepingHr.zScore,
                hrvZ = hrv.zScore,
                respiratoryRateZ = resp.zScore,
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
                // The behavioural sleep score (duration, stages, efficiency, consistency). The full score also contains
                // last night's heart rate, HRV and breathing rate, which recovery already weighs directly; passing it
                // would count those signals twice (formula version 5).
                sleepScore = sleepResult?.behaviouralScore,
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

        val zones = cardio?.let { HeartRateZoneModel.of(it, user.zoneMethod) }

        // --- Version 4: stress, energy, heart-rate dip, journal effects, fitness category --------------------
        val minuteHeartRate = hrRows.map { MinuteHeartRate(minuteOf(it.timestampEpochMillis), it.avgBpm) }
        val daySleeps = db.sleepDao().overlapping(dayStart, dayEnd)
        val dayWorkouts = db.workoutDao().overlapping(dayStart, dayEnd)
        val stressWindow = StressConfig().baselineWindowDays.toLong()
        val priorAggregates = dailyDao.range(MetricType.STRESS_DAY_AGGREGATE_BPM, day - stressWindow, day - 1)
            .associate { it.epochDay to it.value }
            .let { byDay -> ((day - stressWindow) until day).map { byDay[it] } }
        val stepIntervals = db.metricSampleDao().range(MetricType.STEPS, dayStart - StressDay.MAX_INTERVAL_MINUTES * MINUTE_MS, dayEnd)
            .map { StepInterval(it.timestampEpochMillis, it.endEpochMillis, it.value) }
        val stress = StressDay.evaluate(
            dayStartMillis = dayStart,
            dayEndMillis = dayEnd,
            heartRate = minuteHeartRate,
            stepIntervals = stepIntervals,
            excluded = (daySleeps.map { minuteSpan(it.startEpochMillis, it.endEpochMillis) } +
                dayWorkouts.map { minuteSpan(it.startEpochMillis, it.endEpochMillis) }),
            priorAggregates = priorAggregates,
        )

        // The curve ends at midnight, at "now" for today, or when the next main sleep starts.
        val nextSleepStart = night?.let { n -> daySleeps.filter { it.isMainSleep && it.startEpochMillis > n.endEpochMillis }.minOfOrNull { it.startEpochMillis } }
        val energy = EnergyDay.evaluate(
            recovery = recovery.score,
            wakeMillis = night?.endEpochMillis,
            dayEndMillis = minOf(dayEnd, nextSleepStart ?: dayEnd),
            nowMillis = nowMillis(),
            zones = zones,
            heartRate = minuteHeartRate,
            stressLevels = stress.minuteLevels,
            naps = daySleeps.filter { !it.isMainSleep }.map { minuteRangeOf(it.startEpochMillis, it.endEpochMillis) },
        )

        // --- Version 6: research metrics (descriptive; none of them feeds a score) -----------------
        fun tagOn(metric: MetricType) = valueOn(metric, day) == 1.0
        val tags = buildSet {
            if (tagOn(MetricType.JOURNAL_ALCOHOL)) add(ContextTag.ALCOHOL)
            if (tagOn(MetricType.JOURNAL_LATE_MEAL)) add(ContextTag.LATE_MEAL)
            if (tagOn(MetricType.JOURNAL_TRAVEL)) add(ContextTag.TRAVEL)
        }
        val dualHrv = DualBaselines.hrv(series(MetricType.HRV_RMSSD), day)
        val dualRhr = DualBaselines.restingHeartRate(series(rhrMetric), day)
        val dualResp = DualBaselines.respiratoryRate(series(MetricType.RESPIRATORY_RATE), day)
        val dualSleepingHr = DualBaselines.sleepingHeartRate(series(MetricType.SLEEPING_HEART_RATE), day)
        val hrvCv7 = AutonomicMetrics.cv7LnPercent(series(MetricType.HRV_RMSSD), day)
        // Sync age comes from the real last successful sync (sync watermarks), and only for the current day; history and a
        // never-synced store are unknown (null), which keeps alerts off. The sleep row's update time is not a sync time.
        val hoursSinceSync = if (day >= today()) {
            db.syncWatermarkDao().all().mapNotNull { it.lastSuccessEpochMillis }.maxOrNull()
                ?.let { ((nowMillis() - it) / 3_600_000.0).coerceAtLeast(0.0) }
        } else null
        val dataConfidence = DataQuality.confidence(
            ConfidenceInputs(
                hasCurrentReading = hrv.current != null,
                baselineValidDays = hrv.baseline.validDays,
                hoursSinceLastSync = hoursSinceSync,
                confounders = tags.size,
            ),
        )
        // MV01 "illness-like" pattern: robust nightly z for the last two nights, weekly HRV z, the provider's skin-temperature
        // delta. Missing inputs stay missing; the outcome can then be INSUFFICIENT_DATA.
        val nights2 = listOf(day - 1, day)
        val illness = MultiSignal.illnessLikePattern(
            rhrNightlyZ = nights2.map { DualBaselines.restingHeartRate(series(rhrMetric), it).robustZ },
            hrvWeeklyZ = hrv.weeklyStatus?.zScore,
            hrvNightlyZ = nights2.map { DualBaselines.hrv(series(MetricType.HRV_RMSSD), it).robustZ },
            rrNightlyZ = nights2.map { DualBaselines.respiratoryRate(series(MetricType.RESPIRATORY_RATE), it).robustZ },
            temperatureDeltaC = skin.current,
            context = PatternContext(confidence = dataConfidence, tags = tags),
        )
        val researchStages = night?.let { db.sleepDao().stagesFor(it.id) }.orEmpty()
        val activity = ResearchDay.activity(
            dayStartMillis = dayStart,
            dayEndMillis = dayEnd,
            provisional = day >= today(),
            steps = stepIntervals,
            heartRateMinutes = hrRows.map { minuteOf(it.timestampEpochMillis) },
            asleep = daySleeps.map { minuteSpan(it.startEpochMillis, it.endEpochMillis) },
        )
        val research = ResearchInsights(
            hrvDual = dualHrv,
            restingHeartRateDual = dualRhr,
            sleepingHeartRateDual = dualSleepingHr,
            respiratoryRateDual = dualResp,
            hrvCv7LnPercent = hrvCv7,
            hrvSwc = ResearchDay.hrvSwc(hrv.weeklyStatus),
            hrvPercentFromBaseline = ResearchDay.hrvPercent(hrv.weeklyStatus),
            guidelineShortfall = ResearchDay.shortfall(day, sessions),
            sleepMidpointMinuteOfDay = night?.let(ResearchDay::midpointOf),
            sleepMidpointSd7 = ResearchDay.midpointSd(day, sessions),
            wasoMinutes = night?.let { ResearchDay.waso(it, researchStages) },
            awakeningsPerHour = night?.let(ResearchDay::awakeningsPerHour),
            sedentary = activity.sedentary,
            peakCadence30 = activity.peakCadence30,
            activityMissing = activity.missing,
            patterns = listOf(illness),
            dataConfidence = dataConfidence,
        )

        val dip = heartRateDipOf(day, night, sessions)
        val journal = journalEffectsOf(day, recovery.score)
        val vo2Category = Vo2Categories.classify(vo2?.value, age, user.sex)
        val fitnessAge = FitnessAge.estimate(vo2?.value, age, user.sex)

        val analysis = DayAnalysis(
            epochDay = day,
            isProvisional = day >= today(),
            recovery = recovery,
            hrv = hrv,
            restingHeartRate = rhr,
            restingHeartRateMetric = rhrMetric,
            sleepingHeartRate = sleepingHr,
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
            zones = zones,
            load = load,
            fatigue = fatigue,
            vo2Max = vo2,
            workouts = workouts,
            subjectiveFatigue = subjectiveFatigue,
            subjectiveSoreness = valueOn(MetricType.SUBJECTIVE_SORENESS, day)?.toInt(),
            provenance = rows.filter { it.epochDay == day }.associate { it.metricType to it.provenance },
            steps = valueOn(MetricType.STEPS, day),
            stress = stress.summary,
            stressMinuteLevels = stress.minuteLevels,
            stressDayAggregateBpm = stress.dayAggregateBpm,
            stressBaseline = stress.baseline,
            stressMissing = stress.missing,
            energy = energy.result,
            energyMissing = energy.missing,
            heartRateDip = dip,
            journalEffects = journal,
            vo2Category = vo2Category,
            fitnessAge = fitnessAge,
            zoneMinutes = strain?.minutesByZone,
            weeklyHrvStatus = hrv.weeklyStatus,
            sleepRegularity = regularity,
            loadConfidence = load.loadConfidence,
            loadCalibrating = load.isCalibrating,
            fatigueEvaluable = fatigue.evaluable,
            personalStrainBase = personalBase,
            research = research,
        )
        if (persist) store(analysis)
        return analysis
    }

    /**
     * Sleeping heart-rate dip of the night that ended on [day]: the mean heart rate over the waking time that
     * preceded it (workouts, naps and other sleep left out) against the mean over the night.
     * The waking time runs from the previous wake time (at most 24 h before the onset) to the onset.
     */
    private suspend fun heartRateDipOf(day: Long, night: SleepSessionEntity?, mainSleeps: List<SleepSessionEntity>): HeartRateDipResult {
        if (night == null) return HeartRateDipResult(null, null, DipMissing.NO_SLEEPING_HEART_RATE)
        val previousWake = mainSleeps.filter { it.epochDay < day }.maxOfOrNull { it.endEpochMillis }
        val from = HeartRateDipDay.daytimeStart(night.startEpochMillis, previousWake)
        val hrDao = db.intradayHeartRateDao()
        val excluded = db.sleepDao().overlapping(from, night.startEpochMillis).map { minuteSpan(it.startEpochMillis, it.endEpochMillis) } +
            db.workoutDao().overlapping(from, night.startEpochMillis).map { minuteSpan(it.startEpochMillis, it.endEpochMillis) }
        return HeartRateDipDay.evaluate(
            daytimeHeartRate = hrDao.range(from, night.startEpochMillis).toMinutes(),
            excluded = excluded,
            sleepingHeartRate = hrDao.range(night.startEpochMillis, night.endEpochMillis).toMinutes(),
        )
    }

    /**
     * Journal factors of the 90 days ending on [day] against the next-day recovery and overnight RMSSD. The recovery of
     * [day] itself is the one just computed (it is stored only after this returns); earlier days use their stored scores.
     */
    private suspend fun journalEffectsOf(day: Long, recoveryToday: Double?): JournalEffectsReport? {
        val dao = db.dailyBiometricSummaryDao()
        val from = day - JournalEffects.WINDOW_DAYS
        val factorRows = JournalDay.FACTORS.associateWith { metric ->
            dao.range(metric, from, day).associate { it.epochDay to it.value }
        }.filterValues { it.isNotEmpty() }
        if (factorRows.isEmpty()) return null
        val recovery = dao.range(MetricType.RECOVERY_SCORE, day - JournalEffects.WINDOW_DAYS + 1, day - 1)
            .associate { it.epochDay to it.value }.toMutableMap()
        if (recoveryToday != null) recovery[day] = recoveryToday
        val rmssd = dao.range(MetricType.HRV_RMSSD, day - JournalEffects.WINDOW_DAYS + 1, day).associate { it.epochDay to it.value }
        return JournalDay.analyze(factorRows, recovery, rmssd, day)
    }

    /**
     * Heart-rate recovery of one workout from the minute heart rate around its end (see [WorkoutRecovery]).
     * Null without a zone model. Computed when the workout is opened and never stored.
     */
    suspend fun heartRateRecovery(workout: WorkoutEntity, zones: HeartRateZoneModel?): HeartRateRecoveryResult? {
        if (zones == null) return null
        val end = workout.endEpochMillis
        val rows = db.intradayHeartRateDao().range(
            (minuteCeil(end) - WorkoutRecovery.MINUTES_BEFORE_END) * MINUTE_MS,
            (minuteCeil(end) + WorkoutRecovery.MINUTES_AFTER_END) * MINUTE_MS,
        )
        return WorkoutRecovery.compute(end, rows.toMinutes(), zones)
    }

    private fun List<IntradayHeartRateEntity>.toMinutes() = map { MinuteHeartRate(minuteOf(it.timestampEpochMillis), it.avgBpm) }

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
            MetricType.STRESS_DAY_AGGREGATE_BPM to a.stressDayAggregateBpm,
            MetricType.STRESS_SCORE to a.stress?.meanLevel,
            MetricType.STRESS_LOW_MINUTES to a.stress?.lowMinutes?.toDouble(),
            MetricType.STRESS_MEDIUM_MINUTES to a.stress?.mediumMinutes?.toDouble(),
            MetricType.STRESS_HIGH_MINUTES to a.stress?.highMinutes?.toDouble(),
            MetricType.HR_DIP to a.heartRateDip.dipFraction?.let { it * 100.0 },
            // Version 6 research values. Missing stays missing: the row is deleted, never zero-filled.
            MetricType.RHR_ROBUST_Z to a.research.restingHeartRateDual?.robustZ,
            MetricType.HRV_ROBUST_Z to a.research.hrvDual?.robustZ,
            MetricType.RESP_RATE_ROBUST_Z to a.research.respiratoryRateDual?.robustZ,
            MetricType.HRV_CV7_LN to a.research.hrvCv7LnPercent,
            MetricType.SLEEP_REGULARITY_INDEX to a.sleepRegularity.index,
            MetricType.SLEEP_MIDPOINT to a.research.sleepMidpointMinuteOfDay,
            MetricType.SLEEP_MIDPOINT_SD_7D to a.research.sleepMidpointSd7?.sdMinutes,
            MetricType.GUIDELINE_SHORTFALL_CLIPPED_7D to a.research.guidelineShortfall?.clippedMinutes,
            MetricType.GUIDELINE_SHORTFALL_SIGNED_7D to a.research.guidelineShortfall?.signedMinutes,
            MetricType.SLEEP_WASO to a.research.wasoMinutes,
            MetricType.AWAKENINGS_PER_HOUR to a.research.awakeningsPerHour,
            MetricType.SLEEP_SCORE_CONFIDENCE to a.sleep?.availableWeight,
            MetricType.SEDENTARY_PROLONGED_BOUTS to a.research.sedentary?.bouts?.prolongedCount?.toDouble(),
            MetricType.SEDENTARY_LONGEST_BOUT to a.research.sedentary?.bouts?.longestMinutes,
            MetricType.SEDENTARY_BREAKS_PER_HOUR to a.research.sedentary?.breaksPerSedentaryHour,
            MetricType.PEAK_CADENCE_30 to a.research.peakCadence30,
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
