package com.apex.athlete.core.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.core.ui.R
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.state.MetricFormat
import com.apex.athlete.core.ui.theme.ApexTheme
import kotlin.math.abs

/** One ranked effect on a score. [delta] is in the list's unit (for example points). */
@Immutable
data class DriverItem(val key: String, val label: String, val delta: Double)

/** Drivers sorted by absolute effect, largest first. Pure: unit tested. */
fun sortedDrivers(items: List<DriverItem>): List<DriverItem> =
    items.filter { it.delta.isFinite() }.sortedByDescending { abs(it.delta) }

/**
 * "What moved the score" (Pulse 5.4, recovery variant): diverging bars on a hatched track, centre dot, raised
 * to the right in `optimal`, lowered to the left in `warning`. Each driver is its own row card and speaks
 * "<label> raised/lowered the score by N unit". Empty list shows [emptyText].
 */
@Composable
fun DriverList(
    items: List<DriverItem>,
    unit: String,
    modifier: Modifier = Modifier,
    emptyText: String = stringResource(R.string.drivers_empty),
) {
    val colors = ApexTheme.colors
    val sorted = remember(items) { sortedDrivers(items) }
    val maxAbs = remember(sorted) { sorted.maxOfOrNull { abs(it.delta) } ?: 0.0 }
    Column(modifier.fillMaxWidth(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(Modifier.fillMaxWidth().hideFromTalkBack(), verticalAlignment = Alignment.CenterVertically) {
            Row(Modifier.weight(1f), horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Icon(ApexIcons.ChevronDown, null, Modifier.size(14.dp), tint = colors.warningText)
                Text(stringResource(R.string.drivers_lowered).uppercase(), style = ApexTheme.type.statLabel, color = colors.warningText)
            }
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(stringResource(R.string.drivers_raised).uppercase(), style = ApexTheme.type.statLabel, color = colors.optimalText)
                Icon(ApexIcons.ChevronUp, null, Modifier.size(14.dp), tint = colors.optimalText)
            }
        }
        if (sorted.isEmpty()) {
            Text(emptyText, style = ApexTheme.type.body, color = colors.foregroundSecondary)
        }
        sorted.forEach { item ->
            DriverRow(item, unit, maxAbs)
        }
    }
}

@Composable
private fun DriverRow(item: DriverItem, unit: String, maxAbs: Double) {
    val colors = ApexTheme.colors
    val valueText = MetricFormat.delta(item.delta, 0)
    val spoken = stringResource(
        when {
            item.delta > 0 -> R.string.cd_driver_raised
            item.delta < 0 -> R.string.cd_driver_lowered
            else -> R.string.cd_driver_neutral
        },
        item.label,
        MetricFormat.number(abs(item.delta), 0),
        unit,
    )
    val tint = when {
        item.delta > 0 -> colors.optimalText
        item.delta < 0 -> colors.warningText
        else -> colors.foregroundSecondary
    }
    ApexCard(
        spokenDescription = spoken,
        contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
    ) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(item.label.uppercase(), style = ApexTheme.type.statLabel, color = colors.foreground, modifier = Modifier.weight(1f))
                Text("$valueText $unit", style = ApexTheme.type.statSubValue, color = tint)
            }
            DriverBar(item.delta, maxAbs)
        }
    }
}

@Composable
private fun DriverBar(delta: Double, maxAbs: Double) {
    val colors = ApexTheme.colors
    val hatch = colors.patternHatch
    val centre = colors.foreground
    val fill = if (delta >= 0) colors.optimal else colors.warning
    val share = if (maxAbs > 0.0 && delta.isFinite()) (abs(delta) / maxAbs).coerceIn(0.0, 1.0).toFloat() else 0f
    val positive = delta >= 0
    Canvas(Modifier.fillMaxWidth().height(8.dp)) {
        val radius = CornerRadius(2.dp.toPx())
        // Hatched track: diagonal lines, no allocation per line (Offset is a value class).
        clipRect {
            val step = 4.dp.toPx()
            val w = 1.dp.toPx()
            var x = -size.height
            while (x < size.width) {
                drawLine(hatch, Offset(x, size.height), Offset(x + size.height, 0f), strokeWidth = w)
                x += step
            }
        }
        val half = size.width / 2f
        val barW = half * share
        if (barW > 0f) {
            val left = if (positive) half else half - barW
            drawRoundRect(fill, Offset(left, 0f), Size(barW, size.height), radius)
        }
        drawCircle(centre, 3.dp.toPx(), Offset(half, size.height / 2f))
    }
}

@Preview(name = "DriverList dark")
@Composable
private fun DriverListPreviewDark() = ApexPreview(dark = true) { DriverListPreviewBody() }

@Preview(name = "DriverList light")
@Composable
private fun DriverListPreviewLight() = ApexPreview(dark = false) { DriverListPreviewBody() }

@Composable
private fun DriverListPreviewBody() {
    DriverList(
        items = listOf(
            DriverItem("hrv", "HRV above baseline", 12.0),
            DriverItem("rhr", "Resting heart rate", -4.0),
            DriverItem("sleep", "Sleep performance", 7.0),
        ),
        unit = "pts",
    )
}
