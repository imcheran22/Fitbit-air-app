package com.apex.athlete.core.ui.state

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.components.ApexPreview
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.SkeletonLine
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.theme.ApexTheme

/** "72" with a smaller "%" after it, as one wrapping text run. Missing shows `--` with no unit. */
fun metricValueAnnotated(
    number: String,
    unit: String?,
    valueStyle: TextStyle,
    unitStyle: TextStyle,
): AnnotatedString = buildAnnotatedString {
    withStyle(valueStyle.toSpanStyle()) { append(number) }
    if (!unit.isNullOrBlank() && number != MetricFormat.MISSING) {
        append(" ")
        withStyle(unitStyle.toSpanStyle()) { append(unit) }
    }
}

/**
 * The number and unit for any state: the real value, or `--` in the muted colour. Never zero for missing.
 * [valueStyle] is a numeric role such as `ApexTheme.type.statValue`.
 */
@Composable
fun MetricValueText(
    state: MetricState,
    modifier: Modifier = Modifier,
    valueStyle: TextStyle = ApexTheme.type.statValue,
    unitStyle: TextStyle = ApexTheme.type.statUnit,
    unitOverride: String? = null,
    color: Color = ApexTheme.colors.foreground,
) {
    val colors = ApexTheme.colors
    val number: String
    val unit: String?
    val tint: Color
    when (state) {
        is MetricState.Value -> {
            number = state.numberText(); unit = unitOverride ?: state.unit; tint = color
        }
        is MetricState.Stale -> {
            number = state.numberText(); unit = unitOverride ?: state.unit; tint = colors.foregroundSecondary
        }
        else -> {
            number = MetricFormat.MISSING; unit = null; tint = colors.mutedForeground
        }
    }
    Text(
        text = metricValueAnnotated(number, unit, valueStyle.copy(color = tint), unitStyle.copy(color = colors.mutedForeground)),
        modifier = modifier,
        maxLines = 2,
        overflow = TextOverflow.Clip,
    )
}

/**
 * The one switch every free-form metric goes through (Pulse 4.9). [content] draws a real value; the
 * other states are drawn here in one consistent way. Stale values are drawn through [content] too,
 * followed by a "Stale" tag and the stale provenance line.
 *
 * [loading] defaults to a text-line skeleton; pass the component's own skeleton for a final-shape one.
 */
@Composable
fun MetricStateView(
    state: MetricState,
    modifier: Modifier = Modifier,
    label: String? = null,
    reasonSize: ReasonSize = ReasonSize.Small,
    loading: @Composable () -> Unit = { SkeletonLine(width = 96.dp, height = 20.dp) },
    content: @Composable (MetricState.Value) -> Unit,
) {
    when (state) {
        MetricState.Loading -> {
            val cd = if (label != null) stringResource(R.string.cd_metric_loading, label) else stringResource(R.string.cd_loading)
            Box(modifier.semantics { contentDescription = cd }) { loading() }
        }
        is MetricState.Value -> content(state)
        is MetricState.Stale -> Column(modifier, verticalArrangement = Arrangement.spacedBy(6.dp)) {
            content(
                MetricState.Value(
                    value = state.value,
                    decimals = state.decimals,
                    unit = state.unit,
                    provenance = state.provenance,
                    asOf = state.since,
                ),
            )
            Tag(stringResource(R.string.tag_stale), tone = ChipTone.WARNING)
            MetricProvenance(state)
        }
        is MetricState.Calibrating, is MetricState.Unavailable, is MetricState.Error -> Column(modifier) {
            ReasonPlaceholder(state, size = reasonSize)
        }
    }
}

@Preview(name = "MetricStateView dark")
@Composable
private fun MetricStateViewPreviewDark() = ApexPreview(dark = true) { MetricStateViewPreviewBody() }

@Preview(name = "MetricStateView light")
@Composable
private fun MetricStateViewPreviewLight() = ApexPreview(dark = false) { MetricStateViewPreviewBody() }

@Composable
private fun MetricStateViewPreviewBody() {
    val states = listOf(
        MetricState.Loading,
        MetricState.Value(66.0, 0, "ms", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, "2 min ago"),
        MetricState.Value(58.0, 0, "%", DataProvenance.MATHEMATICALLY_DERIVED, "now", isProvisional = true),
        MetricState.Calibrating(4),
        MetricState.Stale(55.0, 0, "bpm", DataProvenance.IMPORTED_HEALTH_CONNECT, "3 h ago"),
        MetricState.Unavailable(MetricReason.NOT_WORN),
        MetricState.Error(),
    )
    Column(Modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        states.forEach { s ->
            MetricStateView(s) { v ->
                Column {
                    MetricValueText(v)
                    MetricProvenance(v)
                    if (v.isProvisional) Tag(stringResource(R.string.tag_provisional))
                }
            }
        }
    }
}
