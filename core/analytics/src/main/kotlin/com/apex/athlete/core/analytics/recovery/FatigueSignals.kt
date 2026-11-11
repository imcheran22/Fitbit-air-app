package com.apex.athlete.core.analytics.recovery

import com.apex.athlete.core.analytics.trend.MetricIntelligence
import com.apex.athlete.core.analytics.trend.RangeStatus

/** One physiological sign that recovery may be incomplete. None of these is a diagnosis. */
enum class FatigueSignal {
    /** Last night's HRV was at least 1.5 SD below the personal baseline. */
    HRV_ACUTE_DROP,
    /** HRV has been below the personal normal range for three or more days in a row. */
    HRV_SUSTAINED_SUPPRESSION,
    /** The 7-day HRV average itself has slipped below the normal range. */
    HRV_WEEKLY_AVERAGE_BELOW_RANGE,
    /** Today's resting heart rate is at least 1.5 SD above the personal baseline. */
    RESTING_HR_ELEVATED,
    /** Resting heart rate has been above the normal range for three or more days in a row. */
    RESTING_HR_SUSTAINED_ELEVATION,
    /** Overnight breathing rate is at least 2 SD above the personal baseline. */
    RESPIRATORY_RATE_ELEVATED,
}

enum class FatigueLevel { NONE, WATCH, ELEVATED, HIGH }

data class FatigueAssessment(val level: FatigueLevel, val signals: Set<FatigueSignal>)

/**
 * Combines the HRV, resting-heart-rate and breathing-rate analyses into a short list of fatigue
 * indicators. Thresholds are deliberately conservative so a single noisy night does not raise an
 * alert: sustained signals need three consecutive days, acute ones need 1.5–2 SD.
 */
object FatigueSignalDetector {

    const val ACUTE_Z = 1.5
    const val RESPIRATORY_Z = 2.0
    const val SUSTAINED_DAYS = 3

    fun assess(
        hrv: MetricIntelligence?,
        restingHeartRate: MetricIntelligence?,
        respiratoryRate: MetricIntelligence? = null,
    ): FatigueAssessment {
        val signals = LinkedHashSet<FatigueSignal>()

        if (hrv != null) {
            val z = hrv.zScore
            if (z != null && z <= -ACUTE_Z) signals += FatigueSignal.HRV_ACUTE_DROP
            if (hrv.rangeStatus == RangeStatus.BELOW_NORMAL && hrv.consecutiveDaysOutsideNormal >= SUSTAINED_DAYS) {
                signals += FatigueSignal.HRV_SUSTAINED_SUPPRESSION
            }
            val lower = hrv.baseline.lowerNormal
            val weekly = hrv.ewma7
            if (lower != null && weekly != null && weekly < lower) {
                signals += FatigueSignal.HRV_WEEKLY_AVERAGE_BELOW_RANGE
            }
        }

        if (restingHeartRate != null) {
            val z = restingHeartRate.zScore
            if (z != null && z >= ACUTE_Z) signals += FatigueSignal.RESTING_HR_ELEVATED
            if (restingHeartRate.rangeStatus == RangeStatus.ABOVE_NORMAL &&
                restingHeartRate.consecutiveDaysOutsideNormal >= SUSTAINED_DAYS
            ) {
                signals += FatigueSignal.RESTING_HR_SUSTAINED_ELEVATION
            }
        }

        val brZ = respiratoryRate?.zScore
        if (brZ != null && brZ >= RESPIRATORY_Z) signals += FatigueSignal.RESPIRATORY_RATE_ELEVATED

        val hrvFlag = signals.any { it.name.startsWith("HRV_") }
        val rhrFlag = signals.any { it.name.startsWith("RESTING_HR_") }
        val sustained = FatigueSignal.HRV_SUSTAINED_SUPPRESSION in signals ||
            FatigueSignal.RESTING_HR_SUSTAINED_ELEVATION in signals

        val level = when {
            signals.isEmpty() -> FatigueLevel.NONE
            // Independent systems agreeing over several days is the strongest evidence available here.
            hrvFlag && rhrFlag && sustained -> FatigueLevel.HIGH
            (hrvFlag && rhrFlag) || sustained -> FatigueLevel.ELEVATED
            else -> FatigueLevel.WATCH
        }
        return FatigueAssessment(level, signals)
    }
}
