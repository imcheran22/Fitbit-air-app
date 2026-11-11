package com.apex.athlete.core.ui.charts

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.roundToInt

/** A closed numeric axis range. */
data class AxisDomain(val min: Double, val max: Double) {
    val span: Double get() = max - min
}

/** Summary of a series, used for TalkBack descriptions and readouts. Only real values are counted. */
data class SeriesStats(
    val validCount: Int,
    val missingCount: Int,
    val min: Double?,
    val max: Double?,
    /** Index (into the source list) of the latest non-null point, or null when there is none. */
    val latestIndex: Int?,
    val firstIndex: Int?,
)

/**
 * Pure chart maths: no Compose, no Android. Everything here is unit-tested in `ChartScalesTest`.
 *
 * Axis policy (DESIGN_SYSTEM.md section 5, "honest axes"):
 * - Line charts size the y axis from the data (and any band) with 10 % padding either side and do not force
 *   zero, because a trend line shows change, not magnitude. Tick labels always show the real values.
 * - Bar charts always start at zero (a bar's length is its value).
 * - A flat series is widened so it does not render as a full-height artefact.
 */
object ChartScales {

    /** Largest "nice" step (1, 2, 5 x 10^n) that gives at most about [targetTicks] ticks over [range]. */
    fun niceStep(range: Double, targetTicks: Int): Double {
        if (!(range > 0.0) || targetTicks < 1) return 1.0
        val raw = range / targetTicks
        val magnitude = 10.0.pow(floor(log10(raw)))
        val norm = raw / magnitude
        val nice = when {
            norm <= 1.0 -> 1.0
            norm <= 2.0 -> 2.0
            norm <= 5.0 -> 5.0
            else -> 10.0
        }
        return nice * magnitude
    }

    /** Tick values at multiples of a nice step, all inside [min, max]. A degenerate range yields one tick. */
    fun niceTicks(min: Double, max: Double, targetTicks: Int = 4): List<Double> {
        if (!(max > min)) return listOf(min)
        val step = niceStep(max - min, targetTicks)
        val first = ceil(min / step - 1e-9) * step
        val out = ArrayList<Double>()
        var i = 0
        while (i < 100) {
            val v = first + i * step
            if (v > max + step * 1e-9) break
            out.add(if (abs(v) < step * 1e-9) 0.0 else v)
            i++
        }
        return out
    }

    /** Number of decimals needed to print ticks spaced [step] apart without hiding the step. */
    fun decimalsForStep(step: Double): Int {
        if (!(step > 0.0)) return 0
        var d = 0
        var s = step
        while (d < 4 && abs(s - s.roundToInt()) > 1e-6) {
            s *= 10.0
            d++
        }
        return d
    }

    /**
     * Y domain for a line chart: data min/max (plus [include] values such as a baseline band) padded by
     * [padFraction] of the span. A flat series is widened by 5 % of its magnitude (at least 1.0).
     * Returns null when there is nothing to scale.
     */
    fun lineDomain(
        values: List<Double>,
        include: List<Double> = emptyList(),
        padFraction: Double = 0.10,
    ): AxisDomain? {
        if (values.isEmpty() && include.isEmpty()) return null
        var lo = Double.POSITIVE_INFINITY
        var hi = Double.NEGATIVE_INFINITY
        for (v in values) { lo = min(lo, v); hi = max(hi, v) }
        for (v in include) { lo = min(lo, v); hi = max(hi, v) }
        if (hi - lo < 1e-9) {
            val half = max(1.0, abs(hi) * 0.05)
            return AxisDomain(lo - half, hi + half)
        }
        val pad = (hi - lo) * padFraction
        return AxisDomain(lo - pad, hi + pad)
    }

    /** Widens [d] outward to multiples of a nice step so the first and last grid lines sit on the frame. */
    fun niceDomain(d: AxisDomain, targetTicks: Int = 4): AxisDomain {
        if (!(d.max > d.min)) return d
        val step = niceStep(d.span, targetTicks)
        return AxisDomain(floor(d.min / step + 1e-9) * step, ceil(d.max / step - 1e-9) * step)
    }

    /** Y domain for a bar chart: zero to a nice ceiling above the largest value (at least [minTop]). */
    fun barDomain(values: List<Double>, minTop: Double = 1.0): AxisDomain {
        var hi = minTop
        for (v in values) hi = max(hi, v)
        val step = niceStep(hi, 4)
        return AxisDomain(0.0, ceil(hi / step - 1e-9) * step)
    }

    /** Maps [v] from [d0, d1] to [p0, p1]. A degenerate source range maps to the middle. */
    fun mapLinear(v: Double, d0: Double, d1: Double, p0: Float, p1: Float): Float {
        if (!(d1 > d0)) return (p0 + p1) / 2f
        return (p0 + ((v - d0) / (d1 - d0)) * (p1 - p0)).toFloat()
    }

    /**
     * Splits a series into runs of consecutive real points. A run also ends when the x distance between
     * neighbours exceeds [maxXStep] (a missing slot is a gap even when no null row exists).
     * Each element is an inclusive index range into [points].
     */
    fun runs(points: List<ChartPoint>, maxXStep: Long = Long.MAX_VALUE): List<IntRange> {
        val out = ArrayList<IntRange>()
        var start = -1
        var prevX = 0L
        for (i in points.indices) {
            val p = points[i]
            if (p.y == null) {
                if (start >= 0) { out.add(start..(i - 1)); start = -1 }
                continue
            }
            if (start >= 0 && p.x - prevX > maxXStep) {
                out.add(start..(i - 1))
                start = -1
            }
            if (start < 0) start = i
            prevX = p.x
        }
        if (start >= 0) out.add(start..points.lastIndex)
        return out
    }

    /**
     * Index of the non-null point whose x is nearest [targetX] (ties pick the earlier point), or null when the
     * series has no real point. Scrubbing uses this so the cursor only ever lands on measured values.
     */
    fun nearestIndex(points: List<ChartPoint>, targetX: Double): Int? {
        var best: Int? = null
        var bestDist = Double.POSITIVE_INFINITY
        for (i in points.indices) {
            val p = points[i]
            if (p.y == null) continue
            val d = abs(p.x.toDouble() - targetX)
            if (d < bestDist) { bestDist = d; best = i }
        }
        return best
    }

    fun stats(points: List<ChartPoint>): SeriesStats {
        var valid = 0
        var lo: Double? = null
        var hi: Double? = null
        var latest: Int? = null
        var first: Int? = null
        for (i in points.indices) {
            val y = points[i].y ?: continue
            valid++
            lo = if (lo == null) y else min(lo, y)
            hi = if (hi == null) y else max(hi, y)
            latest = i
            if (first == null) first = i
        }
        return SeriesStats(valid, points.size - valid, lo, hi, latest, first)
    }

    /**
     * Missing days in an inclusive day range: slots with no real value, whether the row is absent or null.
     * Duplicated days count once.
     */
    fun missingDays(points: List<ChartPoint>, startDay: Long, endDay: Long): Int {
        if (endDay < startDay) return 0
        val seen = HashSet<Long>()
        for (p in points) if (p.y != null && p.x in startDay..endDay) seen.add(p.x)
        return ((endDay - startDay + 1) - seen.size).toInt()
    }

    // ----- time axis -----

    private val tickStepsMinutes = intArrayOf(30, 60, 120, 180, 360, 720, 1440)

    /**
     * Tick instants (epoch ms) on local clock boundaries inside [startMillis, endMillis]: the smallest step
     * from 30 min to 24 h that gives at most [targetCount] ticks. Intended for spans up to about two days.
     */
    fun timeTicks(startMillis: Long, endMillis: Long, zone: ZoneId, targetCount: Int = 5): List<Long> {
        if (endMillis <= startMillis) return emptyList()
        val rangeMin = (endMillis - startMillis) / 60_000.0
        var step = tickStepsMinutes.last()
        for (s in tickStepsMinutes) {
            if (rangeMin / s <= targetCount) { step = s; break }
        }
        var t = Instant.ofEpochMilli(startMillis).atZone(zone).truncatedTo(ChronoUnit.HOURS)
        val out = ArrayList<Long>()
        var guard = 0
        while (t.toInstant().toEpochMilli() <= endMillis && guard < 400) {
            val ms = t.toInstant().toEpochMilli()
            val minuteOfDay = t.hour * 60 + t.minute
            if (ms >= startMillis && minuteOfDay % step == 0) out.add(ms)
            t = t.plusMinutes(30)
            guard++
        }
        return out
    }

    /** "22:48" in 24 h mode, "10:48 PM" in 12 h mode, in [zone]. */
    fun formatClock(millis: Long, zone: ZoneId, use24Hour: Boolean, locale: Locale = Locale.getDefault()): String {
        val t = Instant.ofEpochMilli(millis).atZone(zone)
        val pattern = if (use24Hour) "HH:mm" else "h:mm a"
        return t.format(DateTimeFormatter.ofPattern(pattern, locale))
    }

    /** Short axis label: "22:00" in 24 h mode, "10 PM" in 12 h mode on the hour, "10:30 PM" otherwise. */
    fun formatClockTick(millis: Long, zone: ZoneId, use24Hour: Boolean, locale: Locale = Locale.getDefault()): String {
        val t = Instant.ofEpochMilli(millis).atZone(zone)
        val pattern = when {
            use24Hour -> "HH:mm"
            t.minute == 0 -> "h a"
            else -> "h:mm a"
        }
        return t.format(DateTimeFormatter.ofPattern(pattern, locale))
    }

    /** "Sep 17" for an epoch day. */
    fun formatDay(epochDay: Long, locale: Locale = Locale.getDefault()): String =
        LocalDate.ofEpochDay(epochDay).format(DateTimeFormatter.ofPattern("MMM d", locale))

    /** "Mon, Sep 28" for an epoch day. */
    fun formatDayLong(epochDay: Long, locale: Locale = Locale.getDefault()): String =
        LocalDate.ofEpochDay(epochDay).format(DateTimeFormatter.ofPattern("EEE, MMM d", locale))

    /** Weekday initial-or-abbreviation, e.g. "Mon". */
    fun formatWeekday(epochDay: Long, locale: Locale = Locale.getDefault()): String =
        LocalDate.ofEpochDay(epochDay).format(DateTimeFormatter.ofPattern("EEE", locale))

    /**
     * Number label without fake precision: [decimals] places, trailing zeros kept only when decimals > 0 was
     * requested. -0 prints as 0.
     */
    fun formatNumber(value: Double, decimals: Int, locale: Locale = Locale.getDefault()): String {
        val s = String.format(locale, "%.${decimals.coerceIn(0, 4)}f", value)
        val zero = String.format(locale, "%.${decimals.coerceIn(0, 4)}f", 0.0)
        return if (s.removePrefix("-") == zero) zero else s
    }

    /** Share of [part] in [total] as a percentage, or null when [total] is not positive. */
    fun sharePercent(part: Long, total: Long): Double? =
        if (total > 0L) part.toDouble() * 100.0 / total.toDouble() else null

    /** Whole hours, whole minutes and remaining seconds of a duration; negative input is treated as zero. */
    fun splitDuration(totalSeconds: Long): Triple<Long, Long, Long> {
        val t = max(0L, totalSeconds)
        return Triple(t / 3600, (t % 3600) / 60, t % 60)
    }

    /**
     * Number of interior gaps in time-ordered [segments] (start to end, epoch ms): a gap is a hole longer than
     * [toleranceMs] between the furthest end seen so far and the next start. Overlaps are not gaps.
     */
    fun countTimeGaps(segments: List<Pair<Long, Long>>, toleranceMs: Long): Int {
        var gaps = 0
        var furthestEnd = Long.MIN_VALUE
        for ((start, end) in segments) {
            if (furthestEnd != Long.MIN_VALUE && start - furthestEnd > toleranceMs) gaps++
            if (end > furthestEnd) furthestEnd = end
        }
        return gaps
    }

    /** Index of the segment containing [t] (start inclusive, end exclusive), or null in a gap. */
    fun segmentAt(segments: List<Pair<Long, Long>>, t: Double): Int? {
        for (i in segments.indices) {
            val (s, e) = segments[i]
            if (t >= s && t < e) return i
        }
        return null
    }

    /** Slot index (0 until [count]) under pixel [px] when [count] equal slots span [left, right]. */
    fun slotIndex(px: Float, left: Float, right: Float, count: Int): Int {
        if (count <= 0 || right <= left) return 0
        val i = floor((px - left) / (right - left) * count).toInt()
        return i.coerceIn(0, count - 1)
    }

    /** Number with an explicit sign for non-zero values ("+1.2", "-0.4", "0.0"). */
    fun formatSigned(value: Double, decimals: Int, locale: Locale = Locale.getDefault()): String {
        val plain = formatNumber(value, decimals, locale)
        val isZero = plain == formatNumber(0.0, decimals, locale)
        return if (value > 0.0 && !isZero) "+$plain" else plain
    }
}
