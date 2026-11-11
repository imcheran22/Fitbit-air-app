package app.fitdash.ui

import app.fitdash.health.HealthSnapshot
import app.fitdash.metrics.ReadinessResult
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.Tuning
import app.fitdash.metrics.asleepDuration
import app.fitdash.metrics.nightEnding
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.roundToInt

private val DAY = DateTimeFormatter.ofPattern("EEE d MMM", Locale.ENGLISH)
private val STAMP = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm", Locale.ENGLISH)

fun aiSummary(snapshot: HealthSnapshot, data: TodayData, now: ZonedDateTime): String {
    val zone = now.zone

    val recovery = when (val r = data.readiness) {
        is ReadinessResult.Ready -> "${r.score} (${bandWord(r.band)})"
        is ReadinessResult.Calibrating -> "calibrating (night ${r.nights} of ${Tuning.MIN_NIGHTS})"
        ReadinessResult.NoData -> "no data"
    }
    val sleep = data.sleep?.let { "${formatDuration(it.asleep)} (score ${it.score})" } ?: "no data"
    val h = data.heart
    val hrvPart = h?.hrv?.let { v -> "${v.roundToInt()} ms" + (h.hrvBaseline?.let { " (baseline ${it.roundToInt()})" } ?: "") } ?: "no data"
    val rhrPart = h?.restingHr?.let { v -> "${v.roundToInt()} bpm" + (h.restingHrBaseline?.let { " (baseline ${it.roundToInt()})" } ?: "") } ?: "no data"
    val steps = data.activity?.let { formatSteps(it.steps) } ?: "no data"

    val rows = data.trend.joinToString("\n") { t ->
        val sleepHours = nightEnding(t.date, snapshot.sleep, zone)?.let {
            String.format(Locale.ENGLISH, "%.1f", asleepDuration(it).seconds / 3600.0)
        }
        listOf(t.date.toString(), t.recovery?.toString(), sleepHours, t.hrv?.roundToInt()?.toString(), t.restingHr?.roundToInt()?.toString(), t.steps?.toString())
            .joinToString(", ") { it ?: "" }
    }

    val other = data.generic.joinToString(", ") { "${it.label} ${formatNumber(it.points.last().value)} ${it.unit}" }

    return buildString {
        append("My health data from fitdash (Health Connect), generated ${STAMP.format(now)}.\n")
        append("Please help me understand it. Baselines are my 30-day medians.\n\n")
        val label = if (data.isToday) "Today" else DAY.format(data.date)
        val stepsLabel = if (data.isToday) "steps so far" else "steps"
        append("$label: recovery $recovery, sleep $sleep, HRV $hrvPart, resting HR $rhrPart, $stepsLabel $steps.\n")
        if (data.workouts.isNotEmpty()) {
            append("Workouts: " + data.workouts.joinToString(", ") { w ->
                workoutTitle(w) + " " + formatDuration(w.duration) +
                    (w.distanceMeters?.let { " ${formatNumber(it / 1000)} km" } ?: "") +
                    (w.avgHr?.let { " avg HR ${it.roundToInt()}" } ?: "")
            } + ".\n")
        }
        data.heartDay?.let { append("Heart rate: min ${it.min}, avg ${it.avg}, max ${it.max} bpm.\n") }
        val f = data.fitness
        val parts = listOfNotNull(
            f.fitnessAge?.let { "fitness age ${it.value.years} (Jackson 1990)" },
            f.vo2Estimate?.let { "VO2max est. ${String.format(Locale.ENGLISH, "%.1f", it.value)} ml/kg/min (Uth 2004)" },
            "sleep debt ${String.format(Locale.ENGLISH, "%.1f", f.sleepDebt.value.hours)} h",
            f.trainingLoad?.let { "training load ${String.format(Locale.ENGLISH, "%.1f", it.value.ratio)} (${loadWord(it.value.band)})" },
            f.calories?.let { "resting ${it.value.resting} kcal, daily ${it.value.daily} kcal (Mifflin-St Jeor)" },
        )
        append("Fitness (published formulas): " + parts.joinToString(", ") + ".\n")
        append("\n")
        append("Last ${data.trend.size} days (date, recovery, sleep_hours, hrv_ms, resting_hr, steps):\n")
        append(rows)
        append("\n")
        if (other.isNotEmpty()) append("\nOther data (latest): $other")
    }
}
