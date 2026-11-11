package org.openstrap.app.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.graphics.graphicsLayer

/** Motion timings: short enough that nothing waits on an animation. */
object Motion {
    /** Small state changes: colours, press feedback, selection. */
    const val QUICK = 140
    /** Moving between screens. */
    const val SWIFT = 240
    val easing = FastOutSlowInEasing
}

/**
 * Swaps screens like a navigation stack: a deeper [target] (by [depth]) slides in from the right, going
 * back slides the previous screen in from the left. Both fade, and travel only a fraction of the width.
 */
@Composable
fun <S> PushContent(target: S, depth: (S) -> Int, modifier: Modifier = Modifier, content: @Composable (S) -> Unit) {
    AnimatedContent(
        target,
        modifier,
        transitionSpec = {
            val forward = depth(targetState) >= depth(initialState)
            val enter = tween<androidx.compose.ui.unit.IntOffset>(Motion.SWIFT, easing = Motion.easing)
            (slideInHorizontally(enter) { if (forward) it / 4 else -it / 4 } + fadeIn(tween(Motion.SWIFT))) togetherWith
                (slideOutHorizontally(enter) { if (forward) -it / 8 else it / 4 } + fadeOut(tween(Motion.QUICK)))
        },
        label = "screen",
    ) { content(it) }
}

/** Clickable that also shrinks slightly while pressed, so taps feel physical; [shape] clips it and the ripple. */
fun Modifier.pressClickable(onClick: () -> Unit, shape: androidx.compose.ui.graphics.Shape? = null, scale: Float = 0.97f): Modifier = composed {
    val interaction = remember { MutableInteractionSource() }
    val pressed by interaction.collectIsPressedAsState()
    val s by animateFloatAsState(if (pressed) scale else 1f, tween(Motion.QUICK, easing = Motion.easing), label = "press")
    graphicsLayer {
        scaleX = s; scaleY = s
        if (shape != null) { this.shape = shape; clip = true }
    }.clickable(interactionSource = interaction, indication = androidx.compose.material3.ripple(), onClick = onClick)
}
