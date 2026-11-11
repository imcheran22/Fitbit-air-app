package com.apex.athlete.core.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.state.numberOrNull
import com.apex.athlete.core.ui.theme.ApexTheme

/**
 * Current strain against the Strain Target optimal range on a 0-21.0 track.
 * [targetLow]/[targetHigh] null (or invalid) hides the range and says so in words; the number is never invented.
 */
@Composable
fun StrainTargetBar(
    state: MetricState,
    targetLow: Double?,
    targetHigh: Double?,
    modifier: Modifier = Modifier,
    label: String = stringResource(R.string.strain_target_bar_label),
) {
    val colors = ApexTheme.colors
    val number = state.numberOrNull()
    val valid = targetLow != null && targetHigh != null && DialMath.targetArc(targetLow, targetHigh) != null
    val targetText = if (valid) {
        stringResource(R.string.strain_target_range, MetricFormat.number(targetLow, 1), MetricFormat.number(targetHigh, 1))
    } else {
        stringResource(R.string.strain_target_unavailable)
    }
    val spoken = metricSpoken(label, state, extras = listOf(targetText))
    val fraction = if (number != null) DialMath.strainFraction(number) else 0f
    val sweep = rememberSweep(fraction)
    val lowF = if (valid && targetLow != null) DialMath.fraction(targetLow, DialMath.STRAIN_MAX) else 0f
    val highF = if (valid && targetHigh != null) DialMath.fraction(targetHigh, DialMath.STRAIN_MAX) else 0f
    val track = colors.dialTrack
    val rangeColor = colors.dialTarget
    val fill = colors.strain
    val tickColor = colors.foreground

    Column(modifier.fillMaxWidth().spoken(spoken), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            if (state is MetricState.Loading) {
                SkeletonLineFill(height = 8.dp)
            } else {
                Canvas(Modifier.fillMaxWidth().height(12.dp)) {
                    val barH = 8.dp.toPx()
                    val top = (size.height - barH) / 2f
                    val r = CornerRadius(2.dp.toPx())
                    drawRoundRect(track, Offset(0f, top), Size(size.width, barH), r)
                    if (valid) {
                        drawRoundRect(rangeColor, Offset(size.width * lowF, top), Size(size.width * (highF - lowF), barH), r)
                    }
                    val w = size.width * sweep.value
                    if (w > 0f) drawRoundRect(fill, Offset(0f, top + barH / 4f), Size(w, barH / 2f), r)
                    if (valid) {
                        val mid = size.width * (lowF + highF) / 2f
                        drawRect(tickColor, Offset(mid - 1.dp.toPx(), 0f), Size(2.dp.toPx(), size.height))
                    }
                }
            }
            Text(
                text = if (number != null) {
                    stringResource(R.string.strain_so_far, MetricFormat.number(number, 1)) + "  " + targetText
                } else {
                    targetText
                },
                style = ApexTheme.type.caption,
                color = colors.foregroundSecondary,
            )
            MetricProvenance(state)
        }
    }
}

@Preview(name = "StrainTargetBar dark")
@Composable
private fun StrainTargetBarPreviewDark() = ApexPreview(dark = true) { StrainTargetBarPreviewBody() }

@Preview(name = "StrainTargetBar light")
@Composable
private fun StrainTargetBarPreviewLight() = ApexPreview(dark = false) { StrainTargetBarPreviewBody() }

@Composable
private fun StrainTargetBarPreviewBody() {
    Column(verticalArrangement = Arrangement.spacedBy(16.dp)) {
        StrainTargetBar(MetricState.Value(9.4, 1, null, DataProvenance.MATHEMATICALLY_DERIVED, "now"), 10.0, 14.0)
        StrainTargetBar(MetricState.Unavailable(MetricReason.AWAITING_SLEEP_SYNC), null, null)
        StrainTargetBar(MetricState.Loading, 10.0, 14.0)
    }
}
