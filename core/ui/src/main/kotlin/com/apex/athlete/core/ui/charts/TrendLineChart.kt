package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import java.util.Locale
import kotlin.math.floor

/**
 * Daily trend line for the trend detail screen (7, 30 or 90 day windows).
 *
 * Input: [points] with x = epoch day and y = value (null = no reading). The window is the [rangeDays] days
 * ending on [endDay]; points outside it are ignored. A missing day (null or absent) breaks the line; nothing is
 * interpolated or smoothed. Every real reading gets a dot while the window holds at most 40 of them, so isolated
 * readings are visible.
 *
 * [baseline] draws the personal normal range (mean -/+ 1 SD) as a shaded band with the caption "Shaded: your
 * normal range"; the y axis is sized to include it. Y axis: data (and band) padded 10 % to a nice step, no forced
 * zero (see [ChartScales.lineDomain]); labels show the real values.
 *
 * [title] names the metric for TalkBack. [valueSuffix] is appended to formatted values (for example " ms" or "%").
 * [decimals] controls label precision (no more digits than the metric deserves). The readout shows the window
 * average and the latest reading; scrubbing shows the nearest real day. [provenance] is shown under the plot.
 */
@Composable
fun TrendLineChart(
    title: String,
    points: List<ChartPoint>,
    rangeDays: Int,
    endDay: Long,
    modifier: Modifier = Modifier,
    baseline: ChartBand? = null,
    valueSuffix: String = "",
    decimals: Int = 0,
    provenance: String? = null,
    height: Dp = ChartHeights.trend,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val x1 = endDay
    val x0 = endDay - (rangeDays.coerceAtLeast(2) - 1)
    val window = remember(points, x0, x1) { points.filter { it.x in x0..x1 }.sortedBy { it.x } }
    val stats = remember(window) { ChartScales.stats(window) }
    if (stats.validCount == 0) {
        ChartEmptyBox(stringResource(R.string.apex_chart_empty_trend), height, modifier)
        return
    }

    val colors = ApexTheme.colors
    val labelStyle = ApexTheme.type.chart
    val locale = Locale.getDefault()
    val measurer = rememberTextMeasurer()

    val yAxis = remember(window, baseline) {
        val vals = ArrayList<Double>()
        for (p in window) { val y = p.y; if (y != null) vals.add(y) }
        val extra = if (baseline != null) listOf(baseline.low, baseline.high) else emptyList()
        val d = ChartScales.lineDomain(vals, extra) ?: AxisDomain(0.0, 1.0)
        buildYAxis(ChartScales.niceDomain(d, 4), 4, locale)
    }
    val xTicks = remember(x0, x1) {
        ChartScales.niceTicks(x0.toDouble(), x1.toDouble(), 4).filter { it == floor(it) }.map { it.toLong() }
    }
    val xLabels = remember(xTicks) { xTicks.map { ChartScales.formatDay(it, locale) } }
    val runs = remember(window) { ChartScales.runs(window, 1L) }
    val showDots = stats.validCount <= 40

    val gutterPx = rememberMaxLabelWidth(yAxis.labels, labelStyle)
    val mapper = rememberScrubMapper(window, gutterPx, x0.toDouble(), x1.toDouble())
    val scrub = remember(window) { ScrubState() }
    val progress = rememberChartProgress(reducedMotion, window)

    fun fmt(v: Double) = ChartScales.formatNumber(v, decimals, locale) + valueSuffix
    val sum = remember(window) { var s = 0.0; for (p in window) s += p.y ?: 0.0; s }
    val average = sum / stats.validCount
    val latest = window[stats.latestIndex ?: 0]
    val shown = scrub.index
    val readout = if (shown != null) {
        stringResource(R.string.apex_chart_trend_readout_day, ChartScales.formatDayLong(window[shown].x, locale), fmt(window[shown].y ?: 0.0))
    } else {
        stringResource(R.string.apex_chart_trend_readout_summary, fmt(average), fmt(latest.y ?: 0.0))
    }
    val missing = ChartScales.missingDays(window, x0, x1)
    val description = buildString {
        append(
            stringResource(
                R.string.apex_chart_trend_desc,
                title, rangeDays, fmt(average), fmt(stats.min ?: 0.0), fmt(stats.max ?: 0.0),
                fmt(latest.y ?: 0.0), ChartScales.formatDay(latest.x, locale),
            ),
        )
        append(' ')
        append(stringResource(R.string.apex_chart_missing_days, missing))
        if (baseline != null) {
            append(' ')
            append(stringResource(R.string.apex_chart_band_desc, fmt(baseline.low), fmt(baseline.high)))
        }
        if (provenance != null) { append(' '); append(provenance) }
    }

    val gridColor = colors.chartGrid
    val labelColor = colors.mutedForeground
    val cursorColor = colors.chartCursor
    val bandColor = colors.chartBand
    val lineColor = colors.chart1

    Column(modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = description }) {
        Text(readout, style = ApexTheme.type.chart, color = colors.foreground)
        Spacer(Modifier.height(ChartLabelGap))
        Spacer(
            Modifier
                .fillMaxWidth()
                .height(height)
                .scrubGestures(
                    key = mapper,
                    onTap = { x, w -> scrub.tap(mapper.indexAt(x, w)) },
                    onDrag = { x, w -> scrub.drag(mapper.indexAt(x, w)) },
                )
                .drawWithCache {
                    val gap = ChartLabelGap.toPx()
                    val yLayouts = measureAll(measurer, labelStyle, yAxis.labels)
                    val xLayouts = measureAll(measurer, labelStyle, xLabels)
                    val labelH = (yLayouts.maxOfOrNull { it.size.height } ?: 0).toFloat()
                    val frame = PlotFrame(
                        left = gutterPx + gap,
                        top = labelH / 2f,
                        right = size.width - ChartRightPad.toPx(),
                        bottom = size.height - labelH - gap,
                    )
                    val d = yAxis.domain
                    val mapX = { x: Long -> ChartScales.mapLinear(x.toDouble(), x0.toDouble(), x1.toDouble(), frame.left, frame.right) }
                    val mapY = { y: Double -> ChartScales.mapLinear(y, d.min, d.max, frame.bottom, frame.top) }
                    val tickYs = FloatArray(yAxis.ticks.size) { mapY(yAxis.ticks[it]) }
                    val xCenters = FloatArray(xTicks.size) { mapX(xTicks[it]) }
                    val xPlaced = placeXLabels(xLayouts, xCenters, frame.left, frame.right, gap)
                    val (xs, ys) = pointPixels(window, mapX, mapY)
                    val geo = buildLineGeometry(window, runs, mapX, mapY)
                    val bandTop = if (baseline != null) mapY(baseline.high.coerceIn(d.min, d.max)) else 0f
                    val bandBottom = if (baseline != null) mapY(baseline.low.coerceIn(d.min, d.max)) else 0f
                    val hair = 1.dp.toPx()
                    val stroke = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val dotR = 2.5.dp.toPx()
                    val markR = 4.dp.toPx()

                    onDrawBehind {
                        if (baseline != null) {
                            drawRect(bandColor, Offset(frame.left, bandTop), Size(frame.width, bandBottom - bandTop))
                        }
                        drawYAxis(frame, tickYs, yLayouts, gridColor, labelColor, hair, gap)
                        drawXLabels(xPlaced, frame.bottom + gap, labelColor)
                        val prog = progress.value
                        clipRect(frame.left, 0f, frame.left + frame.width * prog, size.height) {
                            drawPath(geo.path, lineColor, style = stroke)
                            if (showDots) {
                                for (i in xs.indices) if (!ys[i].isNaN()) drawCircle(lineColor, dotR, Offset(xs[i], ys[i]))
                            } else {
                                for (s in geo.singles) drawCircle(lineColor, dotR, s)
                            }
                        }
                        val si = scrub.index
                        if (si != null && prog >= 1f && !ys[si].isNaN()) {
                            drawLine(cursorColor, Offset(xs[si], frame.top), Offset(xs[si], frame.bottom), hair)
                            drawCircle(lineColor, markR, Offset(xs[si], ys[si]))
                        }
                    }
                },
        )
        if (baseline != null) {
            Spacer(Modifier.height(ApexSpacing.xs))
            Text(stringResource(R.string.apex_chart_band_caption), style = ApexTheme.type.caption, color = labelColor)
        }
        if (provenance != null) {
            Spacer(Modifier.height(ApexSpacing.xs))
            Text(provenance, style = ApexTheme.type.caption, color = labelColor)
        }
    }
}
