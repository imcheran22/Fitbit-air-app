package com.apex.athlete.core.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.metricReasonText
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

enum class ReasonSize { Small, Medium, Large }

/** Icon for a reason, so the reason is never carried by text colour alone. */
internal fun reasonIcon(state: MetricState): ImageVector = when (state) {
    is MetricState.Calibrating -> ApexIcons.Hourglass
    is MetricState.Unavailable -> when (state.reason) {
        MetricReason.NO_HRV_LAST_NIGHT -> ApexIcons.Pulse
        MetricReason.AWAITING_SLEEP_SYNC -> ApexIcons.Sync
        MetricReason.NOT_CONNECTED, MetricReason.PERMISSION_MISSING -> ApexIcons.Cloud
        MetricReason.INSUFFICIENT_HR_DATA, MetricReason.NOT_WORN, MetricReason.NO_DATA -> ApexIcons.Info
    }
    is MetricState.Error -> ApexIcons.Warning
    else -> ApexIcons.Info
}

/** Reason copy with an icon for any no-number [MetricState]. Renders nothing for Loading / Value / Stale. */
@Composable
fun ReasonPlaceholder(state: MetricState, modifier: Modifier = Modifier, size: ReasonSize = ReasonSize.Small) {
    val text = metricReasonText(state, short = false) ?: return
    ReasonPlaceholder(text = text, icon = reasonIcon(state), modifier = modifier, size = size)
}

/** Reason with explicit text. */
@Composable
fun ReasonPlaceholder(text: String, icon: ImageVector?, modifier: Modifier = Modifier, size: ReasonSize = ReasonSize.Small) {
    val colors = ApexTheme.colors
    when (size) {
        ReasonSize.Small -> Row(
            modifier,
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (icon != null) Icon(icon, null, Modifier.size(14.dp), tint = colors.mutedForeground)
            Text(text, style = ApexTheme.type.caption, color = colors.mutedForeground)
        }
        ReasonSize.Medium, ReasonSize.Large -> Column(
            modifier.fillMaxWidth().padding(vertical = if (size == ReasonSize.Large) ApexSpacing.xl else ApexSpacing.lg),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (icon != null) {
                Icon(icon, null, Modifier.size(if (size == ReasonSize.Large) 24.dp else 20.dp), tint = colors.mutedForeground)
            }
            Text(
                text,
                style = if (size == ReasonSize.Large) ApexTheme.type.bodyStrong else ApexTheme.type.body,
                color = colors.foregroundSecondary,
                textAlign = TextAlign.Center,
            )
        }
    }
}

@Preview(name = "Reason dark")
@Composable
private fun ReasonPreviewDark() = ApexPreview(dark = true) { ReasonPreviewBody() }

@Preview(name = "Reason light")
@Composable
private fun ReasonPreviewLight() = ApexPreview(dark = false) { ReasonPreviewBody() }

@Composable
private fun ReasonPreviewBody() {
    Column {
        ReasonPlaceholder(MetricState.Calibrating(4))
        ReasonPlaceholder(MetricState.Unavailable(MetricReason.NOT_WORN), size = ReasonSize.Medium)
        ReasonPlaceholder(MetricState.Error(), size = ReasonSize.Medium)
    }
}
