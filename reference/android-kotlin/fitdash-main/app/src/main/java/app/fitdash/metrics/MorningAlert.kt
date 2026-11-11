package app.fitdash.metrics

import java.time.Instant
import java.time.LocalDate
import java.time.ZonedDateTime

// The 10th to 90th percentile band, so only a clearly unusual night alerts.
fun morningAlert(vitals: List<VitalReading>, heart: HeartSummary?, series: Map<MetricKind, List<DayValue>>, date: LocalDate): List<VitalReading> {
    val readings = listOfNotNull(heart?.restingHr?.let { VitalReading("Resting HR", "bpm", it, heart.restingHrBaseline, null, Good.LOWER, MetricKind.RESTING_HR) }) +
        vitals.filter { it.kind == MetricKind.RESPIRATORY || it.kind == MetricKind.SKIN_TEMP }
    return readings.mapNotNull { r ->
        val daily = series[r.kind].orEmpty().mapNotNull { d -> d.value?.let { d.date to it } }.toMap()
        val band = normalRange(daily, date, 0.1, 0.9)
        val usual = normalRange(daily, date)
        if (band != null && usual != null && rangeStatus(r.value, band, r.good) == RangeStatus.BAD_SIDE) r.copy(range = usual) else null
    }
}

fun morningAlertDue(now: ZonedDateTime, lastChecked: Instant?): Boolean {
    if (now.hour !in 6..10) return false
    return lastChecked == null || lastChecked.atZone(now.zone).toLocalDate() != now.toLocalDate()
}
