package app.fitdash.metrics

import java.time.LocalDate

enum class Good { HIGHER, LOWER, MIDDLE }

enum class RangeStatus { IN, GOOD_SIDE, BAD_SIDE }

fun percentile(sorted: List<Double>, p: Double): Double {
    val idx = (sorted.size - 1) * p
    val lo = idx.toInt()
    val hi = minOf(lo + 1, sorted.size - 1)
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo)
}

fun normalRange(daily: Map<LocalDate, Double>, date: LocalDate, lo: Double = 0.25, hi: Double = 0.75): ClosedFloatingPointRange<Double>? {
    val values = daily.filterKeys { it < date && it >= date.minusDays(Tuning.BASELINE_DAYS) }.values.sorted()
    if (values.size < Tuning.MIN_RANGE_VALUES) return null
    return percentile(values, lo)..percentile(values, hi)
}

fun rangeStatus(value: Double, range: ClosedFloatingPointRange<Double>, good: Good): RangeStatus = when {
    value in range -> RangeStatus.IN
    good == Good.MIDDLE -> RangeStatus.BAD_SIDE
    (value > range.endInclusive) == (good == Good.HIGHER) -> RangeStatus.GOOD_SIDE
    else -> RangeStatus.BAD_SIDE
}
