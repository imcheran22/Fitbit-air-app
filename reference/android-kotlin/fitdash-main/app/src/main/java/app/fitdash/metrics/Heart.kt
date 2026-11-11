package app.fitdash.metrics

import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

// One day of heart rate. `line` has one slot per 5-minute bucket from 00:00 (288 slots); null means no sample.
data class HeartDay(val min: Int, val max: Int, val avg: Int, val latest: Sample, val line: List<Double?>) {
    companion object {
        val SLOTS = 24 * 60 / Tuning.HR_BUCKET_MINUTES
    }
}

fun heartDay(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId): HeartDay? {
    val day = snapshot.heartRate.filter { it.time.atZone(zone).toLocalDate() == date }
    if (day.size < Tuning.MIN_HR_DAY_SAMPLES) return null
    val buckets = arrayOfNulls<MutableList<Double>>(HeartDay.SLOTS)
    day.forEach { s ->
        val t = s.time.atZone(zone)
        val slot = (t.hour * 60 + t.minute) / Tuning.HR_BUCKET_MINUTES
        (buckets[slot] ?: mutableListOf<Double>().also { buckets[slot] = it }) += s.value
    }
    val values = day.map { it.value }
    return HeartDay(
        min = values.min().roundToInt(),
        max = values.max().roundToInt(),
        avg = values.average().roundToInt(),
        latest = day.maxBy { it.time },
        line = buckets.map { b -> b?.average() },
    )
}

// Splits a bucketed line into runs that should be drawn as one stroke: a gap longer than `maxGap` empty slots starts a new run.
fun lineRuns(line: List<Double?>, maxGap: Int = Tuning.HR_GAP_BUCKETS): List<List<Pair<Int, Double>>> {
    val runs = mutableListOf<MutableList<Pair<Int, Double>>>()
    var gap = Int.MAX_VALUE
    line.forEachIndexed { i, v ->
        if (v == null) {
            gap++
            return@forEachIndexed
        }
        if (gap > maxGap || runs.isEmpty()) runs.add(mutableListOf())
        runs.last().add(i to v)
        gap = 0
    }
    return runs
}

// Samples inside a span, bucketed to `bucketSeconds` means, for the workout sheet.
fun spanLine(samples: List<Sample>, start: java.time.Instant, end: java.time.Instant, bucketSeconds: Long = 30): List<Double> {
    val inSpan = samples.filter { !it.time.isBefore(start) && !it.time.isAfter(end) }.sortedBy { it.time }
    if (inSpan.isEmpty()) return emptyList()
    return inSpan.groupBy { (it.time.epochSecond - start.epochSecond) / bucketSeconds }
        .toSortedMap().values.map { b -> b.map { it.value }.average() }
}

// Tanaka's estimate of maximum heart rate; closer than 220 − age for adults over 40.
fun maxHrForAge(age: Int): Int = (208 - 0.7 * age).roundToInt()

// Lower edge of zones 1–5 as a share of maximum heart rate.
val ZONE_FLOORS = listOf(0.5, 0.6, 0.7, 0.8, 0.9)

// Seconds in each of the five zones, from a line of 30-second buckets. Readings under 50% of max count in no zone.
fun zoneSeconds(line: List<Double>, maxHr: Int, bucketSeconds: Long = 30): List<Long> {
    val seconds = LongArray(ZONE_FLOORS.size)
    line.forEach { bpm ->
        val zone = ZONE_FLOORS.indexOfLast { bpm >= it * maxHr }
        if (zone >= 0) seconds[zone] += bucketSeconds
    }
    return seconds.toList()
}
