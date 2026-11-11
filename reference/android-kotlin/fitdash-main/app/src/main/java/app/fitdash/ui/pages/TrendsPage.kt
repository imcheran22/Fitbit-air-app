package app.fitdash.ui.pages

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.mutableIntStateOf
import app.fitdash.metrics.DayValue
import app.fitdash.metrics.weeklyAverages
import app.fitdash.ui.components.GapLine
import app.fitdash.ui.components.monthLabels
import app.fitdash.ui.components.sparseLabels
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.formatBloodPressure
import app.fitdash.ui.formatDate
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.ui.text.style.TextAlign
import app.fitdash.ui.theme.Space
import androidx.compose.ui.unit.dp
import app.fitdash.health.GenericSeries
import app.fitdash.metrics.DayTrend
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.dailyMean
import app.fitdash.ui.components.SmoothArea
import app.fitdash.ui.components.EmptyState
import app.fitdash.ui.components.EmptyTrack
import app.fitdash.ui.components.SectionCard
import app.fitdash.ui.components.SectionLabel
import app.fitdash.ui.components.SegmentedControl
import app.fitdash.ui.components.StatTile
import app.fitdash.ui.components.TileGrid
import app.fitdash.ui.bmiWord
import app.fitdash.ui.insightsEmpty
import app.fitdash.ui.dayLetter
import app.fitdash.ui.daysOfData
import app.fitdash.ui.formatBmi
import app.fitdash.ui.formatNumber
import app.fitdash.ui.formatSigned
import app.fitdash.ui.formatSteps
import app.fitdash.ui.metricName
import app.fitdash.ui.theme.Palette
import app.fitdash.metrics.weekReview
import app.fitdash.ui.components.WeekReviewCard
import app.fitdash.ui.components.ListRow
import app.fitdash.ui.components.NavIcons
import app.fitdash.ui.theme.Type
import app.fitdash.ui.theme.bmiColour
import java.time.ZoneId
import kotlin.math.roundToInt
import kotlin.math.roundToLong

@Composable
fun TrendsPage(data: TodayData, chrome: PageChrome) {
    var segment by rememberSaveable { mutableIntStateOf(0) }
    val showBody = LocalPrefs.current.showBody
    val history = data.daysBack > 30
    if (!history && segment > 1) segment = 1
    val month = segment == 1
    val sixMonths = segment == 2
    val range = listOf("week", "month", "6m")[segment]
    val days = when (segment) {
        0 -> data.trend.takeLast(7)
        1 -> data.trend.takeLast(30)
        else -> data.trend
    }
    // In 6M every chart plots weekly averages.
    fun weekly(pick: (DayTrend) -> Double?): List<Double?> = weeklyAverages(days.map { DayValue(it.date, pick(it)) }).map { it.value }
    val weekStarts = weeklyAverages(days.map { DayValue(it.date, null) }).map { it.start }
    val hasTrend = data.trend.any { it.recovery != null || it.sleepScore != null || it.steps != null || it.restingHr != null || it.hrv != null }
    PageColumn(chrome, accent = Palette.Hrv) {
        if (!hasTrend && data.generic.isEmpty()) {
            item(key = "empty") { EmptyState("No trends yet", "A few days of data and your trends will build up here.") }
            return@PageColumn
        }
        weekReview(data.series, if (data.isToday) data.date.minusDays(1) else data.date)?.let { review ->
            item(key = "week-review") { WeekReviewCard(review, Modifier.padding(bottom = Space.s), regularity = data.regularity?.value?.sri, regularityLast = data.regularityLastWeek) }
        }
        item(key = "insights") {
            SectionCard("INSIGHTS", Modifier.padding(bottom = Space.s)) {
                if (data.tagEffects.isEmpty()) {
                    Text(insightsEmpty(data.taggedDays), style = Type.secondary, color = Palette.Muted)
                }
                data.tagEffects.forEachIndexed { i, e ->
                    val parts = listOf(e.hrvMs to "HRV %s ms", e.restingHrBpm to "resting HR %s bpm", e.sleepScore to "sleep score %s", e.deepShare?.times(100) to "deep %s%%")
                        .mapNotNull { (v, text) -> v?.roundToInt()?.takeIf { it != 0 }?.let { text.format(formatSigned(it)) } }
                    ListRow(NavIcons.trends, e.tag.label, (listOf("${e.days} days") + parts).joinToString(" · "), divider = i > 0)
                }
            }
        }
        item(key = "toggle") { SegmentedControl(if (history) listOf("Week", "Month", "6M") else listOf("Week", "Month"), segment, { segment = it }) }
        val letters = if (sixMonths) monthLabels(weekStarts) else sparseLabels(days.map { it.date }, month)
        @Composable fun opener(kind: MetricKind) = metricOpener(MetricRef.Kind(kind))
        fun scoreBars(key: String, label: String, kind: MetricKind, pick: (DayTrend) -> Int?, index: Int) {
            val values = if (sixMonths) weekly { pick(it)?.toDouble() } else days.map { pick(it)?.toDouble() }
            if (values.all { it == null }) return
            revealItem("$key-$range", index) {
                SectionCard(label, trailing = "avg ${values.filterNotNull().average().roundToInt()}", onClick = opener(kind), description = "${metricName(kind)} details") {
                    SmoothArea(
                        "$key-$range", values, labels = letters, poor = { i -> (values[i] ?: 100.0) < 50 },
                        readout = { i -> (if (sixMonths) "Week of ${formatDate(weekStarts[i])}" else formatDate(days[i].date)) + " · " + (values[i]?.roundToInt()?.toString() ?: "—") },
                    )
                }
            }
        }
        scoreBars("recovery", "RECOVERY", MetricKind.RECOVERY, { it.recovery }, 0)
        scoreBars("sleep-score", "SLEEP SCORE", MetricKind.SLEEP_SCORE, { it.sleepScore }, 1)
        val steps = if (sixMonths) weekly { it.steps?.toDouble() } else days.map { it.steps?.toDouble() }
        if (steps.any { it != null }) {
            val known = steps.filterNotNull()
            revealItem("steps-$range", 2) {
                SectionCard("STEPS", trailing = "avg ${formatSteps(known.average().roundToLong())}", onClick = opener(MetricKind.STEPS), description = "Steps details") {
                    SmoothArea(
                        "steps-$range",
                        steps,
                        labels = letters,
                        poor = { i -> (steps[i] ?: Double.MAX_VALUE) * 2 < data.goals.steps },
                        readout = { i -> (if (sixMonths) "Week of ${formatDate(weekStarts[i])}" else formatDate(days[i].date)) + " · " + (steps[i]?.let { formatSteps(it.roundToLong()) } ?: "—") },
                        baseline = data.goals.steps.toDouble(),
                    )
                }
            }
        }
        // Lines keep their gaps: a day without a reading is a break, not a collapsed point.
        val rhr = if (sixMonths) weekly { it.restingHr } else days.map { it.restingHr }
        if (rhr.count { it != null } >= 2) {
            val estimated = days.any { it.restingHr != null && it.date in data.estimatedRestingHrDates }
            revealItem("rhr-$range", 3) {
                SectionCard("RESTING HR", trailing = "avg ${rhr.filterNotNull().average().roundToInt()} bpm" + if (estimated) " · est." else "", onClick = opener(MetricKind.RESTING_HR), description = "Resting heart rate details") {
                    GapLine("rhr-$range", rhr, Modifier.fillMaxWidth().height(74.dp))
                    AxisRow(letters)
                }
            }
        }
        val hrv = if (sixMonths) weekly { it.hrv } else days.map { it.hrv }
        if (hrv.count { it != null } >= 2) {
            revealItem("hrv-$range", 4) {
                SectionCard("HRV", trailing = "avg ${hrv.filterNotNull().average().roundToInt()} ms", onClick = opener(MetricKind.HRV), description = "HRV details") {
                    GapLine("hrv-$range", hrv, Modifier.fillMaxWidth().height(74.dp))
                    AxisRow(letters)
                }
            }
        }
        // Generic types grouped: Body (with BMI), Heart, then whatever is left.
        val byLabel = data.generic.associateBy { it.label }
        val body = listOf("Weight", "Body fat", "Lean body mass", "Bone mass", "Body water mass", "Basal metabolic rate", "Height")
        val heartLabels = listOf("Blood pressure", "VO₂ max", "Blood glucose", "Body temperature", "Basal body temperature")
        val bmiTile: @Composable (Modifier) -> Unit = { m ->
            val open = opener(MetricKind.BMI)
            val bmi = data.bmi
            val band = data.bmiBand
            if (bmi == null || band == null) {
                StatTile("BMI", "—", null, "Add height in Settings", m, onClick = chrome.onMenu, description = "Add height in Settings") { EmptyTrack() }
            } else {
                StatTile("BMI", formatBmi(bmi), null, "general guide, not medical advice", m, onClick = open, description = "BMI details") {
                    Text(bmiWord(band), style = Type.tiny.copy(fontWeight = FontWeight.Medium), color = bmiColour(band))
                }
            }
        }
        fun tile(g: GenericSeries): @Composable (Modifier) -> Unit = { m ->
            val prefs = LocalPrefs.current
            val miles = prefs.weightLb
            val zone = ZoneId.systemDefault()
            val daily = dailyMean(g.points, zone).toSortedMap().values.toList()
            val ref = MetricRef.Generic(g.label, g.unit)
            val last = g.points.last()
            val secondLast = g.second.lastOrNull()
            val isBp = g.label == "Blood pressure"
            val isWeight = g.label == "Weight" && miles
            val value = when {
                isBp && secondLast != null -> formatBloodPressure(last.value, secondLast.value)
                isWeight -> formatNumber(daily.last() * 2.20462)
                else -> formatNumber(daily.last())
            }
            val unit = if (isWeight) "lb" else g.unit
            StatTile(g.label, value, unit, daysOfData(daily.size), m, onClick = metricOpener(ref), description = metricDescription(ref)) {
                if (daily.size >= 2) GapLine("generic-${g.label}", daily, Modifier.fillMaxWidth().height(28.dp), showMinMax = false) else EmptyTrack()
            }
        }
        val bodyTiles = listOf(bmiTile) + body.mapNotNull { byLabel[it] }.map(::tile)
        if (showBody) fitnessSection(data, chrome)
        if (showBody) {
            item(key = "body-label") { SectionLabel("BODY") }
            item(key = "body") { TileGrid(bodyTiles) }
        }
        val heartTiles = heartLabels.mapNotNull { byLabel[it] }.map(::tile)
        if (heartTiles.isNotEmpty()) {
            item(key = "heart-label") { SectionLabel("HEART") }
            item(key = "heart") { TileGrid(heartTiles) }
        }
        val rest = data.generic.filter { it.label !in body && it.label !in heartLabels }.map(::tile)
        if (rest.isNotEmpty()) {
            item(key = "other-label") { SectionLabel("OTHER DATA") }
            item(key = "other") { TileGrid(rest) }
        }
    }
}

// Axis labels under a line chart, aligned with the GapLine's plot width (it reserves 34 dp on the right for min and max).
@Composable
private fun AxisRow(labels: List<String>) {
    if (labels.isEmpty()) return
    Row(Modifier.fillMaxWidth().padding(top = Space.xs, end = 34.dp)) {
        labels.forEach { Text(it, Modifier.weight(1f), style = Type.tiny, color = Palette.Faint, textAlign = TextAlign.Center, maxLines = 1, softWrap = false) }
    }
}
