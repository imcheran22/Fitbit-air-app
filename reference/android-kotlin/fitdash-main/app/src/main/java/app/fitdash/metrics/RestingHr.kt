package app.fitdash.metrics

import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import app.fitdash.health.SleepSession
import java.time.Duration
import java.time.LocalDate
import java.time.ZoneId

fun lowestRollingMean(samples: List<Sample>, window: Duration): Double? {
    val s = samples.sortedBy { it.time }
    var best: Double? = null
    var j = 0
    var sum = 0.0
    for (i in s.indices) {
        val end = s[i].time.plus(window)
        while (j < s.size && !s[j].time.isAfter(end)) {
            sum += s[j].value
            j++
        }
        val count = j - i
        if (count >= Tuning.MIN_WINDOW_SAMPLES && Duration.between(s[i].time, s[j - 1].time) >= window.dividedBy(2)) {
            val mean = sum / count
            if (best == null || mean < best) best = mean
        }
        sum -= s[i].value
    }
    return best
}

fun estimateRestingHr(heartRate: List<Sample>, night: SleepSession?, date: LocalDate, zone: ZoneId): Double? {
    if (night != null) {
        val inNight = heartRate.filter { !it.time.isBefore(night.start) && !it.time.isAfter(night.end) }
        lowestRollingMean(inNight, Duration.ofMinutes(Tuning.RHR_WINDOW_MINUTES))?.let { return it }
    }
    val day = heartRate.filter { it.time.atZone(zone).toLocalDate() == date }.map { it.value }.sorted()
    if (day.size < Tuning.MIN_HR_SAMPLES) return null
    return percentile(day, 0.10)
}

fun withEstimatedRestingHr(snapshot: HealthSnapshot, zone: ZoneId, today: LocalDate): HealthSnapshot {
    if (snapshot.heartRate.isEmpty()) return snapshot
    val recorded = dailyLast(snapshot.restingHr, zone).keys
    val byDate = snapshot.heartRate.groupBy { it.time.atZone(zone).toLocalDate() }
    val added = mutableListOf<Sample>()
    val dates = mutableSetOf<LocalDate>()
    for (offset in 0..Tuning.BASELINE_DAYS) {
        val d = today.minusDays(offset)
        if (d in recorded) continue
        val hr = byDate[d].orEmpty() + byDate[d.minusDays(1)].orEmpty()
        estimateRestingHr(hr, nightEnding(d, snapshot.sleep, zone), d, zone)?.let {
            added += Sample(d.atTime(12, 0).atZone(zone).toInstant(), it)
            dates += d
        }
    }
    return snapshot.copy(restingHr = snapshot.restingHr + added, estimatedRestingHrDates = dates)
}
