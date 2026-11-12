package com.apex.athlete.ui.health

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.BiometricSparklineCard
import com.apex.athlete.core.ui.charts.ChartBand
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.ChartTone
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.DatePill
import com.apex.athlete.core.ui.components.GoodDirection
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.components.MetricProvenance
import com.apex.athlete.core.ui.components.SkeletonLineFill
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.state.MetricStateView
import com.apex.athlete.core.ui.state.MetricValueText
import com.apex.athlete.core.ui.state.metricSpoken
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.MetricStateMapper
import com.apex.athlete.ui.common.apexViewModel
import java.time.LocalDate

/** The Health tab: monitor, trends, fitness and the heart rate entry (DESIGN_SYSTEM section 4, Health). */
@Composable
fun HealthRoute(
    navigator: ApexNavigator,
    day: LocalDate,
    onDayChange: (LocalDate) -> Unit,
    contentPadding: PaddingValues,
) {
    val vm = apexViewModel { container, _ -> HealthViewModel(container.repository, day.toEpochDay()) }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val dashboard by vm.dashboard.collectAsStateWithLifecycle()
    val trends by vm.trends.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val mapper = remember(formatter) { MetricStateMapper(formatter) }
    // Both reads must have arrived; until then the screen shows skeletons, never an empty list.
    val ui = remember(dashboard, trends, mapper, formatter) {
        val d = dashboard
        val t = trends
        if (d != null && t != null) buildHealthUi(d, t, mapper, formatter) else null
    }
    HealthScreen(
        ui = ui,
        dayLabel = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        onPreviousDay = { onDayChange(day.minusDays(1)) },
        onNextDay = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
        onOpenTrend = navigator::openTrend,
        onOpenHeartRate = { navigator.openHeartRateDay(day) },
        contentPadding = contentPadding,
    )
}

private val MONITOR_PLACEHOLDERS = listOf(
    R.string.health_metric_hrv,
    R.string.health_metric_rhr,
    R.string.health_metric_resp,
    R.string.health_metric_spo2,
    R.string.health_metric_skin,
)

@Composable
internal fun HealthScreen(
    ui: HealthUi?,
    dayLabel: String,
    canGoNext: Boolean,
    onPreviousDay: () -> Unit,
    onNextDay: () -> Unit,
    onToday: () -> Unit,
    onOpenTrend: (MetricType) -> Unit,
    onOpenHeartRate: () -> Unit,
    contentPadding: PaddingValues,
) {
    Column(
        Modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .windowInsetsPadding(WindowInsets.statusBars)
            .padding(horizontal = ApexSpacing.gutter)
            .padding(top = ApexSpacing.sm, bottom = contentPadding.calculateBottomPadding() + ApexSpacing.xl),
        verticalArrangement = Arrangement.spacedBy(ApexSpacing.sectionGap),
    ) {
        Row(Modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
            Text(
                stringResource(R.string.health_title),
                style = ApexTheme.type.sectionTitle,
                color = ApexTheme.colors.foreground,
                modifier = Modifier.weight(1f).semantics { heading() },
            )
            DatePill(
                label = dayLabel,
                onPrevious = onPreviousDay,
                onNext = onNextDay,
                onLabelClick = onToday,
                canGoNext = canGoNext,
                previousDescription = stringResource(R.string.health_hr_prev_day),
                nextDescription = stringResource(R.string.health_hr_next_day),
                labelClickDescription = stringResource(R.string.health_hr_go_today),
            )
        }
        MonitorSection(ui, onOpenTrend)
        TrendsSection(ui, onOpenTrend)
        FitnessSection(ui?.fitness, onOpenVo2 = { onOpenTrend(MetricType.VO2_MAX) })
        HeartRateSection(ui?.heartRate, onOpenHeartRate)
    }
}

@Composable
private fun Caption(text: String) {
    Text(text, style = ApexTheme.type.caption, color = ApexTheme.colors.mutedForeground)
}

@Composable
private fun MonitorSection(ui: HealthUi?, onOpenTrend: (MetricType) -> Unit) {
    SectionShell(stringResource(R.string.health_section_monitor)) {
        Caption(stringResource(R.string.health_monitor_caption))
        ApexCard(contentPadding = PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
            if (ui == null) {
                MONITOR_PLACEHOLDERS.forEach { res ->
                    KeyStatRow(label = stringResource(res), state = MetricState.Loading)
                }
            } else {
                ui.monitor.forEach { row ->
                    KeyStatRow(
                        label = stringResource(row.titleRes),
                        state = row.state,
                        average = row.average,
                        averageDecimals = row.decimals,
                        sd = row.sd,
                        goodDirection = row.good,
                        onClick = { onOpenTrend(row.metric) },
                    )
                }
            }
        }
    }
}

@Composable
private fun TrendsSection(ui: HealthUi?, onOpenTrend: (MetricType) -> Unit) {
    SectionShell(stringResource(R.string.health_section_trends)) {
        Caption(stringResource(R.string.health_trends_caption))
        when {
            ui == null -> repeat(3) {
                ApexCard {
                    SkeletonLineFill(height = 20.dp)
                    SkeletonLineFill(Modifier.padding(top = ApexSpacing.md), height = 56.dp)
                }
            }
            ui.trends.isEmpty() -> ApexCard {
                Text(stringResource(R.string.health_trends_empty), style = ApexTheme.type.body, color = ApexTheme.colors.foregroundBody)
            }
            else -> ui.trends.forEach { c ->
                BiometricSparklineCard(
                    title = stringResource(c.titleRes),
                    valueText = c.valueText,
                    unit = c.unit,
                    points = c.points,
                    startDay = ui.trendsStartDay,
                    endDay = ui.trendsEndDay,
                    baseline = c.baseline,
                    zScore = c.zScore,
                    provenance = c.provenance,
                    onClick = { onOpenTrend(c.metric) },
                    statusLabel = c.statusLabel,
                    zTone = c.zTone,
                    baselineLabel = c.baselineText,
                )
            }
        }
    }
}

@Composable
private fun FitnessSection(fitness: FitnessUi?, onOpenVo2: () -> Unit) {
    SectionShell(stringResource(R.string.health_section_fitness)) {
        val label = stringResource(R.string.health_metric_vo2)
        val state = fitness?.state ?: MetricState.Loading
        val caveat = if (fitness?.isEstimate == true) stringResource(R.string.health_fitness_estimate_caveat) else null
        val method = fitness?.method?.let { stringResource(R.string.health_fitness_method, it) }
        val action = stringResource(R.string.health_fitness_action)
        ApexCard(
            onClick = onOpenVo2,
            onClickLabel = action,
            spokenDescription = metricSpoken(label, state, extras = listOfNotNull(caveat, method)),
        ) {
            Text(label.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground)
            Column(Modifier.padding(top = ApexSpacing.sm), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                MetricStateView(state, label = label) { v ->
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                        MetricValueText(v, valueStyle = ApexTheme.type.statValueLarge)
                        MetricProvenance(v)
                    }
                }
                if (caveat != null) Caption(caveat)
                if (method != null) Caption(method)
            }
            ActionLine(action)
        }
    }
}

@Composable
private fun ActionLine(text: String) {
    Row(
        Modifier.padding(top = ApexSpacing.md),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(ApexSpacing.xs),
    ) {
        Text(text.uppercase(), style = ApexTheme.type.linkAction, color = ApexTheme.colors.foregroundSecondary)
        Icon(ApexIcons.ChevronRight, contentDescription = null, modifier = Modifier.size(16.dp), tint = ApexTheme.colors.foregroundSecondary)
    }
}

@Composable
private fun HeartRateSection(entry: HeartRateEntryUi?, onOpen: () -> Unit) {
    SectionShell(stringResource(R.string.health_section_heart_rate)) {
        val title = stringResource(R.string.health_hr_entry_title)
        val state = entry?.state ?: MetricState.Loading
        val action = stringResource(R.string.health_hr_entry_action)
        ApexCard(
            onClick = onOpen,
            onClickLabel = stringResource(R.string.health_hr_entry_cd),
            spokenDescription = metricSpoken(title, state, extras = listOf(action)),
        ) {
            Text(title.uppercase(), style = ApexTheme.type.statLabel, color = ApexTheme.colors.foreground)
            Column(Modifier.padding(top = ApexSpacing.sm), verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                MetricStateView(state, label = title) { v ->
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.xs)) {
                        MetricValueText(v, valueStyle = ApexTheme.type.statValueLarge)
                        MetricProvenance(v)
                    }
                }
            }
            ActionLine(action)
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L

private fun sampleSeries(base: Double, step: Double, gapAt: Int = -1): List<ChartPoint> =
    (0 until SPARKLINE_DAYS).map { i ->
        ChartPoint(PREVIEW_END - (SPARKLINE_DAYS - 1) + i, if (i == gapAt) null else base + step * ((i * 7) % 5 - 2))
    }

private fun previewUi(): HealthUi {
    val measured = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API
    fun card(metric: MetricType, res: Int, value: String?, unit: String, base: Double, step: Double, z: Double?, tone: ChartTone, gap: Int = -1) =
        TrendCardUi(
            metric, res, value, unit, "Within your usual range", sampleSeries(base, step, gap),
            ChartBand(base - step * 2, base + step * 2), z, tone, "Measured", "30-day range ${base - step * 2} to ${base + step * 2}",
        )
    return HealthUi(
        monitor = listOf(
            MonitorRowUi(MetricType.HRV_RMSSD, R.string.health_metric_hrv, MetricState.Value(68.0, 0, "ms", measured), 62.0, 0, 8.0, GoodDirection.UP),
            MonitorRowUi(MetricType.RESTING_HEART_RATE, R.string.health_metric_rhr, MetricState.Value(52.0, 0, "bpm", measured), 53.0, 0, 2.0, GoodDirection.DOWN),
            MonitorRowUi(MetricType.RESPIRATORY_RATE, R.string.health_metric_resp, MetricState.Calibrating(3), null, 1, null, GoodDirection.NEUTRAL),
            MonitorRowUi(MetricType.SPO2_AVG, R.string.health_metric_spo2, MetricState.Value(96.5, 1, "%", measured), 96.8, 1, 0.5, GoodDirection.UP),
            MonitorRowUi(MetricType.SKIN_TEMP_DEVIATION, R.string.health_metric_skin, MetricState.Unavailable(), null, 1, null, GoodDirection.NEUTRAL),
        ),
        trends = listOf(
            card(MetricType.HRV_RMSSD, R.string.health_metric_hrv, "68", "ms", 62.0, 3.0, 0.8, ChartTone.NEUTRAL),
            card(MetricType.RESTING_HEART_RATE, R.string.health_metric_rhr, "52", "bpm", 53.0, 1.0, -0.5, ChartTone.NEUTRAL, gap = 6),
            card(MetricType.SPO2_AVG, R.string.health_metric_spo2, null, "%", 96.0, 0.3, null, ChartTone.NEUTRAL),
        ),
        trendsStartDay = PREVIEW_END - (SPARKLINE_DAYS - 1),
        trendsEndDay = PREVIEW_END,
        fitness = FitnessUi(MetricState.Value(47.5, 1, "ml/kg/min", DataProvenance.ESTIMATED), "Heart-rate ratio (Uth et al. 2004)", true),
        heartRate = HeartRateEntryUi(MetricState.Value(61.0, 0, "bpm", DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API, asOf = "4 min ago")),
    )
}

@HealthThemePreviews
@Composable
private fun HealthScreenPreview() = HealthPreviewFrame {
    HealthScreen(previewUi(), "Today", false, {}, {}, {}, {}, {}, PaddingValues(0.dp))
}

@HealthThemePreviews
@Composable
private fun HealthScreenLoadingPreview() = HealthPreviewFrame {
    HealthScreen(null, "Today", false, {}, {}, {}, {}, {}, PaddingValues(0.dp))
}
