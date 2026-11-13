package com.apex.athlete.core.analytics.plan

import com.apex.athlete.core.analytics.load.WorkloadZone

enum class StrainBand { REST, LIGHT, MODERATE, HARD }

enum class PlanConfidence { NORMAL, LOW }

enum class PlanLowConfidenceReason {
    /** Training load is still calibrating, so its ratio zone is not used. */
    LOAD_CALIBRATING,
    /** No load status was supplied. */
    LOAD_MISSING,
    /** No recovery score for today. */
    RECOVERY_MISSING,
    /** No sleep need, so no per-night target is given. */
    SLEEP_NEED_MISSING,
}

enum class NoPlanReason {
    /** No personal strain base (fewer than 5 recorded days in 14, see StrainTargetCalculator): no plan, no population default. */
    STRAIN_BASE_MISSING,
}

/** Why a day differs from the default pattern. */
enum class PlanAdjustment { LOW_RECOVERY, HIGH_LOAD_RATIO, ELEVATED_LOAD_RATIO, ATHLETE_UNAVAILABLE, HARD_DAY_LIMIT, ENSURE_REST_DAY }

/**
 * @property strainCentre suggested centre of the day's strain (0-21), the personal base times the band factor. Context, not a target to hit.
 * @property sleepTargetMinutes the athlete's sleep need for the night starting that day; null when no need was supplied.
 */
data class PlanDay(
    val epochDay: Long,
    val band: StrainBand,
    val strainCentre: Double,
    val sleepTargetMinutes: Double?,
    val unavailable: Boolean,
    val adjustment: PlanAdjustment?,
)

data class WeeklyPlan(
    val days: List<PlanDay>,
    val confidence: PlanConfidence,
    val lowConfidenceReasons: Set<PlanLowConfidenceReason>,
) {
    /** Always true: a plan is a suggestion. It is not a prescription and is not medical advice. */
    val suggestionOnly: Boolean get() = true
}

data class WeeklyPlanResult(val plan: WeeklyPlan?, val noPlanReason: NoPlanReason?)

/**
 * @property startEpochDay first planned day (the caller decides whether that is today or tomorrow); the plan covers 7 days.
 * @property personalStrainBase the athlete's own recent strain level (StrainTargetCalculator.personalBase); null = unknown.
 * @property todayRecovery latest recovery score 0-100, null = unknown.
 * @property loadZone workload-ratio zone, null = unknown. Ignored when [loadCalibrating].
 * @property sleepNeedMinutes tonight's sleep need, null = unknown.
 * @property unavailableEpochDays days the athlete cannot train; they become REST. Days outside the plan are ignored.
 */
data class WeeklyPlanInput(
    val startEpochDay: Long,
    val personalStrainBase: Double?,
    val todayRecovery: Double?,
    val loadZone: WorkloadZone?,
    val loadCalibrating: Boolean,
    val sleepNeedMinutes: Double?,
    val unavailableEpochDays: Set<Long> = emptySet(),
)

/**
 * A 7-day suggestion of strain bands and sleep targets. Wording lives with the caller.
 *
 * Construction (every number is an Apex calibration choice; no published study validates a weekly template):
 *  1. Start from [Config.template] (default MODERATE, HARD, LIGHT, HARD, MODERATE, LIGHT, REST: two hard days, one rest day,
 *     a generic alternating hard/easy week, the convention in endurance coaching, not a validated prescription).
 *  2. First planned day: recovery below [Config.lowRecoveryBelow] (34, the lower edge of the MODERATE recovery band, itself a
 *     calibration choice) or load zone HIGH_RISK -> REST; load zone OVERREACHING -> at most LIGHT. The load zone is a workload
 *     ratio; the ratio bands are contested (Impellizzeri 2020), so they only shorten the next day and never forbid training.
 *  3. Unavailable days -> REST.
 *  4. Invariants, enforced for any template: no two HARD days back to back (the later one becomes MODERATE), at most
 *     [Config.maxHardDays] = 3 HARD days (the latest ones become MODERATE), at least one REST day (if none, the latest
 *     least-demanding day becomes REST).
 *  5. strainCentre = personalStrainBase x band factor, capped at 21. Factors: HARD 1.3 and LIGHT 0.7 mirror the plus and minus 30 %
 *     recovery scale of StrainTargetCalculator; MODERATE 1.0 is the base itself; REST 0.4 is a calibration choice.
 *  6. sleepTargetMinutes = the supplied sleep need for every night (no extra for hard days: no validated rule).
 *
 * Confidence is LOW, with reasons, when the load status is calibrating or missing, recovery is missing or the sleep need is
 * missing. Without a personal strain base there is no plan at all. A low recovery score is information, not low confidence.
 */
class WeeklyPlanEngine(private val config: Config = Config()) {

    data class Config(
        val template: List<StrainBand> = listOf(
            StrainBand.MODERATE, StrainBand.HARD, StrainBand.LIGHT, StrainBand.HARD,
            StrainBand.MODERATE, StrainBand.LIGHT, StrainBand.REST,
        ),
        val maxHardDays: Int = 3,
        val lowRecoveryBelow: Double = 34.0,
        val factors: Map<StrainBand, Double> = mapOf(
            StrainBand.REST to 0.4, StrainBand.LIGHT to 0.7, StrainBand.MODERATE to 1.0, StrainBand.HARD to 1.3,
        ),
        val maxStrain: Double = 21.0,
    ) {
        init {
            require(template.size == DAYS) { "template must have $DAYS days" }
            require(maxHardDays in 0..DAYS)
        }
    }

    fun plan(input: WeeklyPlanInput): WeeklyPlanResult {
        val base = input.personalStrainBase?.takeIf { it.isFinite() && it >= 0.0 }
            ?: return WeeklyPlanResult(null, NoPlanReason.STRAIN_BASE_MISSING)

        val recovery = input.todayRecovery?.takeIf { it.isFinite() }
        val zone = if (input.loadCalibrating) null else input.loadZone
        val need = input.sleepNeedMinutes?.takeIf { it.isFinite() && it > 0.0 }

        val bands = config.template.toMutableList()
        val adjustments = arrayOfNulls<PlanAdjustment>(DAYS)

        // First planned day: the load and recovery limits.
        if (recovery != null && recovery < config.lowRecoveryBelow) {
            bands[0] = StrainBand.REST; adjustments[0] = PlanAdjustment.LOW_RECOVERY
        } else if (zone == WorkloadZone.HIGH_RISK) {
            bands[0] = StrainBand.REST; adjustments[0] = PlanAdjustment.HIGH_LOAD_RATIO
        } else if (zone == WorkloadZone.OVERREACHING && bands[0] > StrainBand.LIGHT) {
            bands[0] = StrainBand.LIGHT; adjustments[0] = PlanAdjustment.ELEVATED_LOAD_RATIO
        }
        // Recovery below the line wins over an elevated zone, and an elevated zone never lifts a REST day.

        val unavailable = BooleanArray(DAYS) { (input.startEpochDay + it) in input.unavailableEpochDays }
        for (i in 0 until DAYS) if (unavailable[i]) { bands[i] = StrainBand.REST; adjustments[i] = PlanAdjustment.ATHLETE_UNAVAILABLE }

        // Invariants.
        for (i in 1 until DAYS) {
            if (bands[i] == StrainBand.HARD && bands[i - 1] == StrainBand.HARD) { bands[i] = StrainBand.MODERATE; adjustments[i] = PlanAdjustment.HARD_DAY_LIMIT }
        }
        var hard = bands.count { it == StrainBand.HARD }
        var i = DAYS - 1
        while (hard > config.maxHardDays && i >= 0) {
            if (bands[i] == StrainBand.HARD) { bands[i] = StrainBand.MODERATE; adjustments[i] = PlanAdjustment.HARD_DAY_LIMIT; hard-- }
            i--
        }
        if (bands.none { it == StrainBand.REST }) {
            val lowest = bands.min()
            val idx = bands.indexOfLast { it == lowest }
            bands[idx] = StrainBand.REST; adjustments[idx] = PlanAdjustment.ENSURE_REST_DAY
        }

        val reasons = buildSet {
            if (input.loadCalibrating) add(PlanLowConfidenceReason.LOAD_CALIBRATING)
            else if (input.loadZone == null) add(PlanLowConfidenceReason.LOAD_MISSING)
            if (recovery == null) add(PlanLowConfidenceReason.RECOVERY_MISSING)
            if (need == null) add(PlanLowConfidenceReason.SLEEP_NEED_MISSING)
        }
        val days = (0 until DAYS).map { d ->
            PlanDay(
                epochDay = input.startEpochDay + d,
                band = bands[d],
                strainCentre = (base * config.factors.getValue(bands[d])).coerceIn(0.0, config.maxStrain),
                sleepTargetMinutes = need,
                unavailable = unavailable[d],
                adjustment = adjustments[d],
            )
        }
        val plan = WeeklyPlan(days, if (reasons.isEmpty()) PlanConfidence.NORMAL else PlanConfidence.LOW, reasons)
        return WeeklyPlanResult(plan, null)
    }

    companion object { const val DAYS = 7 }
}
