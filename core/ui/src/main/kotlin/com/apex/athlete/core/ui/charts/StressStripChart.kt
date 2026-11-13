package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.theme.ApexTheme
import kotlin.math.max

/** Stress level (0..3) at or above which a minute is drawn as medium, and as high. Mirrors the engine's tiers. */
private const val MEDIUM_FROM = 1.0
private const val HIGH_FROM = 2.0

/** Shortest bar, as a fraction of the strip height, so a level of 0 is still a visible minute. */
private const val MIN_BAR_FRACTION = 0.12f

/**
 * One bar per scored minute of the day, coloured by stress tier (low, medium, high; DESIGN_SYSTEM section 2.2 stress tokens).
 *
 * [points] have x = epoch milliseconds of the minute and y = level 0..3; a null y is a minute without a level and
 * stays empty (never drawn as low). Bar height follows the level so the strip reads without colour alone.
 * The strip spans [windowStartMillis] to [windowEndMillis]. [description] is the TalkBack text (the caller owns the wording).
 * Nothing animates. Geometry is built once per size in `drawWithCache`; the draw lambda only issues three path fills.
 */
@Composable
fun StressStripChart(
    points: List<ChartPoint>,
    windowStartMillis: Long,
    windowEndMillis: Long,
    description: String,
    modifier: Modifier = Modifier,
    height: Dp = 56.dp,
) {
    val colors = ApexTheme.colors
    val track = colors.secondary
    val low = colors.stressLow
    val medium = colors.stressMedium
    val high = colors.stressHigh
    Spacer(
        modifier
            .fillMaxWidth()
            .height(height)
            .clearAndSetSemantics { contentDescription = description }
            .drawWithCache {
                val span = max(1L, windowEndMillis - windowStartMillis).toFloat()
                val w = size.width
                val h = size.height
                val minuteW = max(60_000f / span * w, 1.5f)
                val lowPath = Path()
                val mediumPath = Path()
                val highPath = Path()
                for (p in points) {
                    val level = p.y ?: continue
                    if (!level.isFinite()) continue
                    val x = (p.x - windowStartMillis) / span * w
                    if (x + minuteW < 0f || x > w) continue
                    val fraction = max((level / 3.0).toFloat().coerceIn(0f, 1f), MIN_BAR_FRACTION)
                    val rect = Rect(x, h * (1f - fraction), x + minuteW, h)
                    when {
                        level >= HIGH_FROM -> highPath.addRect(rect)
                        level >= MEDIUM_FROM -> mediumPath.addRect(rect)
                        else -> lowPath.addRect(rect)
                    }
                }
                val corner = CornerRadius(2.dp.toPx())
                onDrawBehind {
                    drawRoundRect(track, cornerRadius = corner)
                    drawPath(lowPath, low)
                    drawPath(mediumPath, medium)
                    drawPath(highPath, high)
                }
            },
    )
}

private fun previewStrip(): List<ChartPoint> {
    val start = 1_800_000_000_000L
    return (0 until 240).map { i ->
        val level = when {
            i in 90..110 -> null // a gap: band off
            i in 150..175 -> 2.4
            i in 40..70 -> 1.3
            else -> 0.4
        }
        ChartPoint(start + i * 60_000L, level)
    }
}

@Preview(name = "Stress strip dark")
@Composable
private fun StressStripDark() = ApexPreview(dark = true) {
    StressStripChart(previewStrip(), 1_800_000_000_000L, 1_800_000_000_000L + 240 * 60_000L, "Stress strip")
}

@Preview(name = "Stress strip light")
@Composable
private fun StressStripLight() = ApexPreview(dark = false) {
    StressStripChart(previewStrip(), 1_800_000_000_000L, 1_800_000_000_000L + 240 * 60_000L, "Stress strip")
}
