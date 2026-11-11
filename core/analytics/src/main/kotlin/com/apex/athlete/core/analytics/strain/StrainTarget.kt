package com.apex.athlete.core.analytics.strain

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
 *   center = 6 + 12 · (recovery / 100)        window = center ± 1
 *
 * so a recovery of 0 % points to a strain of 6 (active recovery), 50 % to 12, 100 % to 18.
 */
class StrainTargetCalculator(
    private val engine: StrainEngine = StrainEngine(),
    private val config: Config = Config(),
) {
    data class Config(
        val centerAtZeroRecovery: Double = 6.0,
        val centerAtFullRecovery: Double = 18.0,
        val halfWidth: Double = 1.0,
        val maxStrain: Double = 21.0,
    )

    fun targetFor(recoveryScore: Double): StrainTarget {
        val r = recoveryScore.coerceIn(0.0, 100.0) / 100.0
        val center = config.centerAtZeroRecovery + (config.centerAtFullRecovery - config.centerAtZeroRecovery) * r
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

        val zones = HeartRateZoneModel.of(profile)
        val minutes = HeartRateZone.entries
            .filter { it != HeartRateZone.BELOW_ZONES }
            .mapNotNull { zone ->
                val perMinute = Trimp.perMinute(zones.midpointOf(zone), profile)
                if (perMinute > 0) zone to trimpRemaining / perMinute else null
            }
            .toMap()

        return RemainingCapacity(strainRemaining, trimpRemaining, minutes)
    }
}
