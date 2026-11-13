package com.apex.athlete.ui.activity

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.tooling.preview.Preview
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ChoiceOption
import com.apex.athlete.core.ui.components.ChoiceScrollRow
import com.apex.athlete.core.ui.components.KeyStatRow
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.ActivityRowUi
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.activityLabelRes
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.DayBanner
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.RangeChoice
import com.apex.athlete.ui.detail.SeriesChartCard
import com.apex.athlete.ui.detail.SeriesPanel
import com.apex.athlete.ui.detail.SeriesUi
import com.apex.athlete.ui.detail.StatBlock
import com.apex.athlete.ui.detail.readyOrNull
import com.apex.athlete.ui.detail.seriesPanel
import com.apex.athlete.ui.health.HealthPreviewFrame
import com.apex.athlete.ui.health.HealthThemePreviews
import com.apex.athlete.ui.health.metricTitleRes
import kotlinx.coroutines.flow.map
import com.apex.athlete.core.data.store.StoreStatus
import java.time.LocalDate

/** Activity detail: the day's totals and active minutes, and a 7, 30 or 90 day history of any figure. */
@Composable
fun ActivityDetailRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle ->
        val repository = container.repository
        ActivityDetailViewModel(
            initialDay = day.toEpochDay(),
            handle = handle,
            loadDay = repository::activityDay,
            loadTrend = repository::trend,
            storeReady = repository.storeStatus.map { it is StoreStatus.Ready },
        )
    }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val chartLoad by vm.chart.collectAsStateWithLifecycle()
    val range by vm.range.collectAsStateWithLifecycle()
    val metric by vm.metric.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val ui = remember(load, formatter) { load.readyOrNull()?.let { buildActivityDetail(it, formatter) } }
    val label = formatter.string(metricTitleRes(metric))
    val panel = remember(chartLoad, label, formatter) { seriesPanel(chartLoad, label, formatter) }
    var selected by rememberSaveable { mutableStateOf<Long?>(null) }
    ActivityDetailScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        ui = ui,
        failed = load is DetailLoad.Failed,
        panel = panel,
        metric = metric,
        range = range,
        selectedDay = selected,
        dayLabel = { epochDay -> formatter.dayLabel(LocalDate.ofEpochDay(epochDay)) },
        onSelectDay = { selected = it },
        onSelectMetric = { vm.selectMetric(it); selected = null },
        onSelectRange = { vm.selectRange(it); selected = null },
        onOpenDay = { epochDay -> selected = null; onDayChange(LocalDate.ofEpochDay(epochDay)) },
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
    )
}

@Composable
internal fun ActivityDetailScreen(
    title: String,
    canGoNext: Boolean,
    ui: ActivityDetailUi?,
    failed: Boolean,
    panel: SeriesPanel,
    metric: MetricType,
    range: Int,
    selectedDay: Long?,
    dayLabel: (Long) -> String,
    onSelectDay: (Long?) -> Unit,
    onSelectMetric: (MetricType) -> Unit,
    onSelectRange: (Int) -> Unit,
    onOpenDay: (Long) -> Unit,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
) {
    val shown = ui ?: ActivityDetailUi.Loading
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        banner = { DayBanner(title, canGoNext, onPrevious, onNext, onToday) },
        hero = {
            StatBlock(
                label = stringResource(R.string.activitydetail_hero_label),
                state = shown.steps.state,
                valueStyle = ApexTheme.type.statValueLarge,
            )
        },
        primary = {
            if (failed) FailedCard()
            SectionShell(stringResource(R.string.activitydetail_section_totals)) {
                RowsCard(shown.totals)
                if (shown.isProvisional) Caption(stringResource(R.string.detail_provisional_note))
            }
            SectionShell(stringResource(R.string.activitydetail_section_minutes)) { RowsCard(shown.levels) }
            SectionShell(stringResource(R.string.activitydetail_section_history)) {
                ChoiceScrollRow(
                    options = ACTIVITY_CHART_METRICS.map { m ->
                        ChoiceOption(m.storageKey, stringResource(metricTitleRes(m)))
                    },
                    selectedKey = metric.storageKey,
                    onSelect = { key -> onSelectMetric(activityChartMetric(key)) },
                    groupDescription = stringResource(R.string.activitydetail_metric_group_cd),
                )
                RangeChoice(ACTIVITY_RANGES, range, onSelectRange)
                SeriesChartCard(
                    title = stringResource(R.string.activitydetail_chart_title, stringResource(metricTitleRes(metric)), range),
                    panel = panel,
                    selectedDay = selectedDay,
                    onSelectDay = onSelectDay,
                    dayLabel = dayLabel,
                    onOpenDay = onOpenDay,
                    emptyText = stringResource(R.string.activitydetail_empty),
                )
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.detail_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.activitydetail_how_p1))
                        BodyText(stringResource(R.string.activitydetail_how_p2))
                        BodyText(stringResource(R.string.activitydetail_how_p3))
                    }
                }
            }
        },
    )
}

@Composable
private fun RowsCard(rows: List<ActivityRowUi>) {
    ApexCard(contentPadding = androidx.compose.foundation.layout.PaddingValues(horizontal = ApexSpacing.cardPadding, vertical = ApexSpacing.sm)) {
        rows.forEach { row ->
            KeyStatRow(
                label = stringResource(activityLabelRes(row.metric) ?: metricTitleRes(row.metric)),
                state = row.state,
            )
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L
private val PreviewSensor = DataProvenance.DIRECT_SENSOR_GOOGLE_HEALTH_API

private fun previewUi(provisional: Boolean) = ActivityDetailUi(
    epochDay = PREVIEW_END,
    steps = ActivityRowUi(MetricType.STEPS, MetricState.Value(8_412.0, 0, null, PreviewSensor, isProvisional = provisional)),
    totals = listOf(
        ActivityRowUi(MetricType.CALORIES_TOTAL, MetricState.Value(2_431.0, 0, "kcal", PreviewSensor, isProvisional = provisional)),
        ActivityRowUi(MetricType.CALORIES_ACTIVE, MetricState.Value(512.0, 0, "kcal", PreviewSensor, isProvisional = provisional)),
        ActivityRowUi(MetricType.DISTANCE, MetricState.Value(6.21, 2, "km", PreviewSensor, isProvisional = provisional)),
        ActivityRowUi(MetricType.FLOORS, MetricState.Unavailable(MetricReason.NO_DATA)),
        ActivityRowUi(MetricType.ACTIVE_ZONE_MINUTES, MetricState.Value(34.0, 0, "min", PreviewSensor, isProvisional = provisional)),
    ),
    levels = listOf(
        ActivityRowUi(MetricType.LIGHTLY_ACTIVE_MINUTES, MetricState.Value(180.0, 0, "min", PreviewSensor, isProvisional = provisional)),
        ActivityRowUi(MetricType.MODERATELY_ACTIVE_MINUTES, MetricState.Value(24.0, 0, "min", PreviewSensor, isProvisional = provisional)),
        ActivityRowUi(MetricType.VERY_ACTIVE_MINUTES, MetricState.Value(10.0, 0, "min", PreviewSensor, isProvisional = provisional)),
        ActivityRowUi(MetricType.SEDENTARY_MINUTES, MetricState.Unavailable(detail = "Counted once the day has finished.")),
    ),
    isProvisional = provisional,
)

private fun previewPanel(): SeriesPanel.Ready {
    val points = (0 until 30).map { i -> ChartPoint(PREVIEW_END - 29 + i, if (i % 11 == 4) null else 8_000.0 + ((i * 7) % 11 - 5) * 600.0) }
    return SeriesPanel.Ready(SeriesUi(MetricType.STEPS, DaySeries("Steps", points), PREVIEW_END - 29, PREVIEW_END, "Measured"))
}

@HealthThemePreviews
@Composable
private fun ActivityDetailPreview() = HealthPreviewFrame {
    ActivityDetailScreen(
        "Today", false, previewUi(true), false, previewPanel(), MetricType.STEPS, 30, PREVIEW_END - 3,
        { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {}, {},
    )
}

@HealthThemePreviews
@Composable
private fun ActivityDetailLoadingPreview() = HealthPreviewFrame {
    ActivityDetailScreen(
        "Today", false, null, false, SeriesPanel.Loading, MetricType.STEPS, 30, null,
        { "Mon, Nov 9" }, {}, {}, {}, {}, {}, {}, {}, {},
    )
}
