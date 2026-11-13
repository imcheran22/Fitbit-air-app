package com.apex.athlete.ui.body

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.apex.athlete.R
import com.apex.athlete.core.data.store.StoreStatus
import com.apex.athlete.core.domain.DataProvenance
import com.apex.athlete.core.domain.MetricType
import com.apex.athlete.core.ui.charts.ChartPoint
import com.apex.athlete.core.ui.charts.DaySeries
import com.apex.athlete.core.ui.components.ApexCard
import com.apex.athlete.core.ui.components.ReasonPlaceholder
import com.apex.athlete.core.ui.components.ReasonSize
import com.apex.athlete.core.ui.icons.ApexIcons
import com.apex.athlete.core.ui.shell.DetailShell
import com.apex.athlete.core.ui.shell.SectionShell
import com.apex.athlete.core.ui.state.MetricReason
import com.apex.athlete.core.ui.state.MetricState
import com.apex.athlete.core.ui.theme.ApexSpacing
import com.apex.athlete.core.ui.theme.ApexTheme
import com.apex.athlete.navigation.ApexNavigator
import com.apex.athlete.ui.common.LocalFormatter
import com.apex.athlete.ui.common.apexViewModel
import com.apex.athlete.ui.detail.BodyText
import com.apex.athlete.ui.detail.Caption
import com.apex.athlete.ui.detail.DayBanner
import com.apex.athlete.ui.detail.DetailLoad
import com.apex.athlete.ui.detail.FailedCard
import com.apex.athlete.ui.detail.LinkRow
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
import java.time.LocalDate

/** Body detail: weight, body fat and BMI with a 7 to 180 day history. Honest about where body data comes from. */
@Composable
fun BodyRoute(navigator: ApexNavigator, day: LocalDate, onDayChange: (LocalDate) -> Unit) {
    val vm = apexViewModel { container, handle ->
        val repository = container.repository
        BodyViewModel(
            initialDay = day.toEpochDay(),
            handle = handle,
            loadBody = repository::body,
            loadTrend = repository::trend,
            storeReady = repository.storeStatus.map { it is StoreStatus.Ready },
        )
    }
    LaunchedEffect(day) { vm.setDay(day.toEpochDay()) }
    val load by vm.state.collectAsStateWithLifecycle()
    val weightLoad by vm.weight.collectAsStateWithLifecycle()
    val fatLoad by vm.bodyFat.collectAsStateWithLifecycle()
    val range by vm.range.collectAsStateWithLifecycle()
    val formatter = LocalFormatter.current
    val ui = remember(load, formatter) { load.readyOrNull()?.let { buildBodyDetail(it, formatter) } }
    val weightLabel = formatter.string(metricTitleRes(MetricType.WEIGHT))
    val fatLabel = formatter.string(metricTitleRes(MetricType.BODY_FAT))
    val bmiLabel = formatter.string(metricTitleRes(MetricType.BMI))
    val weightPanel = remember(weightLoad, weightLabel, formatter) { seriesPanel(weightLoad, weightLabel, formatter) }
    val fatPanel = remember(fatLoad, fatLabel, formatter) { seriesPanel(fatLoad, fatLabel, formatter) }
    val bmiSeries = remember(weightLoad, ui?.heightCm, bmiLabel, formatter) { bmiPanel(weightLoad, ui?.heightCm, bmiLabel, formatter) }
    var selected by rememberSaveable { mutableStateOf<Long?>(null) }
    BodyScreen(
        title = formatter.dayLabel(day),
        canGoNext = day < formatter.today(),
        ui = ui,
        failed = load is DetailLoad.Failed,
        weight = weightPanel,
        bodyFat = fatPanel,
        bmi = bmiSeries,
        range = range,
        selectedDay = selected,
        dayLabel = { epochDay -> formatter.dayLabel(LocalDate.ofEpochDay(epochDay)) },
        onSelectDay = { selected = it },
        onSelectRange = { vm.selectRange(it); selected = null },
        onOpenDay = { epochDay -> selected = null; onDayChange(LocalDate.ofEpochDay(epochDay)) },
        onOpenProfile = navigator::openProfile,
        onOpenTakeout = navigator::openTakeoutImport,
        onBack = navigator::back,
        onPrevious = { onDayChange(day.minusDays(1)) },
        onNext = { onDayChange(day.plusDays(1)) },
        onToday = { onDayChange(formatter.today()) },
    )
}

@Composable
internal fun BodyScreen(
    title: String,
    canGoNext: Boolean,
    ui: BodyDetailUi?,
    failed: Boolean,
    weight: SeriesPanel,
    bodyFat: SeriesPanel,
    bmi: SeriesPanel,
    range: Int,
    selectedDay: Long?,
    dayLabel: (Long) -> String,
    onSelectDay: (Long?) -> Unit,
    onSelectRange: (Int) -> Unit,
    onOpenDay: (Long) -> Unit,
    onOpenProfile: () -> Unit,
    onOpenTakeout: () -> Unit,
    onBack: () -> Unit,
    onPrevious: () -> Unit,
    onNext: () -> Unit,
    onToday: () -> Unit,
) {
    val shown = ui ?: BodyDetailUi.Loading
    val weightTitle = stringResource(R.string.body_chart_title, stringResource(R.string.body_section_weight), range)
    val fatTitle = stringResource(R.string.body_chart_title, stringResource(R.string.body_section_fat), range)
    val bmiTitle = stringResource(R.string.body_chart_title, stringResource(R.string.body_section_bmi), range)
    val chartEmpty = stringResource(R.string.body_chart_empty)
    DetailShell(
        title = title,
        onBack = onBack,
        backDescription = stringResource(R.string.common_back),
        banner = { DayBanner(title, canGoNext, onPrevious, onNext, onToday) },
        hero = {
            StatBlock(
                label = stringResource(R.string.body_section_weight),
                state = shown.weight,
                valueStyle = ApexTheme.type.statValueLarge,
            )
        },
        primary = {
            if (failed) FailedCard()
            if (ui != null && !ui.hasStoredReadings) NoBodyDataCard(ui.isDemo, onOpenTakeout)
            RangeChoice(BODY_RANGES, range, onSelectRange)
            if (weight != SeriesPanel.Empty) {
                SeriesChartCard(weightTitle, weight, selectedDay, onSelectDay, dayLabel, onOpenDay, chartEmpty)
            }
            SectionShell(stringResource(R.string.body_section_fat)) {
                ApexCard { StatBlock(stringResource(R.string.body_section_fat), shown.bodyFat) }
                if (bodyFat != SeriesPanel.Empty) {
                    SeriesChartCard(fatTitle, bodyFat, selectedDay, onSelectDay, dayLabel, onOpenDay, chartEmpty)
                }
            }
            SectionShell(stringResource(R.string.body_section_bmi)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
                        StatBlock(stringResource(R.string.body_section_bmi), shown.bmi)
                        if (ui != null && ui.bmiNeedsHeight) {
                            LinkRow(
                                text = stringResource(R.string.health_open_profile),
                                description = stringResource(R.string.health_bmi_profile_link_cd),
                                onClick = onOpenProfile,
                            )
                        }
                    }
                }
                if (bmi != SeriesPanel.Empty) {
                    SeriesChartCard(bmiTitle, bmi, selectedDay, onSelectDay, dayLabel, onOpenDay, chartEmpty)
                    Caption(stringResource(R.string.body_bmi_chart_note))
                }
            }
        },
        secondary = {
            SectionShell(stringResource(R.string.detail_how_title)) {
                ApexCard {
                    Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.md)) {
                        BodyText(stringResource(R.string.body_how_p1))
                        BodyText(stringResource(R.string.body_how_p2))
                        BodyText(stringResource(R.string.body_how_p3))
                    }
                }
            }
        },
    )
}

/** The honest empty state: where body data comes from and how to bring it in. No Takeout link in Demo mode. */
@Composable
private fun NoBodyDataCard(isDemo: Boolean, onOpenTakeout: () -> Unit) {
    ApexCard {
        Column(verticalArrangement = Arrangement.spacedBy(ApexSpacing.sm)) {
            ReasonPlaceholder(stringResource(R.string.body_empty_title), ApexIcons.Info, size = ReasonSize.Large)
            BodyText(stringResource(R.string.body_empty_text))
            if (isDemo) {
                Caption(stringResource(R.string.body_empty_demo))
            } else {
                LinkRow(
                    text = stringResource(R.string.body_empty_action),
                    description = stringResource(R.string.body_empty_action_cd),
                    onClick = onOpenTakeout,
                )
            }
        }
    }
}

// --- Previews -------------------------------------------------------------------------------------

private const val PREVIEW_END = 20_400L
private val PreviewOwn = DataProvenance.USER_REPORTED

private fun previewPanel(base: Double, step: Double, metric: MetricType, label: String, suffix: String): SeriesPanel {
    val points = (0 until 90).map { i -> ChartPoint(PREVIEW_END - 89 + i, if (i % 9 == 4) null else base + step * ((i * 3) % 7 - 3)) }
    return SeriesPanel.Ready(SeriesUi(metric, DaySeries(label, points, suffix, 1), PREVIEW_END - 89, PREVIEW_END, "Self-reported"))
}

@HealthThemePreviews
@Composable
private fun BodyPreview() = HealthPreviewFrame {
    BodyScreen(
        "Today", false,
        BodyDetailUi(
            MetricState.Value(72.4, 1, "kg", PreviewOwn, "Mon, Nov 9"), MetricState.Unavailable(MetricReason.NO_DATA),
            MetricState.Unavailable(detail = "Add your height in Profile to see BMI"),
            hasStoredReadings = true, bmiNeedsHeight = true, isDemo = false, heightCm = null, epochDay = PREVIEW_END,
        ),
        false,
        previewPanel(72.0, 0.2, MetricType.WEIGHT, "Weight", " kg"), SeriesPanel.Empty, SeriesPanel.Empty,
        90, PREVIEW_END - 5, { "Wed, Nov 4" }, {}, {}, {}, {}, {}, {}, {}, {}, {},
    )
}

@HealthThemePreviews
@Composable
private fun BodyEmptyPreview() = HealthPreviewFrame {
    BodyScreen(
        "Today", false,
        BodyDetailUi(
            MetricState.Unavailable(MetricReason.NO_DATA), MetricState.Unavailable(MetricReason.NO_DATA),
            MetricState.Unavailable(MetricReason.NO_DATA),
            hasStoredReadings = false, bmiNeedsHeight = false, isDemo = false, heightCm = null, epochDay = PREVIEW_END,
        ),
        false, SeriesPanel.Empty, SeriesPanel.Empty, SeriesPanel.Empty,
        90, null, { "Wed, Nov 4" }, {}, {}, {}, {}, {}, {}, {}, {}, {},
    )
}
