package com.apex.athlete.core.analytics.research

import com.apex.athlete.core.analytics.recovery.FatigueSignalDetector
import kotlin.math.abs

/**
 * A daily signal that can take part in a multi-signal pattern. The scale each one is read on is
 * given with it: every signal is a robust z-score against the person's own usual (positive = above
 * usual) except [SLEEP_TEMPERATURE_DELTA_C] (degrees Celsius, as the provider reports it) and
 * [TAG_ALCOHOL_OR_LATE_MEAL] (1.0 = the user tagged it, 0.0 = no tag).
 */
enum class PatternSignal(val label: String) {
    RESTING_HEART_RATE("Resting heart rate"),
    /** z of last night's ln RMSSD against the 60-night baseline. */
    HRV_NIGHT("HRV (last night)"),
    /** [com.apex.athlete.core.analytics.trend.WeeklyHrvStatus.zScore]: the 7-night ln RMSSD mean against the 60-night baseline. */
    HRV_WEEKLY("HRV (7-night average)"),
    /** z that held on each of the last two nights; see [MultiSignal.persistentZ]. */
    HRV_LAST_TWO_NIGHTS("HRV (last two nights)"),
    RESPIRATORY_RATE("Breathing rate"),
    SLEEP_TEMPERATURE_DELTA_C("Sleeping skin temperature"),
    SLEEP_DURATION("Sleep duration"),
    SLEEP_EFFICIENCY("Sleep efficiency"),
    /** z of bedtime against usual; higher = later. Compute it on the clock circle, not on raw minutes. */
    BEDTIME("Bedtime"),
    /** z of the Sleep Regularity Index against the person's own history; lower = less regular. */
    SLEEP_REGULARITY("Sleep regularity"),
    /** z of the SD of the sleep midpoint over recent nights; higher = less consistent. */
    SLEEP_TIMING_VARIABILITY("Sleep timing consistency"),
    /** z of the free-day minus work-day sleep midpoint gap (social jetlag). */
    WEEKEND_SLEEP_SHIFT("Weekend sleep shift"),
    STEPS("Daily steps"),
    SEDENTARY_TIME("Sedentary time"),
    /** z of activity in the evening hours, against usual. */
    EVENING_ACTIVITY("Evening activity"),
    /** z of the daily training load (one scale only, see [LoadMetrics]). */
    TRAINING_LOAD("Training load"),
    MVPA("Moderate-to-vigorous activity"),
    TAG_ALCOHOL_OR_LATE_MEAL("Alcohol or late meal tagged"),
}

/** Which way a signal has to move for a rule to count. STABLE means "close to usual". */
enum class Deviation { HIGHER, LOWER, STABLE }

/** Things the user can tag that plausibly explain a deviation; shown with a detected pattern. */
enum class ContextTag { ALCOHOL, LATE_MEAL, ILLNESS, TRAVEL, HARD_TRAINING }

/**
 * @property threshold HIGHER: value >= threshold. LOWER: value <= -threshold. STABLE: |value| < threshold.
 */
data class SignalRule(val signal: PatternSignal, val deviation: Deviation, val threshold: Double) {
    init {
        require(threshold > 0.0) { "threshold must be > 0" }
    }

    /** True / false when the reading exists, null when it does not. A missing reading is never "normal". */
    fun check(value: Double?): Boolean? {
        if (value == null || !value.isFinite()) return null
        return when (deviation) {
            Deviation.HIGHER -> value >= threshold
            Deviation.LOWER -> value <= -threshold
            Deviation.STABLE -> abs(value) < threshold
        }
    }
}

/**
 * One thing the pattern needs to see, satisfied by any one of [alternatives] ("RHR up or HRV
 * down"). It is unknown when no alternative deviates and at least one has no reading.
 */
data class Criterion(val label: String, val alternatives: List<SignalRule>) {
    init {
        require(alternatives.isNotEmpty()) { "a criterion needs at least one rule" }
    }
}

/** How firmly the research backs a combination (its column "(f) status"). */
enum class PatternMaturity { EXPLORATORY, SUPPORTABLE }

/**
 * A rule-based consistency check, not a score.
 *
 * @property minConcurrent criteria that must be met together. MV01 states 2 of 3; for the other
 *   combinations the research states none and requires every listed criterion, the conservative
 *   reading (calibration choice).
 * @property supporting rules that are listed when they also hold but do not count towards
 *   [minConcurrent] (MV01's temperature).
 * @property alertEligible only the research's INS-REC-03 (MV01) is specified as an insight; the
 *   rest are display-only learning cards.
 * @property suppressedByTags tags that remove the pattern (the user already knows the reason).
 * @property lowerProminenceTags tags that keep the pattern but make it quieter.
 * @property source where the combination comes from.
 */
data class PatternSpec(
    val id: String,
    val title: String,
    val criteria: List<Criterion>,
    val minConcurrent: Int,
    val maturity: PatternMaturity,
    val evidenceClass: String,
    val interpretation: String,
    val suggestion: String,
    val source: String,
    val supporting: List<SignalRule> = emptyList(),
    val alertEligible: Boolean = false,
    val suppressedByTags: Set<ContextTag> = emptySet(),
    val lowerProminenceTags: Set<ContextTag> = emptySet(),
) {
    init {
        require(minConcurrent in 1..criteria.size) { "minConcurrent must be within 1..criteria.size" }
    }
}

enum class PatternOutcome {
    /** At least [PatternSpec.minConcurrent] criteria are met. */
    DETECTED,
    /** Too few criteria are met and the missing readings could not change that. */
    NOT_DETECTED,
    /** Missing readings could still decide the outcome. Nothing is said. */
    INSUFFICIENT_DATA,
}

/** A signal that took part, with the value that was read. */
data class SignalFinding(val signal: PatternSignal, val value: Double, val rule: SignalRule)

data class CriterionResult(val criterion: Criterion, val met: Boolean?, val findings: List<SignalFinding>)

/** Quality of the inputs and the user's own tags for the evaluated night. */
data class PatternContext(
    /** Data-quality confidence of the inputs ([DataQuality.confidence]); null = not assessed, so no alert. */
    val confidence: MetricConfidence? = null,
    val tags: Set<ContextTag> = emptySet(),
)

/**
 * @property contributing the signals behind the criteria that were met, each with its value, so
 *   the card can show every one of them.
 * @property alertAllowed true only for a detected, alert-eligible pattern with adequate data
 *   quality and no suppressing tag.
 * @property likelyExplanations the user's own tags, shown as the probable explanation.
 */
data class PatternMatch(
    val spec: PatternSpec,
    val outcome: PatternOutcome,
    val metCount: Int,
    val unknownCount: Int,
    val criteria: List<CriterionResult>,
    val contributing: List<SignalFinding>,
    val supporting: List<SignalFinding>,
    val alertAllowed: Boolean,
    val lowProminence: Boolean,
    val likelyExplanations: Set<ContextTag>,
    val suppressionReason: String?,
) {
    val detected: Boolean get() = outcome == PatternOutcome.DETECTED

    /** "2 of 3 signals moved together: ..." for a detected pattern, null otherwise. */
    val observation: String?
        get() = if (!detected) null else
            "$metCount of ${spec.criteria.size} signals differed from your usual together: " +
                (contributing + supporting).joinToString("; ") { "${it.signal.label} (${direction(it.rule)})" }

    /** Wording for the card: always hedged, never a diagnosis. Null unless detected. */
    val message: String? get() = if (!detected) null else "${spec.interpretation} ${MultiSignal.NOT_A_DIAGNOSIS}"

    private fun direction(rule: SignalRule) = when (rule.deviation) {
        Deviation.HIGHER -> "higher than usual"
        Deviation.LOWER -> "lower than usual"
        Deviation.STABLE -> "about usual"
    }
}

/**
 * The research's multivariable combinations (Deep Research P2-4, MV01–MV10, and the patterns of
 * the merged research §2.5) that are not class D. Each is a consistency check on signals the
 * app already computes: it counts how many deviated from the person's own usual at the same
 * time and names them. There is no weighted composite and no score (research rule AR05).
 *
 *  - Missing readings stay missing: they neither count as a deviation nor as normal. When they
 *    could still decide the outcome the result is [PatternOutcome.INSUFFICIENT_DATA].
 *  - Every wording says "may". No pattern names a disease or says the person is ill.
 *  - Not built: MV06 and the merged "respiratory change" (breathing rate up with SpO2 down),
 *    which the research excludes as a desaturation or sleep-apnoea screen (class D: filtered,
 *    sparse wrist SpO2 and the Sjoding 2020 bias).
 *  - The fatigue levels of [FatigueSignalDetector] (mean/SD baselines, consecutive days) are a
 *    different, existing rule set and are left alone. MV01 here follows the research's robust-z
 *    rule. The merged "possible high physiological strain" pattern (RHR up, HRV down, sleep
 *    down) is covered by that detector for RHR and HRV and by [MV08]/[MV02] for sleep.
 *
 * Evidence: class C for MV01 (cohort-level support only: Natarajan et al. 2020, Mishra et al.
 * 2020, Alavi et al. 2022, with purpose-built research algorithms, not this rule); the others
 * are exploratory, with no validated formula, and are only meaningful as within-person
 * observations. A single day matching one of them is an observation, not a finding: the
 * research asks that effects across many days be reported with an interval and corrected for the
 * number of pairs scanned ([InterpretationStats.benjaminiHochberg]). All thresholds other than
 * those quoted for MV01 are calibration choices.
 */
object MultiSignal {

    /** Added to every message. */
    const val NOT_A_DIAGNOSIS = "This is not a diagnosis."

    /**
     * z at which a signal counts as deviating in the exploratory patterns. Calibration choice,
     * the same 1.5 SD as [FatigueSignalDetector.ACUTE_Z].
     */
    const val EXPLORATORY_Z = FatigueSignalDetector.ACUTE_Z

    /** A signal is "about usual" when |z| is below this. Calibration choice. */
    const val STABLE_Z = 1.0

    /** MV01 thresholds from the research's INS-REC-03 trigger. Temperature is tunable. */
    const val MV01_RHR_Z = 2.0
    const val MV01_HRV_WEEKLY_Z = 1.5
    const val MV01_HRV_TWO_NIGHT_Z = 2.0
    const val MV01_RR_Z = 2.0
    const val MV01_TEMPERATURE_C = 0.3

    private fun higher(s: PatternSignal, t: Double = EXPLORATORY_Z) = SignalRule(s, Deviation.HIGHER, t)
    private fun lower(s: PatternSignal, t: Double = EXPLORATORY_Z) = SignalRule(s, Deviation.LOWER, t)
    private fun stable(s: PatternSignal) = SignalRule(s, Deviation.STABLE, STABLE_Z)
    private fun c(label: String, vararg rules: SignalRule) = Criterion(label, rules.toList())

    private val RHR_UP_OR_HRV_DOWN = c(
        "Resting heart rate higher or HRV lower",
        higher(PatternSignal.RESTING_HEART_RATE),
        lower(PatternSignal.HRV_NIGHT),
    )

    /**
     * MV01 (INS-REC-03). At least 2 of: resting heart rate z >= 2, HRV 7-night z <= -1.5 (or
     * z <= -2 on each of the last two nights), breathing rate z >= 2, within the same two-night
     * window. Sleeping skin temperature of +0.3 °C or more is listed as a further signal when
     * present but does not count. Suppressed when an illness tag is already active; quieter
     * after an alcohol tag. Exploratory, class C.
     */
    val MV01 = PatternSpec(
        id = "MV01",
        title = "Resting heart rate, HRV and breathing rate moved together",
        criteria = listOf(
            c("Resting heart rate higher", higher(PatternSignal.RESTING_HEART_RATE, MV01_RHR_Z)),
            c(
                "HRV lower",
                lower(PatternSignal.HRV_WEEKLY, MV01_HRV_WEEKLY_Z),
                lower(PatternSignal.HRV_LAST_TWO_NIGHTS, MV01_HRV_TWO_NIGHT_Z),
            ),
            c("Breathing rate higher", higher(PatternSignal.RESPIRATORY_RATE, MV01_RR_Z)),
        ),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "Several signals moved together compared with your usual. This may happen after poor " +
            "sleep, alcohol, heat, stress, hard training or when you are feeling unwell; the app cannot tell which.",
        suggestion = "If you feel unwell, rest and consider talking to a healthcare professional. If you feel " +
            "fine, an easy day and an early night may be reasonable.",
        source = "Deep Research P2-4 MV01; P3-2 example C (INS-REC-03)",
        supporting = listOf(higher(PatternSignal.SLEEP_TEMPERATURE_DELTA_C, MV01_TEMPERATURE_C)),
        alertEligible = true,
        suppressedByTags = setOf(ContextTag.ILLNESS),
        lowerProminenceTags = setOf(ContextTag.ALCOHOL),
    )

    /** MV02. Short sleep, then a higher resting heart rate or lower HRV. Evidence: sleep restriction (Van Dongen 2003); autonomic evidence mixed. */
    val MV02 = PatternSpec(
        id = "MV02",
        title = "Short sleep followed by a higher resting heart rate or lower HRV",
        criteria = listOf(c("Sleep shorter", lower(PatternSignal.SLEEP_DURATION)), RHR_UP_OR_HRV_DOWN),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "A short night and a higher resting heart rate or lower HRV appeared together. Short sleep " +
            "may be related to how your body recovered, but one occurrence shows an association, not a cause.",
        suggestion = "Consider protecting tonight's sleep opportunity.",
        source = "Deep Research P2-4 MV02",
    )

    /** MV03. Late bedtime or low regularity, then lower HRV. Plausible, limited device-level data. */
    val MV03 = PatternSpec(
        id = "MV03",
        title = "Late or irregular sleep timing followed by lower HRV",
        criteria = listOf(
            c("Bedtime later or sleep less regular", higher(PatternSignal.BEDTIME), lower(PatternSignal.SLEEP_REGULARITY)),
            c("HRV lower", lower(PatternSignal.HRV_NIGHT)),
        ),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "Later or less regular sleep timing and a lower HRV appeared together. Timing may be related " +
            "to HRV in your own data; one night cannot show that.",
        suggestion = "Try holding a steady wake-up time for a week and compare.",
        source = "Deep Research P2-4 MV03",
    )

    /** MV04. Fewer steps or more sedentary time, then lower sleep efficiency that night. Small effects in the literature. */
    val MV04 = PatternSpec(
        id = "MV04",
        title = "Less movement during the day and lower sleep efficiency",
        criteria = listOf(
            c("Fewer steps or more sedentary time", lower(PatternSignal.STEPS), higher(PatternSignal.SEDENTARY_TIME)),
            c("Sleep efficiency lower", lower(PatternSignal.SLEEP_EFFICIENCY)),
        ),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "A quieter day and lower sleep efficiency appeared together. Activity may be related to sleep, " +
            "but the effects reported are small and one night shows nothing on its own.",
        suggestion = "Add a short walk on a quiet day and see whether anything changes over several weeks.",
        source = "Deep Research P2-4 MV04",
    )

    /** MV05. More evening activity, then lower sleep efficiency. Stutz 2019 found little effect except very vigorous exercise close to bedtime. */
    val MV05 = PatternSpec(
        id = "MV05",
        title = "Evening activity and lower sleep efficiency",
        criteria = listOf(
            c("Evening activity higher", higher(PatternSignal.EVENING_ACTIVITY)),
            c("Sleep efficiency lower", lower(PatternSignal.SLEEP_EFFICIENCY)),
        ),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "More activity in the evening and lower sleep efficiency appeared together. In studies of " +
            "healthy adults evening exercise mostly had little effect on sleep, so this may well be unrelated.",
        suggestion = "No change is needed on this basis alone.",
        source = "Deep Research P2-4 MV05; Stutz et al. 2019",
    )

    /**
     * MV07. Warmer sleeping skin temperature (+0.3 °C or more, a tunable value) with a higher
     * resting heart rate. Ring-device fever research (Smarr 2020) is a different device class; the
     * provider states its temperature is not for fever detection.
     */
    val MV07 = PatternSpec(
        id = "MV07",
        title = "Warmer sleeping skin temperature with a higher resting heart rate",
        criteria = listOf(
            c("Sleeping skin temperature higher", higher(PatternSignal.SLEEP_TEMPERATURE_DELTA_C, MV01_TEMPERATURE_C)),
            c("Resting heart rate higher", higher(PatternSignal.RESTING_HEART_RATE)),
        ),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "Your skin temperature during sleep and your resting heart rate were both above your usual. " +
            "Warm rooms, bedding, alcohol, late exercise or hormonal changes may also raise them; this is not a body " +
            "temperature or fever reading.",
        suggestion = "Note how you feel and check again tomorrow.",
        source = "Deep Research P2-4 MV07",
    )

    /**
     * MV08 and the merged "training-load mismatch": load up, then a higher resting heart rate or
     * lower HRV. Short sleep is listed when present. Athlete-monitoring support (Plews 2012-14,
     * Buchheit 2014, Bourdon 2017); needs logged workouts.
     */
    val MV08 = PatternSpec(
        id = "MV08",
        title = "Higher training load with a higher resting heart rate or lower HRV",
        criteria = listOf(c("Training load higher", higher(PatternSignal.TRAINING_LOAD)), RHR_UP_OR_HRV_DOWN),
        minConcurrent = 2,
        maturity = PatternMaturity.SUPPORTABLE,
        evidenceClass = "B",
        interpretation = "Recent training was higher than usual and your resting heart rate or HRV differs from your " +
            "usual. Your current load may be exceeding your current recovery; this is a pattern in your own data, not " +
            "a prediction of injury.",
        suggestion = "Consider an easier session and check how your legs and energy feel.",
        source = "Deep Research P2-4 MV08; merged research 2.5 (training-load mismatch)",
        supporting = listOf(lower(PatternSignal.SLEEP_DURATION)),
    )

    /** MV09. A tagged alcohol or late-meal evening followed by lower HRV or higher resting heart rate. Pietilä 2018. */
    val MV09 = PatternSpec(
        id = "MV09",
        title = "A tagged evening followed by lower HRV or a higher resting heart rate",
        criteria = listOf(
            c("Alcohol or late meal tagged", higher(PatternSignal.TAG_ALCOHOL_OR_LATE_MEAL, 1.0)),
            RHR_UP_OR_HRV_DOWN,
        ),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "After the evening you tagged, your HRV was lower or your resting heart rate higher than usual. " +
            "Alcohol and late meals have been linked to lower overnight HRV in a large real-world sample, so this may " +
            "be related; one night is one observation.",
        suggestion = "Keep tagging: with several tagged and untagged nights the app can compare them properly.",
        source = "Deep Research P2-4 MV09; Pietilä et al. 2018",
    )

    /** MV10. A later weekend sleep shift and a drop in steps, then a higher resting heart rate on the Monday. */
    val MV10 = PatternSpec(
        id = "MV10",
        title = "A weekend sleep shift and fewer steps before a higher Monday resting heart rate",
        criteria = listOf(
            c("Weekend sleep later than on work days", higher(PatternSignal.WEEKEND_SLEEP_SHIFT)),
            c("Fewer steps", lower(PatternSignal.STEPS)),
            c("Resting heart rate higher", higher(PatternSignal.RESTING_HEART_RATE)),
        ),
        minConcurrent = 3,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "A later weekend sleep, fewer steps and a higher resting heart rate appeared together. Shifts " +
            "in sleep timing between work days and free days may be related to how the week starts.",
        suggestion = "Keeping a steadier wake-up time at the weekend may be worth trying.",
        source = "Deep Research P2-4 MV10; Roenneberg et al. 2012",
    )

    /** Merged research 2.5 "circadian disruption": inconsistent sleep timing, shorter sleep and more inactivity. */
    val CIRCADIAN_DISRUPTION = PatternSpec(
        id = "MVX-CIRCADIAN",
        title = "Sleep timing less consistent, sleep shorter and daytime movement lower",
        criteria = listOf(
            c("Sleep timing less consistent", higher(PatternSignal.SLEEP_TIMING_VARIABILITY)),
            c("Sleep shorter", lower(PatternSignal.SLEEP_DURATION)),
            c("More sedentary time or fewer steps", higher(PatternSignal.SEDENTARY_TIME), lower(PatternSignal.STEPS)),
        ),
        minConcurrent = 3,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "Your sleep timing has been less consistent, your sleep shorter and your daytime movement " +
            "lower than usual. These may be connected.",
        suggestion = "Choosing a consistent wake-up time and adding brief movement breaks may help.",
        source = "Merged research 2.5 (circadian disruption)",
    )

    /** Merged research 2.5 "low activity despite adequate sleep": sleep about usual, steps or MVPA below usual. */
    val LOW_ACTIVITY_ADEQUATE_SLEEP = PatternSpec(
        id = "MVX-LOW-ACTIVITY",
        title = "Movement lower than usual while sleep is steady",
        criteria = listOf(
            c("Fewer steps or less active time", lower(PatternSignal.STEPS), lower(PatternSignal.MVPA)),
            c("Sleep duration about usual", stable(PatternSignal.SLEEP_DURATION)),
        ),
        minConcurrent = 2,
        maturity = PatternMaturity.EXPLORATORY,
        evidenceClass = "C",
        interpretation = "Your movement has been lower than usual even though your sleep duration is about usual. " +
            "This may simply reflect a busier or quieter few days.",
        suggestion = "A small, achievable movement target may suit better than a universal step goal.",
        source = "Merged research 2.5 (low activity despite adequate sleep)",
    )

    /** Every pattern in this object, MV01 first. */
    val all: List<PatternSpec> = listOf(
        MV01, MV02, MV03, MV04, MV05, MV07, MV08, MV09, MV10, CIRCADIAN_DISRUPTION, LOW_ACTIVITY_ADEQUATE_SLEEP,
    )

    /**
     * The least extreme of the last [nights] nightly z-scores, i.e. the z that held on each of
     * them: the minimum for [Deviation.HIGHER], the maximum for [Deviation.LOWER]. Null when
     * fewer than [nights] values exist or any of them is missing. This is how the research's
     * "same two-night window" and CV01's persistence rule ("z >= 2 for >= 2 consecutive days")
     * are read here: requiring the threshold on every night is a calibration choice.
     *
     * @param nightlyZ one z per night, oldest first, null = no reading.
     */
    fun persistentZ(nightlyZ: List<Double?>, direction: Deviation, nights: Int = 2): Double? {
        require(nights >= 1) { "nights must be >= 1" }
        require(direction != Deviation.STABLE) { "direction must be HIGHER or LOWER" }
        if (nightlyZ.size < nights) return null
        val last = nightlyZ.takeLast(nights)
        if (last.any { it == null || !it.isFinite() }) return null
        val values = last.map { it!! }
        return if (direction == Deviation.HIGHER) values.min() else values.max()
    }

    /**
     * Evaluates [spec] on [readings]. Signals absent from the map, or null, are missing.
     *
     * Outcome: DETECTED when at least [PatternSpec.minConcurrent] criteria are met;
     * NOT_DETECTED when even if every unknown criterion were met the minimum would not be
     * reached; INSUFFICIENT_DATA otherwise.
     */
    fun evaluate(
        spec: PatternSpec,
        readings: Map<PatternSignal, Double?>,
        context: PatternContext = PatternContext(),
    ): PatternMatch {
        val results = spec.criteria.map { criterion ->
            val checked = criterion.alternatives.map { it to it.check(readings[it.signal]) }
            val findings = checked.filter { it.second == true }.map { (rule, _) ->
                SignalFinding(rule.signal, readings.getValue(rule.signal)!!, rule)
            }
            val met: Boolean? = when {
                findings.isNotEmpty() -> true
                checked.all { it.second != null } -> false
                else -> null
            }
            CriterionResult(criterion, met, findings)
        }
        val met = results.count { it.met == true }
        val unknown = results.count { it.met == null }
        val outcome = when {
            met >= spec.minConcurrent -> PatternOutcome.DETECTED
            met + unknown < spec.minConcurrent -> PatternOutcome.NOT_DETECTED
            else -> PatternOutcome.INSUFFICIENT_DATA
        }
        val detected = outcome == PatternOutcome.DETECTED
        val supporting = if (!detected) emptyList() else spec.supporting.mapNotNull { rule ->
            if (rule.check(readings[rule.signal]) == true) SignalFinding(rule.signal, readings.getValue(rule.signal)!!, rule) else null
        }
        val suppressedBy = spec.suppressedByTags.intersect(context.tags)
        val suppression = when {
            !detected -> null
            suppressedBy.isNotEmpty() -> "a ${suppressedBy.first().name.lowercase()} tag is already active"
            context.confidence == null -> "data quality was not assessed"
            !context.confidence.alertAllowed -> "data confidence is low"
            !spec.alertEligible -> "shown as a learning card, not an alert"
            else -> null
        }
        return PatternMatch(
            spec = spec,
            outcome = outcome,
            metCount = met,
            unknownCount = unknown,
            criteria = results,
            contributing = results.filter { it.met == true }.flatMap { it.findings },
            supporting = supporting,
            alertAllowed = detected && suppression == null,
            lowProminence = detected && spec.lowerProminenceTags.intersect(context.tags).isNotEmpty(),
            likelyExplanations = if (detected) context.tags else emptySet(),
            suppressionReason = suppression,
        )
    }

    /**
     * MV01 from nightly series. Applies the two-night persistence to resting heart rate, HRV
     * (last two nights) and breathing rate, and takes the weekly HRV z from the app's weekly HRV status.
     *
     * @param rhrNightlyZ robust z of resting heart rate per night, oldest first.
     * @param hrvWeeklyZ [com.apex.athlete.core.analytics.trend.WeeklyHrvStatus.zScore]; null when the HRV baseline is immature.
     * @param hrvNightlyZ z of each night's ln RMSSD, oldest first.
     * @param rrNightlyZ robust z of breathing rate per night, oldest first.
     * @param temperatureDeltaC the provider's nightly minus baseline temperature, °C.
     */
    fun illnessLikePattern(
        rhrNightlyZ: List<Double?>,
        hrvWeeklyZ: Double?,
        hrvNightlyZ: List<Double?>,
        rrNightlyZ: List<Double?>,
        temperatureDeltaC: Double?,
        context: PatternContext = PatternContext(),
    ): PatternMatch = evaluate(
        MV01,
        mapOf(
            PatternSignal.RESTING_HEART_RATE to persistentZ(rhrNightlyZ, Deviation.HIGHER),
            PatternSignal.HRV_WEEKLY to hrvWeeklyZ,
            PatternSignal.HRV_LAST_TWO_NIGHTS to persistentZ(hrvNightlyZ, Deviation.LOWER),
            PatternSignal.RESPIRATORY_RATE to persistentZ(rrNightlyZ, Deviation.HIGHER),
            PatternSignal.SLEEP_TEMPERATURE_DELTA_C to temperatureDeltaC,
        ),
        context,
    )
}
