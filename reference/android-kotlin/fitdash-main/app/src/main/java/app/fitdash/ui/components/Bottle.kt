package app.fitdash.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.unit.dp
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.Palette
import kotlin.math.PI
import kotlin.math.sin

private val BUBBLE_X = listOf(0.3f, 0.62f, 0.45f, 0.72f)
// Speed and alpha of the back and front wave.
private val WAVES = listOf(0.6f to 0.45f, 1f to 1f)

@Composable
fun Bottle(fraction: Float, modifier: Modifier = Modifier) {
    val still = LocalReduceMotion.current
    val level by animateFloatAsState(fraction.coerceIn(0f, 1f), if (still) snap() else Motion.settle, label = "bottle-level")
    val motion = if (still) null else rememberInfiniteTransition(label = "bottle")
    // Five turns in ten seconds, so the 0.6 speed layer also lands on a whole turn and the loop has no seam.
    val phase = motion?.animateFloat(0f, 10 * PI.toFloat(), infiniteRepeatable(tween(10_000, easing = LinearEasing)), label = "bottle-wave")
    val rise = motion?.animateFloat(0f, 1f, infiniteRepeatable(tween(2400, easing = LinearEasing)), label = "bottle-bubbles")
    val outline = Palette.Accent.copy(alpha = 0.3f)
    val deep = Palette.Deep
    val rem = Palette.Rem
    Spacer(
        modifier.size(120.dp, 200.dp).drawWithCache {
            val stroke = 3.dp.toPx()
            val outlineStroke = Stroke(stroke)
            val neck = size.width * 0.38f
            val shoulder = size.height * 0.12f
            val body = RoundRect(stroke / 2, shoulder, size.width - stroke / 2, size.height - stroke / 2, CornerRadius(28.dp.toPx()))
            val bodyPath = Path().apply { addRoundRect(body) }
            val top = body.bottom - (body.bottom - body.top) * level
            val amp = 4.dp.toPx()
            val brush = Brush.verticalGradient(listOf(deep, rem), startY = top - amp, endY = body.bottom)
            val waves = WAVES.map { Path() }
            onDrawBehind {
                if (level > 0f) clipPath(bodyPath) {
                    WAVES.forEachIndexed { w, (speed, alpha) ->
                        val shift = (phase?.value ?: 0f) * speed
                        val wave = waves[w].apply {
                            rewind()
                            moveTo(0f, size.height)
                            for (i in 0..24) {
                                val x = size.width * i / 24
                                lineTo(x, top + amp * sin(x / size.width * 2 * PI.toFloat() + shift + speed * 2))
                            }
                            lineTo(size.width, size.height)
                            close()
                        }
                        drawPath(wave, brush, alpha = alpha)
                    }
                    BUBBLE_X.forEachIndexed { i, bx ->
                        val t = rise?.let { (it.value + i / 4f) % 1f } ?: (i / 4f)
                        val y = body.bottom - (body.bottom - top) * t
                        if (y > top + amp) drawCircle(Color.White.copy(alpha = 0.35f * (1 - t)), radius = (2.5f + i % 2).dp.toPx(), center = Offset(size.width * bx, y))
                    }
                }
                drawPath(bodyPath, outline, style = outlineStroke)
                drawRoundRect(outline, topLeft = Offset((size.width - neck) / 2, stroke / 2), size = Size(neck, shoulder - stroke / 2), cornerRadius = CornerRadius(6.dp.toPx()), style = outlineStroke)
            }
        },
    )
}
