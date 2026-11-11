package app.fitdash.ui.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import app.fitdash.health.Workout
import app.fitdash.metrics.workoutIcon
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.workoutTitle
import app.fitdash.ui.workoutLine
import app.fitdash.ui.formatDate
import app.fitdash.ui.formatDuration
import app.fitdash.ui.components.ListRow
import app.fitdash.ui.components.RowGroup
import app.fitdash.ui.components.SectionLabel
import app.fitdash.ui.components.workoutIconVector
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import java.time.Duration
import java.time.ZoneId
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.Status
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.Tuning
import app.fitdash.metrics.scoreStatus
import app.fitdash.ui.components.Bars
import app.fitdash.ui.components.SmoothArea
import app.fitdash.ui.components.CardShape
import app.fitdash.ui.components.tappable
import app.fitdash.ui.components.EmptyState
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.components.NumberTile
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.components.SemiGauge
import app.fitdash.ui.components.TileGrid
import app.fitdash.ui.dayLetter
import app.fitdash.ui.formatNumber
import app.fitdash.ui.formatSteps
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import kotlin.math.roundToInt
import kotlin.math.roundToLong

private const val MILES_PER_KM = 0.621371

private fun againstAverage(value: Double, average: Double?): Status? =
    average?.takeIf { it > 0 }?.let { scoreStatus((value / it * 100).roundToInt().coerceAtMost(100)) }

@Composable
fun ActivityPage(data: TodayData, chrome: PageChrome, miles: Boolean, onOpenWorkout: (Workout) -> Unit = {}) {
    val a = data.activity
    val zone = ZoneId.systemDefault()
    @Composable fun opener(kind: MetricKind) = metricOpener(MetricRef.Kind(kind))
    PageColumn(chrome, accent = Palette.Green) {
        if (a == null) {
            item(key = "empty") { EmptyState(if (data.isToday) "No activity yet today" else "No activity recorded", if (LocalPrefs.current.phoneOnly) "Steps show up here as you walk with your phone." else "Sync your watch or ring, then pull down to refresh.") }
        } else {
            item(key = "gauge") {
                val percent = a.goalPercent.coerceIn(0, 100)
                Column(Modifier.fillMaxWidth().padding(top = Space.m).clip(CardShape).tappable(opener(MetricKind.STEPS), "Steps details"), horizontalAlignment = Alignment.CenterHorizontally) {
                    SemiGauge(percent, "Steps", scoreStatus(percent), key = "gauge-steps-${data.date}", value = formatSteps(a.steps), numeric = a.steps, tag = "$percent% of ${formatSteps(data.goals.steps.toLong())}", from = Palette.Accent, to = Palette.Good)
                }
            }
            if (a.hourly.sum() > 0L) revealItem("hourly", 0) {
                SectionCard("STEPS BY HOUR") {
                    Bars(
                        "steps-hourly",
                        a.hourly.map { it.toFloat() },
                        height = 46.dp,
                        highlightLast = false,
                        readout = { h -> "${h.toString().padStart(2, '0')}:00 · ${formatSteps(a.hourly[h])}" },
                    )
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        listOf("00", "06", "12", "18", "24").forEach { Text(it, style = Type.tiny, color = Palette.Faint) }
                    }
                }
            }
            // Averages exclude the selected day, and today never gets a status word: a partial day against full days always reads as a drop.
            val others = data.activityWeek.filter { it.date != data.date }
            val distance = others.mapNotNull { it.distanceKm }
            val kcal = others.mapNotNull { it.kcal }
            val unitScale = if (miles) MILES_PER_KM else 1.0
            val goal = data.goals.activeMinutes
            item(key = "activity-tiles") {
                TileGrid(
                    listOf<@Composable (Modifier) -> Unit>(
                        { m ->
                            val left = goal - a.activeMinutes
                            NumberTile(
                                "Active", NavIcons.bolt, listOf(a.activeMinutes.toString() to "min"), m,
                                if (data.isToday && left > 0) null else scoreStatus((a.activeMinutes * 100 / goal).toInt().coerceAtMost(100)),
                                if (left <= 0) "GOAL $goal MIN DONE" else "$left MIN TO GO",
                                opener(MetricKind.ACTIVE_MINUTES), "Active minutes details", tint = Tint.ROSE,
                            )
                        },
                        { m ->
                            NumberTile(
                                "Distance", NavIcons.walk, listOf(formatNumber(a.distanceKm * unitScale) to if (miles) "mi" else "km"), m,
                                if (data.isToday) null else againstAverage(a.distanceKm, distance.takeIf { it.isNotEmpty() }?.average()),
                                if (distance.isEmpty()) "THIS WEEK" else "7-DAY AVG ${formatNumber(distance.average() * unitScale)} ${if (miles) "MI" else "KM"}",
                                opener(MetricKind.DISTANCE), "Distance details", tint = Tint.SKY,
                            )
                        },
                        { m ->
                            NumberTile(
                                "Calories", NavIcons.heart, listOf(formatSteps(a.kcal.roundToLong()) to "kcal"), m,
                                if (data.isToday) null else againstAverage(a.kcal, kcal.takeIf { it.isNotEmpty() }?.average()),
                                if (kcal.isEmpty()) "THIS WEEK" else "7-DAY AVG ${formatSteps(kcal.average().roundToLong())}",
                                opener(MetricKind.CALORIES), "Calories details", tint = Tint.PEACH,
                            )
                        },
                    ),
                )
            }
        }
        if (data.workouts.isNotEmpty() || data.weekWorkouts.count > 0) {
            item(key = "workouts-label") { SectionLabel("WORKOUTS") }
            if (data.workouts.isNotEmpty()) {
                item(key = "workouts") {
                    RowGroup {
                        data.workouts.forEachIndexed { i, w ->
                            ListRow(workoutIconVector(workoutIcon(w.type)), workoutTitle(w), workoutLine(w, zone, miles, LocalPrefs.current.clock24), Modifier.semantics { contentDescription = "${workoutTitle(w)} details" }, onClick = { onOpenWorkout(w) }, divider = i > 0)
                        }
                    }
                }
            }
            item(key = "workouts-week") {
                val ww = data.weekWorkouts
                Text(
                    if (data.workouts.isEmpty()) "NONE THIS DAY · ${ww.count} THIS WEEK · ${formatDuration(Duration.ofMinutes(ww.minutes)).uppercase()}"
                    else "${ww.count} THIS WEEK · ${formatDuration(Duration.ofMinutes(ww.minutes)).uppercase()}",
                    Modifier.padding(horizontal = Space.xl),
                    style = Type.tiny,
                    color = Palette.Muted,
                )
            }
        }
        if (data.activityWeek.any { it.steps != null }) {
            val known = data.activityWeek.mapNotNull { it.steps }
            revealItem("steps-week", 1) {
                SectionCard(
                    "STEPS · 7 DAYS",
                    trailing = "avg ${formatSteps(known.average().roundToLong())}",
                    onClick = opener(MetricKind.STEPS),
                    description = "Steps details",
                ) {
                    SmoothArea(
                        "steps-week",
                        data.activityWeek.map { it.steps?.toDouble() },
                        poor = { i -> (data.activityWeek[i].steps ?: Long.MAX_VALUE) * 2 < data.goals.steps },
                        labels = data.activityWeek.map { dayLetter(it.date) },
                        readout = { i -> "${formatDate(data.activityWeek[i].date)} · ${data.activityWeek[i].steps?.let(::formatSteps) ?: "—"}" },
                        baseline = data.goals.steps.toDouble(),
                        height = 80.dp,
                    )
                }
            }
        }
    }
}
