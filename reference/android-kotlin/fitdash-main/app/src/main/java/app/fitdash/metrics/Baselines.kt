package app.fitdash.metrics

import app.fitdash.health.Sample
import java.time.LocalDate
import java.time.ZoneId

fun median(values: List<Double>): Double? {
    if (values.isEmpty()) return null
    val s = values.sorted()
    val mid = s.size / 2
    return if (s.size % 2 == 1) s[mid] else (s[mid - 1] + s[mid]) / 2
}

private fun byDate(samples: List<Sample>, zone: ZoneId) =
    samples.groupBy { it.time.atZone(zone).toLocalDate() }

fun dailyMean(samples: List<Sample>, zone: ZoneId): Map<LocalDate, Double> =
    byDate(samples, zone).mapValues { (_, v) -> v.map { it.value }.average() }

fun dailyLast(samples: List<Sample>, zone: ZoneId): Map<LocalDate, Double> =
    byDate(samples, zone).mapValues { (_, v) -> v.maxBy { it.time }.value }

fun baseline(daily: Map<LocalDate, Double>, date: LocalDate): Double? =
    median(daily.filterKeys { it < date && it >= date.minusDays(Tuning.BASELINE_DAYS) }.values.toList())
