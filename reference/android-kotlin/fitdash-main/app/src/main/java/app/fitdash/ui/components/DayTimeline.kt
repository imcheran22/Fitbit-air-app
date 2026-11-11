package app.fitdash.ui.components

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import app.fitdash.metrics.DayTimelineData
import app.fitdash.metrics.SpanKind
import app.fitdash.metrics.Tuning
import app.fitdash.metrics.lineRuns
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.Palette
import app.fitdash.ui.theme.Tint
import app.fitdash.ui.theme.Type

@Composable
fun DayTimeline(data: DayTimelineData, onSleep: () -> Unit, onWorkout: (Int) -> Unit, onHeart: (() -> Unit)?) {
    val measurer = rememberTextMeasurer()
    val tinyStyle = Type.tiny
    val faint = Palette.Faint
    val sleep = Palette.Deep
    val nap = Palette.Light
    val workout = LocalTheme.current.tints[Tint.PEACH.ordinal]
    val workoutInk = LocalTheme.current.tintInk[Tint.PEACH.ordinal]
    val accent = Palette.Accent
    val warn = Palette.Warn
    val text = Palette.Text
    val maxSteps = (data.steps.maxOrNull() ?: 0L).coerceAtLeast(1L)
    val known = data.hr.filterNotNull()
    val runs = lineRuns(data.hr)
    val labels = remember(measurer, tinyStyle) { listOf(0, 6, 12, 18, 24).map { it to measurer.measure(it.toString(), tinyStyle) } }
    StripCard(onHeart, onHeart?.let { "Heart rate details" }, Modifier.height(84.dp)) {
        Spacer(
            Modifier.fillMaxSize().pointerInput(data) {
                detectTapGestures { o ->
                    val minute = (o.x / size.width * 1440).toInt()
                    val hit = data.spans.lastOrNull { minute in it.startMin..it.endMin }
                    when (hit?.kind) {
                        SpanKind.SLEEP, SpanKind.NAP -> onSleep()
                        SpanKind.WORKOUT -> onWorkout(data.spans.filter { it.kind == SpanKind.WORKOUT }.indexOf(hit))
                        null -> onHeart?.invoke()
                    }
                }
            }.drawWithCache {
                val w = size.width
                fun x(min: Int) = w * min / 1440f
                val labelTop = size.height - labels.maxOf { it.second.size.height }
                val stepsTop = labelTop - 2.dp.toPx() - 10.dp.toPx()
                val laneTop = stepsTop - 2.dp.toPx() - 12.dp.toPx()
                val hrBottom = laneTop - 4.dp.toPx()
                val corner = CornerRadius(4.dp.toPx())
                val spanStroke = Stroke(1.dp.toPx())
                val hrStroke = Stroke(1.5.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                val dash = PathEffect.dashPathEffect(floatArrayOf(1.dp.toPx(), 3.dp.toPx()))
                val hrPaths = if (known.isEmpty()) emptyList() else {
                    val lo = known.min()
                    val span = (known.max() - lo).takeIf { it > 0 } ?: 1.0
                    runs.map { run ->
                        val xs = run.map { (slot, _) -> x(slot * Tuning.HR_BUCKET_MINUTES + Tuning.HR_BUCKET_MINUTES / 2) }
                        val ys = run.map { (_, v) -> (hrBottom * (1 - (v - lo) / span)).toFloat() }
                        monotonePath(xs, ys)
                    }
                }
                onDrawBehind {
                    data.steps.forEachIndexed { h, v ->
                        if (v > 0) drawRect(accent.copy(alpha = v.toFloat() / maxSteps), Offset(x(h * 60), stepsTop), Size(x(60), 10.dp.toPx()))
                    }
                    data.spans.forEach { s ->
                        val colour = when (s.kind) { SpanKind.SLEEP -> sleep; SpanKind.NAP -> nap; SpanKind.WORKOUT -> workout }
                        val topLeft = Offset(x(s.startMin), laneTop)
                        val barSize = Size((x(s.endMin) - x(s.startMin)).coerceAtLeast(3.dp.toPx()), 12.dp.toPx())
                        drawRoundRect(colour, topLeft, barSize, corner)
                        if (s.kind == SpanKind.WORKOUT) drawRoundRect(workoutInk, topLeft, barSize, corner, style = spanStroke)
                    }
                    hrPaths.forEach { drawPath(it, accent, style = hrStroke) }
                    data.caffeineCutoffMin?.let {
                        drawLine(warn, Offset(x(it), 0f), Offset(x(it), stepsTop + 10.dp.toPx()), 1.dp.toPx(), cap = StrokeCap.Round, pathEffect = dash)
                    }
                    data.nowMin?.let { drawLine(text, Offset(x(it), 0f), Offset(x(it), stepsTop + 10.dp.toPx()), 1.dp.toPx()) }
                    labels.forEach { (h, t) ->
                        drawText(t, faint, Offset((x(h * 60) - t.size.width / 2f).coerceIn(0f, w - t.size.width), labelTop))
                    }
                }
            },
        )
    }
}
