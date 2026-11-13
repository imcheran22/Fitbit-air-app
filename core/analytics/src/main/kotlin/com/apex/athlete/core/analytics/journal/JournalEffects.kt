package com.apex.athlete.core.analytics.journal

import kotlin.math.exp
import kotlin.math.ln

/**
 * One day's journal. [factors] maps a factor name to yes/no; a factor that was not logged that day has no key
 * (it is not "no").
 */
data class JournalEntry(val epochDay: Long, val factors: Map<String, Boolean>)

/** The next-day outcomes for one day. Null = not measured. [rmssdMs] is the overnight RMSSD in milliseconds. */
data class DailyOutcome(val epochDay: Long, val recovery: Double?, val rmssdMs: Double?)

enum class JournalOutcomeKind {
    /** Difference in recovery score, in points. */
    RECOVERY_POINTS,

    /** Percent difference in RMSSD, analysed on the ln scale. */
    HRV_PERCENT,
}

enum class JournalSkipReason { TOO_FEW_PER_ARM, NO_VARIANCE }

/**
 * An association, not a causal effect. [effect], [ciLow] and [ciHigh] are on the scale of [outcome]: recovery
 * points, or percent for HRV. [effect] is the mean outcome after "yes" days minus after "no" days.
 */
data class JournalEffect(
    val factor: String,
    val outcome: JournalOutcomeKind,
    val nWith: Int,
    val nWithout: Int,
    /** Arm means on the analysis scale (recovery points; ln RMSSD for HRV). */
    val meanWith: Double,
    val meanWithout: Double,
    val effect: Double,
    val ciLow: Double,
    val ciHigh: Double,
    val degreesOfFreedom: Double,
    /** Two-sided Welch p-value. Not corrected for the number of factors tested. */
    val pValue: Double,
) {
    /** True when the 95 % interval does not contain 0 (0 percent for HRV). Equivalent to p < 0.05 for a single test. */
    val intervalExcludesZero: Boolean get() = ciLow > 0.0 || ciHigh < 0.0
}

data class JournalSkip(val factor: String, val outcome: JournalOutcomeKind, val reason: JournalSkipReason, val nWith: Int, val nWithout: Int)

data class JournalEffectsReport(
    val effects: List<JournalEffect>,
    val skipped: List<JournalSkip>,
    /** Number of factor-by-outcome tests actually run. With many tests some intervals will exclude 0 by chance. */
    val testsPerformed: Int,
)

/**
 * Next-day association of a binary journal factor with recovery and HRV.
 *
 * Design:
 *  - Pairing: factor on day d-1 against the outcome of day d (the overnight result follows the day before).
 *  - Window: outcome days in [asOf - 89, asOf], i.e. the last 90 days (calibration choice).
 *  - A day with the factor unlogged, or an outcome that was not measured, is dropped (never read as "no").
 *  - At least [MIN_PER_ARM] = 5 days in each arm, otherwise nothing is reported (calibration choice; with 5 per arm
 *    the Welch interval is wide, which is the honest picture).
 *  - Welch two-sided t-test at alpha = 0.05 and a 95 % interval ([WelchTTest]).
 *  - HRV is analysed on ln(RMSSD) (Plews et al. 2013 Int J Sports Physiol Perform; Buchheit 2014 Front Physiol --
 *    UNVERIFIED, not opened here) because RMSSD is right-skewed and changes are proportional; the effect is
 *    reported as 100 * (e^d - 1) percent with the interval transformed the same way.
 *  - Multiple factors mean multiple tests; no correction is applied, [JournalEffectsReport.testsPerformed] lets the UI caveat that.
 *  - Observational and confounded (a night out also means a late meal, less sleep, etc.). Wording must be "was
 *    associated with", never "caused".
 */
object JournalEffects {
    const val WINDOW_DAYS = 90
    const val MIN_PER_ARM = 5

    fun analyze(
        entries: List<JournalEntry>,
        outcomes: List<DailyOutcome>,
        asOfEpochDay: Long,
        windowDays: Int = WINDOW_DAYS,
        minPerArm: Int = MIN_PER_ARM,
    ): JournalEffectsReport {
        val from = asOfEpochDay - windowDays + 1
        val entryByDay = entries.groupBy { it.epochDay }.mapValues { (_, v) -> v.first() } // first listed wins
        val outcomeByDay = outcomes.filter { it.epochDay in from..asOfEpochDay }.groupBy { it.epochDay }.mapValues { (_, v) -> v.first() }
        val factors = entries.flatMap { it.factors.keys }.distinct().sorted()

        val effects = ArrayList<JournalEffect>()
        val skipped = ArrayList<JournalSkip>()
        for (factor in factors) {
            for (kind in JournalOutcomeKind.entries) {
                val yes = ArrayList<Double>()
                val no = ArrayList<Double>()
                for ((day, out) in outcomeByDay.entries.sortedBy { it.key }) {
                    val flag = entryByDay[day - 1]?.factors?.get(factor) ?: continue
                    val value = when (kind) {
                        JournalOutcomeKind.RECOVERY_POINTS -> out.recovery?.takeIf { it.isFinite() }
                        JournalOutcomeKind.HRV_PERCENT -> out.rmssdMs?.takeIf { it.isFinite() && it > 0.0 }?.let { ln(it) }
                    } ?: continue
                    (if (flag) yes else no).add(value)
                }
                if (yes.isEmpty() && no.isEmpty()) continue // this outcome has no data in the window: nothing to say
                if (yes.size < minPerArm || no.size < minPerArm) {
                    skipped.add(JournalSkip(factor, kind, JournalSkipReason.TOO_FEW_PER_ARM, yes.size, no.size))
                    continue
                }
                val w = WelchTTest.test(yes, no)
                if (w == null) {
                    skipped.add(JournalSkip(factor, kind, JournalSkipReason.NO_VARIANCE, yes.size, no.size))
                    continue
                }
                val pct = { x: Double -> 100.0 * (exp(x) - 1.0) }
                val conv = if (kind == JournalOutcomeKind.HRV_PERCENT) pct else { x: Double -> x }
                effects.add(
                    JournalEffect(
                        factor, kind, yes.size, no.size, w.meanFirst, w.meanSecond,
                        conv(w.difference), conv(w.ciLow), conv(w.ciHigh), w.degreesOfFreedom, w.pValue,
                    ),
                )
            }
        }
        return JournalEffectsReport(effects, skipped, effects.size)
    }
}
