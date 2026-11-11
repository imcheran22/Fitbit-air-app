package app.fitdash.ui.pages

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.text.style.TextAlign
import app.fitdash.metrics.awakeningsStatus
import app.fitdash.metrics.efficiencyStatus
import app.fitdash.metrics.genericDailySeries
import app.fitdash.metrics.weeklyAverages
import app.fitdash.ui.components.GapLine
import app.fitdash.ui.components.monthLabels
import app.fitdash.ui.components.sparseLabels
import app.fitdash.ui.LocalPrefs
import app.fitdash.ui.formatBloodPressure
import app.fitdash.ui.formatDate
import app.fitdash.ui.formatDuration
import java.time.ZoneId
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fitdash.metrics.DayValue
import app.fitdash.metrics.Good
import app.fitdash.metrics.MetricKind
import app.fitdash.metrics.TodayData
import app.fitdash.metrics.Status
import app.fitdash.metrics.normalRange
import app.fitdash.metrics.rangeStatus
import app.fitdash.metrics.rangeWord
import app.fitdash.metrics.scoreStatus
import app.fitdash.metrics.sleepScoreStatus
import app.fitdash.metrics.NSF_SLEEP
import app.fitdash.metrics.sleepGuideline
import app.fitdash.ui.BASELINE_LINE
import app.fitdash.ui.GENERIC_EXPLAIN
import app.fitdash.ui.NOT_MEDICAL
import app.fitdash.ui.components.SmoothArea
import app.fitdash.ui.components.SegmentedControl
import app.fitdash.ui.components.StatusText
import app.fitdash.ui.components.ValueText
import app.fitdash.ui.bmiWord
import app.fitdash.ui.formatBmi
import app.fitdash.ui.formatLiters
import app.fitdash.ui.formatNumber
import app.fitdash.ui.formatSteps
import app.fitdash.metrics.FitnessCard
import app.fitdash.ui.fitnessCardName
import app.fitdash.ui.metricExplain
import app.fitdash.ui.metricName
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import app.fitdash.ui.theme.bmiColour
import kotlin.math.roundToInt
import kotlin.math.roundToLong

sealed interface MetricRef {
    data class Kind(val kind: MetricKind) : MetricRef
    data class Generic(val label: String, val unit: String) : MetricRef
    data class Fitness(val card: FitnessCard) : MetricRef
}

val LocalOpenMetric = staticCompositionLocalOf<(MetricRef) -> Unit> { {} }
val LocalMiles = staticCompositionLocalOf { false }

@Composable
fun metricOpener(ref: MetricRef): () -> Unit {
    val haptic = LocalHapticFeedback.current
    val open = LocalOpenMetric.current
    return {
        haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        open(ref)
    }
}

fun metricDescription(ref: MetricRef) = when (ref) {
    is MetricRef.Kind -> "${metricName(ref.kind)} details"
    is MetricRef.Generic -> "${ref.label} details"
    is MetricRef.Fitness -> "${fitnessCardName(ref.card)}: how it is worked out"
}

private const val MILES_PER_KM = 0.621371

private val LINE_KINDS = setOf(MetricKind.RESTING_HR, MetricKind.HRV, MetricKind.HEART_RATE, MetricKind.SPO2, MetricKind.RESPIRATORY, MetricKind.SKIN_TEMP, MetricKind.EFFICIENCY)
private val RANGE_KINDS = setOf(MetricKind.RESTING_HR, MetricKind.HRV, MetricKind.SPO2, MetricKind.RESPIRATORY, MetricKind.SKIN_TEMP)
private const val LB_PER_KG = 2.20462

private fun goodFor(kind: MetricKind) = when (kind) {
    MetricKind.RESTING_HR -> Good.LOWER
    MetricKind.HRV, MetricKind.SPO2 -> Good.HIGHER
    else -> Good.MIDDLE
}

private fun unitFor(kind: MetricKind, miles: Boolean) = when (kind) {
    MetricKind.RECOVERY, MetricKind.SLEEP_SCORE, MetricKind.STEPS -> ""
    MetricKind.SLEEP_HOURS -> "h"
    MetricKind.DEEP, MetricKind.REM, MetricKind.LIGHT, MetricKind.AWAKE, MetricKind.ACTIVE_MINUTES -> "min"
    MetricKind.RESTING_HR, MetricKind.HEART_RATE -> "bpm"
    MetricKind.HRV -> "ms"
    MetricKind.SPO2, MetricKind.EFFICIENCY -> "%"
    MetricKind.AWAKENINGS -> ""
    MetricKind.RESPIRATORY -> "br/min"
    MetricKind.SKIN_TEMP -> "°C"
    MetricKind.DISTANCE -> if (miles) "mi" else "km"
    MetricKind.CALORIES -> "kcal"
    MetricKind.WATER -> "L"
    MetricKind.BMI -> ""
}

private fun format(kind: MetricKind?, v: Double) = when (kind) {
    MetricKind.STEPS, MetricKind.CALORIES -> formatSteps(v.roundToLong())
    MetricKind.WATER -> formatLiters(v)
    MetricKind.BMI -> formatBmi(v)
    else -> formatNumber(v)
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MetricDetailSheet(ref: MetricRef, data: TodayData, miles: Boolean, onDismiss: () -> Unit) {
    val kind = (ref as? MetricRef.Kind)?.kind
    val prefs = LocalPrefs.current
    val isWeight = ref is MetricRef.Generic && ref.label == "Weight" && prefs.weightLb
    val isTempDelta = kind == MetricKind.SKIN_TEMP && prefs.fahrenheit
    val scale = when {
        kind == MetricKind.DISTANCE && miles -> MILES_PER_KM
        isWeight -> LB_PER_KG
        isTempDelta -> 1.8
        else -> 1.0
    }
    val generic = (ref as? MetricRef.Generic)?.let { g -> data.generic.firstOrNull { it.label == g.label } }
    val series: List<DayValue> = when (ref) {
        is MetricRef.Kind -> data.series[ref.kind].orEmpty()
        is MetricRef.Generic -> data.genericDaily[ref.label].orEmpty()
        is MetricRef.Fitness -> emptyList()
    }.map { d -> d.copy(value = d.value?.times(scale)) }
    // Diastolic for blood pressure, drawn as a second line.
    val second: List<DayValue>? = generic?.second?.takeIf { it.isNotEmpty() }?.let { genericDailySeries(it, data.date, ZoneId.systemDefault(), data.daysBack + 1) }
    val name = when (ref) {
        is MetricRef.Kind -> metricName(ref.kind)
        is MetricRef.Generic -> ref.label
        is MetricRef.Fitness -> fitnessCardName(ref.card)
    }
    val unit = when (ref) {
        is MetricRef.Kind -> if (isTempDelta) "°F" else unitFor(ref.kind, miles)
        is MetricRef.Generic -> if (isWeight) "lb" else ref.unit
        is MetricRef.Fitness -> ""
    }
    val explain = kind?.let(::metricExplain) ?: GENERIC_EXPLAIN
    val history = data.daysBack > 30
    var segment by rememberSaveable { mutableIntStateOf(0) }
    if (!history && segment > 1) segment = 1
    val month = segment == 1
    val sixMonths = segment == 2
    val visible = when (segment) {
        0 -> series.takeLast(7)
        1 -> series.takeLast(30)
        else -> series
    }
    val visibleSecond = second?.takeLast(visible.size)
    val weeks = if (sixMonths) weeklyAverages(visible) else emptyList()
    val plotted: List<Double?> = if (sixMonths) weeks.map { it.value } else visible.map { it.value }
    val plottedSecond: List<Double?>? = visibleSecond?.let { if (sixMonths) weeklyAverages(it).map { w -> w.value } else it.map { d -> d.value } }
    val labels = if (sixMonths) monthLabels(weeks.map { it.start }) else sparseLabels(visible.map { it.date }, month)
    val known = visible.mapNotNull { it.value }
    val selected = if (kind == MetricKind.BMI) data.bmi else series.lastOrNull()?.value
    val selectedSecond = second?.lastOrNull()?.value
    val range = kind?.takeIf { it in RANGE_KINDS }?.let { k ->
        normalRange(series.mapNotNull { d -> d.value?.let { d.date to it } }.toMap(), data.date)?.let { it to goodFor(k) }
    }
    val status: Status? = when {
        selected == null -> null
        kind == MetricKind.RECOVERY -> scoreStatus(selected.roundToInt())
        kind == MetricKind.SLEEP_SCORE -> sleepScoreStatus(selected.roundToInt())
        kind == MetricKind.EFFICIENCY -> efficiencyStatus(selected / 100)
        kind == MetricKind.AWAKENINGS -> awakeningsStatus(selected.roundToInt())
        range != null -> rangeWord(rangeStatus(selected, range.first, range.second))
        else -> null
    }
    val estimated = kind == MetricKind.RESTING_HR && data.date in data.estimatedRestingHrDates

    ModalBottomSheet(onDismissRequest = onDismiss, containerColor = LocalTheme.current.bgMid) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = Space.xxl)) {
            Row(Modifier.padding(horizontal = Space.xl), verticalAlignment = Alignment.CenterVertically) {
                Text(name.uppercase(), style = Type.label, color = Palette.Muted)
                if (estimated) Text("EST.", Modifier.padding(start = Space.s), style = Type.tiny, color = Palette.Faint)
            }
            if (selected != null && selectedSecond != null) {
                ValueText(formatBloodPressure(selected, selectedSecond), unit, Modifier.padding(start = Space.xl, end = Space.xl, top = Space.xs), style = Type.hero.copy(fontSize = 56.sp))
            } else if (selected != null) {
                ValueText(format(kind, selected), unit, Modifier.padding(start = Space.xl, end = Space.xl, top = Space.xs), style = Type.hero.copy(fontSize = 56.sp))
            } else {
                Text("—", Modifier.padding(horizontal = Space.xl), style = Type.hero.copy(fontSize = 56.sp), color = Palette.Faint)
            }
            if (status != null) StatusText(status, Modifier.padding(horizontal = Space.xl))
            if (kind == MetricKind.BMI && data.bmiBand != null) {
                Text(bmiWord(data.bmiBand), Modifier.padding(horizontal = Space.xl), style = Type.tiny.copy(fontSize = 9.5.sp, fontWeight = FontWeight.Medium), color = bmiColour(data.bmiBand))
            }
            Text(explain, Modifier.padding(horizontal = Space.xl, vertical = Space.m), style = Type.body, color = Palette.Muted)
            if (kind == MetricKind.RECOVERY || kind in RANGE_KINDS) {
                Text(BASELINE_LINE, Modifier.padding(horizontal = Space.xl), style = Type.tiny, color = Palette.Faint)
            }
            if (kind == MetricKind.SLEEP_HOURS) {
                data.goals.age(data.date.year)?.let(::sleepGuideline)?.let { g ->
                    Text("Guideline for your age: ${g.first}–${g.last} h a night (${NSF_SLEEP.title}).", Modifier.padding(horizontal = Space.xl), style = Type.tiny, color = Palette.Faint)
                    Text(NOT_MEDICAL, Modifier.padding(horizontal = Space.xl, vertical = Space.xs), style = Type.tiny, color = Palette.Faint)
                }
            }
            if (kind == MetricKind.SLEEP_SCORE) {
                data.sleep?.parts?.let { pts ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = Space.xl, vertical = Space.xs), horizontalArrangement = Arrangement.SpaceBetween) {
                        listOf("DURATION" to "${pts.duration}/50", "EFFICIENCY" to "${pts.efficiency}/15", "RESTORATION" to "${pts.restoration}/20", "RESTFUL" to "${pts.restfulness}/15").forEach { (l, v) ->
                            Column { Text(l, style = Type.tiny, color = Palette.Muted); Text(v, style = Type.small, color = Palette.Text) }
                        }
                    }
                }
            }
            if (kind == MetricKind.SLEEP_HOURS) {
                data.sleep?.latency?.let { l ->
                    Text("FELL ASLEEP IN ${formatDuration(l).uppercase()}", Modifier.padding(horizontal = Space.xl, vertical = Space.xs), style = Type.tiny, color = Palette.Muted)
                }
            }
            if (kind == MetricKind.HEART_RATE) {
                data.heartDay?.let { hd ->
                    Text("LOWEST ${hd.min} · HIGHEST ${hd.max} BPM", Modifier.padding(horizontal = Space.xl, vertical = Space.xs), style = Type.tiny, color = Palette.Muted)
                }
            }
            if (kind != MetricKind.BMI) {
                SegmentedControl(if (history) listOf("Week", "Month", "6M") else listOf("Week", "Month"), segment, { segment = it })
                if (known.size < 2) {
                    Text(
                        "NOT ENOUGH DATA YET",
                        Modifier.padding(horizontal = Space.xl, vertical = Space.xxl),
                        style = Type.label,
                        color = Palette.Faint,
                    )
                } else {
                    val key = "detail-${kind ?: name}-$segment"
                    val chart = Modifier.fillMaxWidth().padding(horizontal = Space.xl, vertical = Space.l)
                    if (kind == null || kind in LINE_KINDS) {
                        Column(chart) {
                            GapLine(key, plotted, Modifier.fillMaxWidth().height(120.dp), second = plottedSecond)
                            if (labels.any { it.isNotEmpty() }) {
                                Row(Modifier.fillMaxWidth().padding(top = Space.xs, end = 34.dp)) {
                                    labels.forEach { Text(it, Modifier.weight(1f), style = Type.tiny, color = Palette.Faint, textAlign = TextAlign.Center, maxLines = 1, softWrap = false) }
                                }
                            }
                        }
                    } else {
                        SmoothArea(
                            key,
                            plotted,
                            chart,
                            labels = labels,
                            height = 120.dp,
                            poor = { i ->
                                val v = plotted[i]
                                v != null && when (kind) {
                                    MetricKind.RECOVERY, MetricKind.SLEEP_SCORE -> v < 50
                                    MetricKind.STEPS -> v < data.goals.steps * 0.5
                                    else -> false
                                }
                            },
                            readout = { i -> (if (sixMonths) "Week of ${formatDate(weeks[i].start)}" else formatDate(visible[i].date)) + " · " + (plotted[i]?.let { format(kind, it) } ?: "—") },
                            baseline = when (kind) {
                                MetricKind.STEPS -> data.goals.steps.toDouble() * scale
                                MetricKind.SLEEP_HOURS -> data.goals.sleepHours
                                MetricKind.ACTIVE_MINUTES -> data.goals.activeMinutes.toDouble()
                                MetricKind.WATER -> data.goals.waterLiters
                                else -> null
                            },
                        )
                    }
                    Row(Modifier.fillMaxWidth().padding(horizontal = Space.xl), horizontalArrangement = Arrangement.SpaceBetween) {
                        listOf("MIN" to known.min(), "AVG" to known.average(), "MAX" to known.max()).forEach { (label, v) ->
                            Column {
                                Text(label, style = Type.tiny, color = Palette.Muted)
                                Text(format(kind, v), style = Type.tile, color = Palette.Text)
                            }
                        }
                    }
                }
                if (range != null) {
                    Row(Modifier.fillMaxWidth().padding(horizontal = Space.xl, vertical = Space.l), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text("NORMAL RANGE", style = Type.tiny, color = Palette.Muted)
                        Text(
                            "${formatNumber(range.first.start)} – ${formatNumber(range.first.endInclusive)} $unit".trim(),
                            style = Type.small,
                            color = Palette.Text,
                        )
                    }
                }
            }
        }
    }
}
