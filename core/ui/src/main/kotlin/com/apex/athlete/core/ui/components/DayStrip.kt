package com.apex.athlete.core.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.background
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.rememberReducedMotion
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.RecoveryBand
import com.apex.athlete.core.ui.theme.recoveryFill

/**
 * The date pill: previous, a label, next (Pulse 4.3.1). Visual height 32 dp, every control a 48 dp target.
 * Next is disabled (dimmed, not clickable) when [canGoNext] is false, e.g. on today. Labels are passed in.
 */
@Composable
fun DatePill(
    label: String,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onLabelClick: () -> Unit,
    modifier: Modifier = Modifier,
    canGoNext: Boolean = true,
    canGoPrevious: Boolean = true,
    previousDescription: String,
    nextDescription: String,
    labelClickDescription: String? = null,
) {
    val colors = ApexTheme.colors
    val track = colors.fillFaint
    val segment = colors.fillHover
    Row(
        modifier
            .height(ApexSpacing.minTouch)
            .drawBehind {
                val h = 32.dp.toPx()
                drawRoundRect(track, Offset(0f, (size.height - h) / 2f), Size(size.width, h), CornerRadius(h / 2f))
            },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        PillChevron(ApexIcons.ChevronLeft, previousDescription, canGoPrevious, onPrevious)
        Box(
            Modifier
                .height(ApexSpacing.minTouch)
                .widthIn(min = 96.dp)
                .apexClickable(onClick = onLabelClick, role = Role.Button, onClickLabel = labelClickDescription)
                .drawBehind {
                    val h = 28.dp.toPx()
                    drawRoundRect(segment, Offset(0f, (size.height - h) / 2f), Size(size.width, h), CornerRadius(h / 2f))
                },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                label.uppercase(),
                style = ApexTheme.type.datePill,
                color = colors.foreground,
                textAlign = TextAlign.Center,
                maxLines = 1,
                modifier = Modifier.padding(horizontal = 16.dp),
            )
        }
        PillChevron(ApexIcons.ChevronRight, nextDescription, canGoNext, onNext)
    }
}

@Composable
private fun PillChevron(icon: androidx.compose.ui.graphics.vector.ImageVector, description: String, enabled: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(ApexSpacing.minTouch)
            .alpha(if (enabled) 1f else 0.35f)
            .apexClickable(onClick = onClick, role = Role.Button, enabled = enabled)
            .semantics { contentDescription = description },
        contentAlignment = Alignment.Center,
    ) {
        Icon(icon, contentDescription = null, tint = ApexTheme.colors.foreground, modifier = Modifier.size(18.dp))
    }
}

/** One cell of the [DayStrip]. [band] null draws the empty indicator (no recovery that day). */
@Immutable
data class DayStripItem(
    val key: String,
    val weekdayInitial: String,
    val dayOfMonth: String,
    val band: RecoveryBand?,
    val description: String,
)

/**
 * Horizontal strip of days, the selected one highlighted and scrolled into view (Pulse 5.11). Each cell is
 * 48 x 64 dp, announces [DayStripItem.description] and its selected state. Scroll is instant under reduced motion.
 */
@Composable
fun DayStrip(
    items: List<DayStripItem>,
    selectedKey: String?,
    onSelect: (String) -> Unit,
    groupDescription: String,
    modifier: Modifier = Modifier,
) {
    val state = rememberLazyListState()
    val reduced = rememberReducedMotion()
    val selectedIndex = items.indexOfFirst { it.key == selectedKey }
    LaunchedEffect(selectedIndex, reduced) {
        if (selectedIndex >= 0) {
            val offset = -state.layoutInfo.viewportSize.width / 2
            if (reduced) state.scrollToItem(selectedIndex, offset) else state.animateScrollToItem(selectedIndex, offset)
        }
    }
    LazyRow(
        modifier
            .fillMaxWidth()
            .selectableGroup()
            .semantics { contentDescription = groupDescription },
        state = state,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        itemsIndexed(items, key = { _, day -> day.key }) { _, item ->
            DayCell(item, selected = item.key == selectedKey, onClick = { onSelect(item.key) })
        }
    }
}

@Composable
private fun DayCell(item: DayStripItem, selected: Boolean, onClick: () -> Unit) {
    val colors = ApexTheme.colors
    val source = remember { MutableInteractionSource() }
    val barColor = if (item.band != null) colors.recoveryFill(item.band) else colors.dialTrack
    Column(
        Modifier
            .width(ApexSpacing.minTouch)
            .height(64.dp)
            .pressScale(source)
            .background(if (selected) colors.secondary else androidx.compose.ui.graphics.Color.Transparent, ApexShapes.button)
            .selectable(selected = selected, interactionSource = source, indication = null, role = Role.Tab, onClick = onClick)
            .semantics { contentDescription = item.description },
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center,
    ) {
        Text(item.weekdayInitial, style = ApexTheme.type.caption, color = colors.mutedForeground)
        Text(item.dayOfMonth, style = ApexTheme.type.statValue, color = colors.foreground)
        Box(
            Modifier
                .padding(top = 4.dp)
                .size(width = 16.dp, height = 4.dp)
                .background(barColor, ApexShapes.bar),
        )
    }
}

@Preview(name = "DayStrip dark")
@Composable
private fun DayStripPreviewDark() = ApexPreview(dark = true) { DayStripPreviewBody() }

@Preview(name = "DayStrip light")
@Composable
private fun DayStripPreviewLight() = ApexPreview(dark = false) { DayStripPreviewBody() }

@Composable
private fun DayStripPreviewBody() {
    val items = listOf(
        DayStripItem("1", "M", "21", RecoveryBand.GREEN, "Monday 21, Recovery green"),
        DayStripItem("2", "T", "22", RecoveryBand.YELLOW, "Tuesday 22, Recovery yellow"),
        DayStripItem("3", "W", "23", null, "Wednesday 23, no Recovery"),
        DayStripItem("4", "T", "24", RecoveryBand.RED, "Thursday 24, Recovery red"),
    )
    Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
        DatePill("Today", {}, {}, {}, canGoNext = false, previousDescription = "Previous day", nextDescription = "Next day")
        DayStrip(items, "2", {}, "Choose a day")
    }
}
