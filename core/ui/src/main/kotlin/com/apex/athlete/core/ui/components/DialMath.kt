package com.apex.athlete.core.ui.components

import com.apex.athlete.core.ui.theme.ApexDial

/**
 * Pure angle maths for the score dial (DESIGN_SYSTEM.md section 5, Pulse 5.1). Compose angles: 0 is
 * 3 o'clock and positive is clockwise, so 12 o'clock is -90. The ring starts [GAP_DEGREES] after
 * 12 o'clock and ends [GAP_DEGREES] before it.
 */
object DialMath {
    const val GAP_DEGREES: Float = ApexDial.TOP_GAP_DEGREES
    const val START_ANGLE: Float = -90f + GAP_DEGREES
    const val TRACK_SWEEP: Float = 360f - 2f * GAP_DEGREES
    const val STRAIN_MAX: Double = 21.0
    const val PERCENT_MAX: Double = 100.0

    /** Width of the strain-target tick in strain units. */
    const val TICK_WIDTH_UNITS: Double = 0.2

    /** A start angle and sweep, both in degrees. */
    data class Arc(val start: Float, val sweep: Float)

    /** 0..1 progress of [value] on a 0..[max] scale. Non-finite or non-positive input gives 0. */
    fun fraction(value: Double, max: Double): Float {
        if (!value.isFinite() || !max.isFinite() || max <= 0.0) return 0f
        return (value / max).coerceIn(0.0, 1.0).toFloat()
    }

    /** Strain fraction: the ring is full at 21.0 and stays full above it. */
    fun strainFraction(value: Double): Float = fraction(value, STRAIN_MAX)

    /** Sweep of the fill for a 0..1 [fraction]. */
    fun sweepFor(fraction: Float): Float = fraction.coerceIn(0f, 1f) * TRACK_SWEEP

    /** Angle at a 0..1 [fraction] of the ring. */
    fun angleAt(fraction: Float): Float = START_ANGLE + sweepFor(fraction)

    /** The target range as an arc on the track, or null when the range is invalid. */
    fun targetArc(low: Double, high: Double, max: Double = STRAIN_MAX): Arc? {
        if (!low.isFinite() || !high.isFinite() || low >= high || max <= 0.0) return null
        val lo = fraction(low, max)
        val hi = fraction(high, max)
        if (hi <= lo) return null
        return Arc(angleAt(lo), sweepFor(hi - lo))
    }

    /** The thin tick at the middle of the target range, or null when the range is invalid. */
    fun tickArc(low: Double, high: Double, max: Double = STRAIN_MAX): Arc? {
        if (targetArc(low, high, max) == null) return null
        val mid = (low + high) / 2.0
        val from = fraction(mid - TICK_WIDTH_UNITS / 2.0, max)
        val to = fraction(mid + TICK_WIDTH_UNITS / 2.0, max)
        return Arc(angleAt(from), sweepFor((to - from).coerceAtLeast(0f)))
    }
}

/** Position helpers for the contributor band track (mean +/- 3 sigma domain). */
object BandMath {
    /** The normal band (mean +/- 1 sigma) always occupies the middle third of a +/- 3 sigma track. */
    const val BAND_START: Float = 1f / 3f
    const val BAND_END: Float = 2f / 3f

    /** Marker position 0..1 on a mean +/- 3 sigma track, or null when [sd] is not positive. */
    fun markerFraction(value: Double, mean: Double, sd: Double): Float? {
        if (!value.isFinite() || !mean.isFinite() || !sd.isFinite() || sd <= 0.0) return null
        return ((value - mean) / (6.0 * sd) + 0.5).coerceIn(0.0, 1.0).toFloat()
    }
}
