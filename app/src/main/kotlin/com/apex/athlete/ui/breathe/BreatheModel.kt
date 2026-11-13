package com.apex.athlete.ui.breathe

import androidx.annotation.StringRes
import com.apex.athlete.R
import com.apex.athlete.core.analytics.breathe.BreathePattern
import com.apex.athlete.core.analytics.breathe.BreathePhaseType
import com.apex.athlete.core.analytics.breathe.BreatheState
import com.apex.athlete.core.analytics.breathe.SpotHrv
import com.apex.athlete.core.analytics.breathe.SpotHrvMissingReason
import com.apex.athlete.core.database.entity.BreatheSessionEntity

/** A running session. The wall-clock start is what gets saved; the screen ticks its own monotonic clock. */
data class BreatheRun(val pattern: BreathePattern, val plannedSeconds: Int, val startMillis: Long)

/** What the last finished session recorded: shown until the next one starts. [saved] false = nothing was written. */
data class SessionSummary(val pattern: BreathePattern, val plannedSeconds: Int, val completedSeconds: Int, val saved: Boolean)

data class SessionRowUi(
    val id: String,
    val startMillis: Long,
    /** Null for a pattern key this app version does not know (an import); [rawKey] is then shown. */
    val pattern: BreathePattern?,
    val rawKey: String,
    val plannedSeconds: Int,
    val completedSeconds: Int,
)

object BreatheGuide {
    val DURATIONS_SECONDS: List<Int> = listOf(60, 180, 300)
    const val DEFAULT_DURATION_SECONDS = 180
    const val MAX_RR_INTERVALS = 600

    /** The key stored with a session. */
    fun keyOf(pattern: BreathePattern): String = pattern.name

    fun patternOf(key: String?): BreathePattern? = BreathePattern.entries.firstOrNull { it.name == key }

    /** Whole seconds of a stopped or finished session, never above the planned length and never negative. */
    fun completedSeconds(elapsedMillis: Long, plannedSeconds: Int): Int =
        (elapsedMillis.coerceIn(0L, plannedSeconds * 1000L) / 1000L).toInt()

    /** Size of the guide circle as a fraction (0.4 to 1.0) of its largest size at this moment of the session. */
    fun scale(pattern: BreathePattern, state: BreatheState): Float {
        val low = 0.4f
        val high = 1.0f
        val topUpStart = 0.8f
        val hasTopUp = pattern.phases.any { it.type == BreathePhaseType.TOP_UP_INHALE }
        val p = state.phaseProgress.toFloat()
        return when (state.type) {
            BreathePhaseType.INHALE -> low + ((if (hasTopUp) topUpStart else high) - low) * p
            BreathePhaseType.TOP_UP_INHALE -> topUpStart + (high - topUpStart) * p
            BreathePhaseType.HOLD_AFTER_INHALE -> high
            BreathePhaseType.EXHALE -> high - (high - low) * p
            BreathePhaseType.HOLD_AFTER_EXHALE -> low
        }
    }

    /** Whole seconds left in the current phase, counting up to the next one (never 0 while the phase is still running). */
    fun secondsLeftInPhase(pattern: BreathePattern, state: BreatheState): Int {
        val duration = pattern.phases[state.phaseIndex].durationMillis
        return Math.ceil((duration - state.elapsedInPhaseMillis) / 1000.0).toInt().coerceAtLeast(1)
    }

    @StringRes
    fun phaseRes(type: BreathePhaseType): Int = when (type) {
        BreathePhaseType.INHALE -> R.string.breathe_phase_in
        BreathePhaseType.TOP_UP_INHALE -> R.string.breathe_phase_in_again
        BreathePhaseType.HOLD_AFTER_INHALE, BreathePhaseType.HOLD_AFTER_EXHALE -> R.string.breathe_phase_hold
        BreathePhaseType.EXHALE -> R.string.breathe_phase_out
    }

    /** "In 4 s" style timing line of one phase, as a string resource plus the seconds to put in it. */
    @StringRes
    fun phaseTimingRes(type: BreathePhaseType): Int = when (type) {
        BreathePhaseType.INHALE -> R.string.breathe_timing_in
        BreathePhaseType.TOP_UP_INHALE -> R.string.breathe_timing_in_again
        BreathePhaseType.HOLD_AFTER_INHALE, BreathePhaseType.HOLD_AFTER_EXHALE -> R.string.breathe_timing_hold
        BreathePhaseType.EXHALE -> R.string.breathe_timing_out
    }

    @StringRes
    fun patternName(p: BreathePattern): Int = when (p) {
        BreathePattern.BOX -> R.string.breathe_pattern_box
        BreathePattern.FOUR_SEVEN_EIGHT -> R.string.breathe_pattern_478
        BreathePattern.COHERENT -> R.string.breathe_pattern_coherent
        BreathePattern.EXTENDED_EXHALE -> R.string.breathe_pattern_extended
        BreathePattern.PHYSIOLOGICAL_SIGH -> R.string.breathe_pattern_sigh
    }

    fun rows(sessions: List<BreatheSessionEntity>): List<SessionRowUi> =
        sessions.sortedByDescending { it.startMillis }.map {
            SessionRowUi(it.id, it.startMillis, patternOf(it.patternKey), it.patternKey, it.plannedSeconds, it.completedSeconds)
        }
}

/** The spot-HRV section: no strap, waiting for beats, or the analysis (a value or a reason). Values are always estimates. */
sealed interface SpotHrvUi {
    data object NoStrap : SpotHrvUi
    data object Waiting : SpotHrvUi
    data class Analysed(
        val rmssdMs: Double?,
        val meanHeartRateBpm: Double?,
        val acceptedBeats: Int,
        val reason: SpotHrvMissingReason?,
    ) : SpotHrvUi
}

/** [rr] null = no strap stream at all. An empty list = connected but nothing yet. */
fun spotHrvUi(rr: List<Int>?): SpotHrvUi {
    if (rr == null) return SpotHrvUi.NoStrap
    if (rr.isEmpty()) return SpotHrvUi.Waiting
    val r = SpotHrv.analyse(rr.takeLast(BreatheGuide.MAX_RR_INTERVALS).map { it.toDouble() })
    return SpotHrvUi.Analysed(r.rmssdMs, r.meanHeartRateBpm, r.acceptedBeats, r.missingReason)
}

@StringRes
fun spotHrvReasonRes(reason: SpotHrvMissingReason): Int = when (reason) {
    SpotHrvMissingReason.TOO_FEW_BEATS -> R.string.breathe_hrv_reason_few
    SpotHrvMissingReason.TOO_SHORT_RECORDING -> R.string.breathe_hrv_reason_short
    SpotHrvMissingReason.NO_ADJACENT_BEATS -> R.string.breathe_hrv_reason_adjacent
}
