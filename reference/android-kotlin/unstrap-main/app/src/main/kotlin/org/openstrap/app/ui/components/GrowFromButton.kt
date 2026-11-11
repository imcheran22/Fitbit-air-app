package org.openstrap.app.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.geometry.lerp
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/*
 * Avatar to You, strap chip to Strap (spec 3.5): the page over the tab grows out of the round button tapped, and
 * closing it shrinks it back in, as a container transform. The same springs as card to detail, 500 in and 300 out,
 * with no bounce.
 */

/**
 * The header button a page over the tab was last opened from, in the window's coordinates. A button records itself
 * as it's tapped ([growClick]); [take] hands it to the page opening and clears it, so a page opened any other way
 * (Profile from a card, the Strap page from the pairing card) has no button to grow from and fades in.
 */
class GrowOrigin {
    private var tapped: Rect? = null

    internal fun tap(bounds: Rect?) { tapped = bounds }

    fun take(): Rect? = tapped.also { tapped = null }
}

val LocalGrowOrigin = staticCompositionLocalOf<GrowOrigin?> { null }

/** A button's [onClick] that first records where the button is, for the page it opens to grow from; and its modifier. */
class GrowClick internal constructor(val modifier: Modifier, val onClick: () -> Unit)

@Composable
fun growClick(onClick: () -> Unit): GrowClick {
    val origin = LocalGrowOrigin.current
    val click by rememberUpdatedState(onClick)
    val bounds = remember { arrayOfNulls<Rect>(1) }
    return remember(origin) {
        GrowClick(Modifier.onGloballyPositioned { bounds[0] = it.boundsInRoot() }) { origin?.tap(bounds[0]); click() }
    }
}

/**
 * How far a page has grown out of its button, as a container transform: the outline goes from the button to the page,
 * the page's content scales with it (to the outline's width) and is clipped to it, and the tab behind dims and sinks.
 */
object GrowMotion {
    /** The surface comes up over this first bit of the way, so the button turns into it rather than flashing. */
    const val SURFACE_PART = 0.06f
    /** The content fades in over this stretch, once the outline has some size to show it in. */
    const val CONTENT_FROM = 0.15f
    const val CONTENT_TO = 0.45f
    /** The outline keeps a card's round corners until this far, then squares off to the screen. */
    const val SQUARE_FROM = 0.85f
    /** The tab behind at the page fully open: dimmed by this much black, and scaled down to this. */
    const val SCRIM = 0.5f
    const val SINK = 0.94f

    /**
     * The page's outline at [progress] (0 the button, 1 the page): the rect between them, round as the button at the
     * start, easing to [cornerRadius] (a card's) on the way and square only at the end.
     */
    fun outline(from: Rect, page: Rect, progress: Float, cornerRadius: Float = 0f): RoundRect {
        val p = progress.coerceIn(0f, 1f)
        val r = lerp(from, page, p)
        val button = from.minDimension / 2f
        val radius = if (p < SQUARE_FROM) button + (cornerRadius - button) * (p / SQUARE_FROM)
        else cornerRadius * (1f - (p - SQUARE_FROM) / (1f - SQUARE_FROM))
        return RoundRect(r, CornerRadius(radius.coerceAtLeast(0f)))
    }

    /** The page's surface: up at once, so it reads as the button growing. */
    fun alpha(progress: Float): Float = (progress / SURFACE_PART).coerceIn(0f, 1f)

    /** The page's content: none while the outline is button sized, all of it before half way. */
    fun contentAlpha(progress: Float): Float = ((progress - CONTENT_FROM) / (CONTENT_TO - CONTENT_FROM)).coerceIn(0f, 1f)

    /** The scale the content is drawn at inside an outline [outlineWidth] wide on a page [pageWidth] wide. */
    fun contentScale(outlineWidth: Float, pageWidth: Float): Float = if (pageWidth <= 0f) 1f else (outlineWidth / pageWidth).coerceIn(0.01f, 1f)

    fun scrim(progress: Float): Float = SCRIM * progress.coerceIn(0f, 1f)

    fun sink(progress: Float): Float = 1f - (1f - SINK) * progress.coerceIn(0f, 1f)

    /** Spring stiffness opening (500) and closing (300), as card to detail. */
    fun stiffness(opening: Boolean): Float = if (opening) CardMotion.STIFFNESS_IN else CardMotion.STIFFNESS_OUT
}

/** How far the page over the tab is open, shared by [GrowFromButton] and the tab behind it ([sinkBehind]). */
class GrowProgress internal constructor(open: Boolean) {
    internal val anim = Animatable(if (open) 1f else 0f)
    val value: Float get() = anim.value
}

@Composable
fun rememberGrowProgress(open: Boolean): GrowProgress = remember { GrowProgress(open) }

/** The tab behind a growing page: it sinks a little as the page comes forward (the dimming is the page's scrim). */
fun Modifier.sinkBehind(progress: GrowProgress): Modifier = graphicsLayer {
    val s = GrowMotion.sink(progress.value)
    scaleX = s; scaleY = s
}

/**
 * [content] while [visible], growing out of [from] (a button's bounds in the window) as it turns visible and shrinking
 * back into it as it turns hidden; with no [from] it fades. The outline goes from the button, on [buttonColor], to the
 * page, round as a card ([cornerRadius]) until the end, with the content scaled to it and fading in once it has some
 * size; a scrim dims what's behind. [content] stays composed until it has shrunk away, told it's closing meanwhile
 * (so the caller can keep back away from a page on its way out). With the system's animations off it jumps.
 */
@Composable
fun GrowFromButton(
    visible: Boolean,
    from: Rect?,
    modifier: Modifier = Modifier,
    progress: GrowProgress = rememberGrowProgress(visible),
    buttonColor: Color = Color(0xFF1F1F22),
    pageColor: Color = Color.Black,
    cornerRadius: Dp = 28.dp,
    content: @Composable (closing: Boolean) -> Unit,
) {
    val animate = rememberAnimationsOn()
    val anim = progress.anim
    LaunchedEffect(visible, animate) {
        val target = if (visible) 1f else 0f
        if (!animate) anim.snapTo(target)
        else anim.animateTo(target, spring(Spring.DampingRatioNoBouncy, GrowMotion.stiffness(visible)))
    }
    val shrunk by remember { derivedStateOf { anim.value == 0f && !anim.isRunning } }
    if (!visible && shrunk) return
    val self = remember { arrayOf(Rect.Zero) }
    val origin by rememberUpdatedState(from)
    Box(modifier.onGloballyPositioned { self[0] = it.boundsInRoot() }) {
        Box(Modifier.matchParentSize().drawBehind { drawRect(Color.Black, alpha = GrowMotion.scrim(anim.value)) })
        Box(
            Modifier.fillMaxSize().graphicsLayer {
                val p = anim.value
                val start = origin?.translate(-self[0].topLeft)
                if (start == null || p >= 1f) {
                    alpha = if (start == null) p else 1f
                    return@graphicsLayer
                }
                // The content laid out at the page's size, scaled to the outline's width and moved onto it, then
                // clipped to the outline in its own (unscaled) coordinates.
                val o = GrowMotion.outline(start, Rect(Offset.Zero, size), p, cornerRadius.toPx())
                val k = GrowMotion.contentScale(o.width, size.width)
                transformOrigin = TransformOrigin(0f, 0f)
                scaleX = k; scaleY = k
                translationX = o.left; translationY = o.top
                alpha = GrowMotion.alpha(p)
                shape = GrowShape(RoundRect(0f, 0f, size.width, o.height / k, CornerRadius(o.topLeftCornerRadius.x / k)))
                clip = true
            }.drawBehind {
                // The surface turns from the button's colour to the page's while the content is still coming in.
                drawRect(androidx.compose.ui.graphics.lerp(buttonColor, pageColor, GrowMotion.contentAlpha(anim.value)))
            },
        ) {
            Box(Modifier.fillMaxSize().graphicsLayer { alpha = if (origin == null) 1f else GrowMotion.contentAlpha(anim.value) }) { content(!visible) }
        }
    }
}

/** A clip of exactly [outline], wherever the layer is. */
private class GrowShape(private val outline: RoundRect) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline = Outline.Rounded(outline)
}
