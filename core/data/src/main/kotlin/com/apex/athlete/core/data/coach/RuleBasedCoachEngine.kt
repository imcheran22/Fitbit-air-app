package com.apex.athlete.core.data.coach

import com.apex.athlete.core.analytics.recovery.FatigueLevel
import com.apex.athlete.core.analytics.recovery.FatigueSignal
import com.apex.athlete.core.analytics.recovery.RecoveryCategory
import com.apex.athlete.core.analytics.recovery.RecoveryComponent
import com.apex.athlete.core.analytics.recovery.RecoveryStatus
import com.apex.athlete.core.analytics.strain.HeartRateZone
import com.apex.athlete.core.data.pipeline.DayAnalysis
import com.apex.athlete.core.data.pipeline.MissingReason
import com.apex.athlete.core.data.settings.UnitSystem
import java.util.Locale
import kotlin.math.roundToInt

enum class CoachAdvice { TRAIN_HARD, TRAIN_MODERATE, TRAIN_EASY, REST_OR_DEFER, NO_ADVICE }

/**
 * One sentence of the briefing.
 *
 * @property numbers every numeral that appears in [text], exactly as printed. Each one is a template
 *   slot filled from a computed value, never free text, which is what the "no invented numbers"
 *   test checks.
 */
data class CoachLine(val topic: Topic, val text: String, val numbers: List<String>) {
    enum class Topic { RECOVERY, DRIVER, SLEEP, STRAIN, FATIGUE, TONIGHT }
}

data class CoachBriefing(val advice: CoachAdvice, val headline: String, val lines: List<CoachLine>)

/**
 * Deterministic morning briefing. Every sentence restates a number that is on screen and says what
 * it means for today; nothing here is a diagnosis, and when an input is missing the sentence says
 * so instead of guessing.
 */
class RuleBasedCoachEngine {

    /** [units] only changes how the skin-temperature difference is written, so the sentence matches the screen. */
    fun briefing(a: DayAnalysis, units: UnitSystem = UnitSystem.METRIC): CoachBriefing {
        val lines = ArrayList<CoachLine>()
        val advice = advice(a)

        // --- Recovery -------------------------------------------------------------------------
        val r = a.recovery
        when (r.status) {
            RecoveryStatus.SCORED -> {
                val p = r.scorePercent!!.toString()
                val meaning = when (r.category!!) {
                    RecoveryCategory.PEAK -> "Your body is well recovered."
                    RecoveryCategory.MODERATE -> "Your body is partly recovered."
                    RecoveryCategory.RESTORATIVE -> "Your body is still recovering."
                }
                lines += line(CoachLine.Topic.RECOVERY, "Recovery is {0}%. $meaning", p)
            }
            RecoveryStatus.CALIBRATING -> {
                val n = r.calibrationDaysRemaining
                lines += if (n != null && n > 0) {
                    line(CoachLine.Topic.RECOVERY, "Recovery is calibrating. It needs {0} more ${plural(n, "night")} of readings to learn your normal range.", n.toString())
                } else {
                    line(CoachLine.Topic.RECOVERY, "Recovery is calibrating while Apex learns your normal range.")
                }
            }
            RecoveryStatus.UNAVAILABLE ->
                lines += line(CoachLine.Topic.RECOVERY, "No recovery score today: last night has no heart rate variability or resting heart rate reading.")
        }

        // --- What moved it --------------------------------------------------------------------
        val strongest = (r.negativeContributors + r.positiveContributors).maxByOrNull { kotlin.math.abs(it.impact) }
        when (strongest?.component) {
            RecoveryComponent.HRV -> {
                val now = a.hrv.current
                val usual = a.hrv.baseline.center
                if (now != null && usual != null) {
                    val word = if (strongest.impact >= 0) "above" else "below"
                    lines += line(CoachLine.Topic.DRIVER, "Heart rate variability was {0} ms, $word your usual {1} ms.", whole(now), whole(usual))
                }
            }
            RecoveryComponent.RESTING_HEART_RATE -> {
                val now = a.restingHeartRate.current
                val usual = a.restingHeartRate.baseline.center
                if (now != null && usual != null) {
                    val word = if (strongest.impact >= 0) "below" else "above"
                    lines += line(CoachLine.Topic.DRIVER, "Resting heart rate was {0} bpm, $word your usual {1} bpm.", whole(now), whole(usual))
                }
            }
            RecoveryComponent.SLEEP -> Unit // covered by the sleep sentence below
            RecoveryComponent.RESPIRATORY_RATE -> {
                val now = a.respiratoryRate.current
                val usual = a.respiratoryRate.baseline.center
                if (now != null && usual != null) {
                    lines += line(CoachLine.Topic.DRIVER, "Breathing rate overnight was {0} per minute against your usual {1}.", oneDecimal(now), oneDecimal(usual))
                }
            }
            RecoveryComponent.SKIN_TEMPERATURE -> {
                val now = a.skinTemperature.current
                if (now != null) {
                    lines += line(CoachLine.Topic.DRIVER, "Skin temperature overnight was {0} from your baseline.", signed(if (units == UnitSystem.IMPERIAL) now * FAHRENHEIT_PER_CELSIUS else now) + if (units == UnitSystem.IMPERIAL) " °F" else " °C")
                }
            }
            else -> Unit
        }

        // --- Sleep ----------------------------------------------------------------------------
        val s = a.sleep
        if (s != null) {
            val text = if (s.sufficientForRecovery) {
                "You slept {0} of the {1} you needed."
            } else {
                "You slept {0}, short of the {1} you needed."
            }
            lines += line(CoachLine.Topic.SLEEP, text, duration(s.asleepMinutes), duration(s.needMinutes))
        } else {
            lines += line(CoachLine.Topic.SLEEP, "No sleep was recorded for last night.")
        }

        // --- Strain ---------------------------------------------------------------------------
        val target = a.strainTarget
        val strain = a.strain
        if (target != null) {
            val low = oneDecimal(target.low)
            val high = oneDecimal(target.high)
            if (strain != null) {
                val now = oneDecimal(strain.strain)
                lines += when {
                    strain.strain > target.high ->
                        line(CoachLine.Topic.STRAIN, "Strain is {0}, above today's target of {1} to {2}. More training today adds fatigue without much benefit.", now, low, high)
                    strain.strain >= target.low ->
                        line(CoachLine.Topic.STRAIN, "Strain is {0}, inside today's target of {1} to {2}.", now, low, high)
                    else -> {
                        val zone = if (advice == CoachAdvice.TRAIN_HARD) HeartRateZone.ZONE_4 else if (advice == CoachAdvice.TRAIN_MODERATE) HeartRateZone.ZONE_3 else HeartRateZone.ZONE_2
                        val toTop = a.remaining?.let { rem ->
                            // Minutes to the upper edge: the capacity figure is to the upper edge, so scale by load.
                            rem.minutesByZone[zone]?.takeIf { it.isFinite() && it > 0 }
                        }
                        if (toTop != null && toTop <= 240) {
                            line(CoachLine.Topic.STRAIN, "Strain is {0}. Today's target is {1} to {2}; about {3} minutes in zone {4} would reach the top of it.", now, low, high, toTop.roundToInt().toString(), zone.number.toString())
                        } else {
                            line(CoachLine.Topic.STRAIN, "Strain is {0}. Today's target is {1} to {2}.", now, low, high)
                        }
                    }
                }
            } else {
                lines += line(CoachLine.Topic.STRAIN, "Today's strain target is {0} to {1}.", low, high)
            }
        } else if (strain == null && a.strainMissing == MissingReason.NO_HEART_RATE_DATA) {
            lines += line(CoachLine.Topic.STRAIN, "No heart rate has arrived for today yet, so strain is not available.")
        }

        // --- Fatigue signals ------------------------------------------------------------------
        if (a.fatigue.level == FatigueLevel.ELEVATED || a.fatigue.level == FatigueLevel.HIGH) {
            val hrvFired = FatigueSignal.HRV_SUSTAINED_SUPPRESSION in a.fatigue.signals
            val rhrFired = FatigueSignal.RESTING_HR_SUSTAINED_ELEVATION in a.fatigue.signals
            // The count comes from the signal(s) that fired; when both are named, only the days both held are true.
            val days = when {
                hrvFired && !rhrFired -> a.hrv.consecutiveDaysOutsideNormal
                rhrFired && !hrvFired -> a.restingHeartRate.consecutiveDaysOutsideNormal
                else -> minOf(a.hrv.consecutiveDaysOutsideNormal, a.restingHeartRate.consecutiveDaysOutsideNormal)
            }
            val what = when {
                FatigueSignal.HRV_SUSTAINED_SUPPRESSION in a.fatigue.signals && FatigueSignal.RESTING_HR_SUSTAINED_ELEVATION in a.fatigue.signals ->
                    "Heart rate variability and resting heart rate have both been outside your normal range"
                FatigueSignal.HRV_SUSTAINED_SUPPRESSION in a.fatigue.signals -> "Heart rate variability has been below your normal range"
                FatigueSignal.RESTING_HR_SUSTAINED_ELEVATION in a.fatigue.signals -> "Resting heart rate has been above your normal range"
                else -> "Heart rate variability and resting heart rate are both outside your normal range today"
            }
            lines += if (days >= 2) {
                line(CoachLine.Topic.FATIGUE, "$what for {0} days. This often follows hard training, short sleep or alcohol; an easier day is reasonable.", days.toString())
            } else {
                line(CoachLine.Topic.FATIGUE, "$what. This often follows hard training, short sleep or alcohol; an easier day is reasonable.")
            }
        }

        // --- Tonight --------------------------------------------------------------------------
        lines += line(CoachLine.Topic.TONIGHT, "Aim for {0} of sleep tonight.", duration(a.sleepNeedTonight.totalMinutes))

        return CoachBriefing(advice, headline(advice), lines)
    }

    fun advice(a: DayAnalysis): CoachAdvice {
        val category = a.recovery.category ?: return CoachAdvice.NO_ADVICE
        return when {
            a.fatigue.level == FatigueLevel.HIGH -> CoachAdvice.REST_OR_DEFER
            category == RecoveryCategory.RESTORATIVE -> CoachAdvice.TRAIN_EASY
            a.fatigue.level == FatigueLevel.ELEVATED -> CoachAdvice.TRAIN_EASY
            category == RecoveryCategory.MODERATE -> CoachAdvice.TRAIN_MODERATE
            else -> CoachAdvice.TRAIN_HARD
        }
    }

    private fun headline(advice: CoachAdvice) = when (advice) {
        CoachAdvice.TRAIN_HARD -> "Ready for a hard session"
        CoachAdvice.TRAIN_MODERATE -> "A moderate day fits"
        CoachAdvice.TRAIN_EASY -> "Keep it easy today"
        CoachAdvice.REST_OR_DEFER -> "Rest, or put hard training off"
        CoachAdvice.NO_ADVICE -> "Not enough data for advice yet"
    }

    /** Fills {0}, {1}, ... and records exactly the strings that were inserted. */
    private fun line(topic: CoachLine.Topic, template: String, vararg slots: String): CoachLine {
        var text = template
        slots.forEachIndexed { i, v -> text = text.replace("{$i}", v) }
        return CoachLine(topic, text, slots.toList())
    }

    private companion object {
        const val FAHRENHEIT_PER_CELSIUS = 1.8
    }

    private fun whole(v: Double) = v.roundToInt().toString()
    private fun oneDecimal(v: Double) = String.format(Locale.US, "%.1f", v)
    private fun signed(v: Double) = (if (v >= 0) "+" else "−") + String.format(Locale.US, "%.1f", kotlin.math.abs(v))
    private fun plural(n: Int, word: String) = if (n == 1) word else word + "s"

    /** "7 h 05 min"; both parts are slots of the same value, reported as printed. */
    private fun duration(minutes: Double): String {
        val m = minutes.roundToInt().coerceAtLeast(0)
        return "${m / 60} h ${String.format(Locale.US, "%02d", m % 60)} min"
    }
}
