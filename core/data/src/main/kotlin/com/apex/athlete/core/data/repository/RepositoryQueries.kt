package com.apex.athlete.core.data.repository

import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.data.pipeline.BodyMassIndex
import com.apex.athlete.core.data.pipeline.JournalDay
import com.apex.athlete.core.data.settings.UserProfile
import com.apex.athlete.core.data.store.ActiveStore
import com.apex.athlete.core.database.entity.DailyBiometricSummaryEntity
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType

/**
 * The reads behind the activity, body, vitals, stress/energy, journal, fitness and workout-detail flows of [AthleteRepository].
 * They take the store (not the repository) so tests can drive them on an in-memory database without the settings store.
 * Every read is a snapshot of one day; none writes (the pipeline's `analyze(persist = false)` stores nothing).
 */
internal object RepositoryQueries {

    const val STEPS_HISTORY_DAYS = 14
    const val BODY_HISTORY_DAYS = 90
    const val STRESS_HISTORY_DAYS = 14
    const val VO2_HISTORY_DAYS = 90

    private fun reading(row: DailyBiometricSummaryEntity?, metric: MetricType): MetricReading =
        if (row == null) MetricReading.absent(metric)
        else MetricReading(metric, row.value, row.epochDay, row.provenance, null, row.sampleCount)

    suspend fun history(store: ActiveStore, metric: MetricType, day: Long, days: Int): List<TrendPoint> {
        val rows = store.db.dailyBiometricSummaryDao().range(metric, day - days + 1, day).associateBy { it.epochDay }
        return ((day - days + 1)..day).map { TrendPoint(it, rows[it]?.value) }
    }

    suspend fun activityDay(store: ActiveStore, day: Long): ActivityDayState {
        val a = store.pipeline.analyze(day, persist = false)
        val rows = store.db.dailyBiometricSummaryDao().forDay(day).associateBy { it.metricType }
        return ActivityDayState(
            analysis = a,
            isDemo = store.isDemo,
            epochDay = day,
            isProvisional = a.isProvisional,
            readings = ACTIVITY_METRICS.associateWith { reading(rows[it], it) },
            workouts = a.workouts,
            stepsHistory = history(store, MetricType.STEPS, day, STEPS_HISTORY_DAYS),
        )
    }

    suspend fun body(store: ActiveStore, day: Long, profile: UserProfile, historyDays: Int = BODY_HISTORY_DAYS): BodyState {
        val dao = store.db.dailyBiometricSummaryDao()
        val weightRow = dao.latest(MetricType.WEIGHT, day)
        // A weigh-in beats the profile weight; the profile weight is the owner's own entry, so it is labelled user-reported.
        val weight = when {
            weightRow != null -> reading(weightRow, MetricType.WEIGHT)
            profile.weightKg != null -> MetricReading(MetricType.WEIGHT, profile.weightKg, null, DataProvenance.USER_REPORTED, null)
            else -> MetricReading.absent(MetricType.WEIGHT)
        }
        val bmiValue = BodyMassIndex.compute(weight.value, profile.heightCm)
        val bmi = when {
            bmiValue != null -> MetricReading(MetricType.BMI, bmiValue, weight.epochDay, DataProvenance.MATHEMATICALLY_DERIVED, null)
            weight.value == null -> MetricReading.absent(MetricType.BMI, ReadingMissing.NEEDS_WEIGHT)
            else -> MetricReading.absent(MetricType.BMI, ReadingMissing.NEEDS_HEIGHT)
        }
        val weightHistory = history(store, MetricType.WEIGHT, day, historyDays)
        return BodyState(
            isDemo = store.isDemo,
            epochDay = day,
            heightCm = profile.heightCm,
            weight = weight,
            bodyFat = reading(dao.latest(MetricType.BODY_FAT, day), MetricType.BODY_FAT),
            bmi = bmi,
            weightHistory = weightHistory,
            bodyFatHistory = history(store, MetricType.BODY_FAT, day, historyDays),
            bmiHistory = weightHistory.map { TrendPoint(it.epochDay, BodyMassIndex.compute(it.value, profile.heightCm)) },
        )
    }

    suspend fun vitals(store: ActiveStore, day: Long): VitalsState {
        val rows = store.db.dailyBiometricSummaryDao().forDay(day).associateBy { it.metricType }
        val night = store.db.sleepDao().mainSleepForDay(day)
        val samples = store.db.metricSampleDao()
        val readings = VITALS_METRICS.associateWith { metric ->
            when (metric) {
                // Raw samples only: the night's mean, with the number of five-minute windows behind it.
                MetricType.HRV_LOW_FREQUENCY, MetricType.HRV_HIGH_FREQUENCY -> {
                    val windows = night?.let { samples.range(metric, it.startEpochMillis, it.endEpochMillis) }.orEmpty()
                    if (windows.isEmpty()) MetricReading.absent(metric)
                    else MetricReading(metric, windows.sumOf { it.value } / windows.size, day, windows.first().provenance, null, windows.size)
                }
                else -> reading(rows[metric], metric)
            }
        }
        return VitalsState(store.isDemo, day, readings)
    }

    suspend fun stressEnergy(store: ActiveStore, day: Long): StressEnergyState {
        val a = store.pipeline.analyze(day, persist = false)
        return StressEnergyState(
            isDemo = store.isDemo,
            epochDay = day,
            isProvisional = a.isProvisional,
            stress = a.stress,
            stressMinuteLevels = a.stressMinuteLevels,
            stressDayAggregateBpm = a.stressDayAggregateBpm,
            stressBaseline = a.stressBaseline,
            stressMissing = a.stressMissing,
            stressHistory = history(store, MetricType.STRESS_SCORE, day, STRESS_HISTORY_DAYS),
            energy = a.energy,
            energyMissing = a.energyMissing,
        )
    }

    suspend fun journal(store: ActiveStore, day: Long): JournalState {
        val a = store.pipeline.analyze(day, persist = false)
        val rows = store.db.dailyBiometricSummaryDao().forDay(day).associateBy { it.metricType }
        return JournalState(
            isDemo = store.isDemo,
            epochDay = day,
            factors = JournalDay.FACTORS.associateWith { m -> rows[m]?.let { it.value >= 0.5 } },
            effects = a.journalEffects,
        )
    }

    suspend fun fitness(store: ActiveStore, day: Long): FitnessState {
        val a = store.pipeline.analyze(day, persist = false)
        return FitnessState(
            isDemo = store.isDemo,
            epochDay = day,
            vo2Max = a.vo2Max,
            category = a.vo2Category,
            fitnessAge = a.fitnessAge,
            vo2History = history(store, MetricType.VO2_MAX, day, VO2_HISTORY_DAYS),
        )
    }

    suspend fun workoutDetail(store: ActiveStore, id: String): WorkoutDetailState? {
        val w = store.db.workoutDao().byId(id) ?: return null
        val a = store.pipeline.analyze(w.epochDay, persist = false)
        val rows = store.db.intradayHeartRateDao().range(w.startEpochMillis, w.endEpochMillis)
        val zones = a.zones
        return WorkoutDetailState(
            workout = w,
            isDemo = store.isDemo,
            recovery = store.pipeline.heartRateRecovery(w, zones),
            recoveryNeedsZones = zones == null,
            zoneMinutes = zones?.let { z ->
                val counts = rows.groupingBy { z.zoneFor(it.avgBpm) }.eachCount()
                HeartRateZone.entries.associateWith { (counts[it] ?: 0).toDouble() }
            },
            heartRate = rows.map { HeartRateTick(it.timestampEpochMillis, it.avgBpm, it.provenance) },
        )
    }
}
