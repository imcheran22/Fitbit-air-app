package com.apex.athlete.core.ui.components

import androidx.annotation.StringRes
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexTheme

/** Short, human provenance label for each [DataProvenance]. Exhaustive: a new entry fails to compile. */
@StringRes
fun provenanceLabelRes(provenance: DataProvenance): Int = when (provenance) {
    DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API -> R.string.provenance_measured
    DataProvenance.IMPORTED_HEALTH_CONNECT -> R.string.provenance_health_connect
    DataProvenance.IMPORTED_FILE_ARCHIVE -> R.string.provenance_imported_file
    DataProvenance.USER_REPORTED -> R.string.provenance_self_reported
    DataProvenance.MATHEMATICALLY_DERIVED -> R.string.provenance_calculated
    DataProvenance.AI_INTERPRETED -> R.string.provenance_ai
    DataProvenance.ESTIMATED -> R.string.provenance_estimated
    DataProvenance.UNAVAILABLE -> R.string.provenance_unavailable
    DataProvenance.SYNTHETIC_DEMO -> R.string.provenance_demo
}

/**
 * Provenance and freshness next to a value: "Measured, 2 min ago". Observed sources get a filled
 * marker, derived/estimated/AI/demo get a hollow one, so the difference is not carried by colour.
 *
 * [provenance] null renders "Source unknown" (a value without a source is reported as such, never hidden).
 * [asOf] is the already-formatted freshness text. [stale] swaps the freshness for "Stale, since ...".
 */
@Composable
fun ProvenanceLabel(
    provenance: DataProvenance?,
    modifier: Modifier = Modifier,
    asOf: String? = null,
    stale: Boolean = false,
) {
    val colors = ApexTheme.colors
    val source = provenance?.let { stringResource(provenanceLabelRes(it)) } ?: stringResource(R.string.provenance_unknown)
    val fresh = when {
        stale && asOf != null -> stringResource(R.string.cd_metric_stale, asOf)
        else -> asOf
    }
    val text = if (fresh.isNullOrBlank()) source else stringResource(R.string.provenance_with_age, source, fresh)
    val filled = provenance?.isObserved == true
    val markColor = colors.mutedForeground
    Row(modifier, horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
        Canvas(Modifier.size(8.dp)) {
            if (filled) {
                drawCircle(markColor, radius = size.minDimension / 2f)
            } else {
                drawCircle(markColor, radius = size.minDimension / 2f - 0.75.dp.toPx(), style = Stroke(1.5.dp.toPx()))
            }
        }
        androidx.compose.material3.Text(text = text, style = ApexTheme.type.caption, color = colors.mutedForeground)
    }
}

/** Provenance line derived from a [MetricState]; draws nothing for states without a value. */
@Composable
fun MetricProvenance(state: MetricState, modifier: Modifier = Modifier) {
    when (state) {
        is MetricState.Value -> ProvenanceLabel(state.provenance, modifier, state.asOf)
        is MetricState.Stale -> ProvenanceLabel(state.provenance, modifier, state.since, stale = true)
        else -> Unit
    }
}

@Preview(name = "Provenance dark")
@Composable
private fun ProvenancePreviewDark() = ApexPreview(dark = true) { ProvenancePreviewBody() }

@Preview(name = "Provenance light")
@Composable
private fun ProvenancePreviewLight() = ApexPreview(dark = false) { ProvenancePreviewBody() }

@Composable
private fun ProvenancePreviewBody() {
    androidx.compose.foundation.layout.Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        DataProvenance.entries.forEach { ProvenanceLabel(it, asOf = "2 min ago") }
        ProvenanceLabel(null)
    }
}
