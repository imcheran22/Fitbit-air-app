package com.apex.athlete.core.analytics.strain

/** Five training zones plus everything below them. */
enum class HeartRateZone(val number: Int, val label: String) {
    BELOW_ZONES(0, "Rest"),
    ZONE_1(1, "Very light"),
    ZONE_2(2, "Light"),
    ZONE_3(3, "Moderate"),
    ZONE_4(4, "Hard"),
    ZONE_5(5, "Maximum"),
}

enum class ZoneMethod {
    /** Zone limits at 50/60/70/80/90 % of maximum heart rate (Edwards' zones). */
    PERCENT_OF_MAX_HEART_RATE,

    /** Zone limits at 50/60/70/80/90 % of heart-rate reserve above resting (Karvonen). */
    HEART_RATE_RESERVE,
}

/**
 * Zone boundaries in bpm for one athlete.
 * [lowerBounds] holds the lower limit of zones 1..5, ascending.
 */
data class HeartRateZoneModel(val method: ZoneMethod, val lowerBounds: List<Double>, val maxHeartRate: Double) {

    init {
        require(lowerBounds.size == 5) { "exactly five zone lower bounds are required" }
        require(lowerBounds.zipWithNext().all { (a, b) -> b > a }) { "zone bounds must ascend" }
    }

    fun zoneFor(bpm: Double): HeartRateZone = when {
        bpm >= lowerBounds[4] -> HeartRateZone.ZONE_5
        bpm >= lowerBounds[3] -> HeartRateZone.ZONE_4
        bpm >= lowerBounds[2] -> HeartRateZone.ZONE_3
        bpm >= lowerBounds[1] -> HeartRateZone.ZONE_2
        bpm >= lowerBounds[0] -> HeartRateZone.ZONE_1
        else -> HeartRateZone.BELOW_ZONES
    }

    /** Lower and upper bpm limit of a training zone; zone 5 ends at the maximum heart rate. */
    fun rangeOf(zone: HeartRateZone): ClosedFloatingPointRange<Double> {
        require(zone != HeartRateZone.BELOW_ZONES) { "BELOW_ZONES has no lower limit" }
        val i = zone.number - 1
        val upper = if (i == 4) maxOf(maxHeartRate, lowerBounds[4]) else lowerBounds[i + 1]
        return lowerBounds[i]..upper
    }

    /** Heart rate in the middle of a zone, used to convert remaining load into minutes. */
    fun midpointOf(zone: HeartRateZone): Double = rangeOf(zone).let { (it.start + it.endInclusive) / 2 }

    companion object {
        val FRACTIONS = listOf(0.50, 0.60, 0.70, 0.80, 0.90)

        fun of(profile: CardioProfile, method: ZoneMethod = ZoneMethod.PERCENT_OF_MAX_HEART_RATE): HeartRateZoneModel {
            val bounds = when (method) {
                ZoneMethod.PERCENT_OF_MAX_HEART_RATE -> FRACTIONS.map { it * profile.maxHeartRate }
                ZoneMethod.HEART_RATE_RESERVE ->
                    FRACTIONS.map { profile.restingHeartRate + it * profile.heartRateReserve }
            }
            return HeartRateZoneModel(method, bounds, profile.maxHeartRate)
        }
    }
}
