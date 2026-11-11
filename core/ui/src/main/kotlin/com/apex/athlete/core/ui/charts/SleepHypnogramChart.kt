package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.SleepStage
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.theme.ApexColors
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import java.util.Locale
import kotlin.math.max
import kotlin.math.min

private const val GAP_TOLERANCE_MS = 60_000L

/** Lane order, top to bottom (Pulse 5.6): Awake, REM, Light, Deep. */
private val LANES = arrayOf(SleepStage.AWAKE, SleepStage.REM, SleepStage.LIGHT, SleepStage.DEEP)

/** Lane for a stage. RESTLESS shares the Awake lane; ASLEEP (classic scoring, no stage detail) has no lane (-1). */
private fun laneOf(stage: SleepStage): Int = when (stage) {
    SleepStage.AWAKE, SleepStage.RESTLESS -> 0
    SleepStage.REM -> 1
    SleepStage.LIGHT -> 2
    SleepStage.DEEP -> 3
    SleepStage.ASLEEP -> -1
}

private fun ApexColors.stageColor(stage: SleepStage): Color = when (stage) {
    SleepStage.AWAKE, SleepStage.RESTLESS -> stageAwake
    SleepStage.REM -> stageRem
    SleepStage.LIGHT -> stageLight
    SleepStage.DEEP -> stageDeep
    SleepStage.ASLEEP -> sleep
}

@Composable
private fun stageName(stage: SleepStage): String = stringResource(
    when (stage) {
        SleepStage.AWAKE -> R.string.apex_chart_stage_awake
        SleepStage.REM -> R.string.apex_chart_stage_rem
        SleepStage.LIGHT -> R.string.apex_chart_stage_light
        SleepStage.DEEP -> R.string.apex_chart_stage_deep
        SleepStage.ASLEEP -> R.string.apex_chart_stage_asleep
        SleepStage.RESTLESS -> R.string.apex_chart_stage_restless
    },
)

@Composable
private fun durationText(millis: Long): String {
    val minutes = (millis + 30_000L) / 60_000L
    val h = minutes / 60
    val m = minutes % 60
    return if (h > 0) stringResource(R.string.apex_chart_duration_hm, h, m) else stringResource(R.string.apex_chart_duration_m, m)
}

private class HypnogramMapper(
    private val spans: List<Pair<Long, Long>>,
    private val frameLeftPx: Float,
    private val rightPadPx: Float,
    private val x0: Double,
    private val x1: Double,
) {
    fun indexAt(px: Float, width: Float): Int? =
        ChartScales.segmentAt(spans, pixelToX(px, frameLeftPx, width - rightPadPx, x0, x1))
}

/**
 * Sleep-stage hypnogram: Awake / REM / Light / Deep lanes (top to bottom) on a hatched track (Pulse 5.6).
 *
 * [segments] are epoch-millisecond runs; time labels use [clock] (zone and 12/24 h). Holes between segments
 * stay empty (no connector, no fill) and are counted in the TalkBack description. Segments of the classic
 * scoring labels are shown honestly: RESTLESS in the Awake lane, ASLEEP (no stage detail) as a faint band across
 * all lanes. A legend below lists time per stage so colour is never the only carrier. Tap or drag to inspect a
 * segment; the readout names its stage, time span and length. [provenance] is shown under the legend.
 */
@Composable
fun SleepHypnogramChart(
    segments: List<HypnogramSegment>,
    clock: ChartClock,
    modifier: Modifier = Modifier,
    provenance: String? = null,
    height: Dp = ChartHeights.hypnogram,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val sorted = remember(segments) { segments.filter { it.endMillis > it.startMillis }.sortedBy { it.startMillis } }
    if (sorted.isEmpty()) {
        ChartEmptyBox(stringResource(R.string.apex_chart_empty_hypnogram), height, modifier)
        return
    }
    val colors = ApexTheme.colors
    val labelStyle = ApexTheme.type.chart
    val locale = Locale.getDefault()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current

    val x0 = sorted.first().startMillis
    val x1 = sorted.maxOf { it.endMillis }
    val spans = remember(sorted) { sorted.map { it.startMillis to it.endMillis } }
    val gaps = remember(spans) { ChartScales.countTimeGaps(spans, GAP_TOLERANCE_MS) }
    val totals = remember(sorted) {
        val t = LongArray(SleepStage.entries.size)
        for (s in sorted) t[s.stage.ordinal] += s.endMillis - s.startMillis
        t
    }

    val laneLabels = LANES.map { stageName(it) }
    val tickTimes = remember(x0, x1, clock) { ChartScales.timeTicks(x0, x1, clock.zone, 4) }
    val tickLabels = remember(tickTimes, clock) {
        tickTimes.map { ChartScales.formatClockTick(it, clock.zone, clock.use24Hour, locale) }
    }
    val gutterPx = rememberMaxLabelWidth(laneLabels, labelStyle)
    val labelHeightPx = rememberMaxLabelHeight(laneLabels, labelStyle)
    // Grow the canvas when the font scale is large so lane labels never overlap.
    val minHeight = with(density) { (labelHeightPx * 5 + ChartLabelGap.toPx() * 2).toDp() }
    val canvasHeight = if (minHeight > height) minHeight else height

    val mapper = remember(spans, gutterPx, x0, x1, density) {
        HypnogramMapper(
            spans,
            gutterPx + with(density) { ChartLabelGap.toPx() },
            with(density) { ChartRightPad.toPx() },
            x0.toDouble(),
            x1.toDouble(),
        )
    }
    val scrub = remember(sorted) { ScrubState() }
    val progress = rememberChartProgress(reducedMotion, sorted)

    val gridColor = colors.chartGrid
    val labelColor = colors.mutedForeground
    val hatchColor = colors.patternHatch
    val cursorColor = colors.chartCursor
    val outlineColor = colors.foreground
    val segColors = remember(sorted, colors) { sorted.map { colors.stageColor(it.stage) } }

    val spanText = stringResource(
        R.string.apex_chart_hypno_span,
        ChartScales.formatClock(x0, clock.zone, clock.use24Hour, locale),
        ChartScales.formatClock(x1, clock.zone, clock.use24Hour, locale),
    )
    val si = scrub.index
    val names = LANES.map { stageName(it) }
    val readout = if (si != null) {
        val s = sorted[si]
        stringResource(
            R.string.apex_chart_hypno_readout_segment,
            ChartScales.formatClock(s.startMillis, clock.zone, clock.use24Hour, locale),
            ChartScales.formatClock(s.endMillis, clock.zone, clock.use24Hour, locale),
            stageName(s.stage),
            durationText(s.endMillis - s.startMillis),
        )
    } else {
        spanText
    }

    val stageTotals = LANES.indices.map { i -> stringResource(R.string.apex_chart_legend_item, names[i], durationText(totals[LANES[i].ordinal])) }
    val description = buildString {
        append(stringResource(R.string.apex_chart_hypno_desc, spanText))
        append(' ')
        append(stageTotals.joinToString(", "))
        append('.')
        if (totals[SleepStage.ASLEEP.ordinal] > 0L) {
            append(' ')
            append(stringResource(R.string.apex_chart_legend_item, stageName(SleepStage.ASLEEP), durationText(totals[SleepStage.ASLEEP.ordinal])))
            append('.')
        }
        append(' ')
        append(stringResource(R.string.apex_chart_gaps, gaps))
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
                .height(canvasHeight)
                .scrubGestures(
                    key = mapper,
                    onTap = { x, w -> scrub.tap(mapper.indexAt(x, w)) },
                    onDrag = { x, w -> scrub.drag(mapper.indexAt(x, w)) },
                )
                .drawWithCache {
                    val gap = ChartLabelGap.toPx()
                    val laneLayouts = measureAll(measurer, labelStyle, laneLabels)
                    val xLayouts = measureAll(measurer, labelStyle, tickLabels)
                    val frame = PlotFrame(
                        left = gutterPx + gap,
                        top = 0f,
                        right = size.width - ChartRightPad.toPx(),
                        bottom = size.height - labelHeightPx - gap,
                    )
                    val laneH = frame.height / 4f
                    val barH = max(6.dp.toPx(), min(laneH * 0.6f, 18.dp.toPx()))
                    val mapX = { t: Long -> ChartScales.mapLinear(t.toDouble(), x0.toDouble(), x1.toDouble(), frame.left, frame.right) }

                    val n = sorted.size
                    val segL = FloatArray(n)
                    val segR = FloatArray(n)
                    val segT = FloatArray(n)
                    val segH = FloatArray(n)
                    val minW = 1.dp.toPx()
                    for (i in 0 until n) {
                        val lane = laneOf(sorted[i].stage)
                        segL[i] = mapX(sorted[i].startMillis)
                        segR[i] = max(segL[i] + minW, mapX(sorted[i].endMillis))
                        if (lane >= 0) {
                            segH[i] = barH
                            segT[i] = frame.top + laneH * (lane + 0.5f) - barH / 2f
                        } else {
                            segH[i] = frame.height
                            segT[i] = frame.top
                        }
                    }
                    val connectors = Path()
                    for (i in 0 until n - 1) {
                        val a = laneOf(sorted[i].stage)
                        val b = laneOf(sorted[i + 1].stage)
                        if (a < 0 || b < 0 || a == b) continue
                        if (sorted[i + 1].startMillis - sorted[i].endMillis > GAP_TOLERANCE_MS) continue
                        val cx = (segR[i] + segL[i + 1]) / 2f
                        connectors.moveTo(cx, frame.top + laneH * (a + 0.5f))
                        connectors.lineTo(cx, frame.top + laneH * (b + 0.5f))
                    }
                    val hatchPath = Path()
                    val step = 6.dp.toPx()
                    var hx = frame.left - frame.height
                    while (hx < frame.right) {
                        hatchPath.moveTo(hx, frame.bottom)
                        hatchPath.lineTo(hx + frame.height, frame.top)
                        hx += step
                    }
                    val xCenters = FloatArray(tickTimes.size) { mapX(tickTimes[it]) }
                    val xPlaced = placeXLabels(xLayouts, xCenters, frame.left, frame.right, gap)
                    val hair = 1.dp.toPx()
                    val hatchStroke = Stroke(width = hair)
                    val outlineStroke = Stroke(width = 2.dp.toPx())

                    onDrawBehind {
                        clipRect(frame.left, frame.top, frame.right, frame.bottom) {
                            drawPath(hatchPath, hatchColor, style = hatchStroke)
                        }
                        for (i in 0..4) {
                            val y = frame.top + laneH * i
                            drawLine(gridColor, Offset(frame.left, y), Offset(frame.right, y), hair)
                        }
                        for (i in laneLayouts.indices) {
                            val l = laneLayouts[i]
                            drawText(
                                l,
                                color = labelColor,
                                topLeft = Offset(gutterPx - l.size.width.toFloat(), frame.top + laneH * (i + 0.5f) - l.size.height / 2f),
                            )
                        }
                        drawXLabels(xPlaced, frame.bottom + gap, labelColor)
                        val prog = progress.value
                        clipRect(frame.left, 0f, frame.left + frame.width * prog, size.height) {
                            drawPath(connectors, cursorColor, style = hatchStroke)
                            for (i in 0 until n) {
                                val c = if (laneOf(sorted[i].stage) < 0) segColors[i].copy(alpha = 0.35f) else segColors[i]
                                drawRect(c, Offset(segL[i], segT[i]), Size(segR[i] - segL[i], segH[i]))
                            }
                        }
                        val sel = scrub.index
                        if (sel != null && prog >= 1f) {
                            drawRect(outlineColor, Offset(segL[sel], segT[sel]), Size(segR[sel] - segL[sel], segH[sel]), style = outlineStroke)
                        }
                    }
                },
        )
        Spacer(Modifier.height(ApexSpacing.sm))
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            for (rowStart in 0 until LANES.size step 2) {
                Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    for (i in rowStart until min(rowStart + 2, LANES.size)) {
                        LegendItem(colors.stageColor(LANES[i]), names[i], durationText(totals[LANES[i].ordinal]), Modifier.weight(1f))
                    }
                }
            }
        }
        if (provenance != null) {
            Spacer(Modifier.height(ApexSpacing.sm))
            Text(provenance, style = ApexTheme.type.caption, color = labelColor)
        }
    }
}

@Composable
private fun LegendItem(color: Color, name: String, value: String, modifier: Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Box(Modifier.size(10.dp).background(color, ApexShapes.swatch))
        Text(
            stringResource(R.string.apex_chart_legend_item, name, value),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.foregroundSecondary,
        )
    }
}
