package com.apex.athlete.core.ui.charts

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.State
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import kotlin.math.roundToInt

/**
 * Time in heart-rate zones as horizontal bars on a hatched track (Pulse 5.8 `rows`, DESIGN_SYSTEM section 5).
 *
 * [zones] are drawn in the order given (hottest first by convention, including "below zone 1" last). Shares are
 * of the total of all rows with a known duration, so they sum to 100 %. A zone with `seconds == null` shows
 * `--` and no fill; zero seconds shows 0:00:00 at 40 % opacity (measured, just empty). [caption] is a free
 * text line such as "Zones from your max heart rate of 186 bpm."; [provenance] is shown under the rows.
 */
@Composable
fun ZoneBars(
    zones: List<ZoneMinutes>,
    modifier: Modifier = Modifier,
    caption: String? = null,
    provenance: String? = null,
    reducedMotion: Boolean = rememberReducedMotion(),
) {
    val total = remember(zones) { zones.sumOf { it.seconds ?: 0L } }
    val anyKnown = remember(zones) { zones.any { it.seconds != null } }
    if (!anyKnown) {
        ChartEmptyBox(stringResource(R.string.apex_chart_empty_zones), 96.dp, modifier)
        return
    }
    val progress = rememberChartProgress(reducedMotion, zones)
    val colors = ApexTheme.colors
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        val (th, tm, ts) = ChartScales.splitDuration(total)
        Text(
            stringResource(R.string.apex_chart_zone_total, th, tm, ts),
            style = ApexTheme.type.statLabel,
            color = colors.foregroundSecondary,
        )
        for (z in zones) ZoneRow(z, total, progress)
        if (caption != null) Text(caption, style = ApexTheme.type.caption, color = colors.mutedForeground)
        if (provenance != null) Text(provenance, style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}

@Composable
private fun ZoneRow(zone: ZoneMinutes, total: Long, progress: State<Float>) {
    val colors = ApexTheme.colors
    val seconds = zone.seconds
    val share = if (seconds != null) ChartScales.sharePercent(seconds, total) else null
    val shareText = when {
        share == null -> stringResource(R.string.apex_chart_value_missing)
        seconds != null && seconds > 0L && share < 1.0 -> stringResource(R.string.apex_chart_share_under_one)
        else -> stringResource(R.string.apex_chart_share_percent, share.roundToInt())
    }
    val durationText = if (seconds != null) {
        val (h, m, s) = ChartScales.splitDuration(seconds)
        stringResource(R.string.apex_chart_duration_hms, h, m, s)
    } else {
        stringResource(R.string.apex_chart_value_missing)
    }
    val spoken = if (seconds != null) {
        val (h, m, s) = ChartScales.splitDuration(seconds)
        stringResource(R.string.apex_chart_duration_spoken, h, m, s)
    } else {
        stringResource(R.string.apex_chart_value_missing_spoken)
    }
    val description = stringResource(
        R.string.apex_chart_zone_row_desc,
        zone.zoneLabel,
        zone.rangeLabel ?: "",
        shareText,
        spoken,
    )
    val fraction = ((share ?: 0.0) / 100.0).toFloat().coerceIn(0f, 1f)
    val hatch = colors.patternHatch
    val fill = colors.foreground

    Column(
        Modifier
            .fillMaxWidth()
            .alpha(if (seconds == 0L) 0.4f else 1f)
            .background(colors.secondary, ApexShapes.row)
            .padding(horizontal = ApexSpacing.md, vertical = 10.dp)
            .clearAndSetSemantics { contentDescription = description },
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Text(
                text = buildAnnotatedString {
                    append(zone.zoneLabel)
                    if (zone.rangeLabel != null) {
                        append("  ")
                        withStyle(SpanStyle(color = colors.mutedForeground)) { append(zone.rangeLabel) }
                    }
                    append("  ")
                    withStyle(SpanStyle(color = colors.foregroundSecondary)) { append(shareText) }
                },
                style = ApexTheme.type.statLabel,
                color = colors.foreground,
                modifier = Modifier.weight(1f),
            )
            Text(durationText, style = ApexTheme.type.statValue, color = colors.foreground)
        }
        Spacer(
            Modifier
                .fillMaxWidth()
                .height(12.dp)
                .clip(ApexShapes.bar)
                .drawWithCache {
                    val hatchPath = Path()
                    val step = 4.dp.toPx()
                    var x = -size.height
                    while (x < size.width) {
                        hatchPath.moveTo(x, size.height)
                        hatchPath.lineTo(x + size.height, 0f)
                        x += step
                    }
                    val hatchStroke = Stroke(width = 1.dp.toPx())
                    val minFill = 2.dp.toPx()
                    onDrawBehind {
                        drawPath(hatchPath, hatch, style = hatchStroke)
                        if (fraction > 0f) {
                            val w = maxOf(minFill, size.width * fraction * progress.value)
                            drawRect(fill, Offset.Zero, Size(w, size.height))
                        }
                    }
                },
        )
    }
}
