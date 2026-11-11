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
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
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
import kotlin.math.max
import kotlin.math.min

/**
 * Daily bars for a 14 day (or any) history, for example Strain or Recovery (Pulse 5.5 bar variant).
 *
 * One slot per day from [startDay] to [endDay] (epoch days). A day with no [DailyBar] or a null value is an
 * empty slot: a short hollow stub on the baseline, never a zero-height bar and never a guess. Each bar is
 * coloured by its [ChartTone] (for example recovery band); provisional bars are drawn at 45 % opacity. Bars always
 * start at zero; the y axis runs 0 to [yMax] when given (use 100 for recovery, 21 for strain), otherwise to a
 * nice ceiling above the largest value. [targetBand] shades a target range (for example the Strain Target) in the
 * dial-target colour and is announced in the description.
 *
 * [title] names the metric for TalkBack. [valueSuffix] is appended to formatted values; [decimals] sets precision.
 * The readout shows the latest value, or the scrubbed day (an empty day reads "no reading"). [provenance] is
 * shown under the plot.
 */
@Composable
fun DailyBarChart(
    title: String,
    bars: List<DailyBar>,
    startDay: Long,
    endDay: Long,
    modifier: Modifier = Modifier,
    yMax: Double? = null,
    targetBand: ChartBand? = null,
    valueSuffix: String = "",
    decimals: Int = 0,
    provenance: String? = null,
    height: Dp = ChartHeights.dailyBars,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val slotCount = (endDay - startDay + 1).coerceIn(1L, 400L).toInt()
    val slots = remember(bars, startDay, slotCount) {
        val arr = arrayOfNulls<DailyBar>(slotCount)
        for (b in bars) {
            val i = b.epochDay - startDay
            if (b.value != null && i >= 0 && i < slotCount) arr[i.toInt()] = b
        }
        arr.toList()
    }
    val validCount = slots.count { it != null }
    if (validCount == 0) {
        ChartEmptyBox(stringResource(R.string.apex_chart_empty_bars), height, modifier)
        return
    }

    val colors = ApexTheme.colors
    val labelStyle = ApexTheme.type.chart
    val locale = Locale.getDefault()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current

    val yAxis = remember(slots, yMax) {
        var top = yMax ?: 0.0
        if (yMax == null) for (s in slots) top = max(top, s?.value ?: 0.0)
        val domain = if (yMax != null) AxisDomain(0.0, yMax) else ChartScales.barDomain(listOf(top))
        buildYAxis(domain, 4, locale)
    }
    val xLabels = remember(startDay, slotCount) { List(slotCount) { ChartScales.formatDay(startDay + it, locale) } }
    val gutterPx = rememberMaxLabelWidth(yAxis.labels, labelStyle)
    val scrub = remember(slots) { ScrubState() }
    val progress = rememberChartProgress(reducedMotion, slots)
    val leftPx = gutterPx + with(density) { ChartLabelGap.toPx() }
    val rightPadPx = with(density) { ChartRightPad.toPx() }
    val gestureKey = remember(slots, leftPx, rightPadPx) { Triple(slots, leftPx, rightPadPx) }

    fun fmt(v: Double) = ChartScales.formatNumber(v, decimals, locale) + valueSuffix
    val latestIdx = slots.indexOfLast { it != null }
    val latest = slots[latestIdx]
    val shown = scrub.index
    val readout = if (shown != null) {
        val b = slots[shown]
        val day = ChartScales.formatDayLong(startDay + shown, locale)
        val bv = b?.value
        if (bv != null) {
            stringResource(R.string.apex_chart_bars_readout_day, day, fmt(bv))
        } else {
            stringResource(R.string.apex_chart_bars_readout_empty, day)
        }
    } else {
        stringResource(R.string.apex_chart_bars_readout_latest, ChartScales.formatDay(startDay + latestIdx, locale), fmt(latest?.value ?: 0.0))
    }
    var lo = Double.POSITIVE_INFINITY
    var hi = Double.NEGATIVE_INFINITY
    for (s in slots) {
        val v = s?.value ?: continue
        lo = min(lo, v); hi = max(hi, v)
    }
    val description = buildString {
        append(
            stringResource(
                R.string.apex_chart_bars_desc, title, slotCount, fmt(lo), fmt(hi),
                fmt(latest?.value ?: 0.0), ChartScales.formatDay(startDay + latestIdx, locale),
            ),
        )
        append(' ')
        append(stringResource(R.string.apex_chart_missing_days, slotCount - validCount))
        if (targetBand != null) {
            append(' ')
            append(stringResource(R.string.apex_chart_target_desc, fmt(targetBand.low), fmt(targetBand.high)))
        }
        if (provenance != null) { append(' '); append(provenance) }
    }

    val gridColor = colors.chartGrid
    val labelColor = colors.mutedForeground
    val outlineColor = colors.chartCursor
    val targetColor = colors.dialTarget.copy(alpha = 0.3f)
    val cursorFill = colors.chartHighlight
    val barColors = remember(slots, colors) { slots.map { s -> if (s == null) colors.mutedForeground else colors.toneColor(s.tone) } }

    Column(modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = description }) {
        Text(readout, style = ApexTheme.type.chart, color = colors.foreground)
        Spacer(Modifier.height(ChartLabelGap))
        Spacer(
            Modifier
                .fillMaxWidth()
                .height(height)
                .scrubGestures(
                    key = gestureKey,
                    onTap = { x, w -> scrub.tap(ChartScales.slotIndex(x, leftPx, w - rightPadPx, slotCount)) },
                    onDrag = { x, w -> scrub.drag(ChartScales.slotIndex(x, leftPx, w - rightPadPx, slotCount)) },
                )
                .drawWithCache {
                    val gap = ChartLabelGap.toPx()
                    val yLayouts = measureAll(measurer, labelStyle, yAxis.labels)
                    val xLayouts = measureAll(measurer, labelStyle, xLabels)
                    val labelH = (yLayouts.maxOfOrNull { it.size.height } ?: 0).toFloat()
                    val frame = PlotFrame(
                        left = leftPx,
                        top = labelH / 2f,
                        right = size.width - rightPadPx,
                        bottom = size.height - labelH - gap,
                    )
                    val d = yAxis.domain
                    val mapY = { y: Double -> ChartScales.mapLinear(y, d.min, d.max, frame.bottom, frame.top) }
                    val slotW = frame.width / slotCount
                    val barW = min(slotW * 0.62f, 28.dp.toPx())
                    val centers = FloatArray(slotCount) { frame.left + slotW * (it + 0.5f) }
                    val tickYs = FloatArray(yAxis.ticks.size) { mapY(yAxis.ticks[it]) }
                    val xPlaced = placeXLabels(xLayouts, centers, frame.left, frame.right, gap)
                    val barTop = FloatArray(slotCount) { i ->
                        val v = slots[i]?.value
                        if (v == null) Float.NaN else mapY(v.coerceIn(d.min, d.max))
                    }
                    val bandTop = if (targetBand != null) mapY(targetBand.high.coerceIn(d.min, d.max)) else 0f
                    val bandBottom = if (targetBand != null) mapY(targetBand.low.coerceIn(d.min, d.max)) else 0f
                    val hair = 1.dp.toPx()
                    val outline = Stroke(width = hair)
                    val corner = CornerRadius(2.dp.toPx())
                    val stub = 4.dp.toPx()

                    onDrawBehind {
                        if (targetBand != null) {
                            drawRect(targetColor, Offset(frame.left, bandTop), Size(frame.width, bandBottom - bandTop))
                        }
                        drawYAxis(frame, tickYs, yLayouts, gridColor, labelColor, hair, gap)
                        drawXLabels(xPlaced, frame.bottom + gap, labelColor)
                        val sel = scrub.index
                        if (sel != null) {
                            drawRect(cursorFill, Offset(frame.left + slotW * sel, frame.top), Size(slotW, frame.height))
                        }
                        val prog = progress.value
                        for (i in 0 until slotCount) {
                            val x = centers[i] - barW / 2f
                            val top = barTop[i]
                            if (top.isNaN()) {
                                drawRoundRect(outlineColor, Offset(x, frame.bottom - stub), Size(barW, stub), corner, outline)
                            } else {
                                val h = (frame.bottom - top) * prog
                                val alpha = if (slots[i]?.provisional == true) 0.45f else 1f
                                drawRoundRect(barColors[i], Offset(x, frame.bottom - h), Size(barW, h), corner, alpha = alpha)
                            }
                        }
                    }
                },
        )
        if (provenance != null) {
            Spacer(Modifier.height(ApexSpacing.xs))
            Text(provenance, style = ApexTheme.type.caption, color = labelColor)
        }
    }
}
