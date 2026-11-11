package com.apex.athlete.core.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Icon
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

@Composable
private fun SettingText(title: String, subtitle: String?, modifier: Modifier = Modifier) {
    val colors = ApexTheme.colors
    Column(modifier, verticalArrangement = Arrangement.spacedBy(2.dp)) {
        Text(title, style = ApexTheme.type.body, color = colors.foreground)
        if (subtitle != null) Text(subtitle, style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}

@Composable
private fun SettingLeading(icon: ImageVector?) {
    if (icon != null) Icon(icon, null, Modifier.size(20.dp), tint = ApexTheme.colors.mutedForeground)
}

/** A switch row: the whole row toggles, 56 dp tall, reads "<title>, <subtitle>, on/off" via switch semantics. */
@Composable
fun SettingToggleRow(
    title: String,
    checked: Boolean,
    onCheckedChange: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    icon: ImageVector? = null,
    enabled: Boolean = true,
) {
    val colors = ApexTheme.colors
    val spoken = if (subtitle != null) "$title, $subtitle" else title
    Row(
        modifier
            .fillMaxWidth()
            .toggleable(value = checked, enabled = enabled, role = Role.Switch, onValueChange = onCheckedChange)
            .semantics { contentDescription = spoken }
            .heightIn(min = ApexSpacing.rowHeight)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingLeading(icon)
        SettingText(title, subtitle, Modifier.weight(1f).hideFromTalkBack())
        Switch(
            checked = checked,
            onCheckedChange = null,
            enabled = enabled,
            colors = SwitchDefaults.colors(
                checkedThumbColor = colors.switchThumb,
                checkedTrackColor = colors.optimal,
                checkedBorderColor = colors.optimal,
                uncheckedThumbColor = colors.switchThumb,
                uncheckedTrackColor = colors.accent,
                uncheckedBorderColor = colors.accent,
            ),
        )
    }
}

/** A navigation row with an optional current value on the right and a chevron. */
@Composable
fun SettingNavRow(
    title: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    subtitle: String? = null,
    value: String? = null,
    icon: ImageVector? = null,
) {
    val colors = ApexTheme.colors
    val spoken = listOfNotNull(title, value, subtitle).joinToString(", ")
    Row(
        modifier
            .fillMaxWidth()
            .apexClickable(onClick = onClick, role = Role.Button)
            .semantics(mergeDescendants = true) { contentDescription = spoken }
            .heightIn(min = ApexSpacing.rowHeight)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingLeading(icon)
        SettingText(title, subtitle, Modifier.weight(1f).hideFromTalkBack())
        if (value != null) {
            Text(value, style = ApexTheme.type.body, color = colors.mutedForeground, textAlign = TextAlign.End, modifier = Modifier.hideFromTalkBack())
        }
        Icon(ApexIcons.ChevronRight, null, Modifier.size(16.dp), tint = colors.mutedForeground)
    }
}

/** A read-only label and value row (algorithm version, last sync). Not interactive. */
@Composable
fun SettingValueRow(
    title: String,
    value: String,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
) {
    val colors = ApexTheme.colors
    val spoken = "$title, $value"
    Row(
        modifier
            .fillMaxWidth()
            .semantics(mergeDescendants = true) { contentDescription = spoken }
            .heightIn(min = ApexSpacing.rowHeight)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        SettingLeading(icon)
        Text(title, style = ApexTheme.type.body, color = colors.foreground, modifier = Modifier.weight(1f).hideFromTalkBack())
        Text(value, style = ApexTheme.type.statSubValue, color = colors.foregroundSecondary, textAlign = TextAlign.End, modifier = Modifier.hideFromTalkBack())
    }
}

@Preview(name = "SettingRow dark")
@Composable
private fun SettingRowPreviewDark() = ApexPreview(dark = true) { SettingRowPreviewBody() }

@Preview(name = "SettingRow light")
@Composable
private fun SettingRowPreviewLight() = ApexPreview(dark = false) { SettingRowPreviewBody() }

@Composable
private fun SettingRowPreviewBody() {
    ApexCard {
        SettingToggleRow("Demo mode", checked = true, onCheckedChange = {}, subtitle = "Synthetic data, separate store")
        SettingToggleRow("Notifications", checked = false, onCheckedChange = {})
        SettingNavRow("Units", onClick = {}, value = "Metric")
        SettingNavRow("Data sources", onClick = {}, subtitle = "Google Health, Health Connect", icon = ApexIcons.Sync)
        SettingValueRow("Algorithm version", "1.0")
    }
}
