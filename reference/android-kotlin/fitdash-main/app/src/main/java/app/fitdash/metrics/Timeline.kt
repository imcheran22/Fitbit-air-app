package app.fitdash.metrics

import app.fitdash.health.SleepSession
import app.fitdash.health.Workout
import java.time.Duration
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import java.time.ZonedDateTime

enum class SpanKind { SLEEP, NAP, WORKOUT }

data class Span(val startMin: Int, val endMin: Int, val kind: SpanKind)

data class DayTimelineData(val spans: List<Span>, val hr: List<Double?>, val steps: List<Long>, val caffeineCutoffMin: Int?, val nowMin: Int?)

fun dayTimeline(sleep: List<SleepSession>, date: LocalDate, zone: ZoneId, bedtime: LocalTime?, now: ZonedDateTime, workouts: List<Workout>, hr: List<Double?>?, steps: List<Long>): DayTimelineData? {
    val midnight = date.atStartOfDay(zone).toInstant()
    val spans = (listOfNotNull(nightEnding(date, sleep, zone)?.let { Triple(it.start, it.end, SpanKind.SLEEP) }) +
        napsEnding(date, sleep, zone).map { Triple(it.start, it.end, SpanKind.NAP) } +
        workouts.map { Triple(it.start, it.end, SpanKind.WORKOUT) })
        .map { (s, e, kind) ->
            Span(Duration.between(midnight, s).toMinutes().coerceIn(0, 1440).toInt(), Duration.between(midnight, e).toMinutes().coerceIn(0, 1440).toInt(), kind)
        }
    if (spans.isEmpty() && hr == null) return null
    return DayTimelineData(
        spans = spans,
        hr = hr.orEmpty(),
        steps = steps,
        // Caffeine's half-life is about five hours; ten hours before bed leaves roughly a quarter.
        caffeineCutoffMin = bedtime?.let { Math.floorMod(it.hour * 60 + it.minute - 600, 1440) },
        nowMin = if (now.toLocalDate() == date) now.hour * 60 + now.minute else null,
    )
}
