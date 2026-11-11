package org.openstrap.app.ui.components

import android.database.ContentObserver
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.BoundsTransform
import androidx.compose.animation.ContentTransform
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.SharedTransitionLayout
import androidx.compose.animation.SharedTransitionScope
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.VisibilityThreshold
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.updateTransition
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.Saver
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.RectangleShape
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import kotlinx.coroutines.launch

/**
 * Card to detail (spec 3.5): the card tapped grows into the detail it opens, its number becoming the detail's
 * headline, and back shrinks it home. Only the card pressed takes part, so a detail several cards open grows out of
 * the one you tapped. Which motion a change shows, and who takes part, is decided in [CardMotion].
 */

/** The cards pressed on each page of one tab's stack; kept across process death, so back still lands on its card. */
class CardTaps internal constructor(initial: Map<Int, CardTap>) {
    var taps: Map<Int, CardTap> by mutableStateOf(initial)

    companion object {
        val Saver: Saver<CardTaps, String> = Saver(save = { CardMotion.save(it.taps) }, restore = { CardTaps(CardMotion.restore(it)) })
    }
}

/** What a screen inside a tab's stack needs to take part: provided by [StackContent] to each screen it shows. */
class CardShare internal constructor(
    internal val scope: SharedTransitionScope,
    internal val visibility: AnimatedVisibilityScope,
    internal val taps: CardTaps,
    /** The stack this screen is the top of (saved keys); empty for the tab's root. */
    internal val page: List<String>,
    private val motionState: State<StackMotion>,
    internal val bounds: BoundsTransform,
) {
    internal val motion: StackMotion get() = motionState.value
    /** This screen's depth in the stack, as its cards record it. */
    internal val depth: Int get() = page.size
}

/** The screen's share in the card to detail motion; null outside a tab's stack or with animations off. */
val LocalCardShare = compositionLocalOf<CardShare?> { null }

/**
 * False where a card's tap opens a detail without growing: the rows inside a detail (Related rows), which crossfade
 * to the next detail instead (spec 3.5).
 */
val LocalCardsGrow = compositionLocalOf { true }

/** The numbers a card shows, so the one number it has can travel with it; provided by the card to its content. */
class CardNumbers internal constructor(internal val source: Long, internal val depth: Int) {
    private val values = mutableStateMapOf<Any, String>()

    /** The card's number, when it shows exactly one. */
    val number: String? get() = values.values.singleOrNull()

    internal fun put(token: Any, value: String) { values[token] = value }
    internal fun remove(token: Any) { values.remove(token) }
}

val LocalCardNumbers = compositionLocalOf<CardNumbers?> { null }

/** A card that opens something, ready to take part: its surface's modifier, its click, and its numbers. */
class CardOpening internal constructor(val modifier: Modifier, val onClick: () -> Unit, val numbers: CardNumbers)

/**
 * For a card with [onClick]: records the press (before any click, so the card is ready when its detail opens) and
 * the click, and while it's the card pressed, shares its surface, clipped to [shape]. Null when there's nothing to
 * take part in: no click, outside a tab's stack, or animations off.
 */
@Composable
fun cardOpening(onClick: (() -> Unit)?, shape: Shape = RectangleShape): CardOpening? {
    val share = LocalCardShare.current
    if (onClick == null || share == null || !LocalCardsGrow.current) return null
    // Who this card is on its page: saved, so after process death back still finds the card that opened the detail.
    val source = rememberSaveable { kotlin.random.Random.nextLong() }
    val depth = share.depth
    val holder = share.taps
    val numbers = remember(source, depth) { CardNumbers(source, depth) }
    val scope = rememberCoroutineScope()
    val click by rememberUpdatedState(onClick)
    val press = Modifier.pointerInput(holder, source, depth) {
        awaitEachGesture {
            awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
            holder.taps = CardMotion.press(holder.taps, CardTap(source, depth, numbers.number))
        }
    }
    val opened: () -> Unit = {
        holder.taps = CardMotion.click(holder.taps, depth, source)
        click()
        // A click that opened nothing over this page (an info sheet, a page over the tab) stops waiting after a frame.
        scope.launch {
            withFrameNanos { }
            withFrameNanos { }
            holder.taps = CardMotion.expire(holder.taps, depth, source)
        }
    }
    val shared = if (CardMotion.cardTakesPart(holder.taps[depth], source, depth, share.motion)) with(share.scope) {
        Modifier.sharedBounds(
            rememberSharedContentState(CardMotion.surfaceKey(depth)), share.visibility,
            boundsTransform = share.bounds,
            resizeMode = SharedTransitionScope.ResizeMode.scaleToBounds(ContentScale.FillWidth, Alignment.TopCenter),
            clipInOverlayDuringTransition = OverlayClip(shape),
        )
    } else Modifier
    return CardOpening(press.then(shared), opened, numbers)
}

/**
 * A card's number ([value]): registered with the card, and while the card is the one pressed and the detail's
 * headline is the same text, it moves into the headline.
 */
@Composable
fun Modifier.cardNumber(value: String?): Modifier {
    val numbers = LocalCardNumbers.current ?: return this
    if (value == null) return this
    val token = remember { Any() }
    DisposableEffect(numbers, value) {
        numbers.put(token, value)
        onDispose { numbers.remove(token) }
    }
    val share = LocalCardShare.current ?: return this
    val tap = share.taps.taps[numbers.depth]
    if (!CardMotion.cardTakesPart(tap, numbers.source, numbers.depth, share.motion) || !CardMotion.sharesNumber(tap, value)) return this
    return numberBounds(share, numbers.depth)
}

/**
 * The detail's surface: its hero when [hero] (the metric template), else the whole page. Takes part when the card
 * pressed on the page under it opened this detail.
 */
@Composable
fun Modifier.detailSurface(hero: Boolean, shape: Shape = RectangleShape): Modifier {
    val share = LocalCardShare.current ?: return this
    val key = share.page.lastOrNull() ?: return this
    if (CardMotion.surfaceInHero(key) != hero || !CardMotion.detailTakesPart(share.taps.taps, share.page, share.motion)) return this
    return with(share.scope) {
        this@detailSurface.sharedBounds(
            rememberSharedContentState(CardMotion.surfaceKey(share.depth - 1)), share.visibility,
            boundsTransform = share.bounds,
            resizeMode = SharedTransitionScope.ResizeMode.scaleToBounds(ContentScale.FillWidth, Alignment.TopCenter),
            clipInOverlayDuringTransition = OverlayClip(shape),
        )
    }
}

/** The detail's headline number ([value]): the card's number arrives here when it's the same text. */
@Composable
fun Modifier.detailNumber(value: String?): Modifier {
    val share = LocalCardShare.current ?: return this
    if (share.page.isEmpty() || !CardMotion.detailTakesPart(share.taps.taps, share.page, share.motion)) return this
    if (!CardMotion.sharesNumber(share.taps.taps[share.depth - 1], value)) return this
    return numberBounds(share, share.depth - 1)
}

/** The number's shared bounds: the two renderings of the same text crossfade while scaling, above the surface. */
@Composable
private fun Modifier.numberBounds(share: CardShare, depth: Int): Modifier = with(share.scope) {
    this@numberBounds.sharedBounds(
        rememberSharedContentState(CardMotion.numberKey(depth)), share.visibility,
        boundsTransform = share.bounds,
        resizeMode = SharedTransitionScope.ResizeMode.scaleToBounds(ContentScale.Fit, Alignment.BottomStart),
        zIndexInOverlay = 1f,
    )
}

/**
 * A tab's stack, one screen at a time: the card tapped grows into its detail and back shrinks it home; any other
 * change crossfades (the detail switcher, Related rows, a deep link), and with the system's animations off every
 * change jumps (spec 3.5). [keys] gives a target's saved keys, deepest last, empty for the tab's root.
 */
@Composable
fun <S> StackContent(target: S, keys: (S) -> List<String>, modifier: Modifier = Modifier, content: @Composable (S) -> Unit) {
    val animate = rememberAnimationsOn()
    val holder = rememberSaveable(saver = CardTaps.Saver) { CardTaps(emptyMap()) }
    val transition = updateTransition(target, label = "stack")
    val from = keys(transition.currentState)
    val to = keys(transition.targetState)
    val motion = rememberUpdatedState(CardMotion.of(from, to, holder.taps, animate))
    val bounds = remember(motion) {
        BoundsTransform { _, _ ->
            spring(Spring.DampingRatioNoBouncy, CardMotion.stiffness(motion.value), Rect.VisibilityThreshold)
        }
    }
    SideEffect {
        val next = CardMotion.settle(holder.taps, to, settled = from == to)
        if (next != holder.taps) holder.taps = next
    }
    SharedTransitionLayout(modifier) {
        transition.AnimatedContent(
            transitionSpec = { stackTransform(CardMotion.of(keys(initialState), keys(targetState), holder.taps, animate)) },
        ) { state ->
            val page = keys(state)
            val share = if (animate) CardShare(this@SharedTransitionLayout, this, holder, page, motion, bounds) else null
            CompositionLocalProvider(LocalCardShare provides share) {
                // A detail without the metric template's hero: the card grows into the whole page.
                Box(Modifier.fillMaxSize().detailSurface(hero = false)) { content(state) }
            }
        }
    }
}

/** Fades for a change of screen, springs with no bounce; nothing at all when it jumps. */
private fun stackTransform(motion: StackMotion): ContentTransform {
    if (motion == StackMotion.Jump || motion == StackMotion.Idle) return ContentTransform(EnterTransition.None, ExitTransition.None, sizeTransform = null)
    val stiffness = CardMotion.stiffness(motion)
    return ContentTransform(
        fadeIn(spring(Spring.DampingRatioNoBouncy, stiffness)), fadeOut(spring(Spring.DampingRatioNoBouncy, stiffness)), sizeTransform = null,
    )
}

/**
 * False while the system's animator duration scale is 0 (animations off in developer options or for accessibility):
 * screens then jump to their end state. Follows the setting while the app is open.
 */
@Composable
fun rememberAnimationsOn(): Boolean {
    val context = LocalContext.current
    val resolver = context.contentResolver
    fun read() = Settings.Global.getFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, 1f) > 0f
    var on by remember(resolver) { mutableStateOf(read()) }
    DisposableEffect(resolver) {
        val observer = object : ContentObserver(Handler(Looper.getMainLooper())) {
            override fun onChange(selfChange: Boolean) { on = read() }
        }
        resolver.registerContentObserver(Settings.Global.getUriFor(Settings.Global.ANIMATOR_DURATION_SCALE), false, observer)
        onDispose { resolver.unregisterContentObserver(observer) }
    }
    return on
}
