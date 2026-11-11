package com.apex.athlete.core.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
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
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.state.metricReasonText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.state.numberOrNull
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme

/** Where a contributor sits: shown as a three-segment dash (Pulse 5.2 / 5.3). */
enum class ContributorStatus { Poor, Sufficient, Optimal }

@androidx.annotation.StringRes
internal fun statusLabelRes(status: ContributorStatus): Int = when (status) {
    ContributorStatus.Poor -> R.string.status_poor
    ContributorStatus.Sufficient -> R.string.status_sufficient
    ContributorStatus.Optimal -> R.string.status_optimal
}

/** Three 16 x 4 dp dashes, 2 dp corners; the active one is warning / neutral / optimal. Decorative: the status is spoken by the row. */
@Composable
fun StatusDashes(status: ContributorStatus, modifier: Modifier = Modifier) {
    val colors = ApexTheme.colors
    val active: Color = when (status) {
        ContributorStatus.Poor -> colors.warning
        ContributorStatus.Sufficient -> colors.foregroundSecondary
        ContributorStatus.Optimal -> colors.optimal
    }
    Row(modifier.hideFromTalkBack(), horizontalArrangement = Arrangement.spacedBy(3.dp)) {
        ContributorStatus.entries.forEach { s ->
            Box(Modifier.size(width = 16.dp, height = 4.dp).background(if (s == status) active else colors.dialTrack, ApexShapes.bar))
        }
    }
}

/**
 * One input of a score against its normal band (Pulse 5.3, recovery variant).
 *
 * Line 1: icon, caps label, value + unit, points ("+9 pts") when [points] is given.
 * Line 2: the band track with the normal band (mean +/- 1 sigma) and a marker, when [baselineMean] and
 * [baselineSd] are given and the state is a value. Line 3: [detail] caption.
 * Non-value states show `--` and the reason; the track and points are hidden. Provenance is always shown.
 */
@Composable
fun ContributorRow(
    label: String,
    state: MetricState,
    modifier: Modifier = Modifier,
    icon: ImageVector? = null,
    status: ContributorStatus? = null,
    points: Double? = null,
    baselineMean: Double? = null,
    baselineSd: Double? = null,
    detail: String? = null,
    onClick: (() -> Unit)? = null,
) {
    val colors = ApexTheme.colors
    val number = state.numberOrNull()
    val pointsText = if (points != null && number != null) MetricFormat.delta(points, 0) else null
    val statusText = status?.let { stringResource(statusLabelRes(it)) }
    val spoken = metricSpoken(label, state, extras = listOfNotNull(statusText, pointsText?.let { stringResource(R.string.contributor_points_cd, it) }, detail))
    var m = modifier.fillMaxWidth()
    if (onClick != null) m = m.apexClickable(onClick = onClick, role = Role.Button).minTouchTarget()
    Column(
        m.spoken(spoken).padding(vertical = 12.dp),
        verticalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp), verticalAlignment = Alignment.CenterVertically) {
                if (icon != null) Icon(icon, null, Modifier.size(20.dp), tint = colors.mutedForeground)
                Text(label.uppercase(), style = ApexTheme.type.statLabel, color = colors.foreground, modifier = Modifier.weight(1f))
                if (status != null) StatusDashes(status)
                if (state is MetricState.Loading) {
                    SkeletonLine(width = 56.dp, height = 20.dp)
                } else {
                    MetricValueText(state)
                }
                if (pointsText != null && points != null) {
                    val tint = when {
                        points > 0 -> colors.optimalText
                        points < 0 -> colors.warningText
                        else -> colors.mutedForeground
                    }
                    Text(
                        stringResource(R.string.contributor_points, pointsText),
                        style = ApexTheme.type.statUnit,
                        color = tint,
                    )
                }
                if (onClick != null) Icon(ApexIcons.ChevronRight, null, Modifier.size(16.dp), tint = colors.mutedForeground)
            }
            if (number != null && baselineMean != null && baselineSd != null) {
                val marker = BandMath.markerFraction(number, baselineMean, baselineSd)
                if (marker != null) BandTrack(marker)
            }
            if (state is MetricState.Loading) {
                SkeletonLine(width = 120.dp)
            } else {
                val line = detail ?: metricReasonText(state)
                if (line != null) Text(line, style = ApexTheme.type.caption, color = colors.mutedForeground)
                MetricProvenance(state)
            }
        }
    }
}

@Composable
private fun BandTrack(marker: Float) {
    val colors = ApexTheme.colors
    val track = colors.dialTrack
    val band = colors.foreground.copy(alpha = 0.2f)
    val markerColor = colors.foreground
    val ring = colors.card
    Canvas(Modifier.fillMaxWidth().height(12.dp)) {
        val h = 6.dp.toPx()
        val top = (size.height - h) / 2f
        val r = CornerRadius(2.dp.toPx())
        drawRoundRect(track, Offset(0f, top), Size(size.width, h), r)
        drawRoundRect(band, Offset(size.width * BandMath.BAND_START, top), Size(size.width * (BandMath.BAND_END - BandMath.BAND_START), h), r)
        val cx = size.width * marker
        drawCircle(ring, 6.dp.toPx(), Offset(cx, size.height / 2f))
        drawCircle(markerColor, 4.5.dp.toPx(), Offset(cx, size.height / 2f))
    }
}

@Preview(name = "ContributorRow dark")
@Composable
private fun ContributorPreviewDark() = ApexPreview(dark = true) { ContributorPreviewBody() }

@Preview(name = "ContributorRow light")
@Composable
private fun ContributorPreviewLight() = ApexPreview(dark = false) { ContributorPreviewBody() }

@Composable
private fun ContributorPreviewBody() {
    ApexCard {
        ContributorRow(
            label = "Heart rate variability",
            state = MetricState.Value(66.0, 0, "ms", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, "this morning"),
            icon = ApexIcons.Pulse, points = 9.0, baselineMean = 55.0, baselineSd = 8.0,
            detail = "Baseline 55 +/- 8 ms",
        )
        ContributorRow(
            label = "Sleep duration",
            state = MetricState.Value(6.4, 1, "h", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, "this morning"),
            icon = ApexIcons.Moon, status = ContributorStatus.Sufficient,
        )
        ContributorRow(
            label = "Respiratory rate",
            state = MetricState.Unavailable(MetricReason.NO_DATA),
            icon = ApexIcons.Wind,
        )
    }
}
