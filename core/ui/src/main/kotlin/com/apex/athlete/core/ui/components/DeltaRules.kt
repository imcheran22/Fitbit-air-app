package com.apex.athlete.core.ui.components

import kotlin.math.abs

/** Which way a metric should move to be good (Pulse 5.0 "Delta arrows"). */
enum class GoodDirection { UP, DOWN, NEUTRAL, TOWARD_ZERO }

enum class DeltaDirection { UP, DOWN, FLAT }

enum class DeltaTone { GOOD, BAD, NEUTRAL }

/** What the arrow looks like. [direction] FLAT means the 6 dp neutral dot instead of a triangle. */
data class DeltaArrow(val direction: DeltaDirection, val tone: DeltaTone)

object DeltaRules {
    /**
     * Compares [value] with its [average].
     * - Equal (or either missing): a neutral dot.
     * - Inside one [sd] of the average: a neutral dot.
     * - Outside: a triangle pointing the way the value moved; tone is good or bad by [good],
     *   or neutral when [good] is [GoodDirection.NEUTRAL] (the arrow still shows direction).
     */
    fun arrow(value: Double?, average: Double?, sd: Double?, good: GoodDirection): DeltaArrow {
        val dot = DeltaArrow(DeltaDirection.FLAT, DeltaTone.NEUTRAL)
        if (value == null || average == null || !value.isFinite() || !average.isFinite()) return dot
        val diff = value - average
        if (diff == 0.0) return dot
        if (sd != null && sd.isFinite() && sd > 0.0 && abs(diff) <= sd) return dot
        val direction = if (diff > 0) DeltaDirection.UP else DeltaDirection.DOWN
        val tone = when (good) {
            GoodDirection.NEUTRAL -> DeltaTone.NEUTRAL
            GoodDirection.UP -> if (diff > 0) DeltaTone.GOOD else DeltaTone.BAD
            GoodDirection.DOWN -> if (diff < 0) DeltaTone.GOOD else DeltaTone.BAD
            GoodDirection.TOWARD_ZERO -> {
                val a = abs(value)
                val b = abs(average)
                when {
                    a < b -> DeltaTone.GOOD
                    a > b -> DeltaTone.BAD
                    else -> DeltaTone.NEUTRAL
                }
            }
        }
        return DeltaArrow(direction, tone)
    }
}
