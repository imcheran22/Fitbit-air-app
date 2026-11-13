package com.apex.athlete.ui.stress

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
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartClock
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.charts.StressStripChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.components.Tag
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.DayBanner
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.EstimateTag
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.LinkRow
import com.apex.athlete.ui.detail.SeriesChartCard
import com.apex.athlete.ui.detail.SeriesPanel
import com.apex.athlete.ui.detail.SeriesUi
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.detail.StateBody
import com.apex.athlete.ui.detail.WindowLabels
import com.apex.athlete.ui.detail.readyOrNull
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import com.apex.athlete.ui.overview.StressTier
import java.time.LocalDate

/** Stress for one day: the minute strip, level, minutes per tier and how it is estimated. Always labelled an estimate. */
@Composable
fun StressRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle -> StressViewModel(day.toEpochDay(), handle, container.repository::stressEnergy) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val ui = remember(load, formatter) { load.readyOrNull()?.let { buildStressDetail(it, formatter) } }
    val clock = remember(formatter) { ChartClock(use24Hour = formatter.clock24h) }
    var selected by rememberSaveable { mutableStateOf<Long?>(null) }
    StressScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        ui = ui,
        failed = load is DetailLoad.Failed,
        clock = clock,
        selectedDay = selected,
        dayLabel = { epochDay -> formatter.dayLabel(LocalDate.ofEpochDay(epochDay)) },
        onSelectDay = { selected = it },
        onOpenDay = { epochDay -> selected = null; onDayChange(LocalDate.ofEpochDay(epochDay)) },
        onOpenEnergy = { navigator.openEnergy(day) },
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
    )
}

@StringRes
private fun tierRes(tier: StressTier): Int = when (tier) {
    StressTier.Low -> R.string.stress_tier_low
    StressTier.Medium -> R.string.stress_tier_medium
    StressTier.High -> R.string.stress_tier_high
}

private fun tierTone(tier: StressTier): ChipTone = when (tier) {
    StressTier.Low -> ChipTone.OPTIMAL
    StressTier.Medium -> ChipTone.WARNING
    StressTier.High -> ChipTone.ALERT
}

private fun minutesOf(state: MetricState): Int? = (state as? MetricState.Value)?.value?.toInt()

@Composable
internal fun StressScreen(
    title: String,
    canGoNext: Boolean,
    ui: StressDetailUi?,
    failed: Boolean,
    clock: ChartClock,
    selectedDay: Long?,
    dayLabel: (Long) -> String,
    onSelectDay: (Long?) -> Unit,
    onOpenDay: (Long) -> Unit,
    onOpenEnergy: () -> Unit,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
) {
    val shown = ui ?: StressDetailUi.Loading
    val tierText = shown.tier?.let { stringResource(tierRes(it)) }
    val spokenExtras = listOfNotNull(tierText, stringResource(R.string.detail_estimate_spoken))
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        banner = { DayBanner(title, canGoNext, onPrevious, onNext, onToday) },
        hero = {
            Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                StatBlock(
                    label = stringResource(R.string.stress_hero_label),
                    state = shown.level,
                    valueStyle = ApexTheme.type.statValueLarge,
                    extras = spokenExtras,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    EstimateTag()
                    if (tierText != null && shown.tier != null) Tag(tierText, tone = tierTone(shown.tier))
                }
            }
        },
        primary = {
            if (failed) FailedCard()
            SectionShell(stringResource(R.string.stress_section_day)) { DayCard(shown, clock) }
            SectionShell(stringResource(R.string.stress_section_baseline)) { BaselineCard(shown) }
            val history = shown.history
            if (history != null) {
                SectionShell(stringResource(R.string.stress_section_history)) {
                    SeriesChartCard(
                        title = stringResource(R.string.stress_history_title),
                        panel = SeriesPanel.Ready(history),
                        selectedDay = selectedDay,
                        onSelectDay = onSelectDay,
                        dayLabel = dayLabel,
                        onOpenDay = onOpenDay,
                        emptyText = stringResource(R.string.stress_history_empty),
                    )
                }
            }
            ApexCard {
                LinkRow(
                    text = stringResource(R.string.stress_link_energy),
                    description = stringResource(R.string.stress_link_energy_cd),
                    onClick = onOpenEnergy,
                )
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.detail_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.stress_how_p1))
                        BodyText(stringResource(R.string.stress_how_p2))
                        BodyText(stringResource(R.string.stress_how_p3))
                        BodyText(stringResource(R.string.stress_how_p4))
                    }
                }
            }
        },
    )
}

@Composable
private fun DayCard(ui: StressDetailUi, clock: ChartClock) {
    val colors = ApexTheme.colors
    val low = minutesOf(ui.lowMinutes)
    val medium = minutesOf(ui.mediumMinutes)
    val high = minutesOf(ui.highMinutes)
    ApexCard {
        if (ui.level is MetricState.Value && ui.points.isNotEmpty()) {
            val description = stringResource(
                R.string.stress_chart_desc,
                com.apex.athlete.ui.detail.clockLabel(ui.windowStartMillis, clock),
                com.apex.athlete.ui.detail.clockLabel(ui.windowEndMillis, clock),
                low ?: 0, medium ?: 0, high ?: 0,
            )
            StressStripChart(
                points = ui.points,
                windowStartMillis = ui.windowStartMillis,
                windowEndMillis = ui.windowEndMillis,
                description = description,
            )
            WindowLabels(ui.windowStartMillis, ui.windowEndMillis, clock)
            Row(Modifier.fillMaxWidth().padding(top = ApexSpacing.md), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                TierCell(R.string.stress_tier_low, ui.lowMinutes, colors.stressLow, Modifier.weight(1f))
                TierCell(R.string.stress_tier_medium, ui.mediumMinutes, colors.stressMedium, Modifier.weight(1f))
                TierCell(R.string.stress_tier_high, ui.highMinutes, colors.stressHigh, Modifier.weight(1f))
            }
            Caption(stringResource(R.string.stress_minutes_label), Modifier.padding(top = ApexSpacing.sm))
        } else if (ui.level is MetricState.Loading) {
            StateBody(ui.level)
        } else if (ui.level is MetricState.Value) {
            ReasonPlaceholder(stringResource(R.string.stress_chart_empty), ApexIcons.Info, size = ReasonSize.Medium)
        } else {
            // Calibrating, no motion data, too few minutes: the reason in words, never an empty chart.
            ReasonPlaceholder(ui.level, size = ReasonSize.Medium)
        }
    }
}

@Composable
private fun TierCell(@StringRes label: Int, state: MetricState, swatch: Color, modifier: Modifier) {
    Column(modifier, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            Box(Modifier.size(8.dp).background(swatch, ApexShapes.swatch).hideFromTalkBack())
            Text(stringResource(label).uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foregroundSecondary)
        }
        MetricValueText(state, valueStyle = ApexTheme.type.statValue)
    }
}

@Composable
private fun BaselineCard(ui: StressDetailUi) {
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.lg)) {
            StatBlock(stringResource(R.string.stress_baseline_label), ui.baselineBpm)
            val days = ui.baselineDays
            if (days != null && ui.baselineBpm is MetricState.Value) {
                Caption(pluralStringResource(R.plurals.stress_baseline_days, days, days))
            }
            StatBlock(stringResource(R.string.stress_today_label), ui.dayBpm)
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private val PreviewDerived = DataProvenance.MATHEMATICALLY_DERIVED
private const val PREVIEW_START = 1_800_000_000_000L
private const val PREVIEW_END = 20_400L

private fun previewUi(): StressDetailUi {
    val minute = 60_000L
    val strip = (0 until 360).map { i ->
        ChartPoint(PREVIEW_START + i * minute, if (i in 120..150) null else if (i in 200..230) 2.3 else if (i in 60..100) 1.2 else 0.5)
    }
    val history = (0 until 14).map { i -> ChartPoint(PREVIEW_END - 13 + i, if (i == 5) null else 0.6 + (i % 4) * 0.3) }
    return StressDetailUi(
        PREVIEW_END,
        MetricState.Value(0.9, 1, "/ 3", PreviewDerived), StressTier.Low,
        MetricState.Value(240.0, 0, "min", PreviewDerived), MetricState.Value(80.0, 0, "min", PreviewDerived), MetricState.Value(31.0, 0, "min", PreviewDerived),
        strip, PREVIEW_START, PREVIEW_START + 359 * minute,
        MetricState.Value(58.0, 0, "bpm", PreviewDerived), 12, MetricState.Value(60.0, 0, "bpm", PreviewDerived),
        SeriesUi(MetricType.STRESS_SCORE, DaySeries("Stress", history, "", 1), PREVIEW_END - 13, PREVIEW_END, "Calculated"),
        false,
    )
}

@HealthThemePreviews
@Composable
private fun StressPreview() = HealthPreviewFrame {
    StressScreen("Today", false, previewUi(), false, ChartClock(), PREVIEW_END - 4, { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {})
}

@HealthThemePreviews
@Composable
private fun StressCalibratingPreview() = HealthPreviewFrame {
    val calibrating = MetricState.Calibrating(3)
    val ui = StressDetailUi(
        PREVIEW_END, calibrating, null, calibrating, calibrating, calibrating, emptyList(), 0L, 0L,
        calibrating, 4, MetricState.Unavailable(MetricReason.NO_DATA), null, false,
    )
    StressScreen("Today", false, ui, false, ChartClock(), null, { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {})
}

@HealthThemePreviews
@Composable
private fun StressLoadingPreview() = HealthPreviewFrame {
    StressScreen("Today", false, null, false, ChartClock(), null, { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {})
}
