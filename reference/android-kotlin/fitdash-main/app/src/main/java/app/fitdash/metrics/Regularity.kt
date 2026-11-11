package app.fitdash.metrics

import app.fitdash.health.SleepSession
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.ZoneId
import kotlin.math.roundToInt
import kotlin.math.sqrt

data class NightSpan(val date: LocalDate, val start: Instant?, val end: Instant?)

data class Regularity(
    val sri: Int,
    val nightsUsed: Int,
    val pairsUsed: Int,
    val bedtimeSpreadMin: Int?,
    val wakeSpreadMin: Int?,
    val nights: List<NightSpan>,
)

// `value` is null while calibrating; `progress` is the number of back-to-back recorded nights so far.
data class RegularityResult(val value: FitnessValue<Regularity>?, val progress: Int)

enum class RegularityBand { VERY_REGULAR, REGULAR, VARIES, IRREGULAR }

val PHILLIPS = Source("Phillips et al. 2017", "Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing. Sci Rep 7:3216. Defines the Sleep Regularity Index.")
val WINDRED = Source("Windred et al. 2023", "Sleep regularity is a stronger predictor of mortality risk than sleep duration: a prospective cohort study. Sleep 47(1). UK Biobank, 60 977 adults.")

const val REGULARITY_NIGHTS = 14L
const val MIN_PAIRS = 5
private const val SPREAD_NIGHTS = 7
private const val DAY_MINUTES = 24 * 60
private const val EVENING_MIN = 18 * 60
const val NIGHT_AXIS_SPAN_MIN = 16 * 60

fun regularityBand(sri: Int): RegularityBand = when {
    sri >= 80 -> RegularityBand.VERY_REGULAR
    sri >= 70 -> RegularityBand.REGULAR
    sri >= 60 -> RegularityBand.VARIES
    else -> RegularityBand.IRREGULAR
}

// Minutes since 18:00 of the previous evening, so bedtimes either side of midnight sit on one scale.
private fun minutesFromEvening(t: Instant, zone: ZoneId): Int {
    val z = t.atZone(zone)
    val m = z.hour * 60 + z.minute
    return if (m >= EVENING_MIN) m - EVENING_MIN else m + DAY_MINUTES - EVENING_MIN
}

fun medianBedtime(starts: List<Instant>, zone: ZoneId, nights: Int = REGULARITY_NIGHTS.toInt()): LocalTime? {
    if (starts.size < Tuning.MIN_BEDTIME_NIGHTS) return null
    val m = median(starts.sorted().takeLast(nights).map { minutesFromEvening(it, zone).toDouble() })?.toInt() ?: return null
    return LocalTime.of((m + EVENING_MIN) % DAY_MINUTES / 60, (m + EVENING_MIN) % 60)
}

fun clockSpreadMinutes(times: List<Instant>, zone: ZoneId): Int? {
    if (times.size < 3) return null
    val xs = times.map { minutesFromEvening(it, zone).toDouble() }
    val mean = xs.average()
    return sqrt(xs.sumOf { (it - mean) * (it - mean) } / (xs.size - 1)).roundToInt()
}

// Where a time sits on the chart's 20:00–12:00 axis, 0..1; times outside it pin to the nearer edge.
fun nightAxisFraction(t: Instant, zone: ZoneId): Float =
    (minutesFromEvening(t, zone) - 120).coerceIn(0, NIGHT_AXIS_SPAN_MIN) / NIGHT_AXIS_SPAN_MIN.toFloat()

fun regularity(sessions: List<SleepSession>, date: LocalDate, zone: ZoneId): RegularityResult {
    val dates = window(date, REGULARITY_NIGHTS)
    val mains = sessions
        .filter { Duration.between(it.start, it.end).seconds >= Tuning.MIN_NIGHT_HOURS * 3600 }
        .groupBy { it.end.atZone(zone).toLocalDate() }
        .filterKeys { it in dates }
        .mapValues { (_, v) -> v.maxBy { Duration.between(it.start, it.end) } }
    val nights = dates.map { d -> NightSpan(d, mains[d]?.start, mains[d]?.end) }
    val dayPairs = dates.count { it in mains && it.plusDays(1) in mains }
    if (dayPairs < MIN_PAIRS) return RegularityResult(null, dayPairs)

    // The sleep day d runs from 18:00 the evening before to 18:00 on d, so the night ending d sits inside it; each
    // minute is paired with the one exactly 24 h later. Only the window plus one day is painted, and minutes outside
    // the recorded span are unknown rather than awake and are skipped.
    val first = maxOf(sessions.minOf { it.start }, dates.first().minusDays(1).atTime(18, 0).atZone(zone).toInstant())
    val last = minOf(sessions.maxOf { it.end }, dates.last().plusDays(1).atTime(18, 0).atZone(zone).toInstant())
    val total = Duration.between(first, last).toMinutes().toInt() + 1
    val asleep = BooleanArray(total)
    for (s in sessions) {
        if (s.end <= first || s.start >= last) continue
        val a = Duration.between(first, s.start).toMinutes().toInt().coerceAtLeast(0)
        val b = Duration.between(first, s.end).toMinutes().toInt().coerceAtMost(total)
        for (i in a until b) asleep[i] = true
    }
    var matches = 0L
    var pairs = 0L
    for (d in dates) {
        if (d !in mains || d.plusDays(1) !in mains) continue
        val base = Duration.between(first, d.minusDays(1).atTime(18, 0).atZone(zone).toInstant()).toMinutes()
        for (m in 0 until DAY_MINUTES) {
            val i = base + m
            val j = i + DAY_MINUTES
            if (i < 0 || j >= total) continue
            pairs++
            if (asleep[i.toInt()] == asleep[j.toInt()]) matches++
        }
    }
    if (pairs == 0L) return RegularityResult(null, dayPairs)
    val sri = (200.0 * matches / pairs - 100).roundToInt().coerceIn(0, 100)
    val recent = nights.takeLast(SPREAD_NIGHTS)
    val bed = clockSpreadMinutes(recent.mapNotNull { it.start }, zone)
    val wake = clockSpreadMinutes(recent.mapNotNull { it.end }, zone)
    val value = FitnessValue(
        Regularity(sri, mains.size, dayPairs, bed, wake, nights),
        Explanation(
            formula = "SRI = 200 × (share of minute pairs 24 h apart in the same state, asleep or awake) − 100, over the last $REGULARITY_NIGHTS nights",
            inputs = listOfNotNull(
                "Nights used" to "${mains.size} of $REGULARITY_NIGHTS",
                "Day pairs used" to dayPairs.toString(),
                bed?.let { "Bedtime" to "± $it min over $SPREAD_NIGHTS nights" },
                wake?.let { "Wake time" to "± $it min over $SPREAD_NIGHTS nights" },
            ),
            source = PHILLIPS,
            note = "Bands are fitdash's choice: 80 and over very regular, 70–79 regular, 60–69 varies, under 60 irregular. Regularity predicted mortality more strongly than duration in ${WINDRED.title} (${WINDRED.citation}).",
        ),
    )
    return RegularityResult(value, dayPairs)
}
