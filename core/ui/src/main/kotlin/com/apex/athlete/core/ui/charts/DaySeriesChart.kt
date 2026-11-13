package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import java.util.Locale
import kotlin.math.floor

/** One daily series of a [DaySeriesChart]. x = epoch day, y = value on the display scale; a null y is a gap. */
@Immutable
data class DaySeries(
    val label: String,
    val points: List<ChartPoint>,
    val valueSuffix: String = "",
    val decimals: Int = 0,
    /** The personal normal range, drawn as a shaded band (primary series only). */
    val baseline: ChartBand? = null,
)

/** Pure helpers of [DaySeriesChart]; unit-tested without Compose. */
internal object DaySeriesMath {

    /**
     * The days inside [x0, x1] on which at least one series has a reading, ascending and without duplicates, as points
     * (x = day, y = 1.0). Selection snaps to these days only, so the cursor never lands on a gap.
     */
    fun activeDays(primary: List<ChartPoint>, secondary: List<ChartPoint>?, x0: Long, x1: Long): List<ChartPoint> {
        val days = HashSet<Long>()
        for (p in primary) if (p.y != null && p.x in x0..x1) days.add(p.x)
        if (secondary != null) for (p in secondary) if (p.y != null && p.x in x0..x1) days.add(p.x)
        return days.sorted().map { ChartPoint(it, 1.0) }
    }

    /** The value of [series] on [day], or null when there is none. */
    fun valueOn(series: List<ChartPoint>, day: Long): Double? {
        for (p in series) if (p.x == day) return p.y
        return null
    }

    /** The Y domain of one series (with its band) padded to nice steps; a series without readings gets 0..1. */
    fun domainFor(window: List<ChartPoint>, band: ChartBand?): AxisDomain {
        val values = ArrayList<Double>()
        for (p in window) { val y = p.y; if (y != null) values.add(y) }
        val extra = if (band != null) listOf(band.low, band.high) else emptyList()
        val d = ChartScales.lineDomain(values, extra) ?: return AxisDomain(0.0, 1.0)
        return ChartScales.niceDomain(d, 4)
    }
}

/**
 * Daily lines over a window of days, with a selectable day, for the activity, body, trends and overlay screens.
 *
 * [primary] is drawn solid against the left axis. An optional [secondary] is drawn dashed against its own right axis, so two
 * metrics with different units can be compared by shape; the two scales are independent, which means the picture says
 * nothing about how strongly the metrics are related. Missing days are gaps; nothing is interpolated or smoothed.
 *
 * Selection is owned by the caller ([selectedDay], [onSelectDay]): a tap or drag selects the nearest day that has a reading,
 * tapping the selected day again clears it. The caller shows what to do with the day (for example an "Open day" button).
 * The readout line shows the selected day's values, or each series' average and latest value.
 * The window is [startDay]..[endDay]. [provenance] is shown under the plot. TalkBack gets one description with the summary
 * of each series.
 */
@Composable
fun DaySeriesChart(
    title: String,
    primary: DaySeries,
    startDay: Long,
    endDay: Long,
    selectedDay: Long?,
    onSelectDay: (Long?) -> Unit,
    modifier: Modifier = Modifier,
    secondary: DaySeries? = null,
    provenance: String? = null,
    height: Dp = ChartHeights.trend,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val x0 = startDay
    val x1 = maxOf(endDay, startDay + 1)
    val windowP = remember(primary.points, x0, x1) { primary.points.filter { it.x in x0..x1 }.sortedBy { it.x } }
    val windowS = remember(secondary?.points, x0, x1) { secondary?.points?.filter { it.x in x0..x1 }?.sortedBy { it.x } }
    val statsP = remember(windowP) { ChartScales.stats(windowP) }
    val statsS = remember(windowS) { windowS?.let { ChartScales.stats(it) } }
    if (statsP.validCount == 0 && (statsS == null || statsS.validCount == 0)) {
        ChartEmptyBox(stringResource(R.string.apex_chart_empty_trend), height, modifier)
        return
    }

    val colors = ApexTheme.colors
    val labelStyle = ApexTheme.type.chart
    val locale = Locale.getDefault()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current

    val yAxisP = remember(windowP, primary.baseline) { buildYAxis(DaySeriesMath.domainFor(windowP, primary.baseline), 4, locale) }
    val yAxisS = remember(windowS) { windowS?.let { buildYAxis(DaySeriesMath.domainFor(it, null), 4, locale) } }
    val xTicks = remember(x0, x1) {
        ChartScales.niceTicks(x0.toDouble(), x1.toDouble(), 4).filter { it == floor(it) }.map { it.toLong() }
    }
    val xLabels = remember(xTicks) { xTicks.map { ChartScales.formatDay(it, locale) } }
    val runsP = remember(windowP) { ChartScales.runs(windowP, 1L) }
    val runsS = remember(windowS) { windowS?.let { ChartScales.runs(it, 1L) } }
    val dotsP = statsP.validCount <= MAX_DOTS
    val dotsS = (statsS?.validCount ?: 0) <= MAX_DOTS

    val leftPx = rememberMaxLabelWidth(yAxisP.labels, labelStyle)
    val rightPx = rememberMaxLabelWidth(yAxisS?.labels ?: emptyList(), labelStyle)
    val gapPx = with(density) { ChartLabelGap.toPx() }
    val padPx = with(density) { ChartRightPad.toPx() }
    val rightReserve = if (yAxisS != null) rightPx + gapPx + padPx else padPx
    val days = remember(windowP, windowS, x0, x1) { DaySeriesMath.activeDays(windowP, windowS, x0, x1) }
    val mapper = remember(days, leftPx, rightReserve, x0, x1) {
        ScrubMapper(days, leftPx + gapPx, rightReserve, x0.toDouble(), x1.toDouble())
    }
    val latestSelected by rememberUpdatedState(selectedDay)
    val latestOnSelect by rememberUpdatedState(onSelectDay)
    val progress = rememberChartProgress(reducedMotion, windowP to windowS)

    fun fmt(v: Double, s: DaySeries) = ChartScales.formatNumber(v, s.decimals, locale) + s.valueSuffix
    fun average(window: List<ChartPoint>, valid: Int): Double {
        var sum = 0.0
        for (p in window) sum += p.y ?: 0.0
        return sum / valid
    }

    val readout: String = run {
        val day = selectedDay
        if (day != null && day in x0..x1) {
            val parts = ArrayList<String>()
            for ((series, window) in listOfNotNull(primary to windowP, secondary?.let { it to (windowS ?: emptyList()) })) {
                val v = DaySeriesMath.valueOn(window, day)
                parts.add(
                    if (v != null) stringResource(R.string.apex_chart_legend_item, series.label, fmt(v, series))
                    else stringResource(R.string.apex_chart_day_series_none, series.label),
                )
            }
            stringResource(R.string.apex_chart_trend_readout_day, ChartScales.formatDayLong(day, locale), parts.joinToString(", "))
        } else {
            val parts = ArrayList<String>()
            if (statsP.validCount > 0) {
                val latest = windowP[statsP.latestIndex ?: 0].y ?: 0.0
                parts.add(
                    stringResource(R.string.apex_chart_day_series_summary, primary.label, fmt(average(windowP, statsP.validCount), primary), fmt(latest, primary)),
                )
            } else {
                parts.add(stringResource(R.string.apex_chart_day_series_none, primary.label))
            }
            if (secondary != null && windowS != null && statsS != null) {
                if (statsS.validCount > 0) {
                    val latest = windowS[statsS.latestIndex ?: 0].y ?: 0.0
                    parts.add(
                        stringResource(R.string.apex_chart_day_series_summary, secondary.label, fmt(average(windowS, statsS.validCount), secondary), fmt(latest, secondary)),
                    )
                } else {
                    parts.add(stringResource(R.string.apex_chart_day_series_none, secondary.label))
                }
            }
            parts.joinToString("; ")
        }
    }

    val rangeDays = (x1 - x0 + 1).toInt()
    val description = buildString {
        append(title)
        append(". ")
        for ((series, window, stats) in listOfNotNull(
            Triple(primary, windowP, statsP),
            if (secondary != null && windowS != null && statsS != null) Triple(secondary, windowS, statsS) else null,
        )) {
            if (stats.validCount > 0) {
                val latest = window[stats.latestIndex ?: 0]
                append(
                    stringResource(
                        R.string.apex_chart_trend_desc,
                        series.label, rangeDays, fmt(average(window, stats.validCount), series), fmt(stats.min ?: 0.0, series),
                        fmt(stats.max ?: 0.0, series), fmt(latest.y ?: 0.0, series), ChartScales.formatDay(latest.x, locale),
                    ),
                )
            } else {
                append(stringResource(R.string.apex_chart_day_series_none, series.label))
            }
            append(' ')
            append(stringResource(R.string.apex_chart_missing_days, ChartScales.missingDays(window, x0, x1)))
            append(' ')
        }
        val band = primary.baseline
        if (band != null) {
            append(stringResource(R.string.apex_chart_band_desc, fmt(band.low, primary), fmt(band.high, primary)))
            append(' ')
        }
        if (secondary != null) {
            append(stringResource(R.string.apex_chart_day_series_two_scales, primary.label, secondary.label))
            append(' ')
        }
        val sel = selectedDay
        append(
            if (sel != null && sel in x0..x1) stringResource(R.string.apex_chart_day_series_selected_desc, ChartScales.formatDayLong(sel, locale))
            else stringResource(R.string.apex_chart_day_series_hint),
        )
        if (provenance != null) { append(' '); append(provenance) }
    }

    val gridColor = colors.chartGrid
    val labelColor = colors.mutedForeground
    val cursorColor = colors.chartCursor
    val bandColor = colors.chartBand
    val lineP = colors.chart1
    val lineS = colors.chart2
    val axisColorP = if (secondary != null) lineP else labelColor
    val axisColorS = lineS

    Column(modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = description }) {
        Text(readout, style = ApexTheme.type.chart, color = colors.foreground)
        if (secondary != null) {
            Spacer(Modifier.height(ApexSpacing.xs))
            Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.lg), verticalAlignment = Alignment.CenterVertically) {
                LegendItem(primary.label, dashed = false, color = lineP, Modifier.weight(1f))
                LegendItem(secondary.label, dashed = true, color = lineS, Modifier.weight(1f))
            }
        }
        Spacer(Modifier.height(ChartLabelGap))
        Spacer(
            Modifier
                .fillMaxWidth()
                .height(height)
                .scrubGestures(
                    key = mapper,
                    onTap = { x, w ->
                        val d = mapper.indexAt(x, w)?.let { days[it].x }
                        latestOnSelect(if (d == null || d == latestSelected) null else d)
                    },
                    onDrag = { x, w ->
                        val d = mapper.indexAt(x, w)?.let { days[it].x }
                        if (d != null) latestOnSelect(d)
                    },
                )
                .drawWithCache {
                    val gap = ChartLabelGap.toPx()
                    val yLayoutsP = measureAll(measurer, labelStyle, yAxisP.labels)
                    val yLayoutsS = measureAll(measurer, labelStyle, yAxisS?.labels ?: emptyList())
                    val xLayouts = measureAll(measurer, labelStyle, xLabels)
                    val labelH = maxOf(yLayoutsP.maxOfOrNull { it.size.height } ?: 0, yLayoutsS.maxOfOrNull { it.size.height } ?: 0).toFloat()
                    val frame = PlotFrame(
                        left = leftPx + gap,
                        top = labelH / 2f,
                        right = size.width - rightReserve,
                        bottom = size.height - labelH - gap,
                    )
                    val dP = yAxisP.domain
                    val mapX = { x: Long -> ChartScales.mapLinear(x.toDouble(), x0.toDouble(), x1.toDouble(), frame.left, frame.right) }
                    val mapYP = { y: Double -> ChartScales.mapLinear(y, dP.min, dP.max, frame.bottom, frame.top) }
                    val dS = yAxisS?.domain ?: AxisDomain(0.0, 1.0)
                    val mapYS = { y: Double -> ChartScales.mapLinear(y, dS.min, dS.max, frame.bottom, frame.top) }
                    val tickYsP = FloatArray(yAxisP.ticks.size) { mapYP(yAxisP.ticks[it]) }
                    val tickYsS = FloatArray(yAxisS?.ticks?.size ?: 0) { mapYS(yAxisS?.ticks?.get(it) ?: 0.0) }
                    val xCenters = FloatArray(xTicks.size) { mapX(xTicks[it]) }
                    val xPlaced = placeXLabels(xLayouts, xCenters, frame.left, frame.right, gap)
                    val (pxP, pyP) = pointPixels(windowP, mapX, mapYP)
                    val geoP = buildLineGeometry(windowP, runsP, mapX, mapYP)
                    val sWindow = windowS
                    val sRuns = runsS
                    val geoS = if (sWindow != null && sRuns != null) buildLineGeometry(sWindow, sRuns, mapX, mapYS) else null
                    val pxPy = if (sWindow != null) pointPixels(sWindow, mapX, mapYS) else null
                    val band = primary.baseline
                    val bandTop = if (band != null) mapYP(band.high.coerceIn(dP.min, dP.max)) else 0f
                    val bandBottom = if (band != null) mapYP(band.low.coerceIn(dP.min, dP.max)) else 0f
                    val hair = 1.dp.toPx()
                    val strokeP = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val strokeS = Stroke(
                        width = 1.5.dp.toPx(),
                        cap = StrokeCap.Round,
                        join = StrokeJoin.Round,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())),
                    )
                    val dotR = 2.5.dp.toPx()
                    val markR = 4.dp.toPx()
                    val sel = selectedDay?.takeIf { it in x0..x1 }
                    val selX = if (sel != null) mapX(sel) else Float.NaN
                    val selP = if (sel != null) windowP.indexOfFirst { it.x == sel && it.y != null } else -1
                    val selS = if (sel != null && sWindow != null) sWindow.indexOfFirst { it.x == sel && it.y != null } else -1

                    onDrawBehind {
                        if (band != null) drawRect(bandColor, Offset(frame.left, bandTop), Size(frame.width, bandBottom - bandTop))
                        drawYAxis(frame, tickYsP, yLayoutsP, gridColor, axisColorP, hair, gap)
                        for (i in tickYsS.indices) {
                            val l = yLayoutsS[i]
                            drawText(l, color = axisColorS, topLeft = Offset(frame.right + gap, tickYsS[i] - l.size.height / 2f))
                        }
                        drawXLabels(xPlaced, frame.bottom + gap, labelColor)
                        val prog = progress.value
                        clipRect(frame.left, 0f, frame.left + frame.width * prog, size.height) {
                            drawPath(geoP.path, lineP, style = strokeP)
                            if (dotsP) {
                                for (i in pxP.indices) if (!pyP[i].isNaN()) drawCircle(lineP, dotR, Offset(pxP[i], pyP[i]))
                            } else {
                                for (s in geoP.singles) drawCircle(lineP, dotR, s)
                            }
                            if (geoS != null) {
                                drawPath(geoS.path, lineS, style = strokeS)
                                if (dotsS && pxPy != null) {
                                    for (i in pxPy.first.indices) if (!pxPy.second[i].isNaN()) drawCircle(lineS, dotR, Offset(pxPy.first[i], pxPy.second[i]))
                                } else {
                                    for (s in geoS.singles) drawCircle(lineS, dotR, s)
                                }
                            }
                        }
                        if (sel != null && prog >= 1f) {
                            drawLine(cursorColor, Offset(selX, frame.top), Offset(selX, frame.bottom), hair)
                            if (selP >= 0 && !pyP[selP].isNaN()) drawCircle(lineP, markR, Offset(pxP[selP], pyP[selP]))
                            if (selS >= 0 && pxPy != null && !pxPy.second[selS].isNaN()) drawCircle(lineS, markR, Offset(pxPy.first[selS], pxPy.second[selS]))
                        }
                    }
                },
        )
        if (primary.baseline != null) {
            Spacer(Modifier.height(ApexSpacing.xs))
            Text(stringResource(R.string.apex_chart_band_caption), style = ApexTheme.type.caption, color = labelColor)
        }
        if (provenance != null) {
            Spacer(Modifier.height(ApexSpacing.xs))
            Text(provenance, style = ApexTheme.type.caption, color = labelColor)
        }
    }
}

@Composable
private fun LegendItem(label: String, dashed: Boolean, color: androidx.compose.ui.graphics.Color, modifier: Modifier) {
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.width(24.dp).height(8.dp)) {
            val y = size.height / 2f
            val effect = if (dashed) PathEffect.dashPathEffect(floatArrayOf(5.dp.toPx(), 3.dp.toPx())) else null
            drawLine(color, Offset(0f, y), Offset(size.width, y), strokeWidth = 2.dp.toPx(), cap = StrokeCap.Round, pathEffect = effect)
        }
        Text(label, style = ApexTheme.type.caption, color = ApexTheme.colors.foregroundSecondary)
    }
}

private const val MAX_DOTS = 40

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L

private fun previewSeries(base: Double, step: Double, gapAt: Int): List<ChartPoint> =
    (0 until 30).map { i -> ChartPoint(PREVIEW_END - 29 + i, if (i == gapAt || i == gapAt + 1) null else base + step * ((i * 7) % 11 - 5)) }

@Composable
private fun DaySeriesPreviewBody() {
    androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        DaySeriesChart(
            title = "Steps",
            primary = DaySeries("Steps", previewSeries(8_000.0, 600.0, 12)),
            startDay = PREVIEW_END - 29,
            endDay = PREVIEW_END,
            selectedDay = PREVIEW_END - 5,
            onSelectDay = {},
            provenance = "Measured",
        )
        DaySeriesChart(
            title = "Heart rate variability and resting heart rate",
            primary = DaySeries("HRV", previewSeries(62.0, 3.0, 20), " ms", 0, ChartBand(56.0, 68.0)),
            secondary = DaySeries("Resting heart rate", previewSeries(54.0, 1.0, 8), " bpm", 0),
            startDay = PREVIEW_END - 29,
            endDay = PREVIEW_END,
            selectedDay = null,
            onSelectDay = {},
        )
    }
}

@Preview(name = "Day series dark", heightDp = 700)
@Composable
private fun DaySeriesDark() = ApexPreview(dark = true) { DaySeriesPreviewBody() }

@Preview(name = "Day series light", heightDp = 700)
@Composable
private fun DaySeriesLight() = ApexPreview(dark = false) { DaySeriesPreviewBody() }
