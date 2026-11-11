package app.fitdash.metrics

import java.time.DayOfWeek
import java.time.LocalDate
import kotlin.math.abs
import kotlin.math.roundToInt

// One line of the weekly review: the mean of the last seven days and of the seven before, over days that have a value.
data class WeekRow(val kind: MetricKind, val thisWeek: Double, val lastWeek: Double?)

data class WeekReview(val end: LocalDate, val rows: List<WeekRow>, val headline: String?)

val REVIEW_KINDS = listOf(MetricKind.RECOVERY, MetricKind.SLEEP_HOURS, MetricKind.STEPS, MetricKind.ACTIVE_MINUTES)

// A week needs this many days with a value before its mean is worth showing.
private const val MIN_DAYS = 3

private fun mean(values: List<DayValue>, from: LocalDate, to: LocalDate): Double? =
    values.filter { !it.date.isBefore(from) && !it.date.isAfter(to) }.mapNotNull { it.value }
        .takeIf { it.size >= MIN_DAYS }?.average()

// The seven days ending on `end` against the seven before. Null when no metric has a week of data.
fun weekReview(series: Map<MetricKind, List<DayValue>>, end: LocalDate): WeekReview? {
    val start = end.minusDays(6)
    val rows = REVIEW_KINDS.mapNotNull { kind ->
        val values = series[kind] ?: return@mapNotNull null
        val now = mean(values, start, end) ?: return@mapNotNull null
        WeekRow(kind, now, mean(values, start.minusDays(7), start.minusDays(1)))
    }
    if (rows.isEmpty()) return null
    return WeekReview(end, rows, headline(rows))
}

// Monday to Wednesday, until the review has been dismissed this week.
fun showWeekReview(today: LocalDate, seen: LocalDate?): Boolean {
    val monday = today.with(DayOfWeek.MONDAY)
    return today.dayOfWeek <= DayOfWeek.WEDNESDAY && (seen == null || seen.isBefore(monday))
}

// One plain sentence on the biggest change; small wobbles are not news.
private fun headline(rows: List<WeekRow>): String? {
    val changes = rows.mapNotNull { r -> r.lastWeek?.takeIf { it > 0 }?.let { r to (r.thisWeek - it) / it } }
    val (row, share) = changes.maxByOrNull { abs(it.second) } ?: return null
    if (abs(share) < 0.05) return "A steady week: everything within 5% of the week before."
    val more = share > 0
    val pct = (abs(share) * 100).roundToInt()
    val last = row.lastWeek ?: return null
    return when (row.kind) {
        MetricKind.STEPS -> "You walked $pct% ${if (more) "more" else "less"} than the week before."
        MetricKind.SLEEP_HOURS -> {
            val minutes = (abs(row.thisWeek - last) * 60).roundToInt()
            "You slept $minutes minutes ${if (more) "more" else "less"} a night than the week before."
        }
        MetricKind.ACTIVE_MINUTES -> "You were active $pct% ${if (more) "more" else "less"} than the week before."
        MetricKind.RECOVERY -> {
            val points = abs(row.thisWeek - last).roundToInt()
            "Recovery averaged $points ${if (points == 1) "point" else "points"} ${if (more) "higher" else "lower"} than the week before."
        }
        else -> null
    }
}
