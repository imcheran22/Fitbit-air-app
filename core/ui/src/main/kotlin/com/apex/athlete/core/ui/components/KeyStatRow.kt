package com.apex.athlete.core.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.state.metricReasonText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.state.numberOrNull
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ApexColors

/** Filled 8 dp triangle (up or down) or a 6 dp dot for neutral, per Pulse 5.0 "Delta arrows". Decorative. */
@Composable
fun DeltaArrowView(arrow: DeltaArrow, modifier: Modifier = Modifier) {
    val colors = ApexTheme.colors
    val tint = arrow.toneColor(colors)
    val path = remember(arrow.direction) { Path() }
    Canvas(modifier.size(8.dp).hideFromTalkBack()) {
        if (arrow.direction == DeltaDirection.FLAT) {
            drawCircle(tint, radius = 3.dp.toPx(), center = Offset(size.width / 2f, size.height / 2f))
        } else {
            path.reset()
            if (arrow.direction == DeltaDirection.UP) {
                path.moveTo(size.width / 2f, 0f)
                path.lineTo(size.width, size.height)
                path.lineTo(0f, size.height)
            } else {
                path.moveTo(0f, 0f)
                path.lineTo(size.width, 0f)
                path.lineTo(size.width / 2f, size.height)
            }
            path.close()
            drawPath(path, tint)
        }
    }
}

private fun DeltaArrow.toneColor(colors: ApexColors): Color = when (tone) {
    DeltaTone.GOOD -> colors.optimal
    DeltaTone.BAD -> colors.warning
    DeltaTone.NEUTRAL -> colors.mutedForeground
}

/**
 * Key statistic row (Pulse 5.2, row variant): icon, caps label with provenance beneath, value + unit with the
 * delta arrow, the comparison average below the value, optional status dashes, chevron when clickable.
 *
 * [average]/[sd]/[goodDirection] drive the arrow via [DeltaRules]; with no average there is no arrow.
 * Non-value states: `--` plus the reason instead of provenance. The row speaks one sentence.
 */
@Composable
fun KeyStatRow(
    label: String,
    state: MetricState,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    average: Double? = null,
    averageDecimals: Int = 0,
    sd: Double? = null,
    goodDirection: GoodDirection = GoodDirection.NEUTRAL,
    averageLabel: String = stringResource(R.string.stat_average_30d),
    status: ContributorStatus? = null,
    onClick: (() -> Unit)? = null,
) {
    val colors = ApexTheme.colors
    val number = state.numberOrNull()
    val arrow = if (number != null && average != null) DeltaRules.arrow(number, average, sd, goodDirection) else null
    val averageText = if (number != null && average != null) MetricFormat.number(average, averageDecimals) else null
    val statusText = status?.let { stringResource(statusLabelRes(it)) }
    val deltaText = arrow?.let {
        when (it.direction) {
            DeltaDirection.UP -> stringResource(R.string.cd_delta_above, averageLabel)
            DeltaDirection.DOWN -> stringResource(R.string.cd_delta_below, averageLabel)
            DeltaDirection.FLAT -> stringResource(R.string.cd_delta_same, averageLabel)
        }
    }
    val averageSpoken = if (averageText != null) stringResource(R.string.cd_average_value, averageLabel, averageText) else null
    val spoken = metricSpoken(label, state, extras = listOfNotNull(deltaText, averageSpoken, statusText))

    var m = modifier.fillMaxWidth()
    if (onClick != null) m = m.apexClickable(onClick = onClick, role = Role.Button)
    Row(
        m
            .heightIn(min = ApexSpacing.rowHeight)
            .spoken(spoken)
            .padding(vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) Icon(icon, null, Modifier.size(20.dp), tint = colors.mutedForeground)
        Column(Modifier.weight(1f).hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.foreground)
            if (state is MetricState.Loading) {
                SkeletonLine(width = 96.dp)
            } else {
                val reason = metricReasonText(state)
                if (reason != null) {
                    Text(reason, style = ApexTheme.type.caption, color = colors.mutedForeground)
                } else {
                    MetricProvenance(state)
                }
            }
        }
        if (status != null) StatusDashes(status)
        Column(Modifier.hideFromTalkBack(), horizontalAlignment = Alignment.End) {
            if (state is MetricState.Loading) {
                SkeletonLine(width = 48.dp, height = 20.dp)
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    MetricValueText(state)
                    if (arrow != null) DeltaArrowView(arrow)
                }
                if (averageText != null) {
                    Text(averageText, style = ApexTheme.type.statSubValue, color = colors.mutedForeground)
                }
                if (state is MetricState.Value && state.isProvisional) {
                    Tag(stringResource(R.string.tag_provisional))
                }
            }
        }
        if (onClick != null) {
            Icon(ApexIcons.ChevronRight, null, Modifier.size(16.dp), tint = colors.mutedForeground)
        }
    }
}

@Preview(name = "KeyStatRow dark")
@Composable
private fun KeyStatPreviewDark() = ApexPreview(dark = true) { KeyStatPreviewBody() }

@Preview(name = "KeyStatRow light")
@Composable
private fun KeyStatPreviewLight() = ApexPreview(dark = false) { KeyStatPreviewBody() }

@Composable
private fun KeyStatPreviewBody() {
    val src = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    ApexCard {
        KeyStatRow("Heart rate variability", MetricState.Value(66.0, 0, "ms", src, "this morning"), icon = ApexIcons.Pulse, average = 55.0, sd = 6.0, goodDirection = GoodDirection.UP, onClick = {})
        KeyStatRow("Resting heart rate", MetricState.Value(55.0, 0, "bpm", src, "this morning"), icon = ApexIcons.Heart, average = 55.0, goodDirection = GoodDirection.DOWN, onClick = {})
        KeyStatRow("Respiratory rate", MetricState.Value(14.2, 1, "rpm", src, "this morning"), icon = ApexIcons.Wind, average = 14.7, averageDecimals = 1, sd = 0.2, onClick = {})
        KeyStatRow("Skin temperature", MetricState.Unavailable(MetricReason.NOT_WORN), icon = ApexIcons.Info)
        KeyStatRow("Sleep performance", MetricState.Loading, icon = ApexIcons.Moon)
    }
}
