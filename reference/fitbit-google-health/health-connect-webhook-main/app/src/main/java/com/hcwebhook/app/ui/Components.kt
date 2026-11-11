package com.hcwebhook.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

// Shared building blocks, so every screen uses the same rows, groups and notices.
// Two text sizes: bodyLarge for row titles, bodyMedium for everything else.

class GroupScope {
    internal val items = mutableListOf<@Composable () -> Unit>()

    fun item(content: @Composable () -> Unit) {
        items += content
    }
}

/** Grouped list, like Android Settings: one rounded group, small gaps between rows. */
@Composable
fun Group(title: String? = null, modifier: Modifier = Modifier, build: GroupScope.() -> Unit) {
    val items = GroupScope().apply(build).items
    if (items.isEmpty()) return
    Column(modifier.fillMaxWidth()) {
        if (title != null) SectionTitle(title)
        items.forEachIndexed { index, content ->
            Surface(
                shape = groupShape(index, items.size),
                color = MaterialTheme.colorScheme.surfaceContainer,
                modifier = Modifier.fillMaxWidth(),
            ) { content() }
            if (index < items.lastIndex) Spacer(Modifier.height(2.dp))
        }
    }
}

/**
 * One row of a group in a lazy list, where [Group] cannot be used: the same shape and color.
 * Put `Spacer(Modifier.height(2.dp))` between rows, as [Group] does.
 */
@Composable
fun GroupItem(index: Int, count: Int, content: @Composable () -> Unit) {
    Surface(
        shape = groupShape(index, count),
        color = MaterialTheme.colorScheme.surfaceContainer,
        modifier = Modifier.fillMaxWidth(),
    ) { content() }
}

private fun groupShape(index: Int, count: Int): Shape {
    val big = 20.dp
    val small = 4.dp
    return RoundedCornerShape(
        topStart = if (index == 0) big else small,
        topEnd = if (index == 0) big else small,
        bottomStart = if (index == count - 1) big else small,
        bottomEnd = if (index == count - 1) big else small,
    )
}

@Composable
fun SectionTitle(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.titleSmall,
        color = MaterialTheme.colorScheme.primary,
        modifier = modifier.padding(start = 16.dp, top = 8.dp, bottom = 8.dp),
    )
}

/** A row in a [Group]. [value] shows on the right; a chevron shows when the row opens something. */
@Composable
fun SettingRow(
    title: String,
    summary: String? = null,
    icon: ImageVector? = null,
    value: String? = null,
    chevron: Boolean = false,
    danger: Boolean = false,
    onClick: (() -> Unit)? = null,
    trailing: (@Composable () -> Unit)? = null,
) {
    val colors = MaterialTheme.colorScheme
    ListItem(
        headlineContent = { Text(title, color = if (danger) colors.error else Color.Unspecified) },
        supportingContent = summary?.let { { Text(it) } },
        leadingContent = icon?.let { { Icon(it, null, tint = if (danger) colors.error else colors.onSurfaceVariant) } },
        trailingContent = trailing ?: if (value != null || chevron) {
            {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    if (value != null) Text(value, style = MaterialTheme.typography.bodyMedium, color = colors.primary)
                    if (chevron) Icon(Icons.Filled.ChevronRight, null, tint = colors.onSurfaceVariant)
                }
            }
        } else null,
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = if (onClick != null) Modifier.clickable(onClick = onClick) else Modifier,
    )
}

@Composable
fun SwitchRow(
    title: String,
    checked: Boolean,
    onChange: (Boolean) -> Unit,
    summary: String? = null,
    icon: ImageVector? = null,
) {
    ListItem(
        headlineContent = { Text(title) },
        supportingContent = summary?.let { { Text(it) } },
        leadingContent = icon?.let { { Icon(it, null, tint = MaterialTheme.colorScheme.onSurfaceVariant) } },
        trailingContent = { AppSwitch(checked, null) },
        colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        modifier = Modifier.toggleable(checked, role = Role.Switch, onValueChange = onChange),
    )
}

/** Material switch with a check mark in the thumb when on, like Google apps. */
@Composable
fun AppSwitch(checked: Boolean, onChange: ((Boolean) -> Unit)?) {
    Switch(
        checked = checked,
        onCheckedChange = onChange,
        thumbContent = if (checked) {
            { Icon(Icons.Filled.Check, null, Modifier.size(SwitchDefaults.IconSize)) }
        } else null,
    )
}

/** Circle with an icon on a tonal color, for list rows. */
@Composable
fun IconBadge(
    icon: ImageVector,
    size: Dp = 40.dp,
    container: Color = MaterialTheme.colorScheme.secondaryContainer,
    content: Color = MaterialTheme.colorScheme.onSecondaryContainer,
) {
    Surface(shape = CircleShape, color = container, modifier = Modifier.size(size)) {
        Box(contentAlignment = Alignment.Center) { Icon(icon, null, Modifier.size(size * 0.5f), tint = content) }
    }
}

/** Info: a suggestion. Error: something stops the sync or makes it unreliable. */
enum class NoticeTone { Info, Error }

/**
 * A problem or a suggestion on a screen: icon, title, short text and up to two actions.
 * All notices look the same, so the user can read them quickly.
 */
@Composable
fun Notice(
    icon: ImageVector,
    title: String,
    body: String? = null,
    tone: NoticeTone = NoticeTone.Info,
    action: String? = null,
    onAction: () -> Unit = {},
    secondaryAction: String? = null,
    onSecondaryAction: () -> Unit = {},
    modifier: Modifier = Modifier,
    content: @Composable ColumnScope.() -> Unit = {},
) {
    val colors = MaterialTheme.colorScheme
    val (container, onContainer) = when (tone) {
        NoticeTone.Info -> colors.secondaryContainer to colors.onSecondaryContainer
        NoticeTone.Error -> colors.errorContainer to colors.onErrorContainer
    }
    Surface(color = container, contentColor = onContainer, shape = RoundedCornerShape(20.dp), modifier = modifier.fillMaxWidth()) {
        Column(Modifier.padding(start = 16.dp, end = 16.dp, top = 16.dp, bottom = if (action != null) 4.dp else 16.dp)) {
            Row(verticalAlignment = Alignment.Top) {
                Icon(icon, null, Modifier.size(24.dp))
                Spacer(Modifier.width(16.dp))
                Column(Modifier.weight(1f)) {
                    Text(title, style = MaterialTheme.typography.bodyLarge)
                    if (body != null) {
                        Spacer(Modifier.height(2.dp))
                        Text(body, style = MaterialTheme.typography.bodyMedium)
                    }
                    content()
                }
            }
            if (action != null) {
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(4.dp, Alignment.End)) {
                    if (secondaryAction != null) TextButton(onClick = onSecondaryAction) { Text(secondaryAction, color = onContainer) }
                    TextButton(onClick = onAction) { Text(action, color = onContainer) }
                }
            }
        }
    }
}

@Composable
fun SupportingText(text: String, modifier: Modifier = Modifier) {
    Text(
        text,
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = modifier.padding(horizontal = 16.dp),
    )
}
