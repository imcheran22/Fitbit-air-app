package com.apex.athlete.core.ui.charts

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.theme.ApexMotion
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import java.util.Locale

/**
 * Biometric trend card (DESIGN_SYSTEM "TrendChart", Pulse 5.5 header + sparkline): metric title, latest value and
 * unit, Z-score badge against the 28 day baseline, and a 14 day sparkline with the baseline band behind it.
 *
 * Missing is shown as `--`, never as a number: pass [valueText] == null when there is no value and [zScore] == null
 * when there is no baseline comparison. The screen maps its `MetricState` onto these parameters:
 * value -> [valueText]; provisional / calibrating / stale / unavailable-with-reason -> [statusLabel] (a short tag such
 * as "Provisional" or "Stale", shown next to the value and read by TalkBack); error -> [valueText] = null plus a
 * [statusLabel]. [provenance] (for example "Fitbit, synced 14:32") is always printed under the chart.
 *
 * [points] x = epoch day, y = value (null = gap), window [startDay]..[endDay] (14 days by convention). The sparkline
 * is sized to the data and [baseline] (mean -/+ 1 SD) with 10 % padding and no forced zero; it has no axis labels,
 * so the min and max are in the TalkBack description. Gaps break the line; every real reading gets a dot.
 * [zTone] colours the badge text (OPTIMAL / WARNING by the metric's good direction, NEUTRAL inside +/- 1 SD);
 * the badge always also prints the signed number. Tapping anywhere on the card calls [onClick] (card is >= 48 dp).
 */
@Composable
fun BiometricSparklineCard(
    title: String,
    valueText: String?,
    unit: String,
    points: List<ChartPoint>,
    startDay: Long,
    endDay: Long,
    baseline: ChartBand?,
    zScore: Double?,
    provenance: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    statusLabel: String? = null,
    zTone: ChartTone = ChartTone.NEUTRAL,
    baselineLabel: String? = null,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val colors = ApexTheme.colors
    val locale = Locale.getDefault()
    val window = remember(points, startDay, endDay) { points.filter { it.x in startDay..endDay }.sortedBy { it.x } }
    val stats = remember(window) { ChartScales.stats(window) }
    val runs = remember(window) { ChartScales.runs(window, 1L) }
    val domain = remember(window, baseline) {
        val vals = ArrayList<Double>()
        for (p in window) { val y = p.y; if (y != null) vals.add(y) }
        val extra = if (baseline != null) listOf(baseline.low, baseline.high) else emptyList()
        ChartScales.lineDomain(vals, extra) ?: AxisDomain(0.0, 1.0)
    }
    val progress = rememberChartProgress(reducedMotion, window)

    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(
        targetValue = if (pressed) ApexMotion.PRESS_SCALE else 1f,
        animationSpec = if (reducedMotion) snap() else tween(ApexMotion.FAST_MS, easing = ApexMotion.standard),
        label = "sparklinePress",
    )

    val missing = stringResource(R.string.apex_chart_value_missing)
    val shownValue = valueText ?: missing
    val zText = if (zScore != null) ChartScales.formatSigned(zScore, 1, locale) else missing
    val baselineText = baselineLabel ?: if (baseline != null) {
        stringResource(
            R.string.apex_chart_baseline_range,
            ChartScales.formatNumber(baseline.low, 1, locale),
            ChartScales.formatNumber(baseline.high, 1, locale),
        )
    } else {
        stringResource(R.string.apex_chart_baseline_none)
    }
    val zDesc = if (zScore != null) {
        stringResource(R.string.apex_chart_z_desc, zText)
    } else {
        stringResource(R.string.apex_chart_z_desc_none)
    }
    val trendDesc = if (stats.validCount > 0) {
        stringResource(
            R.string.apex_chart_sparkline_desc,
            (endDay - startDay + 1).toInt(),
            ChartScales.formatNumber(stats.min ?: 0.0, 1, locale),
            ChartScales.formatNumber(stats.max ?: 0.0, 1, locale),
            ChartScales.missingDays(window, startDay, endDay),
        )
    } else {
        stringResource(R.string.apex_chart_empty_sparkline)
    }
    val description = buildString {
        append(title)
        append(": ")
        append(if (valueText != null) "$valueText $unit".trim() else stringResource(R.string.apex_chart_value_missing_spoken))
        append(". ")
        if (statusLabel != null) { append(statusLabel); append(". ") }
        append(zDesc); append(". ")
        append(trendDesc); append(" ")
        append(baselineText); append(". ")
        append(provenance)
    }

    val cardBrush = Brush.verticalGradient(listOf(colors.cardTop, colors.card))
    val edge = colors.cardEdge
    val lineColor = colors.chart1
    val bandColor = colors.chartBand
    val gridColor = colors.chartGrid
    val zColor = when (zTone) {
        ChartTone.OPTIMAL -> colors.optimalText
        ChartTone.WARNING -> colors.warningText
        else -> colors.foregroundSecondary
    }

    Column(
        modifier
            .fillMaxWidth()
            .graphicsLayer { scaleX = scale; scaleY = scale }
            .clip(ApexShapes.card)
            .background(cardBrush)
            .drawBehind { drawLine(edge, Offset(0f, 0.5f), Offset(size.width, 0.5f), 1.dp.toPx()) }
            .clickable(
                interactionSource = interaction,
                indication = null,
                role = Role.Button,
                onClick = onClick,
            )
            .clearAndSetSemantics {
                contentDescription = description
                role = Role.Button
            }
            .padding(ApexSpacing.cardPadding),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Text(
                title.uppercase(locale),
                style = ApexTheme.type.statLabel,
                color = colors.foregroundSecondary,
                modifier = Modifier.weight(1f),
            )
            Text(
                stringResource(R.string.apex_chart_z_badge, zText),
                style = ApexTheme.type.tag,
                color = zColor,
                modifier = Modifier
                    .background(colors.secondary, ApexShapes.chip)
                    .padding(horizontal = ApexSpacing.sm, vertical = ApexSpacing.xs),
            )
        }
        Row(verticalAlignment = Alignment.Bottom, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(shownValue, style = ApexTheme.type.statValueLarge, color = colors.foreground)
            if (unit.isNotEmpty()) Text(unit, style = ApexTheme.type.statUnit, color = colors.mutedForeground)
            if (statusLabel != null) {
                Text(
                    statusLabel.uppercase(locale),
                    style = ApexTheme.type.tag,
                    color = colors.foregroundSecondary,
                    modifier = Modifier
                        .border(1.dp, colors.border, ApexShapes.pill)
                        .padding(horizontal = ApexSpacing.sm, vertical = 2.dp),
                )
            }
        }
        if (stats.validCount == 0) {
            ChartEmptyBox(stringResource(R.string.apex_chart_empty_sparkline), ChartHeights.sparkline)
        } else {
            Spacer(
                Modifier
                    .fillMaxWidth()
                    .height(ChartHeights.sparkline)
                    .drawWithCache {
                        val inset = 4.dp.toPx()
                        val left = inset
                        val right = size.width - inset
                        val top = inset
                        val bottom = size.height - inset
                        val mapX = { x: Long ->
                            ChartScales.mapLinear(x.toDouble(), startDay.toDouble(), endDay.toDouble(), left, right)
                        }
                        val mapY = { y: Double -> ChartScales.mapLinear(y, domain.min, domain.max, bottom, top) }
                        val (xs, ys) = pointPixels(window, mapX, mapY)
                        val geo = buildLineGeometry(window, runs, mapX, mapY)
                        val bandTop = if (baseline != null) mapY(baseline.high.coerceIn(domain.min, domain.max)) else 0f
                        val bandBottom = if (baseline != null) mapY(baseline.low.coerceIn(domain.min, domain.max)) else 0f
                        val stroke = Stroke(width = 1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                        val dotR = 2.dp.toPx()
                        val markR = 3.5.dp.toPx()
                        val hair = 1.dp.toPx()
                        val latest = stats.latestIndex ?: -1

                        onDrawBehind {
                            drawLine(gridColor, Offset(0f, size.height - hair / 2f), Offset(size.width, size.height - hair / 2f), hair)
                            if (baseline != null) {
                                drawRect(bandColor, Offset(0f, bandTop), Size(size.width, bandBottom - bandTop))
                            }
                            val prog = progress.value
                            clipRect(0f, 0f, size.width * prog, size.height) {
                                drawPath(geo.path, lineColor, style = stroke)
                                for (i in xs.indices) if (!ys[i].isNaN()) drawCircle(lineColor, dotR, Offset(xs[i], ys[i]))
                            }
                            if (prog >= 1f && latest >= 0 && !ys[latest].isNaN()) {
                                drawCircle(lineColor, markR, Offset(xs[latest], ys[latest]))
                            }
                        }
                    },
            )
        }
        Text(baselineText, style = ApexTheme.type.caption, color = colors.mutedForeground)
        Text(provenance, style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}
