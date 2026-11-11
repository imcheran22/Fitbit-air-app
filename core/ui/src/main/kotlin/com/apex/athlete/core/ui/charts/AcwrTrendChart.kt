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
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import java.util.Locale
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.max

private const val OPTIMAL_LOW = 0.8
private const val OPTIMAL_HIGH = 1.3

@Composable
private fun bandWord(band: AcwrBand): String = stringResource(
    when (band) {
        AcwrBand.LOW -> R.string.apex_chart_acwr_band_low
        AcwrBand.OPTIMAL -> R.string.apex_chart_acwr_band_optimal
        AcwrBand.ELEVATED -> R.string.apex_chart_acwr_band_elevated
        AcwrBand.HIGH -> R.string.apex_chart_acwr_band_high
    },
)

/**
 * Training load: acute and chronic load lines (left axis) plus the acute:chronic ratio (right axis) with the
 * 0.8 - 1.3 optimal band shaded (DESIGN_SYSTEM section 2.2 training-load band). x = epoch day for all series.
 *
 * The ratio line changes colour by band (optimal, elevated, high; low in muted), and the band word is always
 * printed in the readout, so colour is never the only signal. Each series breaks at a null or a missing day.
 * The left axis is sized from the load data (floor 0); the right axis always starts at 0 and reaches at least 2.0,
 * so the 0.8 - 1.3 band sits where it really is. [monotony] (null = unknown) is appended to the readout.
 * [caveat] is a text slot for engine caveats (for example "Fewer than 14 days of history"); [provenance] is shown
 * under the legend. Tap or drag to scrub by day.
 */
@Composable
fun AcwrTrendChart(
    acute: List<ChartPoint>,
    chronic: List<ChartPoint>,
    acwr: List<ChartPoint>,
    modifier: Modifier = Modifier,
    monotony: Double? = null,
    caveat: String? = null,
    provenance: String? = null,
    height: Dp = ChartHeights.acwr,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val any = remember(acute, chronic, acwr) {
        ChartScales.stats(acute).validCount + ChartScales.stats(chronic).validCount + ChartScales.stats(acwr).validCount
    }
    if (any == 0) {
        Column(modifier.fillMaxWidth()) {
            ChartEmptyBox(stringResource(R.string.apex_chart_empty_acwr), height)
            if (caveat != null) Text(caveat, style = ApexTheme.type.caption, color = ApexTheme.colors.foregroundSecondary)
        }
        return
    }

    val colors = ApexTheme.colors
    val labelStyle = ApexTheme.type.chart
    val locale = Locale.getDefault()
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current

    // Day axis shared by the three series.
    val days = remember(acute, chronic, acwr) {
        val set = java.util.TreeSet<Long>()
        for (p in acute) if (p.y != null) set.add(p.x)
        for (p in chronic) if (p.y != null) set.add(p.x)
        for (p in acwr) if (p.y != null) set.add(p.x)
        set.map { ChartPoint(it, 0.0) }
    }
    val x0 = days.first().x
    val x1 = days.last().x
    val acuteByDay = remember(acute) { acute.filter { it.y != null }.associate { it.x to it.y } }
    val chronicByDay = remember(chronic) { chronic.filter { it.y != null }.associate { it.x to it.y } }
    val acwrByDay = remember(acwr) { acwr.filter { it.y != null }.associate { it.x to it.y } }

    val loadAxis = remember(acute, chronic) {
        val vals = ArrayList<Double>()
        for (p in acute) { val y = p.y; if (y != null) vals.add(y) }
        for (p in chronic) { val y = p.y; if (y != null) vals.add(y) }
        val d = ChartScales.lineDomain(vals) ?: AxisDomain(0.0, 1.0)
        buildYAxis(ChartScales.niceDomain(AxisDomain(max(0.0, d.min), d.max), 4), 4, locale)
    }
    val ratioAxis = remember(acwr) {
        var hi = 2.0
        for (p in acwr) { val y = p.y; if (y != null) hi = max(hi, y * 1.1) }
        buildYAxis(ChartScales.niceDomain(AxisDomain(0.0, hi), 4), 4, locale)
    }
    val xTicks = remember(x0, x1) {
        ChartScales.niceTicks(x0.toDouble(), x1.toDouble(), 3).filter { it == floor(it) }.map { it.toLong() }
    }
    val xLabels = remember(xTicks) { xTicks.map { ChartScales.formatDay(it, locale) } }
    val acwrRuns = remember(acwr) { ChartScales.runs(acwr, 1L) }
    val acuteRuns = remember(acute) { ChartScales.runs(acute, 1L) }
    val chronicRuns = remember(chronic) { ChartScales.runs(chronic, 1L) }

    val gutterL = rememberMaxLabelWidth(loadAxis.labels, labelStyle)
    val gutterR = rememberMaxLabelWidth(ratioAxis.labels, labelStyle)
    val mapper = remember(days, gutterL, gutterR, density) {
        ScrubMapper(
            days,
            gutterL + with(density) { ChartLabelGap.toPx() },
            gutterR + with(density) { ChartLabelGap.toPx() },
            x0.toDouble(),
            x1.toDouble(),
        )
    }
    val scrub = remember(days) { ScrubState() }
    val progress = rememberChartProgress(reducedMotion, acwr)

    // Readout and description.
    val latestAcwrPoint = acwr.lastOrNull { it.y != null }
    val shownDay = scrub.index?.let { days[it].x }
    val missing = stringResource(R.string.apex_chart_value_missing)
    fun load(v: Double?) = if (v == null) missing else ChartScales.formatNumber(v, 0, locale)
    fun ratio(v: Double?) = if (v == null) missing else ChartScales.formatNumber(v, 2, locale)

    val readout: String = if (shownDay != null) {
        val r = acwrByDay[shownDay]
        val bandText = if (r != null) bandWord(acwrBandOf(r)) else missing
        stringResource(
            R.string.apex_chart_acwr_readout_day,
            ChartScales.formatDayLong(shownDay, locale),
            load(acuteByDay[shownDay]),
            load(chronicByDay[shownDay]),
            ratio(r),
            bandText,
        )
    } else if (latestAcwrPoint != null) {
        val r = latestAcwrPoint.y ?: 0.0
        stringResource(R.string.apex_chart_acwr_readout_latest, ratio(r), bandWord(acwrBandOf(r)))
    } else {
        stringResource(R.string.apex_chart_acwr_readout_none)
    }
    val monotonyText = if (monotony != null) {
        stringResource(R.string.apex_chart_acwr_monotony, ChartScales.formatNumber(monotony, 1, locale))
    } else {
        null
    }
    val missingDays = ChartScales.missingDays(acwr, x0, x1)
    val description = buildString {
        append(stringResource(R.string.apex_chart_acwr_desc,
            ChartScales.formatDay(x0, locale), ChartScales.formatDay(x1, locale),
            ChartScales.formatNumber(OPTIMAL_LOW, 1, locale), ChartScales.formatNumber(OPTIMAL_HIGH, 1, locale)))
        append(' ')
        append(readout)
        append('.')
        if (monotonyText != null) { append(' '); append(monotonyText); append('.') }
        append(' ')
        append(stringResource(R.string.apex_chart_missing_days, missingDays))
        if (caveat != null) { append(' '); append(caveat) }
        if (provenance != null) { append(' '); append(provenance) }
    }

    val gridColor = colors.chartGrid
    val labelColor = colors.mutedForeground
    val cursorColor = colors.chartCursor
    val acuteColor = colors.chart1
    val chronicColor = colors.chart3
    val bandFill = colors.optimal.copy(alpha = 0.14f)
    val bandColors = remember(colors) {
        listOf(colors.acwrColor(AcwrBand.LOW), colors.acwrColor(AcwrBand.OPTIMAL), colors.acwrColor(AcwrBand.ELEVATED), colors.acwrColor(AcwrBand.HIGH))
    }

    Column(modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = description }) {
        Text(
            if (monotonyText != null) "$readout - $monotonyText" else readout,
            style = ApexTheme.type.chart,
            color = colors.foreground,
        )
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
                    val loadLayouts = measureAll(measurer, labelStyle, loadAxis.labels)
                    val ratioLayouts = measureAll(measurer, labelStyle, ratioAxis.labels)
                    val xLayouts = measureAll(measurer, labelStyle, xLabels)
                    val labelH = (loadLayouts.maxOfOrNull { it.size.height } ?: 0).toFloat()
                    val frame = PlotFrame(
                        left = gutterL + gap,
                        top = labelH / 2f,
                        right = size.width - gutterR - gap,
                        bottom = size.height - labelH - gap,
                    )
                    val ld = loadAxis.domain
                    val rd = ratioAxis.domain
                    val mapX = { x: Long -> ChartScales.mapLinear(x.toDouble(), x0.toDouble(), x1.toDouble(), frame.left, frame.right) }
                    val mapLoad = { y: Double -> ChartScales.mapLinear(y, ld.min, ld.max, frame.bottom, frame.top) }
                    val mapRatio = { y: Double -> ChartScales.mapLinear(y, rd.min, rd.max, frame.bottom, frame.top) }

                    val loadYs = FloatArray(loadAxis.ticks.size) { mapLoad(loadAxis.ticks[it]) }
                    val ratioYs = FloatArray(ratioAxis.ticks.size) { mapRatio(ratioAxis.ticks[it]) }
                    val xCenters = FloatArray(xTicks.size) { mapX(xTicks[it]) }
                    val xPlaced = placeXLabels(xLayouts, xCenters, frame.left, frame.right, gap)

                    val bandTop = mapRatio(minOf(OPTIMAL_HIGH, rd.max))
                    val bandBottom = mapRatio(maxOf(OPTIMAL_LOW, rd.min))

                    val acuteGeo = buildLineGeometry(acute, acuteRuns, mapX, mapLoad)
                    val chronicGeo = buildLineGeometry(chronic, chronicRuns, mapX, mapLoad)
                    val bandPaths = Array(4) { Path() }
                    val singleCenters = ArrayList<Offset>()
                    val singleBands = ArrayList<Int>()
                    for (r in acwrRuns) {
                        if (r.first == r.last) {
                            val y = acwr[r.first].y ?: continue
                            singleCenters.add(Offset(mapX(acwr[r.first].x), mapRatio(y)))
                            singleBands.add(acwrBandOf(y).ordinal)
                            continue
                        }
                        for (i in (r.first + 1)..r.last) {
                            val a = acwr[i - 1]
                            val b = acwr[i]
                            val ya = a.y ?: continue
                            val yb = b.y ?: continue
                            val p = bandPaths[acwrBandOf(yb).ordinal]
                            p.moveTo(mapX(a.x), mapRatio(ya))
                            p.lineTo(mapX(b.x), mapRatio(yb))
                        }
                    }
                    val (dx, dy) = pointPixels(days, mapX) { 0f }
                    val acwrAtDayY = FloatArray(days.size) { i ->
                        val v = acwrByDay[days[i].x]
                        if (v == null) Float.NaN else mapRatio(v)
                    }
                    val latestDay = latestAcwrPoint?.x
                    val latestIdx = if (latestDay != null) days.indexOfFirst { it.x == latestDay } else -1

                    val hair = 1.dp.toPx()
                    val thin = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val dashed = Stroke(
                        width = 1.5.dp.toPx(),
                        cap = StrokeCap.Butt,
                        join = StrokeJoin.Round,
                        pathEffect = PathEffect.dashPathEffect(floatArrayOf(6.dp.toPx(), 4.dp.toPx())),
                    )
                    val thick = Stroke(width = 2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val dotR = 2.5.dp.toPx()
                    val markR = 4.dp.toPx()

                    onDrawBehind {
                        drawRect(bandFill, Offset(frame.left, bandTop), Size(frame.width, bandBottom - bandTop))
                        drawYAxis(frame, loadYs, loadLayouts, gridColor, labelColor, hair, gap)
                        for (i in ratioYs.indices) {
                            val l = ratioLayouts[i]
                            drawText(l, color = labelColor, topLeft = Offset(frame.right + gap, ratioYs[i] - l.size.height / 2f))
                        }
                        drawXLabels(xPlaced, frame.bottom + gap, labelColor)
                        val prog = progress.value
                        clipRect(frame.left, 0f, frame.left + frame.width * prog, size.height) {
                            drawPath(chronicGeo.path, chronicColor, style = dashed)
                            for (s in chronicGeo.singles) drawCircle(chronicColor, dotR, s)
                            drawPath(acuteGeo.path, acuteColor, style = thin)
                            for (s in acuteGeo.singles) drawCircle(acuteColor, dotR, s)
                            for (b in 0 until 4) drawPath(bandPaths[b], bandColors[b], style = thick)
                            for (i in singleCenters.indices) drawCircle(bandColors[singleBands[i]], dotR, singleCenters[i])
                        }
                        if (prog >= 1f) {
                            if (latestIdx >= 0 && !acwrAtDayY[latestIdx].isNaN()) {
                                drawCircle(colors.foreground, markR, Offset(dx[latestIdx], acwrAtDayY[latestIdx]))
                            }
                            val si = scrub.index
                            if (si != null) {
                                drawLine(cursorColor, Offset(dx[si], frame.top), Offset(dx[si], frame.bottom), hair)
                                if (!acwrAtDayY[si].isNaN()) drawCircle(colors.foreground, markR, Offset(dx[si], acwrAtDayY[si]))
                            }
                        }
                    }
                },
        )
        Spacer(Modifier.height(ApexSpacing.sm))
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            AcwrLegend(acuteColor, stringResource(R.string.apex_chart_acwr_legend_acute))
            AcwrLegend(chronicColor, stringResource(R.string.apex_chart_acwr_legend_chronic))
            AcwrLegend(colors.optimal, stringResource(R.string.apex_chart_acwr_legend_ratio, ChartScales.formatNumber(OPTIMAL_LOW, 1, locale), ChartScales.formatNumber(OPTIMAL_HIGH, 1, locale)))
        }
        if (caveat != null) {
            Spacer(Modifier.height(ApexSpacing.sm))
            Text(caveat, style = ApexTheme.type.caption, color = colors.foregroundSecondary)
        }
        if (provenance != null) {
            Spacer(Modifier.height(ApexSpacing.xs))
            Text(provenance, style = ApexTheme.type.caption, color = labelColor)
        }
    }
}

@Composable
private fun AcwrLegend(color: Color, text: String) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Box(Modifier.size(10.dp).background(color, ApexShapes.swatch))
        Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.foregroundSecondary)
    }
}
