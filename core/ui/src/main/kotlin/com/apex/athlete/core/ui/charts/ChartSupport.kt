package com.apex.athlete.core.ui.charts

import android.provider.Settings
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextLayoutResult
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.theme.ApexMotion
import com.apex.athlete.core.ui.theme.ApexTheme
import java.util.Locale
import kotlin.math.max

/*
 * Internal helpers shared by the chart components. Nothing here is public API.
 *
 * Draw model: every chart computes its geometry (paths, pixel positions, measured labels) inside
 * `Modifier.drawWithCache`, which re-runs only when the size or a state read inside the cache block changes.
 * The `onDrawBehind` lambda only issues draw calls from that precomputed geometry plus two cheap state reads
 * (draw-in progress, scrub index), so a frame allocates nothing beyond the draw primitives themselves.
 */

/** Fixed chart heights (Pulse spec 5.0: heights are fixed per component, never percentages). */
object ChartHeights {
    val intradayHr: Dp = 200.dp
    val hypnogram: Dp = 160.dp
    val acwr: Dp = 200.dp
    val trend: Dp = 200.dp
    val dailyBars: Dp = 160.dp
    val sparkline: Dp = 48.dp
}

/** True when the system "Remove animations" (animator duration scale 0) setting is on. */
@Composable
fun rememberReducedMotion(): Boolean {
    val context = LocalContext.current
    return remember(context) {
        Settings.Global.getFloat(context.contentResolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) == 0f
    }
}

/**
 * Draw-in progress 0..1 over [ApexMotion.CHART_DRAW_MS]; snaps to 1 when [reducedMotion]. Re-runs when [key]
 * (the data) changes. Charts reveal left to right by clipping, so a gap never gets filled while animating.
 */
@Composable
internal fun rememberChartProgress(reducedMotion: Boolean, key: Any?): State<Float> {
    val progress = remember { Animatable(if (reducedMotion) 1f else 0f) }
    LaunchedEffect(key, reducedMotion) {
        if (reducedMotion) {
            progress.snapTo(1f)
        } else {
            progress.snapTo(0f)
            progress.animateTo(1f, tween(durationMillis = ApexMotion.CHART_DRAW_MS, easing = ApexMotion.standard))
        }
    }
    return progress.asState()
}

/** Empty-state text in place of a blank canvas. Height is a minimum so large fonts never clip. */
@Composable
internal fun ChartEmptyBox(text: String, minHeight: Dp, modifier: Modifier = Modifier) {
    Box(
        modifier = modifier.fillMaxWidth().heightIn(min = minHeight),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = text,
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/** Widest measured width in px of [labels] in [style]; recomputed when the font scale changes. */
@Composable
internal fun rememberMaxLabelWidth(labels: List<String>, style: TextStyle): Int {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return remember(labels, style, density) {
        var w = 0
        for (l in labels) w = max(w, measurer.measure(l, style).size.width)
        w
    }
}

/** Tallest measured height in px of [labels] in [style]. */
@Composable
internal fun rememberMaxLabelHeight(labels: List<String>, style: TextStyle): Int {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return remember(labels, style, density) {
        var h = 0
        for (l in labels) h = max(h, measurer.measure(l, style).size.height)
        h
    }
}

/** Index of the scrubbed point, or null. Kept in a holder so the draw lambda reads it without recomposition. */
@Stable
internal class ScrubState {
    var index: Int? by mutableStateOf(null)

    /** Tap: select, or clear when the same point is tapped again. */
    fun tap(i: Int?) { index = if (i == null || i == index) null else i }

    /** Drag: follow the finger. */
    fun drag(i: Int?) { if (i != null) index = i }
}

/**
 * Tap and horizontal-drag scrubbing. Callbacks receive the x position and the width of the touch area in px.
 * [key] must change whenever the mapping from x to a data point changes.
 */
internal fun Modifier.scrubGestures(
    key: Any?,
    onTap: (x: Float, width: Float) -> Unit,
    onDrag: (x: Float, width: Float) -> Unit,
): Modifier = this
    .pointerInput(key) {
        detectTapGestures(onTap = { o -> onTap(o.x, size.width.toFloat()) })
    }
    .pointerInput(key) {
        detectHorizontalDragGestures(
            onDragStart = { o -> onDrag(o.x, size.width.toFloat()) },
            onHorizontalDrag = { change, _ ->
                change.consume()
                onDrag(change.position.x, size.width.toFloat())
            },
        )
    }

/** Plot rectangle in px inside the canvas. */
internal class PlotFrame(val left: Float, val top: Float, val right: Float, val bottom: Float) {
    val width: Float get() = right - left
    val height: Float get() = bottom - top
}

/** Y axis description computed in composition (the gutter width depends on the label strings). */
internal class YAxisSpec(val domain: AxisDomain, val ticks: List<Double>, val labels: List<String>)

internal fun buildYAxis(domain: AxisDomain, targetTicks: Int, locale: Locale = Locale.getDefault()): YAxisSpec {
    val ticks = ChartScales.niceTicks(domain.min, domain.max, targetTicks)
    val step = if (ticks.size >= 2) ticks[1] - ticks[0] else 1.0
    val decimals = ChartScales.decimalsForStep(step)
    return YAxisSpec(domain, ticks, ticks.map { ChartScales.formatNumber(it, decimals, locale) })
}

/** A measured label with its left edge already clamped into the plot. */
internal class PlacedLabel(val layout: TextLayoutResult, val x: Float)

/**
 * Greedy left-to-right placement of centred x labels: a label is dropped when it would touch the previous one
 * (gap [gapPx]), and the rest are clamped inside [minX, maxX]. At large font sizes fewer labels survive; none clip.
 */
internal fun placeXLabels(
    layouts: List<TextLayoutResult>,
    centers: FloatArray,
    minX: Float,
    maxX: Float,
    gapPx: Float,
): List<PlacedLabel> {
    val out = ArrayList<PlacedLabel>()
    var lastRight = Float.NEGATIVE_INFINITY
    for (i in layouts.indices) {
        val w = layouts[i].size.width.toFloat()
        var left = centers[i] - w / 2f
        if (left < minX) left = minX
        if (left + w > maxX) left = maxX - w
        if (left < lastRight + gapPx) continue
        out.add(PlacedLabel(layouts[i], left))
        lastRight = left + w
    }
    return out
}

/** Horizontal grid lines with right-aligned tick labels in the gutter. Vertical grid is never drawn. */
internal fun DrawScope.drawYAxis(
    frame: PlotFrame,
    ys: FloatArray,
    labels: List<TextLayoutResult>,
    gridColor: Color,
    labelColor: Color,
    gridWidthPx: Float,
    labelGapPx: Float,
) {
    for (i in ys.indices) {
        drawLine(gridColor, Offset(frame.left, ys[i]), Offset(frame.right, ys[i]), gridWidthPx)
        val l = labels[i]
        drawText(
            l,
            color = labelColor,
            topLeft = Offset(frame.left - labelGapPx - l.size.width, ys[i] - l.size.height / 2f),
        )
    }
}

internal fun DrawScope.drawXLabels(labels: List<PlacedLabel>, top: Float, color: Color) {
    for (l in labels) drawText(l.layout, color = color, topLeft = Offset(l.x, top))
}

internal fun measureAll(measurer: TextMeasurer, style: TextStyle, texts: List<String>): List<TextLayoutResult> =
    texts.map { measurer.measure(it, style) }

/** Straight-segment geometry for a series: one sub-path per run, plus isolated single points. */
internal class LineGeometry(val path: Path, val singles: List<Offset>)

/**
 * Builds the line path. Segments are straight: smoothing would invent values between readings.
 * Runs come from [ChartScales.runs], so a null (or a missing slot) ends the sub-path; nothing bridges it.
 */
internal fun buildLineGeometry(
    points: List<ChartPoint>,
    runs: List<IntRange>,
    mapX: (Long) -> Float,
    mapY: (Double) -> Float,
): LineGeometry {
    val path = Path()
    val singles = ArrayList<Offset>()
    for (r in runs) {
        if (r.first == r.last) {
            val y = points[r.first].y ?: continue
            singles.add(Offset(mapX(points[r.first].x), mapY(y)))
            continue
        }
        for (i in r) {
            val p = points[i]
            val y = p.y ?: continue
            val x = mapX(p.x)
            if (i == r.first) path.moveTo(x, mapY(y)) else path.lineTo(x, mapY(y))
        }
    }
    return LineGeometry(path, singles)
}

/** Pixel positions of every point; NaN where the value is missing. */
internal fun pointPixels(
    points: List<ChartPoint>,
    mapX: (Long) -> Float,
    mapY: (Double) -> Float,
): Pair<FloatArray, FloatArray> {
    val xs = FloatArray(points.size)
    val ys = FloatArray(points.size)
    for (i in points.indices) {
        val y = points[i].y
        xs[i] = mapX(points[i].x)
        ys[i] = if (y == null) Float.NaN else mapY(y)
    }
    return xs to ys
}

/** x pixel -> x data value for a plot spanning [frameLeft, frameRight] px over the x domain [x0, x1]. */
internal fun pixelToX(px: Float, frameLeft: Float, frameRight: Float, x0: Double, x1: Double): Double {
    val span = frameRight - frameLeft
    if (span <= 0f) return x0
    val f = ((px - frameLeft) / span).coerceIn(0f, 1f)
    return x0 + f * (x1 - x0)
}

/** Layout constants shared by the cartesian charts. */
internal val ChartLabelGap: Dp = 8.dp
internal val ChartRightPad: Dp = 8.dp

/** Maps a touch x to the nearest real point; the key for [scrubGestures]. */
internal class ScrubMapper(
    private val points: List<ChartPoint>,
    private val frameLeftPx: Float,
    private val rightPadPx: Float,
    private val x0: Double,
    private val x1: Double,
) {
    fun indexAt(px: Float, width: Float): Int? {
        val xv = pixelToX(px, frameLeftPx, width - rightPadPx, x0, x1)
        return ChartScales.nearestIndex(points, xv)
    }
}

@Composable
internal fun rememberScrubMapper(points: List<ChartPoint>, gutterPx: Int, x0: Double, x1: Double): ScrubMapper {
    val density = LocalDensity.current
    return remember(points, gutterPx, x0, x1, density) {
        ScrubMapper(
            points,
            gutterPx + with(density) { ChartLabelGap.toPx() },
            with(density) { ChartRightPad.toPx() },
            x0,
            x1,
        )
    }
}
