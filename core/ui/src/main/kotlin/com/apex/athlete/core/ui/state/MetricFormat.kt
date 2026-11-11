package com.apex.athlete.core.ui.state

import java.util.Locale
import kotlin.math.abs
import kotlin.math.pow

/**
 * Pure number formatting for metrics (DESIGN_SYSTEM.md section 3, Pulse 3.3).
 *
 * - Missing or non-finite values render as [MISSING] (`--`), never as zero.
 * - Negative numbers use the real minus sign U+2212.
 * - Deltas carry an explicit `+` when positive.
 * - A value that rounds to zero carries no sign (never "-0.0").
 */
object MetricFormat {
    const val MISSING: String = "--"
    const val MINUS: Char = '−'
    const val PLUS: Char = '+'

    /** Formats [value] with [decimals] fraction digits, or [MISSING] when it is null or not finite. */
    fun number(value: Double?, decimals: Int = 0, locale: Locale = Locale.getDefault()): String {
        if (value == null || !value.isFinite()) return MISSING
        val d = decimals.coerceIn(0, 6)
        val magnitude = String.format(locale, "%.${d}f", abs(value))
        return if (value < 0 && roundsToNonZero(value, d)) "$MINUS$magnitude" else magnitude
    }

    /** Formats a signed change: `+3`, `−2.5`, `0`, or [MISSING]. */
    fun delta(value: Double?, decimals: Int = 0, locale: Locale = Locale.getDefault()): String {
        if (value == null || !value.isFinite()) return MISSING
        val d = decimals.coerceIn(0, 6)
        val magnitude = String.format(locale, "%.${d}f", abs(value))
        if (!roundsToNonZero(value, d)) return magnitude
        return if (value > 0) "$PLUS$magnitude" else "$MINUS$magnitude"
    }

    /** `72 %`-style text for places that need one string (TalkBack, tests). Unit is omitted when missing. */
    fun withUnit(value: Double?, decimals: Int, unit: String?, locale: Locale = Locale.getDefault()): String {
        val n = number(value, decimals, locale)
        return if (unit.isNullOrBlank() || n == MISSING) n else "$n $unit"
    }

    private fun roundsToNonZero(value: Double, decimals: Int): Boolean {
        val scale = 10.0.pow(decimals)
        return Math.round(abs(value) * scale) != 0L
    }
}
