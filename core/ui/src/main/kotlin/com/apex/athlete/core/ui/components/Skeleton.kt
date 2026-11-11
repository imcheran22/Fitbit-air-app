package com.apex.athlete.core.ui.components

import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.state.rememberReducedMotion
import com.apex.athlete.core.ui.theme.ApexDial
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexTheme

/** Pulsing alpha shared by skeletons. A constant 1 when the user removed animations. */
@Composable
internal fun rememberSkeletonAlpha(): State<Float> {
    val reduced = rememberReducedMotion()
    if (reduced) return remember { mutableFloatStateOf(1f) }
    val transition = rememberInfiniteTransition(label = "skeleton")
    return transition.animateFloat(
        initialValue = 0.55f,
        targetValue = 1f,
        animationSpec = infiniteRepeatable(tween(900, easing = LinearEasing), RepeatMode.Reverse),
        label = "skeletonAlpha",
    )
}

/** A placeholder block in the final shape of the thing it stands for. Decorative: no semantics. */
@Composable
fun Skeleton(modifier: Modifier = Modifier, shape: Shape = ApexShapes.bar) {
    val alpha = rememberSkeletonAlpha()
    val fill = ApexTheme.colors.fillPressed
    Box(
        modifier
            .clip(shape)
            .drawBehind { drawRect(color = fill, alpha = alpha.value) },
    )
}

/** A text-line skeleton. */
@Composable
fun SkeletonLine(width: Dp, modifier: Modifier = Modifier, height: Dp = 12.dp) {
    Skeleton(modifier.width(width).height(height), ApexShapes.bar)
}

/** Full-width text-line skeleton. */
@Composable
fun SkeletonLineFill(modifier: Modifier = Modifier, height: Dp = 12.dp) {
    Skeleton(modifier.fillMaxWidth().height(height), ApexShapes.bar)
}

/** Ring skeleton at a dial's diameter and stroke. */
@Composable
fun SkeletonRing(diameter: Dp, stroke: Dp, modifier: Modifier = Modifier) {
    val alpha = rememberSkeletonAlpha()
    val color = ApexTheme.colors.dialTrack
    val strokePx = with(LocalDensity.current) { stroke.toPx() }
    val style = remember(strokePx) { Stroke(width = strokePx) }
    Box(
        modifier
            .size(diameter)
            .drawBehind {
                val inset = strokePx / 2f
                drawArc(
                    color = color,
                    startAngle = 0f,
                    sweepAngle = 360f,
                    useCenter = false,
                    topLeft = Offset(inset, inset),
                    size = Size(size.width - strokePx, size.height - strokePx),
                    alpha = alpha.value,
                    style = style,
                )
            },
    )
}

@Composable
fun SkeletonDial(modifier: Modifier = Modifier, diameter: Dp = ApexDial.homeDiameter, stroke: Dp = ApexDial.homeStroke) {
    SkeletonRing(diameter, stroke, modifier)
}

@Preview(name = "Skeleton dark")
@Composable
private fun SkeletonPreviewDark() = ApexPreview(dark = true) { SkeletonPreviewBody() }

@Preview(name = "Skeleton light")
@Composable
private fun SkeletonPreviewLight() = ApexPreview(dark = false) { SkeletonPreviewBody() }

@Composable
private fun SkeletonPreviewBody() {
    Column {
        SkeletonLine(120.dp)
        Spacer(Modifier.height(8.dp))
        SkeletonLineFill()
        Spacer(Modifier.height(8.dp))
        SkeletonRing(56.dp, 5.dp)
    }
}
