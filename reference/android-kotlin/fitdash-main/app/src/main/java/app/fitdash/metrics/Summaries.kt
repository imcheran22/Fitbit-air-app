package app.fitdash.metrics

import app.fitdash.health.HealthSnapshot
import app.fitdash.health.Sample
import app.fitdash.health.Workout
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.roundToInt

data class HeartSummary(
    val hrv: Double?,
    val hrvBaseline: Double?,
    val restingHr: Double?,
    val restingHrBaseline: Double?,
    val hrvTrend: List<Double>,
    val restingHrTrend: List<Double>,
    val hrvRange: ClosedFloatingPointRange<Double>?,
    val restingHrRange: ClosedFloatingPointRange<Double>?,
)

data class VitalReading(
    val label: String,
    val unit: String,
    val value: Double,
    val baseline: Double?,
    val range: ClosedFloatingPointRange<Double>?,
    val good: Good,
    val kind: MetricKind,
)

data class ActivitySummary(
    val date: LocalDate,
    val steps: Long,
    val goalPercent: Int,
    val hourly: List<Long>,
    val activeMinutes: Long,
    val distanceKm: Double,
    val kcal: Double,
    val workouts: List<Workout> = emptyList(),
)

fun heartSummary(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId): HeartSummary? {
    val hrv = dailyMean(snapshot.hrv, zone)
    val rhr = dailyLast(snapshot.restingHr, zone)
    if (hrv[date] == null && rhr[date] == null) return null
    val from = date.minusDays(Tuning.TREND_DAYS - 1)
    fun trend(daily: Map<LocalDate, Double>) = daily.filterKeys { it in from..date }.toSortedMap().values.toList()
    return HeartSummary(
        hrv = hrv[date],
        hrvBaseline = baseline(hrv, date),
        restingHr = rhr[date],
        restingHrBaseline = baseline(rhr, date),
        hrvTrend = trend(hrv),
        restingHrTrend = trend(rhr),
        hrvRange = normalRange(hrv, date),
        restingHrRange = normalRange(rhr, date),
    )
}

private data class VitalSource(val label: String, val unit: String, val samples: List<Sample>, val good: Good, val kind: MetricKind)

fun vitals(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId): List<VitalReading> =
    listOf(
        VitalSource("SpO₂", "%", snapshot.spo2, Good.HIGHER, MetricKind.SPO2),
        VitalSource("Respiratory rate", "br/min", snapshot.respiratoryRate, Good.MIDDLE, MetricKind.RESPIRATORY),
        VitalSource("Skin temperature", "°C", snapshot.skinTempDelta, Good.MIDDLE, MetricKind.SKIN_TEMP),
    ).mapNotNull { s ->
        val daily = dailyMean(s.samples, zone)
        daily[date]?.let { VitalReading(s.label, s.unit, it, baseline(daily, date), normalRange(daily, date), s.good, s.kind) }
    }

fun stepsOn(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId): Long? {
    snapshot.dailyActivity.firstOrNull { it.date == date }?.let { return it.steps }
    val buckets = snapshot.hourlySteps.filter { it.start.atZone(zone).toLocalDate() == date }
    return if (buckets.isEmpty()) null else buckets.sumOf { it.steps }
}

fun activitySummary(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId, stepGoal: Int = Tuning.STEP_GOAL): ActivitySummary? {
    val day = snapshot.dailyActivity.firstOrNull { it.date == date }
    val buckets = snapshot.hourlySteps.filter { it.start.atZone(zone).toLocalDate() == date }
    if (day == null && buckets.isEmpty()) return null
    val hourly = List(24) { h -> buckets.filter { it.start.atZone(zone).hour == h }.sumOf { it.steps } }
    val steps = stepsOn(snapshot, date, zone)!!
    val workouts = workoutsOn(snapshot, date, zone)
    return ActivitySummary(
        date = date,
        steps = steps,
        goalPercent = (steps * 100.0 / stepGoal).roundToInt(),
        hourly = hourly,
        activeMinutes = activeMinutes(workouts),
        distanceKm = (day?.distanceMeters ?: 0.0) / 1000,
        kcal = day?.kcal ?: 0.0,
        workouts = workouts,
    )
}

// Steps on `date` counted only up to and including `hour`, as a percentage of the goal. Null when the day has no hourly buckets.
fun movementAtHour(snapshot: HealthSnapshot, date: LocalDate, zone: ZoneId, hour: Int, stepGoal: Int): Int? {
    val buckets = snapshot.hourlySteps.filter { it.start.atZone(zone).toLocalDate() == date }
    if (buckets.isEmpty()) return null
    val steps = buckets.filter { it.start.atZone(zone).hour <= hour }.sumOf { it.steps }
    return (steps * 100.0 / stepGoal).roundToInt().coerceAtMost(100)
}
