package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.theme.ApexTheme
import java.util.Locale
import kotlin.math.max

/**
 * Heart-rate line across a day or an activity window (DESIGN_SYSTEM section 5, Pulse 5.7).
 *
 * Input: [points] with x = epoch milliseconds, y = bpm (null = no reading). The line breaks at every null and
 * whenever two real readings are more than [maxGapMillis] apart. Nothing is interpolated or smoothed.
 *
 * Y axis: data min/max padded 10 % then widened to a nice step (see [ChartScales.lineDomain]); no forced zero.
 * Optional: [workoutSpans] (x = epoch ms) shaded in the strain colour, [zoneGuides] dashed lines with labels,
 * [nowMillis] dashed cursor, latest-reading marker. Tap or drag to scrub; the readout above the plot shows
 * the nearest real reading. [provenance] is shown under the plot (for example "Fitbit, synced 14:32").
 */
@Composable
fun IntradayHrChart(
    points: List<ChartPoint>,
    windowStartMillis: Long,
    windowEndMillis: Long,
    clock: ChartClock,
    modifier: Modifier = Modifier,
    workoutSpans: List<ChartSpan> = emptyList(),
    zoneGuides: List<ChartGuide> = emptyList(),
    nowMillis: Long? = null,
    maxGapMillis: Long = 10 * 60_000L,
    provenance: String? = null,
    height: Dp = ChartHeights.intradayHr,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val stats = remember(points) { ChartScales.stats(points) }
    if (stats.validCount == 0) {
        ChartEmptyBox(stringResource(R.string.apex_chart_empty_hr), height, modifier)
    } else {
        IntradayHrContent(
            points, stats, windowStartMillis, windowEndMillis, clock, modifier, workoutSpans, zoneGuides,
            nowMillis, maxGapMillis, provenance, height, reducedMotion,
        )
    }
}

@Composable
private fun IntradayHrContent(
    points: List<ChartPoint>,
    stats: SeriesStats,
    windowStartMillis: Long,
    windowEndMillis: Long,
    clock: ChartClock,
    modifier: Modifier,
    workoutSpans: List<ChartSpan>,
    zoneGuides: List<ChartGuide>,
    nowMillis: Long?,
    maxGapMillis: Long,
    provenance: String?,
    height: Dp,
    reducedMotion: Boolean,
) {
    val colors = ApexTheme.colors
    val labelStyle = ApexTheme.type.chart
    val locale = Locale.getDefault()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current

    val firstX = points[stats.firstIndex ?: 0].x
    val lastX = points[stats.latestIndex ?: 0].x
    val x0: Long
    val x1: Long
    if (windowEndMillis > windowStartMillis) {
        x0 = windowStartMillis
        x1 = windowEndMillis
    } else if (lastX > firstX) {
        x0 = firstX
        x1 = lastX
    } else {
        x0 = firstX - 1_800_000L
        x1 = firstX + 1_800_000L
    }

    val yAxis = remember(points) {
        val vals = ArrayList<Double>()
        for (p in points) {
            val y = p.y
            if (y != null) vals.add(y)
        }
        val d = ChartScales.lineDomain(vals) ?: AxisDomain(0.0, 1.0)
        val nice = ChartScales.niceDomain(AxisDomain(max(0.0, d.min), d.max), 4)
        buildYAxis(nice, 4, locale)
    }
    val tickTimes = remember(x0, x1, clock) { ChartScales.timeTicks(x0, x1, clock.zone, 4) }
    val tickLabels = remember(tickTimes, clock) {
        tickTimes.map { ChartScales.formatClockTick(it, clock.zone, clock.use24Hour, locale) }
    }
    val guides = remember(zoneGuides, yAxis) {
        zoneGuides.filter { it.y >= yAxis.domain.min && it.y <= yAxis.domain.max }
    }
    val spans = remember(workoutSpans, x0, x1) { workoutSpans.filter { it.endX > x0 && it.startX < x1 } }
    val runs = remember(points, maxGapMillis) { ChartScales.runs(points, maxGapMillis) }

    val gutterPx = rememberMaxLabelWidth(yAxis.labels, labelStyle)
    val mapper = rememberScrubMapper(points, gutterPx, x0.toDouble(), x1.toDouble())
    val scrub = remember(points) { ScrubState() }
    val progress = rememberChartProgress(reducedMotion, points)

    val gridColor = colors.chartGrid
    val labelColor = colors.mutedForeground
    val cursorColor = colors.chartCursor
    val lineColor = colors.strain
    val spanColor = colors.strain.copy(alpha = 0.18f)
    val areaTop = colors.strain.copy(alpha = 0.45f)
    val areaBottom = colors.strain.copy(alpha = 0f)

    val shown = scrub.index ?: stats.latestIndex
    val readout = if (shown != null) {
        val p = points[shown]
        val time = ChartScales.formatClock(p.x, clock.zone, clock.use24Hour, locale)
        val bpm = ChartScales.formatNumber(p.y ?: 0.0, 0, locale)
        if (scrub.index != null) {
            stringResource(R.string.apex_chart_hr_readout_point, time, bpm)
        } else {
            stringResource(R.string.apex_chart_hr_readout_latest, time, bpm)
        }
    } else {
        ""
    }

    val latest = stats.latestIndex?.let { points[it] }
    val description = buildString {
        append(
            stringResource(
                R.string.apex_chart_hr_desc,
                ChartScales.formatClock(x0, clock.zone, clock.use24Hour, locale),
                ChartScales.formatClock(x1, clock.zone, clock.use24Hour, locale),
                ChartScales.formatNumber(latest?.y ?: 0.0, 0, locale),
                ChartScales.formatClock(latest?.x ?: x1, clock.zone, clock.use24Hour, locale),
                ChartScales.formatNumber(stats.min ?: 0.0, 0, locale),
                ChartScales.formatNumber(stats.max ?: 0.0, 0, locale),
            ),
        )
        append(' ')
        append(stringResource(R.string.apex_chart_gaps, max(0, runs.size - 1)))
        if (spans.isNotEmpty()) {
            append(' ')
            append(stringResource(R.string.apex_chart_workouts_desc, spans.joinToString { it.label }))
        }
        if (provenance != null) {
            append(' ')
            append(provenance)
        }
    }

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
                    val xLayouts = measureAll(measurer, labelStyle, tickLabels)
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
                    val tickCenters = FloatArray(tickTimes.size) { mapX(tickTimes[it]) }
                    val xPlaced = placeXLabels(xLayouts, tickCenters, frame.left, frame.right, gap)

                    val (xs, ys) = pointPixels(points, mapX, mapY)
                    val geo = buildLineGeometry(points, runs, mapX, mapY)
                    val area = Path()
                    for (r in runs) {
                        if (r.first == r.last) continue
                        area.moveTo(xs[r.first], frame.bottom)
                        for (i in r) area.lineTo(xs[i], ys[i])
                        area.lineTo(xs[r.last], frame.bottom)
                        area.close()
                    }
                    val areaBrush = Brush.verticalGradient(listOf(areaTop, areaBottom), startY = frame.top, endY = frame.bottom)

                    val spanL = FloatArray(spans.size) { mapX(max(spans[it].startX, x0)) }
                    val spanR = FloatArray(spans.size) { mapX(minOf(spans[it].endX, x1)) }
                    val spanLabels = measureAll(measurer, labelStyle, spans.map { it.label })
                    val guideYs = FloatArray(guides.size) { mapY(guides[it].y) }
                    val guideLabels = measureAll(measurer, labelStyle, guides.map { it.label })
                    val nowX = if (nowMillis != null && nowMillis in x0..x1) mapX(nowMillis) else Float.NaN

                    val hair = 1.dp.toPx()
                    val dash = PathEffect.dashPathEffect(floatArrayOf(4.dp.toPx(), 4.dp.toPx()))
                    val lineStroke = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val dotR = 2.dp.toPx()
                    val markR = 4.dp.toPx()
                    val haloR = 8.dp.toPx()
                    val pad = 4.dp.toPx()
                    val latestIdx = stats.latestIndex ?: -1

                    onDrawBehind {
                        drawYAxis(frame, tickYs, yLayouts, gridColor, labelColor, hair, gap)
                        for (i in spanL.indices) {
                            drawRect(spanColor, Offset(spanL[i], frame.top), Size(spanR[i] - spanL[i], frame.height))
                            val l = spanLabels[i]
                            if (l.size.width + 2 * pad <= spanR[i] - spanL[i]) {
                                drawText(l, color = labelColor, topLeft = Offset(spanL[i] + pad, frame.top + pad / 2f))
                            }
                        }
                        for (i in guideYs.indices) {
                            drawLine(gridColor, Offset(frame.left, guideYs[i]), Offset(frame.right, guideYs[i]), hair, pathEffect = dash)
                            val l = guideLabels[i]
                            drawText(l, color = labelColor, topLeft = Offset(frame.right - l.size.width - pad, guideYs[i] - l.size.height))
                        }
                        if (!nowX.isNaN()) {
                            drawLine(cursorColor, Offset(nowX, frame.top), Offset(nowX, frame.bottom), hair, pathEffect = dash)
                        }
                        drawXLabels(xPlaced, frame.bottom + gap, labelColor)

                        val prog = progress.value
                        clipRect(left = frame.left, top = 0f, right = frame.left + frame.width * prog, bottom = size.height) {
                            drawPath(area, areaBrush)
                            drawPath(geo.path, lineColor, style = lineStroke)
                            for (s in geo.singles) drawCircle(lineColor, dotR, s)
                        }
                        if (prog >= 1f) {
                            if (latestIdx >= 0 && !ys[latestIdx].isNaN()) {
                                val c = Offset(xs[latestIdx], ys[latestIdx])
                                drawCircle(lineColor.copy(alpha = 0.25f), haloR, c)
                                drawCircle(lineColor, markR, c)
                            }
                            val si = scrub.index
                            if (si != null && !ys[si].isNaN()) {
                                drawLine(cursorColor, Offset(xs[si], frame.top), Offset(xs[si], frame.bottom), hair)
                                drawCircle(lineColor, markR, Offset(xs[si], ys[si]))
                            }
                        }
                    }
                },
        )
        if (provenance != null) {
            Spacer(Modifier.height(ChartLabelGap))
            Text(provenance, style = ApexTheme.type.caption, color = labelColor)
        }
    }
}
