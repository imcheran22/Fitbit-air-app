package app.fitdash.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.size
import androidx.compose.material3.LocalContentColor
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.fitdash.ui.theme.Motion
import app.fitdash.ui.theme.LocalReduceMotion
import app.fitdash.ui.theme.LocalTheme
import app.fitdash.ui.theme.breathMillis
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.sin

private const val BLOB_TURN_MILLIS = 40_000
private const val DIM = 0.55f

@Composable
fun Orb(score: Int?, modifier: Modifier = Modifier, diameter: Dp = 220.dp, frozen: Boolean = false, intro: Boolean = false, content: @Composable () -> Unit) {
    val t = LocalTheme.current
    val dim = remember { Animatable(if (score == null) DIM else 0f) }
    LaunchedEffect(score == null) { dim.animateTo(if (score == null) DIM else 0f, tween(Motion.COLOUR, easing = Motion.ease)) }
    val appear = remember { Animatable(if (intro) 0f else 1f) }
    LaunchedEffect(Unit) { appear.animateTo(1f, tween(Motion.RISE, easing = Motion.ease)) }
    val transition = rememberInfiniteTransition(label = "orb")
    val breath = breathMillis(score ?: 50)
    val animatedScale by transition.animateFloat(
        initialValue = 0.95f,
        targetValue = 1.05f,
        animationSpec = infiniteRepeatable(tween(breath / 2, easing = FastOutSlowInEasing), RepeatMode.Reverse),
        label = "breathe",
    )
    val animatedPhase by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * PI).toFloat(),
        animationSpec = infiniteRepeatable(tween(9000, easing = LinearEasing)),
        label = "morph",
    )
    val animatedTurn by transition.animateFloat(
        initialValue = 0f,
        targetValue = (2 * PI).toFloat(),
        animationSpec = infiniteRepeatable(tween(BLOB_TURN_MILLIS, easing = LinearEasing)),
        label = "turn",
    )
    val still = frozen || LocalReduceMotion.current
    val scale = if (still) 1f else animatedScale
    val phase = if (still) 1f else animatedPhase
    val turn = if (still) 0.6f else animatedTurn

    Box(
        modifier
            .size(diameter)
            .graphicsLayer { val a = appear.value; scaleX = 0.85f + 0.15f * a; scaleY = 0.85f + 0.15f * a; alpha = a }
            .drawBehind {
                val glowAlpha = 1f - 0.6f * dim.value / DIM
                drawRect(
                    Brush.radialGradient(
                        listOf(t.glow.copy(alpha = t.glow.alpha * glowAlpha), t.glow.copy(alpha = 0f)),
                        center = center,
                        radius = size.minDimension * 0.75f,
                    ),
                    topLeft = Offset(center.x - size.minDimension * 0.75f, center.y - size.minDimension * 0.75f),
                    size = Size(size.minDimension * 1.5f, size.minDimension * 1.5f),
                )
            },
        contentAlignment = Alignment.Center,
    ) {
        Canvas(Modifier.fillMaxSize().graphicsLayer { scaleX = scale; scaleY = scale }) {
            fun grey(c: Color) = lerp(c, t.bgMid, dim.value)
            val c1 = grey(t.orb1)
            val c2 = grey(t.orb2)
            val c3 = grey(t.orb3)
            val m = size.minDimension
            val mid = Offset(size.width / 2, size.height / 2)
            fun centre(fx: Float, fy: Float): Offset {
                val dx = size.width * fx - mid.x
                val dy = size.height * fy - mid.y
                return Offset(mid.x + dx * cos(turn) - dy * sin(turn), mid.y + dx * sin(turn) + dy * cos(turn))
            }
            fun blob(colour: Color, at: Offset, radius: Float) =
                Brush.radialGradient(listOf(colour, colour.copy(alpha = 0f)), center = at, radius = radius)
            clipPath(blobPath(size, phase, 0.42f)) {
                drawRect(lerp(c2, c3, 0.5f))
                drawRect(blob(c3, centre(0.45f, 0.75f), m * 0.45f))
                drawRect(blob(c2, centre(0.7f, 0.4f), m * 0.30f))
                drawRect(blob(c1, centre(0.3f, 0.3f), m * 0.35f))
                drawRect(
                    Brush.radialGradient(
                        0.55f to Color.Black.copy(alpha = 0f),
                        1f to Color.Black.copy(alpha = 0.45f),
                        center = Offset(size.width * 0.4f, size.height * 0.4f),
                        radius = m * 0.7f,
                    ),
                )
                drawRect(
                    Brush.radialGradient(
                        listOf(Color.White.copy(alpha = 0.18f), Color.White.copy(alpha = 0f)),
                        center = Offset(size.width * 0.32f, size.height * 0.28f),
                        radius = m * 0.3f,
                    ),
                )
            }
        }
        CompositionLocalProvider(LocalContentColor provides if (score == null) t.text else t.onOrb) { content() }
    }
}

private fun blobPath(size: Size, phase: Float, radiusFraction: Float): Path {
    val c = Offset(size.width / 2, size.height / 2)
    val base = size.minDimension * radiusFraction
    val n = 8
    val pts = List(n) { i ->
        val a = i * 2f * PI.toFloat() / n
        val r = base * (1 + 0.06f * sin(phase + i * 1.7f) + 0.04f * cos(2 * phase - i))
        Offset(c.x + r * cos(a), c.y + r * sin(a))
    }
    return Path().apply {
        moveTo(pts[0].x, pts[0].y)
        for (i in 0 until n) {
            val p0 = pts[(i - 1 + n) % n]
            val p1 = pts[i]
            val p2 = pts[(i + 1) % n]
            val p3 = pts[(i + 2) % n]
            cubicTo(
                p1.x + (p2.x - p0.x) / 6, p1.y + (p2.y - p0.y) / 6,
                p2.x - (p3.x - p1.x) / 6, p2.y - (p3.y - p1.y) / 6,
                p2.x, p2.y,
            )
        }
        close()
    }
}
