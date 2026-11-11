package com.apex.athlete.core.ui.shell

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.ExitTransition
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.DialVariant
import com.apex.athlete.core.ui.components.MiniRing
import com.apex.athlete.core.ui.components.apexClickable
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.rememberReducedMotion
import com.apex.athlete.core.ui.theme.ApexMotion
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/** State of the sync dot next to the header sync text. Colour is backed by the text and the description. */
enum class SyncStatus { Ok, Syncing, Stale, Error }

/**
 * Overview header (Pulse 4.3). Top row: profile, date pill, sync text + dot. The ring row (mini rings in
 * [ringRow]) fades and expands in when [ringsVisible] turns true, i.e. once the big dials scroll away; the
 * caller derives that from scroll state. Place it over the scrolling content in a Box: the fill is the page
 * ground, so scrolled content passes beneath it. Reduced motion: no transition.
 */
@Composable
fun HomeHeader(
    dateLabel: String,
    onPreviousDay: () -> Unit,
    onNextDay: () -> Unit,
    onDateClick: () -> Unit,
    previousDayDescription: String,
    nextDayDescription: String,
    syncText: String,
    syncStatus: SyncStatus,
    syncDescription: String,
    onSyncClick: () -> Unit,
    profileDescription: String,
    onProfileClick: () -> Unit,
    modifier: Modifier = Modifier,
    canGoNext: Boolean = true,
    ringsVisible: Boolean = false,
    ringRow: @Composable RowScope.() -> Unit = {},
) {
    val ground = rememberGroundBrush()
    val reduced = rememberReducedMotion()
    Column(
        modifier
            .fillMaxWidth()
            .drawBehind { drawRect(ground) }
            .windowInsetsPadding(WindowInsets.statusBars),
    ) {
        Row(
            Modifier.fillMaxWidth().height(ApexSpacing.minTouch + 4.dp).padding(horizontal = ApexSpacing.gutter - 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterStart) {
                Box(
                    Modifier
                        .size(ApexSpacing.minTouch)
                        .apexClickable(onClick = onProfileClick, role = Role.Button)
                        .semantics { contentDescription = profileDescription },
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(ApexIcons.Profile, null, Modifier.size(28.dp), tint = ApexTheme.colors.foreground)
                }
            }
            DatePill(
                label = dateLabel,
                onPrevious = onPreviousDay,
                onNext = onNextDay,
                onLabelClick = onDateClick,
                canGoNext = canGoNext,
                previousDescription = previousDayDescription,
                nextDescription = nextDayDescription,
            )
            Box(Modifier.weight(1f), contentAlignment = Alignment.CenterEnd) {
                SyncIndicator(syncText, syncStatus, syncDescription, onSyncClick)
            }
        }
        AnimatedVisibility(
            visible = ringsVisible,
            enter = if (reduced) EnterTransition.None else fadeIn(tween(ApexMotion.BASE_MS, easing = ApexMotion.outExpo)) + expandVertically(tween(ApexMotion.BASE_MS, easing = ApexMotion.outExpo)),
            exit = if (reduced) ExitTransition.None else fadeOut(tween(ApexMotion.FAST_MS)) + shrinkVertically(tween(ApexMotion.FAST_MS)),
        ) {
            Row(
                Modifier.fillMaxWidth().padding(horizontal = ApexSpacing.gutter),
                horizontalArrangement = Arrangement.SpaceEvenly,
                verticalAlignment = Alignment.CenterVertically,
                content = ringRow,
            )
        }
    }
}

@Composable
private fun SyncIndicator(text: String, status: SyncStatus, description: String, onClick: () -> Unit) {
    val colors = ApexTheme.colors
    val dot = when (status) {
        SyncStatus.Ok -> colors.optimal
        SyncStatus.Syncing -> colors.coach
        SyncStatus.Stale -> colors.warning
        SyncStatus.Error -> colors.recoveryRed
    }
    Row(
        Modifier
            .height(ApexSpacing.minTouch)
            .apexClickable(onClick = onClick, role = Role.Button)
            .semantics { contentDescription = description }
            .padding(horizontal = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(text, style = ApexTheme.type.headerSync, color = colors.foregroundSecondary, modifier = Modifier.hideFromTalkBack())
        Box(Modifier.hideFromTalkBack()) {
            Icon(ApexIcons.Sync, null, Modifier.size(22.dp), tint = colors.foregroundSecondary)
            Box(
                Modifier
                    .align(Alignment.TopEnd)
                    .size(8.dp)
                    .background(dot, CircleShape),
            )
        }
    }
}

@Preview(name = "HomeHeader dark")
@Composable
private fun HomeHeaderPreviewDark() = ApexPreview(dark = true) { HomeHeaderPreviewBody() }

@Preview(name = "HomeHeader light")
@Composable
private fun HomeHeaderPreviewLight() = ApexPreview(dark = false) { HomeHeaderPreviewBody() }

@Composable
private fun HomeHeaderPreviewBody() {
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    HomeHeader(
        dateLabel = "Today",
        onPreviousDay = {}, onNextDay = {}, onDateClick = {},
        previousDayDescription = "Previous day", nextDayDescription = "Next day",
        syncText = "1m", syncStatus = SyncStatus.Ok, syncDescription = "Synced 1 minute ago",
        onSyncClick = {}, profileDescription = "More and settings", onProfileClick = {},
        canGoNext = false, ringsVisible = true,
        ringRow = {
            MiniRing(MetricState.Value(90.0, 0, "%", derived, "now"), DialVariant.Sleep, "Sleep", Modifier.weight(1f))
            MiniRing(MetricState.Value(94.0, 0, "%", derived, "now"), DialVariant.Recovery, "Recovery", Modifier.weight(1f))
            MiniRing(MetricState.Value(9.4, 1, null, derived, "now"), DialVariant.Strain, "Strain", Modifier.weight(1f))
        },
    )
}
