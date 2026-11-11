package com.apex.athlete.core.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import com.apex.athlete.core.ui.state.rememberReducedMotion
import com.apex.athlete.core.ui.theme.ApexMotion
import com.apex.athlete.core.ui.theme.ApexSpacing

/** Press feedback: scale to 0.96 over 150 ms (DESIGN_SYSTEM.md section 2.6). Snaps under reduced motion. */
@Composable
fun Modifier.pressScale(interactionSource: InteractionSource): Modifier {
    val pressed by interactionSource.collectIsPressedAsState()
    val reduced = rememberReducedMotion()
    val scale by animateFloatAsState(
        targetValue = if (pressed) ApexMotion.PRESS_SCALE else 1f,
        animationSpec = if (reduced) snap() else tween(ApexMotion.FAST_MS, easing = ApexMotion.standard),
        label = "pressScale",
    )
    return this.graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}

/** Guarantees the 48 dp minimum touch target (Apex brief, stricter than the reference's 44). */
fun Modifier.minTouchTarget(): Modifier =
    this.sizeIn(minWidth = ApexSpacing.minTouch, minHeight = ApexSpacing.minTouch)

/**
 * Clickable with press scale and no ripple (the look is a scale, not a Material ripple).
 * [description], when set, becomes the merged TalkBack text of the whole node.
 */
@Composable
fun Modifier.apexClickable(
    onClick: () -> Unit,
    role: Role = Role.Button,
    enabled: Boolean = true,
    onClickLabel: String? = null,
    interactionSource: MutableInteractionSource = remember { MutableInteractionSource() },
): Modifier = this
    .pressScale(interactionSource)
    .clickable(
        interactionSource = interactionSource,
        indication = null,
        enabled = enabled,
        onClickLabel = onClickLabel,
        role = role,
        onClick = onClick,
    )

/** Merges the node and gives it one TalkBack sentence. Pair with [hideFromTalkBack] on visual children. */
fun Modifier.spoken(description: String): Modifier =
    this.semantics(mergeDescendants = true) { contentDescription = description }

/** Removes a decorative subtree from TalkBack (its information is in the parent's description). */
fun Modifier.hideFromTalkBack(): Modifier = this.clearAndSetSemantics { }

/**
 * Animates 0 -> [target] with [durationMs]; on later changes continues from the current value.
 * Snaps when the user removed animations. Read `.value` in the draw phase only.
 */
@Composable
fun rememberSweep(target: Float, durationMs: Int = ApexMotion.DIAL_SWEEP_MS): State<Float> {
    val reduced = rememberReducedMotion()
    val anim = remember { Animatable(0f) }
    LaunchedEffect(target, reduced) {
        if (reduced) {
            anim.snapTo(target)
        } else {
            anim.animateTo(target, tween(durationMs, easing = ApexMotion.standard))
        }
    }
    return anim.asState()
}
