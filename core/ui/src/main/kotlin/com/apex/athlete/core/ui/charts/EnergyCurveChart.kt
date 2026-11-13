package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.theme.ApexTheme
import kotlin.math.max

/**
 * The energy bank across the day: a line on a fixed 0..100 scale with guides at 0, 50 and 100.
 *
 * [points] have x = epoch milliseconds and y = level 0..100; a null y (or a step longer than [maxGapMillis]) breaks the
 * line, nothing is interpolated or smoothed. The latest point gets a dot. [description] is the TalkBack text.
 * Nothing animates. Geometry is built once per size in `drawWithCache`.
 */
@Composable
fun EnergyCurveChart(
    points: List<ChartPoint>,
    windowStartMillis: Long,
    windowEndMillis: Long,
    description: String,
    modifier: Modifier = Modifier,
    maxGapMillis: Long = 5 * 60_000L,
    height: Dp = 120.dp,
) {
    val colors = ApexTheme.colors
    val grid = colors.chartGrid
    val line = colors.optimal
    val runs = remember(points, maxGapMillis) { ChartScales.runs(points, maxGapMillis) }
    Spacer(
        modifier
            .fillMaxWidth()
            .height(height)
            .clearAndSetSemantics { contentDescription = description }
            .drawWithCache {
                val pad = 6.dp.toPx()
                val span = max(1L, windowEndMillis - windowStartMillis).toFloat()
                val top = pad
                val bottom = size.height - pad
                val w = size.width
                fun mapX(x: Long): Float = ((x - windowStartMillis) / span * w).coerceIn(0f, w)
                fun mapY(y: Double): Float = bottom - (y.coerceIn(0.0, 100.0) / 100.0).toFloat() * (bottom - top)
                val geometry = buildLineGeometry(points, runs, ::mapX, ::mapY)
                val lastIdx = points.indexOfLast { it.y != null }
                val latest: Offset? = if (lastIdx >= 0) Offset(mapX(points[lastIdx].x), mapY(points[lastIdx].y ?: 0.0)) else null
                val guideYs = floatArrayOf(mapY(100.0), mapY(50.0), mapY(0.0))
                val gridWidth = 1.dp.toPx()
                val stroke = Stroke(width = 2.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                val dot = 3.dp.toPx()
                onDrawBehind {
                    for (y in guideYs) drawLine(grid, Offset(0f, y), Offset(w, y), gridWidth)
                    drawPath(geometry.path, line, style = stroke)
                    for (s in geometry.singles) drawCircle(line, dot, s)
                    if (latest != null) drawCircle(line, dot + 1.dp.toPx(), latest)
                }
            },
    )
}

private fun previewCurve(): List<ChartPoint> {
    val start = 1_800_000_000_000L
    return (0 until 300 step 5).map { i ->
        ChartPoint(start + i * 60_000L, if (i in 120..160) null else 92.0 - i * 0.15)
    }
}

@Preview(name = "Energy curve dark")
@Composable
private fun EnergyCurveDark() = ApexPreview(dark = true) {
    EnergyCurveChart(previewCurve(), 1_800_000_000_000L, 1_800_000_000_000L + 300 * 60_000L, "Energy curve")
}

@Preview(name = "Energy curve light")
@Composable
private fun EnergyCurveLight() = ApexPreview(dark = false) {
    EnergyCurveChart(previewCurve(), 1_800_000_000_000L, 1_800_000_000_000L + 300 * 60_000L, "Energy curve")
}
