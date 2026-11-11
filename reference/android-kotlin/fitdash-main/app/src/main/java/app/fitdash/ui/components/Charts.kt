package app.fitdash.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.text.drawText
import app.fitdash.metrics.lineRuns
import app.fitdash.ui.formatNumber
import app.fitdash.ui.dayLetter
import java.time.LocalDate
import androidx.compose.material3.Icon
import app.fitdash.ui.theme.LocalReduceMotion
import androidx.compose.foundation.gestures.detectDragGesturesAfterLongPress
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.font.FontWeight
import kotlinx.coroutines.launch
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.fitdash.health.SleepStage
import app.fitdash.health.StageType
import app.fitdash.metrics.Good
import app.fitdash.metrics.Status
import app.fitdash.ui.formatSteps
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.labelCase
import app.fitdash.ui.theme.noteCase
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Space
import app.fitdash.ui.theme.Type
import app.fitdash.ui.theme.scoreColor
import java.time.Duration
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.roundToLong
import kotlin.math.sin

// Touch-to-read for charts. A tap shows the value under the finger for a moment; press and hold, then drag, to scrub.
// Horizontal drags are only claimed after a long press so the pager keeps its swipe.
@Composable
fun rememberScrub(count: Int): Pair<State<Int?>, Modifier> {
    val index = remember { mutableStateOf<Int?>(null) }
    val haptic = LocalHapticFeedback.current
    var hideJob by remember { mutableStateOf<kotlinx.coroutines.Job?>(null) }
    val scope = rememberCoroutineScope()
    fun show(i: Int?, sticky: Boolean) {
        if (i != index.value && i != null) haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
        index.value = i
        hideJob?.cancel()
        if (!sticky && i != null) hideJob = scope.launch { kotlinx.coroutines.delay(2500); index.value = null }
    }
    val modifier = Modifier
        .pointerInput(count) {
            detectTapGestures(onTap = { show((it.x / size.width * count).toInt().coerceIn(0, count - 1), sticky = false) })
        }
        .pointerInput(count) {
            detectDragGesturesAfterLongPress(
                onDragStart = { show((it.x / size.width * count).toInt().coerceIn(0, count - 1), sticky = true) },
                onDragEnd = { show(index.value, sticky = false) },
                onDragCancel = { index.value = null },
            ) { change, _ ->
                change.consume()
                show((change.position.x / size.width * count).toInt().coerceIn(0, count - 1), sticky = true)
            }
        }
    return index to modifier
}

// A small rounded label above a point, kept inside the canvas horizontally.
fun DrawScope.drawBubble(measurer: TextMeasurer, text: String, style: TextStyle, x: Float, y: Float, fill: Color, textColor: Color) {
    val t = measurer.measure(text, style)
    val padX = 8.dp.toPx()
    val padY = 5.dp.toPx()
    val w = t.size.width + padX * 2
    val h = t.size.height + padY * 2
    val left = (x - w / 2).coerceIn(0f, (size.width - w).coerceAtLeast(0f))
    val top = (y - h - 8.dp.toPx()).coerceAtLeast(0f)
    drawRoundRect(fill, Offset(left, top), Size(w, h), CornerRadius(8.dp.toPx()))
    drawText(t, textColor, Offset(left + padX, top + padY))
}

object Chart {
    val stroke = 2.dp
    val corner = 3.dp
    val track: Color @Composable @ReadOnlyComposable get() = Palette.Divider
}

val LocalRevealed = staticCompositionLocalOf<MutableSet<String>> { mutableSetOf() }

@Composable
fun rememberDrawProgress(key: String, durationMillis: Int = Motion.DRAW, delayMillis: Int = 0): State<Float> {
    val revealed = LocalRevealed.current
    val reduce = LocalReduceMotion.current
    val p = remember(key) { Animatable(if (key in revealed || reduce) 1f else 0f) }
    LaunchedEffect(key) {
        if (p.value < 1f) {
            p.animateTo(1f, tween(durationMillis, delayMillis, Motion.ease))
            revealed += key
        }
    }
    return p.asState()
}

@Composable
fun CountUpText(key: String, target: Long, style: TextStyle, modifier: Modifier = Modifier, color: Color = Color.Unspecified) {
    val revealed = LocalRevealed.current
    val reduce = LocalReduceMotion.current
    val value = remember(key) { Animatable(if (key in revealed || reduce) target.toFloat() else 0f) }
    LaunchedEffect(key, target) {
        if (reduce) value.snapTo(target.toFloat()) else value.animateTo(target.toFloat(), tween(Motion.COUNT, easing = Motion.ease))
        revealed += key
    }
    Text(formatSteps(value.value.roundToLong()), modifier, style = style, color = color)
}

@Composable
@ReadOnlyComposable
private fun stageColor(t: StageType) = when (t) {
    StageType.AWAKE -> Palette.Awake
    StageType.REM -> Palette.Rem
    StageType.LIGHT, StageType.SLEEPING -> Palette.Light
    StageType.DEEP -> Palette.Deep
}

private fun stageRow(t: StageType) = when (t) {
    StageType.AWAKE -> 0
    StageType.REM -> 1
    StageType.LIGHT, StageType.SLEEPING -> 2
    StageType.DEEP -> 3
}

// A classic stepped hypnogram: four lanes (Awake on top, then REM, Light, Deep), a block per stage, thin risers between them.
// With `colours` it draws bare, without lane names or tracks, for a coloured card.
@Composable
fun Hypnogram(key: String, stages: List<SleepStage>, modifier: Modifier = Modifier, colours: Map<StageType, Color>? = null) {
    val progress = rememberDrawProgress(key)
    val colors = colours ?: StageType.entries.associateWith { stageColor(it) }
    val laneText = Palette.Faint
    val track = Chart.track
    val measurer = rememberTextMeasurer()
    val labelStyle = Type.tiny
    val lanes = listOf("AWAKE", "REM", "LIGHT", "DEEP")
    Canvas(modifier.fillMaxWidth().height(104.dp)) {
        if (stages.isEmpty()) return@Canvas
        val sorted = stages.sortedBy { it.start }
        val start = sorted.first().start
        val total = Duration.between(start, sorted.maxOf { it.end }).seconds.toFloat()
        if (total <= 0f) return@Canvas
        val labelW = if (colours == null) 44.dp.toPx() else 0f
        val w = size.width - labelW
        val laneH = size.height / 4
        val blockH = laneH * 0.62f
        if (colours == null) lanes.forEachIndexed { i, name ->
            val cy = laneH * i + laneH / 2
            val t = measurer.measure(name, labelStyle)
            drawText(t, laneText, Offset(0f, cy - t.size.height / 2))
            drawLine(track, Offset(labelW, cy), Offset(size.width, cy), 1.dp.toPx())
        }
        clipRect(left = labelW, right = labelW + w * progress.value) {
            var prevRow = -1
            var prevX = 0f
            sorted.forEach { st ->
                val x0 = labelW + Duration.between(start, st.start).seconds / total * w
                val x1 = labelW + Duration.between(start, st.end).seconds / total * w
                val row = stageRow(st.type)
                val cy = laneH * row + laneH / 2
                val c = colors.getValue(st.type)
                if (prevRow >= 0 && prevRow != row) {
                    val pcy = laneH * prevRow + laneH / 2
                    drawLine(c.copy(alpha = 0.45f), Offset(x0, pcy), Offset(x0, cy), 1.dp.toPx())
                }
                drawRoundRect(c, Offset(x0, cy - blockH / 2), Size(max(x1 - x0, 1.5.dp.toPx()), blockH), CornerRadius(2.dp.toPx()))
                prevRow = row
                prevX = x1
            }
        }
    }
}

@Composable
fun TrendLine(key: String, values: List<Double>, modifier: Modifier = Modifier, baseline: Double? = null) {
    if (values.size < 2) {
        Spacer(modifier)
        return
    }
    val progress = rememberDrawProgress(key)
    val faint = Palette.Faint
    val color = Palette.Accent
    val fillColor = color.copy(alpha = 0.12f)
    Spacer(
        modifier.drawWithCache {
            val all = values + listOfNotNull(baseline)
            val lo = all.min()
            val span = (all.max() - lo).takeIf { it > 0 } ?: 1.0
            val pad = 3.dp.toPx()
            fun y(v: Double) = pad + (size.height - 2 * pad) * (1 - ((v - lo) / span).toFloat())
            val path = Path().apply {
                values.forEachIndexed { i, v ->
                    val x = i * size.width / (values.size - 1)
                    if (i == 0) moveTo(x, y(v)) else lineTo(x, y(v))
                }
            }
            val measure = PathMeasure().apply { setPath(path, false) }
            val partial = Path()
            val fill = Path()
            val stroke = Stroke(Chart.stroke.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx()))
            onDrawBehind {
                baseline?.let {
                    drawLine(faint, Offset(0f, y(it)), Offset(size.width, y(it)), 1.dp.toPx(), pathEffect = dash)
                }
                val length = measure.length * progress.value
                if (length <= 0f) return@onDrawBehind
                partial.reset()
                measure.getSegment(0f, length, partial, true)
                val end = measure.getPosition(length)
                fill.reset()
                fill.addPath(partial)
                fill.lineTo(end.x, size.height)
                fill.lineTo(0f, size.height)
                fill.close()
                drawPath(fill, fillColor)
                drawPath(partial, color, style = stroke)
            }
        },
    )
}

@Composable
fun Bars(
    key: String,
    values: List<Float>,
    modifier: Modifier = Modifier,
    labels: List<String> = emptyList(),
    height: Dp = 56.dp,
    highlightLast: Boolean = true,
    poor: (Int) -> Boolean = { false },
    // Text for the readout when a bar is tapped or scrubbed; null disables touch.
    readout: ((Int) -> String)? = null,
) {
    val accent = Palette.Accent
    val calm = accent.copy(alpha = 0.35f)
    val bad = Palette.Bad.copy(alpha = 0.45f)
    val progress = rememberDrawProgress(key, Motion.RISE + 300)
    val top = values.maxOrNull()?.takeIf { it > 0 } ?: 1f
    val (scrub, scrubModifier) = rememberScrub(values.size.coerceAtLeast(1))
    val measurer = rememberTextMeasurer()
    val bubbleFill = Palette.Text
    val bubbleText = Palette.Background
    val bubbleStyle = Type.tiny.copy(fontWeight = FontWeight.Medium)
    Column(modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().height(height + if (readout != null) 22.dp else 0.dp).then(if (readout != null) scrubModifier else Modifier)) {
            if (values.isEmpty()) return@Canvas
            val topPad = if (readout != null) 22.dp.toPx() else 0f
            val plotH = size.height - topPad
            val w = size.width / values.size
            // Pill bars: a third of the slot is gap, ends fully rounded, and a faint track so empty slots still read.
            val gap = w * 0.3f / 2
            val barW = w - 2 * gap
            val sel = scrub.value
            val trackColor = accent.copy(alpha = 0.07f)
            values.forEachIndexed { i, v ->
                drawRoundRect(trackColor, Offset(i * w + gap, topPad), Size(barW, plotH), CornerRadius(barW / 2))
                val h = (v / top * plotH * progress.value).coerceAtLeast(if (v > 0f) barW else 0f)
                if (h > 0f) {
                    val colour = when {
                        sel == i -> accent
                        sel != null -> calm.copy(alpha = 0.25f)
                        highlightLast && i == values.lastIndex -> accent
                        poor(i) -> bad
                        else -> calm
                    }
                    drawRoundRect(colour, Offset(i * w + gap, size.height - h), Size(barW, h), CornerRadius(barW / 2))
                }
            }
            if (sel != null && readout != null) {
                val h = values[sel] / top * plotH
                drawBubble(measurer, readout(sel), bubbleStyle, sel * w + w / 2, size.height - h, bubbleFill, bubbleText)
            }
        }
        if (labels.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(top = Space.xs)) {
                labels.forEach { Text(it, Modifier.weight(1f), style = Type.tiny, color = Palette.Faint, textAlign = TextAlign.Center, maxLines = 1, softWrap = false) }
            }
        }
    }
}

// Day-of-month under every 7th bar for a month view, month names under the first week of each month for 6M, nothing for a week.
fun sparseLabels(dates: List<LocalDate>, month: Boolean): List<String> = dates.mapIndexed { i, d ->
    if (month) { if (i % 7 == 0) d.dayOfMonth.toString() else "" } else dayLetter(d)
}

fun monthLabels(weeks: List<LocalDate>): List<String> = weeks.mapIndexed { i, w ->
    val prev = weeks.getOrNull(i - 1)
    if (prev == null || prev.month != w.month) w.month.getDisplayName(java.time.format.TextStyle.SHORT, java.util.Locale.ENGLISH).uppercase() else ""
}

// A line that keeps gaps: a null value breaks the stroke. Min and max are labelled at the right edge.
@Composable
fun GapLine(
    key: String,
    values: List<Double?>,
    modifier: Modifier = Modifier,
    baseline: Double? = null,
    second: List<Double?>? = null,
    showMinMax: Boolean = true,
    color: Color = Palette.Accent,
) {
    val known = values.filterNotNull() + second.orEmpty().filterNotNull()
    if (known.size < 2) {
        Spacer(modifier)
        return
    }
    val progress = rememberDrawProgress(key)
    val faint = Palette.Faint
    val muted = Palette.Muted
    val fillColor = color.copy(alpha = 0.12f)
    val labelStyle = Type.tiny
    val measurer = rememberTextMeasurer()
    val all = known + listOfNotNull(baseline)
    val lo = all.min()
    val hi = all.max()
    val span = (hi - lo).takeIf { it > 0 } ?: 1.0
    Spacer(
        modifier.drawWithCache {
            val labelWidth = if (showMinMax) 34.dp.toPx() else 0f
            val w = size.width - labelWidth
            val pad = 4.dp.toPx()
            fun y(v: Double) = pad + (size.height - 2 * pad) * (1 - ((v - lo) / span).toFloat())
            fun x(i: Int, n: Int) = if (n <= 1) 0f else i * w / (n - 1)
            // Each run of consecutive known points becomes one monotone cubic curve.
            fun runs(list: List<Double?>): List<Path> {
                val out = mutableListOf<Path>()
                var xs = mutableListOf<Float>()
                var ys = mutableListOf<Float>()
                fun flush() { if (xs.isNotEmpty()) out += monotonePath(xs, ys); xs = mutableListOf(); ys = mutableListOf() }
                list.forEachIndexed { i, v -> if (v == null) flush() else { xs += x(i, list.size); ys += y(v) } }
                flush()
                return out
            }
            val main = runs(values)
            val other = second?.let(::runs).orEmpty()
            val stroke = Stroke(Chart.stroke.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val thin = Stroke(1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx()))
            val maxText = measurer.measure(formatNumber(hi), labelStyle)
            val minText = measurer.measure(formatNumber(lo), labelStyle)
            onDrawBehind {
                baseline?.let { drawLine(faint, Offset(0f, y(it)), Offset(w, y(it)), 1.dp.toPx(), pathEffect = dash) }
                clipRect(right = w * progress.value) {
                    other.forEach { drawPath(it, muted, style = thin) }
                    main.forEach { path ->
                        drawPath(path, color, style = stroke)
                    }
                    // Dots mark isolated single-day runs that a stroke cannot show.
                    values.forEachIndexed { i, v ->
                        if (v != null && values.getOrNull(i - 1) == null && values.getOrNull(i + 1) == null) {
                            drawCircle(color, 2.5.dp.toPx(), Offset(x(i, values.size), y(v)))
                        }
                    }
                }
                if (showMinMax) {
                    drawText(maxText, muted, Offset(w + 6.dp.toPx(), y(hi) - maxText.size.height / 2))
                    drawText(minText, muted, Offset(w + 6.dp.toPx(), y(lo) - minText.size.height / 2))
                }
            }
        },
    )
}

// A smooth curve through daily values with a soft gradient under it, a dot per point and the last point lit.
// Monotone cubic interpolation keeps the curve from overshooting between days. Null values break the curve.
@Composable
fun SmoothArea(
    key: String,
    values: List<Double?>,
    modifier: Modifier = Modifier,
    labels: List<String> = emptyList(),
    height: Dp = 96.dp,
    poor: (Int) -> Boolean = { false },
    readout: ((Int) -> String)? = null,
    color: Color = Palette.Accent,
    baseline: Double? = null,
) {
    val progress = rememberDrawProgress(key, Motion.DRAW)
    val (scrub, scrubModifier) = rememberScrub(values.size.coerceAtLeast(1))
    val measurer = rememberTextMeasurer()
    val bubbleFill = Palette.Text
    val bubbleText = Palette.Background
    val bubbleStyle = Type.tiny.copy(fontWeight = FontWeight.Medium)
    val badColor = Palette.Bad
    val faint = Palette.Faint
    val dotRing = Palette.Background
    val lastDot = Palette.Text
    val tinyStyle = Type.tiny
    val known = values.filterNotNull()
    Column(modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().height(height + 22.dp).then(if (readout != null && known.isNotEmpty()) scrubModifier else Modifier)) {
            if (known.isEmpty()) return@Canvas
            val topPad = 22.dp.toPx()
            val bottomPad = 6.dp.toPx()
            val lo = 0.0
            val hi = (known.max().takeIf { it > 0 } ?: 1.0) * 1.08
            fun y(v: Double) = topPad + (size.height - topPad - bottomPad) * (1 - ((v - lo) / (hi - lo)).toFloat())
            val n = values.size
            val slot = size.width / n
            fun x(i: Int) = slot * i + slot / 2
            val sel = scrub.value?.let { s -> (0 until n).filter { values[it] != null }.minByOrNull { kotlin.math.abs(it - s) } }
            // Runs of consecutive known points, each drawn as one curve.
            val runs = mutableListOf<MutableList<Int>>()
            values.forEachIndexed { i, v -> if (v == null) runs.add(mutableListOf()) else { if (runs.isEmpty()) runs.add(mutableListOf()); runs.last().add(i) } }
            val reveal = size.width * progress.value
            clipRect(right = reveal) {
                runs.filter { it.isNotEmpty() }.forEach { run ->
                    val xs = run.map { x(it) }
                    val ys = run.map { y(values[it]!!) }
                    val path = monotonePath(xs, ys)
                    val fill = Path().apply {
                        addPath(path)
                        lineTo(xs.last(), size.height)
                        lineTo(xs.first(), size.height)
                        close()
                    }
                    drawPath(fill, Brush.verticalGradient(listOf(color.copy(alpha = 0.28f), color.copy(alpha = 0f)), startY = topPad, endY = size.height))
                    drawPath(path, color, style = Stroke(2.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
                baseline?.let { drawLine(faint, Offset(0f, y(it)), Offset(size.width, y(it)), 1.dp.toPx(), pathEffect = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx()))) }
                values.forEachIndexed { i, v ->
                    if (v == null) return@forEachIndexed
                    val c = if (poor(i)) badColor else color
                    val last = i == values.indexOfLast { it != null }
                    val r = if (last || sel == i) 5.dp.toPx() else 3.dp.toPx()
                    drawCircle(dotRing, r + 1.5.dp.toPx(), Offset(x(i), y(v)))
                    drawCircle(if (last && sel == null) lastDot else c, r, Offset(x(i), y(v)))
                }
            }
            if (known.size == 1) {
                // A curve needs two days; say so instead of showing a lone dot in an empty box.
                val t = measurer.measure("ONE DAY SO FAR · A TREND NEEDS TWO", tinyStyle)
                drawText(t, faint, Offset((size.width - t.size.width) / 2, topPad + (size.height - topPad - bottomPad) / 2 - t.size.height / 2))
            }
            if (sel != null && readout != null) {
                val v = values[sel]!!
                drawLine(faint, Offset(x(sel), topPad), Offset(x(sel), size.height - bottomPad), 1.dp.toPx())
                drawBubble(measurer, readout(sel), bubbleStyle, x(sel), y(v), bubbleFill, bubbleText)
            }
        }
        if (labels.isNotEmpty()) {
            Row(Modifier.fillMaxWidth().padding(top = Space.xs)) {
                labels.forEach { Text(it, Modifier.weight(1f), style = Type.tiny, color = Palette.Faint, textAlign = TextAlign.Center, maxLines = 1, softWrap = false) }
            }
        }
    }
}

// Fritsch–Carlson monotone cubic through the points: smooth, and never overshoots a neighbour.
fun monotonePath(xs: List<Float>, ys: List<Float>): Path {
    val path = Path()
    val n = xs.size
    if (n == 0) return path
    path.moveTo(xs[0], ys[0])
    if (n == 1) return path
    val d = FloatArray(n - 1) { (ys[it + 1] - ys[it]) / (xs[it + 1] - xs[it]).coerceAtLeast(1e-3f) }
    val m = FloatArray(n)
    m[0] = d[0]; m[n - 1] = d[n - 2]
    for (i in 1 until n - 1) m[i] = if (d[i - 1] * d[i] <= 0f) 0f else (d[i - 1] + d[i]) / 2
    for (i in 0 until n - 1) {
        if (d[i] == 0f) { m[i] = 0f; m[i + 1] = 0f; continue }
        val a = m[i] / d[i]; val b = m[i + 1] / d[i]
        val s = a * a + b * b
        if (s > 9f) { val t = 3f / kotlin.math.sqrt(s); m[i] = t * a * d[i]; m[i + 1] = t * b * d[i] }
    }
    for (i in 0 until n - 1) {
        val dx = xs[i + 1] - xs[i]
        path.cubicTo(xs[i] + dx / 3, ys[i] + m[i] * dx / 3, xs[i + 1] - dx / 3, ys[i + 1] - m[i + 1] * dx / 3, xs[i + 1], ys[i + 1])
    }
    return path
}

// One day of heart rate: 288 five-minute slots, gaps over 30 minutes break the line, spans shade the background.
@Composable
fun HeartDayLine(
    key: String,
    line: List<Double?>,
    modifier: Modifier = Modifier,
    restingHr: Double? = null,
    sleepSpans: List<Pair<Float, Float>> = emptyList(),
    workoutSpans: List<Pair<Float, Float>> = emptyList(),
    // Readout for a tapped or scrubbed slot: given the slot index and its value.
    readout: ((Int, Double) -> String)? = null,
) {
    val runs = remember(line) { lineRuns(line) }
    val known = line.filterNotNull()
    if (known.size < 2) {
        Spacer(modifier)
        return
    }
    val progress = rememberDrawProgress(key)
    val (scrub, scrubModifier) = rememberScrub(line.size)
    val measurer = rememberTextMeasurer()
    val bubbleFill = Palette.Text
    val bubbleText = Palette.Background
    val bubbleStyle = Type.tiny.copy(fontWeight = FontWeight.Medium)
    val color = Palette.Accent
    val sleep = Palette.Deep.copy(alpha = 0.14f)
    val workout = Palette.Accent.copy(alpha = 0.12f)
    val faint = Palette.Faint
    val all = known + listOfNotNull(restingHr)
    val lo = all.min()
    val span = (all.max() - lo).takeIf { it > 0 } ?: 1.0
    val sel = scrub.value
    // Nearest slot with a value, so a tap on a gap still reads something.
    val selSlot = sel?.let { s -> (0 until line.size).filter { line[it] != null }.minByOrNull { kotlin.math.abs(it - s) } }
    val textColor = Palette.Text
    Spacer(
        modifier.then(if (readout != null) scrubModifier else Modifier).drawWithCache {
            val topPad = if (readout != null) 22.dp.toPx() else 4.dp.toPx()
            val pad = 4.dp.toPx()
            fun y(v: Double) = topPad + (size.height - topPad - pad) * (1 - ((v - lo) / span).toFloat())
            fun x(slot: Int) = slot * size.width / (line.size - 1)
            val paths = runs.map { run ->
                Path().apply { run.forEachIndexed { i, (slot, v) -> if (i == 0) moveTo(x(slot), y(v)) else lineTo(x(slot), y(v)) } }
            }
            val stroke = Stroke(1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
            val dash = PathEffect.dashPathEffect(floatArrayOf(3.dp.toPx(), 4.dp.toPx()))
            onDrawBehind {
                sleepSpans.forEach { (a, b) -> drawRect(sleep, Offset(size.width * a, topPad), Size(size.width * (b - a), size.height - topPad)) }
                workoutSpans.forEach { (a, b) -> drawRect(workout, Offset(size.width * a, topPad), Size(size.width * (b - a), size.height - topPad)) }
                restingHr?.let { drawLine(faint, Offset(0f, y(it)), Offset(size.width, y(it)), 1.dp.toPx(), pathEffect = dash) }
                clipRect(right = size.width * progress.value) {
                    paths.forEach { drawPath(it, color, style = stroke) }
                    runs.filter { it.size == 1 }.forEach { r -> drawCircle(color, 2.dp.toPx(), Offset(x(r[0].first), y(r[0].second))) }
                }
                if (selSlot != null && readout != null) {
                    val v = line[selSlot]!!
                    drawLine(faint, Offset(x(selSlot), topPad), Offset(x(selSlot), size.height), 1.dp.toPx())
                    drawCircle(textColor, 4.dp.toPx(), Offset(x(selSlot), y(v)))
                    drawBubble(measurer, readout(selSlot, v), bubbleStyle, x(selSlot), y(v), bubbleFill, bubbleText)
                }
            }
        },
    )
}

@Composable
fun RangeBar(key: String, value: Double, range: ClosedFloatingPointRange<Double>, good: Good, modifier: Modifier = Modifier) {
    val progress = rememberDrawProgress(key, Motion.RING)
    val track = Chart.track
    val band = Palette.Good.copy(alpha = 0.45f)
    val ring = Palette.Background
    val dot = Palette.Text
    Canvas(modifier.fillMaxWidth().height(14.dp)) {
        val span = (range.endInclusive - range.start).takeIf { it > 0 } ?: max(abs(range.start) * 0.1, 1.0)
        val lo = minOf(range.start, value) - span * 0.6
        val hi = maxOf(range.endInclusive, value) + span * 0.6
        fun x(v: Double) = ((v - lo) / (hi - lo)).toFloat() * size.width
        val cy = size.height / 2
        val th = 3.dp.toPx()
        val r = CornerRadius(th / 2)
        drawRoundRect(track, Offset(0f, cy - th / 2), Size(size.width, th), r)
        drawRoundRect(
            band,
            Offset(x(range.start), cy - th / 2),
            Size(max(x(range.endInclusive) - x(range.start), th), th),
            r,
        )
        val dx = max(x(value) * progress.value, 7.5.dp.toPx())
        drawCircle(ring, 7.5.dp.toPx(), Offset(dx, cy))
        drawCircle(dot, 4.5.dp.toPx(), Offset(dx, cy))
    }
}

@Composable
fun TypicalShareBar(share: Float, typical: ClosedFloatingPointRange<Float>, modifier: Modifier = Modifier, key: String = "typical-$share-$typical") {
    val progress = rememberDrawProgress(key, Motion.RING)
    val track = Chart.track
    val fill = Palette.Accent
    val bracket = Palette.Text.copy(alpha = 0.45f)
    Canvas(modifier.fillMaxWidth().height(12.dp)) {
        val cy = size.height / 2
        val th = 4.dp.toPx()
        val r = CornerRadius(th / 2)
        drawRoundRect(track, Offset(0f, cy - th / 2), Size(size.width, th), r)
        drawRoundRect(fill, Offset(0f, cy - th / 2), Size(size.width * share.coerceIn(0f, 1f) * progress.value, th), r)
        val x0 = size.width * typical.start.coerceIn(0f, 1f)
        val x1 = size.width * typical.endInclusive.coerceIn(0f, 1f)
        val dash = PathEffect.dashPathEffect(floatArrayOf(2.dp.toPx(), 2.dp.toPx()))
        drawRoundRect(
            bracket,
            Offset(x0, 0.5.dp.toPx()),
            Size(x1 - x0, size.height - 1.dp.toPx()),
            CornerRadius(2.dp.toPx()),
            style = Stroke(1.dp.toPx(), pathEffect = dash),
        )
    }
}

private const val GAUGE_START = 200f
private const val GAUGE_SWEEP = 140f

// Score header: a 140-degree arc coloured by the score, a glowing end dot, the value counting up, and a tinted status chip.
@Composable
fun SemiGauge(
    score: Int,
    label: String,
    status: Status,
    modifier: Modifier = Modifier,
    key: String = "gauge-$label-$score",
    value: String = score.toString(),
    tag: String = statusWord(status),
    from: Color = Palette.Deep,
    to: Color = Palette.Rem,
    numeric: Long? = null,
    chip: Color = statusColour(status),
) {
    val progress = rememberDrawProgress(key, Motion.DRAW)
    val track = Chart.track
    val chipText = chip
    Box(modifier.fillMaxWidth().height(176.dp), contentAlignment = Alignment.TopCenter) {
        Canvas(Modifier.size(256.dp, 176.dp)) {
            val s = 12.dp.toPx()
            val radius = size.width / 2 - s / 2 - 8.dp.toPx()
            val centre = Offset(size.width / 2, size.height - 28.dp.toPx())
            val topLeft = Offset(centre.x - radius, centre.y - radius)
            val arc = Size(radius * 2, radius * 2)
            drawArc(track, GAUGE_START, GAUGE_SWEEP, false, topLeft, arc, style = Stroke(s, cap = StrokeCap.Round))
            val sweep = GAUGE_SWEEP * score.coerceIn(0, 100) / 100f * progress.value
            if (sweep > 0f) {
                drawArc(
                    Brush.sweepGradient(listOf(from, to, to), center = centre),
                    GAUGE_START, sweep, false, topLeft, arc, style = Stroke(s, cap = StrokeCap.Round),
                )
            }
            val a = Math.toRadians((GAUGE_START + sweep).toDouble())
            val tip = Offset(centre.x + radius * cos(a).toFloat(), centre.y + radius * sin(a).toFloat())
            drawCircle(Brush.radialGradient(listOf(to.copy(alpha = 0.55f), to.copy(alpha = 0f)), center = tip, radius = 16.dp.toPx()), 16.dp.toPx(), tip)
            drawCircle(Color.White, 5.dp.toPx(), tip)
        }
        Column(Modifier.padding(top = 52.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            Text(labelCase(label), style = Type.label, color = Palette.Muted)
            if (numeric != null) CountUpText("$key-count", numeric, Type.hero.copy(fontSize = 52.sp), color = Palette.Text)
            else Text(value, style = Type.hero.copy(fontSize = 52.sp), color = Palette.Text)
            Text(
                noteCase(tag),
                Modifier.padding(top = 4.dp).clip(RoundedCornerShape(8.dp)).background(chipText.copy(alpha = 0.14f)).padding(horizontal = 12.dp, vertical = 5.dp),
                style = Type.status,
                color = chipText,
            )
        }
    }
}

@Composable
fun SpanBar(start: String, end: String, modifier: Modifier = Modifier, from: Float = 0f, to: Float = 1f, key: String = "span-$start-$end") {
    val progress = rememberDrawProgress(key, Motion.RING)
    val track = Chart.track
    val a = Palette.Light
    val b = Palette.Rem
    Column(modifier.fillMaxWidth()) {
        Canvas(Modifier.fillMaxWidth().height(4.dp)) {
            val r = CornerRadius(2.dp.toPx())
            drawRoundRect(track, Offset.Zero, size, r)
            val x0 = size.width * from
            val w = size.width * (to - from) * progress.value
            drawRoundRect(Brush.horizontalGradient(listOf(a, b), startX = x0, endX = x0 + size.width * (to - from)), Offset(x0, 0f), Size(w, size.height), r)
        }
        Row(Modifier.fillMaxWidth().padding(top = Space.s), horizontalArrangement = Arrangement.SpaceBetween) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(NavIcons.moonSmall, null, Modifier.padding(end = 4.dp).size(12.dp), tint = Palette.Muted)
                Text(noteCase(start), style = Type.tiny, color = Palette.Muted)
            }
            Row(verticalAlignment = Alignment.CenterVertically) {
                Icon(NavIcons.sun, null, Modifier.padding(end = 4.dp).size(12.dp), tint = Palette.Muted)
                Text(noteCase(end), style = Type.tiny, color = Palette.Muted)
            }
        }
    }
}

@Composable
fun MiniRing(
    key: String,
    fraction: Float,
    color: Color,
    modifier: Modifier = Modifier,
    diameter: Dp = 38.dp,
    stroke: Dp = 4.dp,
    delayMillis: Int = 0,
) {
    val progress = rememberDrawProgress(key, Motion.RING, delayMillis)
    val glide by animateFloatAsState(fraction.coerceIn(0f, 1f), if (LocalReduceMotion.current) snap() else tween(Motion.PAGE, easing = Motion.ease), label = "ring-$key")
    val track = Chart.track
    Canvas(modifier.size(diameter)) {
        val s = stroke.toPx()
        val topLeft = Offset(s / 2, s / 2)
        val arc = Size(size.width - s, size.height - s)
        drawArc(track, -90f, 360f, false, topLeft, arc, style = Stroke(s))
        drawArc(color, -90f, 360f * glide * progress.value, false, topLeft, arc, style = Stroke(s, cap = StrokeCap.Round))
    }
}

@Composable
fun ScoreRing(key: String, label: String, score: Int?, index: Int, onClick: () -> Unit) {
    val haptic = LocalHapticFeedback.current
    Column(
        Modifier
            .clip(RoundedCornerShape(Space.m))
            .clickable {
                haptic.performHapticFeedback(HapticFeedbackType.TextHandleMove)
                onClick()
            }
            .padding(Space.s)
            .clearAndSetSemantics { contentDescription = "$label ${score ?: "no data"}"; role = Role.Button },
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        MiniRing(
            key,
            (score ?: 0) / 100f,
            score?.let { scoreColor(it) } ?: Palette.Calibrating,
            diameter = 48.dp,
            stroke = 5.dp,
            delayMillis = index * Motion.STAGGER,
        )
        Spacer(Modifier.height(Space.xs))
        Text("$label ${score ?: "—"}", style = Type.small, color = Palette.Muted)
    }
}
