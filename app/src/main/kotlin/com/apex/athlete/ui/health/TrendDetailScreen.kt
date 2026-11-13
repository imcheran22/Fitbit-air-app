package com.apex.athlete.ui.health

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.pluralStringResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartBand
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.ChartScales
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.charts.DaySeriesChart
import com.apex.athlete.core.ui.charts.ChartTone
import com.apex.athlete.core.ui.charts.TrendLineChart
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChipTone
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.components.StatusChip
import com.apex.athlete.core.ui.components.hideFromTalkBack
import com.apex.athlete.core.ui.components.spoken
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.theme.ApexShapes
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.LinkRow
import com.apex.athlete.ui.detail.SelectedDayRow
import com.apex.athlete.ui.trends.dayTargetOf
import com.apex.athlete.ui.trends.openDayTarget
import java.time.LocalDate

/** Trend detail: a range selector, the line with its baseline band, min, max, mean and how the baseline is made. */
@Composable
fun TrendDetailRoute(navigator: ApexNavigator, metric: MetricType) {
    val vm = apexViewModel(key = "health-trend-${metric.storageKey}") { container, handle ->
        TrendDetailViewModel(container.repository, handle, metric)
    }
    val load by vm.state.collectAsStateWithLifecycle()
    val range by vm.range.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    val loaded = load as? TrendLoad.Loaded
    val ui = remember(loaded, mapper, formatter) {
        loaded?.let { buildTrendDetail(it.trend, it.rangeDays, it.endDay, mapper, formatter) }
    }
    TrendDetailScreen(
        title = stringResource(metricTitleRes(metric)),
        load = load,
        ui = ui,
        selectedRange = range,
        onSelectRange = vm::selectRange,
        onBack = navigator::back,
        onOpenDay = { epochDay -> navigator.openDayTarget(dayTargetOf(metric), LocalDate.ofEpochDay(epochDay)) },
        onCompare = { navigator.openTrends(metric) },
    )
}

@Composable
internal fun TrendDetailScreen(
    title: String,
    load: TrendLoad,
    ui: TrendDetailUi?,
    selectedRange: Int,
    onSelectRange: (Int) -> Unit,
    onBack: () -> Unit,
    /** When set, a tap on the chart selects a day and a button opens that day's screen. */
    onOpenDay: ((Long) -> Unit)? = null,
    /** When set, a link offers to compare this figure with another on the trends overlay. */
    onCompare: (() -> Unit)? = null,
) {
    var selectedDay by rememberSaveable { mutableStateOf<Long?>(null) }
    val formatter = LocalFormatter.current
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        hero = { TrendHero(title, load, ui) },
        primary = {
            RangeSelector(selectedRange, onSelectRange)
            when {
                ui == null && load is TrendLoad.Loading -> ApexCard {
                    SkeletonLineFill(height = 180.dp)
                }
                ui == null -> ApexCard {
                    ReasonPlaceholder(
                        text = stringResource(R.string.health_trend_no_data),
                        icon = ApexIcons.Info,
                        size = ReasonSize.Medium,
                    )
                }
                else -> {
                    ApexCard {
                        if (onOpenDay != null) {
                            DaySeriesChart(
                                title = title,
                                primary = DaySeries(
                                    label = title,
                                    points = ui.points,
                                    valueSuffix = if (ui.unit.isBlank()) "" else " ${ui.unit}",
                                    decimals = ui.decimals,
                                    baseline = ui.baseline,
                                ),
                                startDay = ui.endDay - (ui.rangeDays - 1),
                                endDay = ui.endDay,
                                selectedDay = selectedDay,
                                onSelectDay = { selectedDay = it },
                                provenance = ui.provenance,
                            )
                            val inRange = selectedDay?.takeIf { it in (ui.endDay - (ui.rangeDays - 1))..ui.endDay }
                            SelectedDayRow(
                                dayLabel = inRange?.let { formatter.dayLabel(LocalDate.ofEpochDay(it)) },
                                onOpen = { inRange?.let(onOpenDay) },
                            )
                        } else {
                            TrendLineChart(
                                title = title,
                                points = ui.points,
                                rangeDays = ui.rangeDays,
                                endDay = ui.endDay,
                                baseline = ui.baseline,
                                valueSuffix = if (ui.unit.isBlank()) "" else " ${ui.unit}",
                                decimals = ui.decimals,
                                provenance = ui.provenance,
                            )
                        }
                        if (ui.baseline != null) {
                            Text(
                                stringResource(R.string.health_trend_baseline_note),
                                style = ApexTheme.type.caption,
                                color = ApexTheme.colors.mutedForeground,
                                modifier = Modifier.padding(top = ApexSpacing.sm),
                            )
                        }
                    }
                    SummaryCard(ui)
                    if (onCompare != null) {
                        ApexCard {
                            LinkRow(
                                text = stringResource(R.string.trends_compare_action),
                                description = stringResource(R.string.trends_compare_cd, title),
                                onClick = onCompare,
                            )
                        }
                    }
                }
            }
        },
        secondary = { BaselineExplanation(ui) },
    )
}

@Composable
private fun TrendHero(title: String, load: TrendLoad, ui: TrendDetailUi?) {
    val state: MetricState = when {
        ui != null -> ui.headline
        load is TrendLoad.Loading -> MetricState.Loading
        else -> MetricState.Unavailable(MetricReason.NO_DATA)
    }
    val status = ui?.statusLabel
    val z = ui?.zScore?.let { ChartScales.formatSigned(it, 1) }
    val zText = z?.let { stringResource(R.string.health_trend_z, it) }
    val spoken = metricSpoken(title, state, extras = listOfNotNull(status, zText))
    Column(
        Modifier.fillMaxWidth().spoken(spoken).padding(vertical = ApexSpacing.sm),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        Column(
            Modifier.hideFromTalkBack(),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
        ) {
            MetricStateView(state, label = title) { v ->
                Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                    MetricValueText(v, valueStyle = ApexTheme.type.statValueLarge)
                    MetricProvenance(v)
                }
            }
            if (ui != null) {
                Row(horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm), verticalAlignment = Alignment.CenterVertically) {
                    StatusChip(ui.statusLabel, tone = ui.zTone.toChipTone())
                    if (zText != null) StatusChip(zText, tone = ui.zTone.toChipTone())
                }
            }
        }
    }
}

private fun ChartTone.toChipTone(): ChipTone = when (this) {
    ChartTone.OPTIMAL -> ChipTone.OPTIMAL
    ChartTone.WARNING -> ChipTone.WARNING
    else -> ChipTone.NEUTRAL
}

@Composable
private fun RangeSelector(selected: Int, onSelect: (Int) -> Unit) {
    val groupDescription = stringResource(R.string.health_trend_range_selector_cd)
    Row(
        Modifier.fillMaxWidth().selectableGroup().semantics { contentDescription = groupDescription },
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.sm),
    ) {
        TREND_RANGES.forEach { days ->
            val isSelected = days == selected
            val colors = ApexTheme.colors
            val label = pluralStringResource(R.plurals.health_range_days, days, days)
            val description = pluralStringResource(R.plurals.health_range_option_cd, days, days)
            Box(
                Modifier
                    .weight(1f)
                    .heightIn(min = ApexSpacing.minTouch)
                    .clip(ApexShapes.chip)
                    .background(if (isSelected) colors.primary else colors.secondary)
                    .selectable(selected = isSelected, role = Role.RadioButton, onClick = { onSelect(days) })
                    .semantics { contentDescription = description }
                    .padding(horizontal = ApexSpacing.xs, vertical = ApexSpacing.sm),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    label,
                    style = ApexTheme.type.button,
                    color = if (isSelected) colors.primaryForeground else colors.foregroundSecondary,
                    textAlign = TextAlign.Center,
                )
            }
        }
    }
}

@Composable
private fun SummaryCard(ui: TrendDetailUi) {
    ApexCard {
        Text(
            stringResource(R.string.health_trend_summary_title).uppercase(),
            style = ApexTheme.type.cardTitle,
            color = ApexTheme.colors.foreground,
            modifier = Modifier.semantics { heading() },
        )
        Row(Modifier.fillMaxWidth().padding(top = ApexSpacing.md), horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            SummaryStat(stringResource(R.string.health_trend_min), ui.min, Modifier.weight(1f))
            SummaryStat(stringResource(R.string.health_trend_max), ui.max, Modifier.weight(1f))
            SummaryStat(stringResource(R.string.health_trend_mean), ui.mean, Modifier.weight(1f))
        }
        Text(
            stringResource(R.string.health_trend_readings, ui.readings, ui.days),
            style = ApexTheme.type.caption,
            color = ApexTheme.colors.mutedForeground,
            modifier = Modifier.padding(top = ApexSpacing.md),
        )
        MetricProvenance(ui.mean, Modifier.padding(top = ApexSpacing.xs))
    }
}

@Composable
private fun SummaryStat(label: String, state: MetricState, modifier: Modifier) {
    Column(modifier.spoken(metricSpoken(label, state)), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
        Column(Modifier.hideFromTalkBack(), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.mutedForeground)
            MetricStateView(state, label = label) { v -> MetricValueText(v) }
        }
    }
}

@Composable
private fun BaselineExplanation(ui: TrendDetailUi?) {
    SectionShell(stringResource(R.string.health_calc_title)) {
        ApexCard {
            Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                CalcText(stringResource(R.string.health_calc_window))
                CalcText(stringResource(R.string.health_calc_range))
                CalcText(stringResource(R.string.health_calc_calibration))
                if (ui?.logScale == true) CalcText(stringResource(R.string.health_calc_hrv))
                CalcText(stringResource(R.string.health_calc_floor))
                if (ui != null) {
                    val progress = if (ui.baselineEstablished) {
                        stringResource(R.string.health_calc_established, ui.baselineValidDays)
                    } else {
                        stringResource(R.string.health_calc_progress, ui.baselineValidDays, ui.baselineRequiredDays)
                    }
                    Text(progress, style = ApexTheme.type.bodyStrong, color = ApexTheme.colors.foreground)
                }
            }
        }
    }
}

@Composable
private fun CalcText(text: String) {
    Text(text, style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody)
}

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L

private fun previewDetail(established: Boolean = true): TrendDetailUi {
    val points = (0 until 30).map { i ->
        ChartPoint(PREVIEW_END - 29 + i, if (i % 9 == 4) null else 62.0 + ((i * 7) % 11 - 5))
    }
    val derived = DataProvenance.MATHEMATICALLY_DERIVED
    return TrendDetailUi(
        metric = MetricType.HRV_RMSSD,
        titleRes = R.string.health_metric_hrv,
        headline = MetricState.Value(66.0, 0, "ms", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, asOf = "Yesterday"),
        statusLabel = "Within your usual range",
        zScore = 0.6,
        zTone = ChartTone.NEUTRAL,
        points = points,
        baseline = if (established) ChartBand(57.0, 68.0) else null,
        decimals = 0,
        unit = "ms",
        provenance = "Measured",
        rangeDays = 30,
        endDay = PREVIEW_END,
        min = MetricState.Value(57.0, 0, "ms", derived),
        max = MetricState.Value(67.0, 0, "ms", derived),
        mean = MetricState.Value(62.0, 0, "ms", derived),
        readings = 26,
        days = 30,
        baselineEstablished = established,
        baselineValidDays = if (established) 28 else 4,
        baselineRequiredDays = 7,
        logScale = true,
    )
}

@HealthThemePreviews
@Composable
private fun TrendDetailPreview() = HealthPreviewFrame {
    val ui = previewDetail()
    TrendDetailScreen("Heart rate variability", TrendLoad.Loading, ui, 30, {}, {})
}

@HealthThemePreviews
@Composable
private fun TrendDetailCalibratingPreview() = HealthPreviewFrame {
    val ui = previewDetail(established = false).copy(
        headline = MetricState.Calibrating(3), statusLabel = "Learning your baseline", zScore = null,
    )
    TrendDetailScreen("Heart rate variability", TrendLoad.Loading, ui, 14, {}, {})
}

@HealthThemePreviews
@Composable
private fun TrendDetailLoadingPreview() = HealthPreviewFrame {
    TrendDetailScreen("Heart rate variability", TrendLoad.Loading, null, 30, {}, {})
}
