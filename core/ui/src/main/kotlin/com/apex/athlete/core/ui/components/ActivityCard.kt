package com.apex.athlete.core.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.metricReasonText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.state.numberOrNull
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/** Chip colour on an [ActivityCard]: sleep rows use `sleepDeep`, activity rows `strainDeep`. */
enum class ActivityKind { Sleep, Workout }

/**
 * A row on the day's timeline (Pulse 5.12): chip with icon and value, name, start and end times.
 * [value] is the chip number as a [MetricState] (duration hours or strain, 1 dp as the caller sets);
 * missing shows `--` plus the reason under the name. Provenance is shown under the name.
 */
@Composable
fun ActivityCard(
    name: String,
    kind: ActivityKind,
    value: MetricState,
    startTime: String,
    endTime: String,
    modifier: Modifier = Modifier,
    icon: ImageVector = if (kind == ActivityKind.Sleep) ApexIcons.Moon else ApexIcons.Bolt,
    onClick: (() -> Unit)? = null,
) {
    val colors = ApexTheme.colors
    val chipColor = if (kind == ActivityKind.Sleep) colors.sleepDeep else colors.strainDeep
    val number = value.numberOrNull()
    val chipText = MetricFormat.number(number, (value as? MetricState.Value)?.decimals ?: 1)
    val times = stringResource(R.string.cd_time_range, startTime, endTime)
    val spoken = metricSpoken(name, value, extras = listOf(times))
    var m = modifier.fillMaxWidth()
    if (onClick != null) m = m.apexClickable(onClick = onClick, role = Role.Button)
    Row(
        m
            .heightIn(min = ApexSpacing.rowHeight)
            .background(colors.secondary, ApexShapes.row)
            .spoken(spoken)
            .padding(start = 6.dp, end = 12.dp, top = 6.dp, bottom = 6.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier
                .hideFromTalkBack()
                .heightIn(min = 44.dp)
                .widthIn(min = 72.dp)
                .background(chipColor, ApexShapes.chip)
                .padding(horizontal = 10.dp),
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(icon, null, Modifier.size(16.dp), tint = colors.foreground)
            Text(
                if (value is MetricState.Loading) "" else chipText,
                style = ApexTheme.type.statValue,
                color = if (number != null) colors.foreground else colors.foregroundSecondary,
            )
        }
        Column(Modifier.weight(1f).hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(name.uppercase(), style = ApexTheme.type.statLabel, color = colors.foreground)
            val reason = metricReasonText(value)
            if (reason != null) {
                Text(reason, style = ApexTheme.type.caption, color = colors.mutedForeground)
            } else {
                MetricProvenance(value)
            }
        }
        Column(Modifier.hideFromTalkBack(), horizontalAlignment = Alignment.End) {
            Text(startTime, style = ApexTheme.type.chart, color = colors.foregroundSecondary, textAlign = TextAlign.End)
            Text(endTime, style = ApexTheme.type.chart, color = colors.foregroundSecondary, textAlign = TextAlign.End)
        }
    }
}

/** Loading shape of an [ActivityCard]. */
@Composable
fun ActivityCardSkeleton(modifier: Modifier = Modifier) {
    Skeleton(modifier.fillMaxWidth().height(ApexSpacing.rowHeight), ApexShapes.row)
}

@Preview(name = "ActivityCard dark")
@Composable
private fun ActivityCardPreviewDark() = ApexPreview(dark = true) { ActivityCardPreviewBody() }

@Preview(name = "ActivityCard light")
@Composable
private fun ActivityCardPreviewLight() = ApexPreview(dark = false) { ActivityCardPreviewBody() }

@Composable
private fun ActivityCardPreviewBody() {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        ActivityCard("Sleep", ActivityKind.Sleep, MetricState.Value(6.5, 1, "h", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, "this morning"), "00:51", "07:38", onClick = {})
        ActivityCard("Running", ActivityKind.Workout, MetricState.Value(10.3, 1, null, DataProvenance.MATHEMATICALLY_DERIVED, "12:14"), "11:16", "12:14", onClick = {})
        ActivityCard("Walking", ActivityKind.Workout, MetricState.Unavailable(MetricReason.INSUFFICIENT_HR_DATA), "15:02", "15:40")
        ActivityCardSkeleton()
    }
}
