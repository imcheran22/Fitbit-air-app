package com.apex.athlete.core.analytics.strain

import com.apex.athlete.core.analytics.stats.Ewma
import com.apex.athlete.core.analytics.stats.MissingValuePolicy

/**
 * The day's recommended strain window, derived from the morning recovery score.
 *
 * @property center strain that matches today's recovery.
 * @property low lower edge of the optimal window (below it the day adds little training stimulus).
 * @property high upper edge; going beyond it exceeds what today's recovery supports.
 */
data class StrainTarget(val center: Double, val low: Double, val high: Double)

/**
 * What is left before the upper edge of the target window is reached.
 *
 * @property minutesByZone how many more minutes at the middle of each zone would use up the
 *   remaining capacity. Absent for zones whose midpoint earns no load.
 */
data class RemainingCapacity(
    val strainRemaining: Double,
    val trimpRemaining: Double,
    val minutesByZone: Map<HeartRateZone, Double>,
)

/**
 * Formula version 3: the target is built from the athlete's own recent strain, not from a fixed
 * scale.
 *
 *   base   = EWMA (alpha 0.25, normalised weights) of the recorded strain of the last 14 days,
 *            missing days skipped (at least 5 recorded days, otherwise no target)
 *   center = base * (1 + 0.6 * (recovery - 50) / 100),   window = center +/- 1,   limited to 0-21
 *
 * so a steady base of 10 gives a centre of 7 at recovery 0, 10 at 50 and 13 at 100. The form
 * (14-day fold with alpha 0.25 and a +-30 % recovery scale) is that of the Bevel study
 * (strain-load.md, "Target Strain"), which is not peer reviewed; Apex skips missing days where the
 * study counts them as zero. The window width and the minimum are *calibration*. Guidance only,
 * not a prescription. Version 2 used `6 + 12 * recovery / 100`, a fixed scale that is not
 * personal and amounts to a population norm.
 */
class StrainTargetCalculator(
    private val engine: StrainEngine = StrainEngine(),
    private val config: Config = Config(),
) {
    data class Config(
        val baseWindowDays: Int = 14,
        val baseSpan: Int = 7, // alpha = 2 / (7 + 1) = 0.25
        val minRecordedDays: Int = 5,
        val recoveryScalePerPoint: Double = 0.006, // 0.6 per 100 recovery points
        val halfWidth: Double = 1.0,
        val maxStrain: Double = 21.0,
    )

    /**
     * Personal strain base from the last [Config.baseWindowDays] calendar days, oldest first, null for
     * a day without a recorded strain. Null when fewer than [Config.minRecordedDays] are recorded.
     */
    fun personalBase(recentStrains: List<Double?>): Double? {
        val window = recentStrains.takeLast(config.baseWindowDays).map { it?.takeIf(Double::isFinite) }
        if (window.count { it != null } < config.minRecordedDays) return null
        return Ewma.normalizedSeries(window, config.baseSpan, MissingValuePolicy.CARRY_FORWARD).last()
    }

    /** Null without a personal base: a target is never filled in from a population default. */
    fun targetFor(recoveryScore: Double, personalBase: Double?): StrainTarget? {
        if (personalBase == null || !personalBase.isFinite()) return null
        val r = recoveryScore.coerceIn(0.0, 100.0)
        val center = (personalBase * (1.0 + config.recoveryScalePerPoint * (r - 50.0))).coerceIn(0.0, config.maxStrain)
        return StrainTarget(
            center = center,
            low = (center - config.halfWidth).coerceIn(0.0, config.maxStrain),
            high = (center + config.halfWidth).coerceIn(0.0, config.maxStrain),
        )
    }

    fun remaining(currentTrimp: Double, target: StrainTarget, profile: CardioProfile): RemainingCapacity {
        val currentStrain = engine.strainFromTrimp(currentTrimp)
        val strainRemaining = (target.high - currentStrain).coerceAtLeast(0.0)
        val trimpRemaining = (engine.trimpFromStrain(target.high) - currentTrimp).coerceAtLeast(0.0)

        // Same zone method and reserve floor as the engine that scored the day, so the minutes
        // refer to the zones the user actually sees.
        val zones = HeartRateZoneModel.of(profile, engine.config.zoneMethod)
        val minutes = HeartRateZone.entries
            .filter { it != HeartRateZone.BELOW_ZONES }
            .mapNotNull { zone ->
                val perMinute = Trimp.perMinute(zones.midpointOf(zone), profile, engine.config.reserveFloor)
                if (perMinute > 0) zone to trimpRemaining / perMinute else null
            }
            .toMap()

        return RemainingCapacity(strainRemaining, trimpRemaining, minutes)
    }
}
