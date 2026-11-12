package com.apex.athlete.ui.common

import com.apex.athlete.R
import com.apex.athlete.core.analytics.baseline.BaselineStatus
import com.apex.athlete.core.analytics.load.LoadCaveat
import com.apex.athlete.core.analytics.load.TrainingLoadResult
import com.apex.athlete.core.analytics.recovery.FatigueAssessment
import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.recovery.FatigueSignal
import com.apex.athlete.core.analytics.recovery.RecoveryResult
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.data.pipeline.DayAnalysis
import com.apex.athlete.core.data.pipeline.MissingReason
import com.apex.athlete.core.data.repository.HeartRateTick
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState

/**
 * Maps engine output to the [MetricState] every metric renders through.
 *
 * The rules, which tests pin down:
 *  - A missing input is never a number. It becomes [MetricState.Unavailable] (with the reason) or
 *    [MetricState.Calibrating] (with the nights still needed); never zero, never an estimate.
 *  - Provenance is passed through unchanged; scores computed here from observed inputs keep the
 *    provenance the engine reported (derived).
 *  - Today's strain is marked provisional while the day is still accumulating.
 *  - A reading older than 36 hours that is shown at all becomes [MetricState.Stale] with its age.
 *  - Skin-temperature differences are converted to the owner's temperature unit.
 */
class MetricStateMapper(private val formatter: ApexFormatter) {

    // --- Scores ---------------------------------------------------------------------------------

    fun recovery(a: DayAnalysis): MetricState = recovery(a.recovery, a)

    fun recovery(result: RecoveryResult, analysis: DayAnalysis? = null): MetricState = when (result.status) {
        RecoveryStatus.SCORED -> result.scorePercent
            ?.let { MetricState.Value(it.toDouble(), 0, "%", result.provenance) }
            ?: MetricState.Unavailable(MetricReason.NO_DATA)
        RecoveryStatus.CALIBRATING -> MetricState.Calibrating(result.calibrationDaysRemaining)
        RecoveryStatus.UNAVAILABLE -> MetricState.Unavailable(
            when {
                analysis == null -> MetricReason.NO_DATA
                analysis.isProvisional && analysis.sleepSession == null -> MetricReason.AWAITING_SLEEP_SYNC
                analysis.hrv.current == null -> MetricReason.NO_HRV_LAST_NIGHT
                else -> MetricReason.NO_DATA
            },
        )
    }

    fun strain(a: DayAnalysis): MetricState {
        val strain = a.strain ?: return missing(a.strainMissing)
        return MetricState.Value(strain.strain, 1, null, strain.provenance, isProvisional = a.isProvisional)
    }

    fun sleep(a: DayAnalysis): MetricState {
        val score = a.sleep ?: return MetricState.Unavailable(
            if (a.isProvisional) MetricReason.AWAITING_SLEEP_SYNC else MetricReason.NO_DATA,
        )
        return MetricState.Value(score.scorePercent.toDouble(), 0, "%", DataProvenance.MATHEMATICALLY_DERIVED)
    }

    /** Workload ratio. Shown only when the engine produced one; a short history is Calibrating, never a guess. */
    fun workloadRatio(load: TrainingLoadResult): MetricState {
        val ratio = load.acwrUncoupled ?: load.acwrCoupled
        if (ratio != null && ratio.isFinite()) {
            return MetricState.Value(ratio, 2, null, load.provenance)
        }
        return if (LoadCaveat.SHORT_HISTORY in load.caveats || load.daysOfHistory < MIN_LOAD_DAYS) {
            MetricState.Calibrating((MIN_LOAD_DAYS - load.daysOfHistory).coerceAtLeast(0).takeIf { it > 0 })
        } else {
            MetricState.Unavailable(MetricReason.NO_DATA)
        }
    }

    fun missing(reason: MissingReason?): MetricState = when (reason) {
        MissingReason.NO_HEART_RATE_DATA -> MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA)
        MissingReason.NO_SLEEP_DATA -> MetricState.Unavailable(MetricReason.AWAITING_SLEEP_SYNC)
        MissingReason.NEEDS_RESTING_HEART_RATE ->
            MetricState.Unavailable(MetricReason.NO_DATA, formatter.string(R.string.mapper_needs_resting_hr))
        MissingReason.NEEDS_MAX_HEART_RATE ->
            MetricState.Unavailable(MetricReason.NO_DATA, formatter.string(R.string.mapper_needs_max_hr))
        MissingReason.CALIBRATING -> MetricState.Calibrating(null)
        MissingReason.NO_DATA, null -> MetricState.Unavailable(MetricReason.NO_DATA)
    }

    // --- Biometrics -----------------------------------------------------------------------------

    /**
     * A daily biometric against the personal baseline. [observedAtMillis], when the screen knows the
     * time of the reading (for example the latest value on a live view), enables the 36 h stale rule.
     * Past days pass null: a historical value is not "stale".
     */
    fun intelligence(
        intelligence: MetricIntelligence,
        metric: MetricType,
        provenance: DataProvenance?,
        observedAtMillis: Long? = null,
    ): MetricState {
        val display = displayFor(metric)
        val raw = intelligence.current
        if (raw == null || !raw.isFinite()) return MetricState.Unavailable(MetricReason.NO_DATA)
        return value(display.convert(raw), display.decimals, display.unit, provenance, observedAtMillis)
    }

    /** Nights still needed before the personal range exists, or null when it is established. */
    fun calibrationDaysLeft(intelligence: MetricIntelligence): Int? =
        intelligence.baseline.takeIf { it.status == BaselineStatus.CALIBRATING }?.daysUntilEstablished?.takeIf { it > 0 }

    fun heartRate(tick: HeartRateTick?): MetricState {
        val bpm = tick?.bpm
        if (tick == null || bpm == null) return MetricState.Unavailable(MetricReason.NO_DATA)
        return value(bpm, 0, "bpm", tick.provenance, tick.epochMillis)
    }

    /** VO2 max when the analysis has one; unavailable otherwise (never estimated here). */
    fun vo2Max(a: DayAnalysis): MetricState {
        val reading = a.vo2Max ?: return MetricState.Unavailable(MetricReason.NO_DATA)
        return value(reading.value, 1, "ml/kg/min", reading.provenance, observedAtMillis = null)
    }

    fun steps(a: DayAnalysis): MetricState {
        val steps = a.steps ?: return MetricState.Unavailable(MetricReason.NO_DATA)
        return MetricState.Value(steps, 0, null, a.provenance[MetricType.STEPS], isProvisional = a.isProvisional)
    }

    /**
     * The general rule for one reading. Null or non-finite is Unavailable; older than 36 h (when
     * [observedAtMillis] is known) is Stale with its age; otherwise a Value.
     */
    fun value(
        value: Double?,
        decimals: Int,
        unit: String?,
        provenance: DataProvenance?,
        observedAtMillis: Long? = null,
        isProvisional: Boolean = false,
    ): MetricState {
        if (value == null || !value.isFinite()) return MetricState.Unavailable(MetricReason.NO_DATA)
        if (observedAtMillis != null && formatter.isStale(observedAtMillis)) {
            return MetricState.Stale(value, decimals, unit, provenance, since = formatter.relativeTime(observedAtMillis))
        }
        return MetricState.Value(
            value = value,
            decimals = decimals,
            unit = unit,
            provenance = provenance,
            asOf = observedAtMillis?.let(formatter::relativeTime),
            isProvisional = isProvisional,
        )
    }

    // --- Words ----------------------------------------------------------------------------------

    fun fatigueLevelText(assessment: FatigueAssessment): String = formatter.string(
        when (assessment.level) {
            FatigueLevel.NONE -> R.string.mapper_fatigue_none
            FatigueLevel.WATCH -> R.string.mapper_fatigue_watch
            FatigueLevel.ELEVATED -> R.string.mapper_fatigue_elevated
            FatigueLevel.HIGH -> R.string.mapper_fatigue_high
        },
    )

    /** One plain sentence per signal; observational, never diagnostic. */
    fun fatigueSignalText(signal: FatigueSignal): String = formatter.string(
        when (signal) {
            FatigueSignal.HRV_ACUTE_DROP -> R.string.mapper_signal_hrv_drop
            FatigueSignal.HRV_SUSTAINED_SUPPRESSION -> R.string.mapper_signal_hrv_sustained
            FatigueSignal.HRV_WEEKLY_AVERAGE_BELOW_RANGE -> R.string.mapper_signal_hrv_weekly
            FatigueSignal.RESTING_HR_ELEVATED -> R.string.mapper_signal_rhr_high
            FatigueSignal.RESTING_HR_SUSTAINED_ELEVATION -> R.string.mapper_signal_rhr_sustained
            FatigueSignal.RESPIRATORY_RATE_ELEVATED -> R.string.mapper_signal_resp_high
        },
    )

    fun loadCaveatText(caveat: LoadCaveat): String = formatter.string(
        when (caveat) {
            LoadCaveat.SHORT_HISTORY -> R.string.mapper_caveat_short_history
            LoadCaveat.LOW_CHRONIC_LOAD -> R.string.mapper_caveat_low_chronic
            LoadCaveat.SPARSE_DATA -> R.string.mapper_caveat_sparse
        },
    )

    // --- Display table --------------------------------------------------------------------------

    private class Display(val decimals: Int, val unit: String?, val convert: (Double) -> Double = { it })

    private fun displayFor(metric: MetricType): Display = when (metric) {
        MetricType.HRV_RMSSD, MetricType.HRV_DEEP_SLEEP_RMSSD -> Display(0, "ms")
        MetricType.RESTING_HEART_RATE, MetricType.SLEEPING_HEART_RATE -> Display(0, "bpm")
        MetricType.RESPIRATORY_RATE -> Display(1, "br/min")
        MetricType.SPO2_AVG, MetricType.SPO2_LOWER_BOUND, MetricType.SPO2_UPPER_BOUND -> Display(1, "%")
        MetricType.SKIN_TEMP_DEVIATION -> Display(1, formatter.temperatureDeltaUnit(), formatter::temperatureDeltaValue)
        MetricType.VO2_MAX -> Display(1, "ml/kg/min")
        MetricType.SLEEP_DURATION, MetricType.TIME_IN_BED -> Display(1, "h") { it / 60.0 }
        MetricType.RECOVERY_SCORE, MetricType.SLEEP_SCORE -> Display(0, "%")
        MetricType.STRAIN_SCORE, MetricType.STRAIN_TARGET -> Display(1, null)
        MetricType.STEPS -> Display(0, null)
        MetricType.DAILY_TRIMP -> Display(0, null)
        else -> Display(0, metric.unit.takeIf { it.isNotBlank() })
    }

    private companion object {
        /** TrainingLoadEngine needs 14 days before it reports a ratio (Config.minDaysForRatio). */
        const val MIN_LOAD_DAYS = 14
    }
}

/** A repository result that is still null means "not loaded yet": render the component's skeleton. */
fun <T : Any> T?.toStateOrLoading(map: (T) -> MetricState): MetricState = if (this == null) MetricState.Loading else map(this)
