package com.apex.athlete.ui.overview

import androidx.annotation.StringRes
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.ChartScales
import com.apex.athlete.core.ui.charts.EnergyCurveChart
import com.apex.athlete.core.ui.charts.StressStripChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.SkeletonLine
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.core.ui.theme.ThemePreference
import com.apex.athlete.ui.common.ActivityRowUi
import com.apex.athlete.ui.common.activityLabelRes
import java.util.Locale

/** Short label of a figure in the compact activity row. */
@StringRes
private fun shortLabelRes(metric: MetricType): Int = when (metric) {
    MetricType.CALORIES_ACTIVE -> R.string.activity_calories_active_short
    MetricType.ACTIVE_ZONE_MINUTES -> R.string.activity_azm_short
    else -> activityLabelRes(metric) ?: R.string.activity_steps
}

@StringRes
private fun tierRes(tier: StressTier): Int = when (tier) {
    StressTier.Low -> R.string.overview_stress_tier_low
    StressTier.Medium -> R.string.overview_stress_tier_medium
    StressTier.High -> R.string.overview_stress_tier_high
}

private fun tierTone(tier: StressTier): ChipTone = when (tier) {
    StressTier.Low -> ChipTone.OPTIMAL
    StressTier.Medium -> ChipTone.WARNING
    StressTier.High -> ChipTone.ALERT
}

private fun minutesOf(state: MetricState): Int? = (state as? MetricState.Value)?.value?.toInt()

private fun clockOf(millis: Long, clock: ChartClock): String =
    ChartScales.formatClock(millis, clock.zone, clock.use24Hour, Locale.getDefault())

@Composable
private fun StateBody(state: MetricState) {
    if (state is MetricState.Loading) {
        SkeletonLine(width = 96.dp, height = 36.dp)
        return
    }
    MetricValueText(state, valueStyle = ApexTheme.type.statValueLarge)
    if (state is MetricState.Value) {
        MetricProvenance(state)
        if (state.isProvisional) Tag(stringResource(com.apex.athlete.core.ui.R.string.tag_provisional))
    } else {
        ReasonPlaceholder(state, size = ReasonSize.Small)
    }
}

@Composable
private fun CardTitle(text: String) {
    Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
        Text(text.uppercase(), style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foreground, modifier = Modifier.weight(1f))
        Tag(stringResource(R.string.overview_estimate_tag))
    }
}

@Composable
private fun WindowLabels(startMillis: Long, endMillis: Long, clock: ChartClock) {
    Row(Modifier.fillMaxWidth().hideFromTalkBack(), horizontalArrangement = Arrangement.SpaceBetween) {
        Text(clockOf(startMillis, clock), style = ApexTheme.type.chart, color = ApexTheme.colors.mutedForeground)
        Text(clockOf(endMillis, clock), style = ApexTheme.type.chart, color = ApexTheme.colors.mutedForeground)
    }
}

/** The day's stress: level, minutes per tier and the minute strip. An estimate from heart rate while still. */
@Composable
internal fun StressCard(ui: StressCardUi, clock: ChartClock) {
    val colors = ApexTheme.colors
    val title = stringResource(R.string.overview_stress_title)
    val tierText = ui.tier?.let { stringResource(tierRes(it)) }
    val low = minutesOf(ui.lowMinutes)
    val medium = minutesOf(ui.mediumMinutes)
    val high = minutesOf(ui.highMinutes)
    val minutesSpoken = if (low != null && medium != null && high != null) {
        stringResource(R.string.overview_stress_minutes_spoken, low, medium, high)
    } else {
        null
    }
    val spoken = metricSpoken(
        title,
        ui.level,
        extras = listOfNotNull(tierText, minutesSpoken, stringResource(R.string.overview_estimate_spoken)),
    )
    ApexCard(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().spoken(spoken), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                CardTitle(title)
                StateBody(ui.level)
                if (tierText != null && ui.tier != null) Tag(tierText, tone = tierTone(ui.tier))
                if (ui.level is MetricState.Value) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        MinutesCell(stringResource(R.string.overview_stress_tier_low), ui.lowMinutes, colors.stressLow, Modifier.weight(1f))
                        MinutesCell(stringResource(R.string.overview_stress_tier_medium), ui.mediumMinutes, colors.stressMedium, Modifier.weight(1f))
                        MinutesCell(stringResource(R.string.overview_stress_tier_high), ui.highMinutes, colors.stressHigh, Modifier.weight(1f))
                    }
                }
            }
        }
        if (ui.level is MetricState.Value && ui.points.isNotEmpty()) {
            val description = stringResource(
                R.string.overview_stress_chart_desc,
                clockOf(ui.windowStartMillis, clock),
                clockOf(ui.windowEndMillis, clock),
                low ?: 0,
                medium ?: 0,
                high ?: 0,
            )
            StressStripChart(
                points = ui.points,
                windowStartMillis = ui.windowStartMillis,
                windowEndMillis = ui.windowEndMillis,
                description = description,
                modifier = Modifier.padding(top = ApexSpacing.md),
            )
            WindowLabels(ui.windowStartMillis, ui.windowEndMillis, clock)
        }
        Text(
            stringResource(R.string.overview_stress_footnote),
            style = ApexTheme.type.caption,
            color = colors.mutedForeground,
            modifier = Modifier.padding(top = ApexSpacing.sm),
        )
    }
}

@Composable
private fun MinutesCell(label: String, state: MetricState, swatch: Color, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(8.dp).background(swatch, ApexShapes.swatch))
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foregroundSecondary)
        }
        MetricValueText(state, valueStyle = ApexTheme.type.statValue)
    }
}

/** The energy bank now and its curve through the day. A model that starts at the morning recovery, not a measurement. */
@Composable
internal fun EnergyCard(ui: EnergyCardUi, clock: ChartClock) {
    val colors = ApexTheme.colors
    val title = stringResource(R.string.overview_energy_title)
    val lowest = (ui.lowest as? MetricState.Value)?.let { stringResource(R.string.overview_energy_lowest_spoken, it.numberText()) }
    val spoken = metricSpoken(title, ui.bank, extras = listOfNotNull(lowest, stringResource(R.string.overview_estimate_spoken)))
    ApexCard(Modifier.fillMaxWidth()) {
        Column(Modifier.fillMaxWidth().spoken(spoken), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                CardTitle(title)
                StateBody(ui.bank)
                if (ui.lowest is MetricState.Value) {
                    Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                        Text(
                            stringResource(R.string.overview_energy_lowest).uppercase(),
                            style = ApexTheme.type.statLabel,
                            color = colors.foregroundSecondary,
                        )
                        MetricValueText(ui.lowest, valueStyle = ApexTheme.type.statValue)
                    }
                }
            }
        }
        if (ui.bank is MetricState.Value && ui.points.isNotEmpty()) {
            val current = (ui.bank as MetricState.Value).numberText()
            val description = stringResource(
                R.string.overview_energy_chart_desc,
                clockOf(ui.windowStartMillis, clock),
                clockOf(ui.windowEndMillis, clock),
                current,
                (ui.lowest as? MetricState.Value)?.numberText() ?: stringResource(R.string.overview_value_missing),
            )
            EnergyCurveChart(
                points = ui.points,
                windowStartMillis = ui.windowStartMillis,
                windowEndMillis = ui.windowEndMillis,
                description = description,
                modifier = Modifier.padding(top = ApexSpacing.md),
            )
            WindowLabels(ui.windowStartMillis, ui.windowEndMillis, clock)
        }
        Text(
            stringResource(R.string.overview_energy_footnote),
            style = ApexTheme.type.caption,
            color = colors.mutedForeground,
            modifier = Modifier.padding(top = ApexSpacing.sm),
        )
    }
}

/** Compact activity row: steps, active calories, distance and active zone minutes. Opens the Strain screen. */
@Composable
internal fun ActivityRow(rows: List<ActivityRowUi>, onOpen: () -> Unit) {
    val title = stringResource(R.string.overview_activity_title)
    val labels = rows.map { stringResource(shortLabelRes(it.metric)) }
    val spokenRows = rows.mapIndexed { i, r -> metricSpoken(labels[i], r.state) }
    val spoken = stringResource(R.string.overview_activity_spoken, title, spokenRows.joinToString(". "))
    ApexCard(Modifier.fillMaxWidth(), onClick = onOpen, spokenDescription = spoken) {
        Column(Modifier.fillMaxWidth().hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(title.uppercase(), style = ApexTheme.type.cardTitle, color = ApexTheme.colors.foreground)
            rows.indices.chunked(2).forEach { pair ->
                Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                    pair.forEach { i -> ActivityTile(labels[i], rows[i].state, Modifier.weight(1f)) }
                    if (pair.size == 1) Box(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun ActivityTile(label: String, state: MetricState, modifier: Modifier = Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foregroundSecondary)
        if (state is MetricState.Loading) {
            SkeletonLine(width = 72.dp, height = 24.dp)
        } else {
            MetricValueText(state, valueStyle = ApexTheme.type.statValue)
            if (state is MetricState.Value) {
                MetricProvenance(state)
                if (state.isProvisional) Tag(stringResource(com.apex.athlete.core.ui.R.string.tag_provisional))
            } else {
                ReasonPlaceholder(state, size = ReasonSize.Small)
            }
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private val PreviewDerived = DataProvenance.MATHEMATICALLY_DERIVED
private val PreviewSensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
private const val PREVIEW_START = 1_800_000_000_000L

internal fun previewExtras(): OverviewExtrasUi {
    val minute = 60_000L
    val strip = (0 until 360).map { i ->
        ChartPoint(PREVIEW_START + i * minute, if (i in 120..150) null else if (i in 200..230) 2.3 else if (i in 60..100) 1.2 else 0.5)
    }
    val curve = (0 until 360 step 5).map { i -> ChartPoint(PREVIEW_START + i * minute, 88.0 - i * 0.12) }
    return OverviewExtrasUi(
        stress = StressCardUi(
            level = MetricState.Value(0.9, 1, "/ 3", PreviewDerived),
            tier = StressTier.Low,
            lowMinutes = MetricState.Value(240.0, 0, "min", PreviewDerived),
            mediumMinutes = MetricState.Value(80.0, 0, "min", PreviewDerived),
            highMinutes = MetricState.Value(31.0, 0, "min", PreviewDerived),
            points = strip,
            windowStartMillis = PREVIEW_START,
            windowEndMillis = PREVIEW_START + 359 * minute,
        ),
        energy = EnergyCardUi(
            bank = MetricState.Value(46.0, 0, "/ 100", PreviewDerived),
            lowest = MetricState.Value(44.0, 0, "/ 100", PreviewDerived),
            points = curve,
            windowStartMillis = PREVIEW_START,
            windowEndMillis = PREVIEW_START + 355 * minute,
        ),
        activity = listOf(
            ActivityRowUi(MetricType.STEPS, MetricState.Value(8_412.0, 0, null, PreviewSensor, isProvisional = true)),
            ActivityRowUi(MetricType.CALORIES_ACTIVE, MetricState.Value(512.0, 0, "kcal", PreviewSensor, isProvisional = true)),
            ActivityRowUi(MetricType.DISTANCE, MetricState.Unavailable(MetricReason.NO_DATA)),
            ActivityRowUi(MetricType.ACTIVE_ZONE_MINUTES, MetricState.Value(34.0, 0, "min", PreviewSensor, isProvisional = true)),
        ),
    )
}

internal fun previewExtrasMissing(): OverviewExtrasUi {
    val stress = MetricState.Calibrating(3)
    val energy = MetricState.Unavailable(MetricReason.AWAITING_SLEEP_SYNC)
    return OverviewExtrasUi(
        stress = StressCardUi(stress, null, stress, stress, stress, emptyList(), 0L, 0L),
        energy = EnergyCardUi(energy, energy, emptyList(), 0L, 0L),
        activity = OVERVIEW_ACTIVITY_METRICS.map { ActivityRowUi(it, MetricState.Unavailable(MetricReason.NO_DATA)) },
    )
}

@Composable
private fun ExtrasPreview(dark: Boolean, extras: OverviewExtrasUi) {
    ApexTheme(if (dark) ThemePreference.DARK else ThemePreference.LIGHT) {
        Column(
            Modifier.background(ApexTheme.colors.background).padding(ApexSpacing.gutter),
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.cardGap),
        ) {
            StressCard(extras.stress, ChartClock())
            EnergyCard(extras.energy, ChartClock())
            ActivityRow(extras.activity) {}
        }
    }
}

@Preview(name = "Overview extras dark", heightDp = 1100)
@Composable
private fun ExtrasDark() = ExtrasPreview(true, previewExtras())

@Preview(name = "Overview extras light", heightDp = 1100)
@Composable
private fun ExtrasLight() = ExtrasPreview(false, previewExtras())

@Preview(name = "Overview extras missing dark", heightDp = 800)
@Composable
private fun ExtrasMissingDark() = ExtrasPreview(true, previewExtrasMissing())

@Preview(name = "Overview extras missing light", heightDp = 800)
@Composable
private fun ExtrasMissingLight() = ExtrasPreview(false, previewExtrasMissing())
