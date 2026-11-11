package org.openstrap.app.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentWidth
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.isSpecified

/** From this width a settings page opens beside the list of them: the list is short rows, so it can be narrow. */
val SidePaneWidth = 600.dp

/** From this width a detail opens beside a dashboard: two phone-width (360 dp and up) screens side by side. */
val SideBySideWidth = 720.dp

/**
 * A screen and what it opens. On a phone it's [StackContent]: the card tapped on [list] grows into the screen it
 * opens, and anything else crossfades. From [minWidth] the opened screen sits in a pane on the right and [list] stays
 * on the left, narrower, so you can tap through one thing after another; back closes the pane. [list] keeps its
 * scroll position either way: on a phone its saved state is held while it's away.
 *
 * [isOpen] says whether a [target] has anything to show in the pane, [keys] its saved keys, deepest last (empty for
 * [list]). With the pane closed, [closedMaxWidth] keeps [list] from stretching across the whole window.
 */
@Composable
fun <S> ListDetail(
    target: S,
    isOpen: (S) -> Boolean,
    keys: (S) -> List<String>,
    minWidth: Dp = SidePaneWidth,
    closedMaxWidth: Dp = Dp.Unspecified,
    detail: @Composable (S) -> Unit,
    list: @Composable () -> Unit,
) {
    BoxWithConstraints(Modifier.fillMaxSize()) {
        if (maxWidth < minWidth) {
            // The root leaves the tree while a screen is open over it; its scroll position and the like wait here.
            val saved = rememberSaveableStateHolder()
            StackContent(target, keys) { if (isOpen(it)) detail(it) else saved.SaveableStateProvider("root") { list() } }
            return@BoxWithConstraints
        }
        val open = isOpen(target)
        // Half the window, up to a little more than a phone: the opened screens were laid out for a phone.
        val pane = (maxWidth / 2).coerceAtMost(480.dp)
        Row(Modifier.fillMaxSize()) {
            Box(
                Modifier.weight(1f).fillMaxHeight()
                    .let { if (!open && closedMaxWidth.isSpecified) it.wrapContentWidth().widthIn(max = closedMaxWidth) else it },
            ) { list() }
            AnimatedVisibility(open) {
                Box(Modifier.width(pane).fillMaxHeight()) {
                    StackContent(target, keys) { if (isOpen(it)) detail(it) }
                }
            }
        }
    }
}
